import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openDatabase } from "@al1s-wms/db";
import { buildApp } from "./app.js";
import { recordStock, transferStock } from "./stock.js";

async function fixture() {
  const db = openDatabase(":memory:");
  const homeId=randomUUID(),otherHome=randomUUID(),itemId=randomUUID(),fridge=randomUUID(),living=randomUUID(),foreignLocation=randomUUID();
  db.prepare("INSERT INTO homes(id,name) VALUES (?,?),(?,?)").run(homeId,"Home",otherHome,"Other");
  for(const [id,home,name] of [[fridge,homeId,"Fridge"],[living,homeId,"Living"],[foreignLocation,otherHome,"Other location"]]) {
    db.prepare("INSERT INTO locations(id,home_id,name) VALUES (?,?,?)").run(id,home,name);
  }
  db.prepare("INSERT INTO items(id,home_id,sku,name,category,base_unit,reorder_point) VALUES (?,?,?,?,?,?,?)").run(itemId,homeId,itemId,"Tea","Drinks","瓶",4);
  const userId=randomUUID(),sessionId=randomUUID();
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)").run(userId,"location-user","unused",new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)").run(sessionId,userId,"2099-01-01T00:00:00.000Z");
  const app=await buildApp(db),headers={cookie:`session=${sessionId}`};
  const base=`/api/v1/homes/${homeId}`;
  const save=(locationId:string,minimumQuantity:number,home=homeId)=>app.inject({method:"PUT",url:`/api/v1/homes/${home}/items/${itemId}/location-minimums/${locationId}`,headers,payload:{minimumQuantity}});
  const read=async()=>(await app.inject({method:"GET",url:`${base}/location-minimums`,headers})).json();
  return {db,app,headers,homeId,otherHome,itemId,fridge,living,foreignLocation,base,save,read};
}

test("local minimum reminds to transfer while purchasing uses household stock",async()=>{
  const f=await fixture();
  try {
    for(const locationId of [f.fridge,f.living])recordStock(f.db,f.homeId,"receipt",{itemId:f.itemId,locationId,quantity:4,idempotencyKey:locationId});
    assert.equal((await f.save(f.living,4)).statusCode,200);
    recordStock(f.db,f.homeId,"issue",{itemId:f.itemId,locationId:f.living,quantity:1,idempotencyKey:"drink"});
    const [rule]=await f.read();
    assert.equal(rule.quantity,3);
    assert.equal(rule.minimumQuantity,4);
    assert.equal(rule.shortage,1);
    assert.equal(rule.availableElsewhere,4);
    assert.equal((await f.app.inject({method:"GET",url:`${f.base}/shopping-list`,headers:f.headers})).json().length,0);
    transferStock(f.db,f.homeId,{itemId:f.itemId,sourceLocationId:f.fridge,targetLocationId:f.living,quantity:1,idempotencyKey:"restock-living"});
    assert.equal((await f.read())[0].shortage,0);
    assert.equal((await f.app.inject({method:"GET",url:`${f.base}/shopping-list`,headers:f.headers})).json().length,0);
  } finally {await f.app.close();f.db.close();}
});

test("empty locations retain rules; zero removes and quantities normalize",async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.save(f.living,1.3370000001)).statusCode,200);
    const [rule]=await f.read();
    assert.equal(rule.minimumQuantity,1.34);
    assert.equal(rule.quantity,0);
    assert.equal(rule.shortage,1.34);
    assert.equal(rule.availableElsewhere,0);
    assert.equal((await f.save(f.living,2)).statusCode,200);
    assert.equal((await f.read()).length,1);
    assert.equal((await f.save(f.living,-1)).statusCode,400);
    assert.equal((await f.save(f.living,0)).statusCode,200);
    assert.deepEqual(await f.read(),[]);
  } finally {await f.app.close();f.db.close();}
});

test("location rules reject cross-household targets and hide inactive records",async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.save(f.foreignLocation,4)).statusCode,404);
    assert.equal((await f.save(f.living,4,f.otherHome)).statusCode,404);
    assert.equal((await f.save(f.living,4)).statusCode,200);
    const other=await f.app.inject({method:"GET",url:`/api/v1/homes/${f.otherHome}/location-minimums`,headers:f.headers});
    assert.deepEqual(other.json(),[]);
    f.db.prepare("UPDATE locations SET active=0 WHERE id=?").run(f.living);
    assert.deepEqual(await f.read(),[]);
    assert.equal((await f.save(f.living,3)).statusCode,404);
  } finally {await f.app.close();f.db.close();}
});
