import assert from "node:assert/strict";
import {test} from "node:test";
import {randomUUID,createHash} from "node:crypto";
import {mkdtempSync,readdirSync,existsSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {openDatabase} from "@al1s-wms/db";
import {buildApp} from "./app.js";
import {recordStock,transferStock} from "./stock.js";
import {photoStorageRoot} from "./photos.js";

async function fixture() {
  const dir=mkdtempSync(join(tmpdir(),"al1s-photos-")),db=openDatabase(join(dir,"inventory.db"));
  const home=randomUUID(),other=randomUUID(),item=randomUUID(),location=randomUUID(),destination=randomUUID();
  db.prepare("INSERT INTO homes(id,name) VALUES (?,?),(?,?)").run(home,"Home",other,"Other");
  for(const [id,name] of [[location,"Fridge"],[destination,"Living"]])db.prepare("INSERT INTO locations(id,home_id,name) VALUES (?,?,?)").run(id,home,name);
  db.prepare("INSERT INTO items(id,home_id,sku,name,base_unit) VALUES (?,?,?,?,?)").run(item,home,item,"Tea","瓶");
  recordStock(db,home,"receipt",{itemId:item,locationId:location,quantity:4,idempotencyKey:"initial"});
  const batch=db.prepare("SELECT id FROM stock_batches WHERE item_id=?").get(item)!.id as string;
  const user=randomUUID(),session=randomUUID();
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)").run(user,"photo-user","unused",new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)").run(session,user,"2099-01-01T00:00:00Z");
  const uploads=join(dir,"uploads"),app=await buildApp(db,{uploadsDir:uploads}),headers={cookie:`session=${session}`};
  const itemUrl=`/api/v1/homes/${home}/items/${item}/photos`,batchUrl=`/api/v1/homes/${home}/batches/${batch}/photos`;
  const png=await sharp({create:{width:1200,height:800,channels:3,background:"#445522"}}).png().toBuffer();
  const upload=(url=itemUrl,payload=png,contentType="image/png")=>app.inject({method:"POST",url,headers:{...headers,"content-type":contentType,"x-photo-name":encodeURIComponent("乌龙茶.png")},payload});
  return {dir,db,app,home,other,item,batch,location,destination,uploads,headers,itemUrl,batchUrl,png,upload,
    close:async()=>{await app.close();db.close();rmSync(dir,{recursive:true,force:true});}};
}

test("item photo persists, normalizes, replaces safely and deletes files",async()=>{
  const f=await fixture();
  try {
    assert.equal(photoStorageRoot(f.db),join(realpathSync(f.dir),"uploads"));
    const result=await f.upload();assert.equal(result.statusCode,201,result.body);
    const photo=result.json();assert.equal(photo.caption,"乌龙茶.png");
    const listed=await f.app.inject({method:"GET",url:f.itemUrl,headers:f.headers});assert.equal(listed.json()[0].id,photo.id);
    const full=await f.app.inject({method:"GET",url:photo.url,headers:f.headers});
    assert.equal(full.statusCode,200);assert.equal(full.headers["content-type"],"image/webp");assert.equal(full.headers["cache-control"],"private, no-store");
    const meta=await sharp(full.rawPayload).metadata();assert.equal(meta.format,"webp");assert.equal(meta.width,1200);assert.equal(meta.exif,undefined);
    const thumb=await f.app.inject({method:"GET",url:photo.thumbnailUrl,headers:f.headers});assert.equal((await sharp(thumb.rawPayload).metadata()).width,400);
    // Reopening the database/server retains both metadata and private image access.
    await f.app.close();
    const reopened=await buildApp(f.db,{uploadsDir:f.uploads});
    const reread=await reopened.inject({method:"GET",url:photo.url,headers:f.headers});assert.equal(reread.statusCode,200);
    await reopened.close();
  }finally{await f.close();}
});

test("invalid replacements preserve originals; item replacement and deletion clean file pairs",async()=>{
  const f=await fixture();
  try {
    const first=(await f.upload()).json();
    const invalid=await f.upload(f.itemUrl,Buffer.from("not an image"));assert.equal(invalid.statusCode,400);
    assert.equal((await f.app.inject({method:"GET",url:f.itemUrl,headers:f.headers})).json()[0].id,first.id);
    assert.equal(readdirSync(join(f.uploads,f.home)).length,2);
    const next=await f.upload();assert.equal(next.statusCode,201,next.body);assert.notEqual(next.json().id,first.id);
    assert.equal(readdirSync(join(f.uploads,f.home)).length,2);
    assert.equal((await f.app.inject({method:"GET",url:first.url,headers:f.headers})).statusCode,404);
    const deleted=await f.app.inject({method:"DELETE",url:`${f.itemUrl}/${next.json().id}`,headers:f.headers});assert.equal(deleted.statusCode,204);
    assert.equal(readdirSync(join(f.uploads,f.home)).length,0);
  }finally{await f.close();}
});

test("batch limits survive concurrent uploads and photos remain attached through transfers",async()=>{
  const f=await fixture();
  try {
    const uploads=await Promise.all(Array.from({length:7},()=>f.upload(f.batchUrl)));
    assert.equal(uploads.filter(row=>row.statusCode===201).length,6);
    assert.equal(uploads.filter(row=>row.statusCode===409).length,1);
    assert.equal(readdirSync(join(f.uploads,f.home)).length,12);
    const photos=(await f.app.inject({method:"GET",url:f.batchUrl,headers:f.headers})).json();assert.equal(photos.length,6);
    transferStock(f.db,f.home,{itemId:f.item,sourceLocationId:f.location,targetLocationId:f.destination,quantity:1,idempotencyKey:"move"});
    assert.equal((await f.app.inject({method:"GET",url:f.batchUrl,headers:f.headers})).json().length,6);
    f.db.prepare("UPDATE stock_batches SET voided=1 WHERE id=?").run(f.batch);
    assert.equal((await f.app.inject({method:"GET",url:photos[0].url,headers:f.headers})).statusCode,404);
  }finally{await f.close();}
});

test("photo reads and mutations require authentication, household scope and valid images",async()=>{
  const f=await fixture();
  try {
    const photo=(await f.upload()).json();
    assert.equal((await f.app.inject({method:"GET",url:photo.url})).statusCode,401);
    assert.equal((await f.app.inject({method:"GET",url:photo.url.replace(f.home,f.other),headers:f.headers})).statusCode,404);
    assert.equal((await f.upload(f.itemUrl.replace(f.home,f.other))).statusCode,404);
    const rawToken=`al1s_${randomUUID()}`;
    const user=f.db.prepare("SELECT id FROM users").get()!.id;
    f.db.prepare("INSERT INTO api_tokens(id,user_id,home_id,name,token_hash,token_prefix,created_at) VALUES (?,?,?,?,?,?,?)").run(randomUUID(),user,f.other,"other",createHash("sha256").update(rawToken).digest("hex"),rawToken.slice(0,10),new Date().toISOString());
    assert.equal((await f.app.inject({method:"GET",url:photo.url,headers:{authorization:`Bearer ${rawToken}`}})).statusCode,403);
    const oversized=await f.upload(f.itemUrl,Buffer.alloc(10*1024*1024+1));assert.equal(oversized.statusCode,413,oversized.body);
    assert.equal((await f.upload(f.itemUrl,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),"image/svg+xml")).statusCode,415);
    const svgDisguised=await f.upload(f.itemUrl,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'));assert.equal(svgDisguised.statusCode,400);
    assert.equal(readdirSync(join(f.uploads,f.home)).length,2);
    f.db.prepare("UPDATE items SET active=0 WHERE id=?").run(f.item);
    assert.equal((await f.app.inject({method:"GET",url:photo.url,headers:f.headers})).statusCode,404);
    assert.equal(existsSync(join(f.uploads,f.home,`${photo.id}.webp`)),true);
  }finally{await f.close();}
});
