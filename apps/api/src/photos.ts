import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { atomic, InventoryError } from "./stock.js";

const MAX_BYTES=10*1024*1024;
type PhotoRow={id:string;home_id:string;item_id:string;batch_id:string|null;caption:string};
type Target={homeId:string;itemId:string;batchId:string|null};
const uuid=z.string().uuid();

export function photoStorageRoot(db:DatabaseSync,configured?:string) {
  const file=(db.prepare("PRAGMA database_list").all() as {name:string;file:string}[]).find(row=>row.name==="main")?.file;
  return resolve(configured??process.env.UPLOADS_DIR??join(file?dirname(file):resolve("./data"),"uploads"));
}
function target(db:DatabaseSync,homeId:string,id:string,batch:boolean):Target {
  uuid.parse(homeId);uuid.parse(id);
  const item=batch
    ? db.prepare("SELECT i.id FROM stock_batches b JOIN items i ON i.id=b.item_id AND i.home_id=b.home_id JOIN homes h ON h.id=i.home_id WHERE b.id=? AND b.home_id=? AND b.voided=0 AND i.active=1 AND h.active=1").get(id,homeId)
    : db.prepare("SELECT i.id FROM items i JOIN homes h ON h.id=i.home_id WHERE i.id=? AND i.home_id=? AND i.active=1 AND h.active=1").get(id,homeId);
  if(!item)throw new InventoryError(404,batch?"BATCH_NOT_FOUND":"ITEM_NOT_FOUND",batch?"error.batchNotFound":"error.itemNotFound");
  return {homeId,itemId:item.id as string,batchId:batch?id:null};
}
function serialize(row:PhotoRow) {
  const url=`/api/v1/homes/${row.home_id}/photos/${row.id}`;
  return {id:row.id,url,thumbnailUrl:`${url}?size=thumbnail`,caption:row.caption};
}
function paths(root:string,homeId:string,id:string) {return [join(root,homeId,`${id}.webp`),join(root,homeId,`${id}.thumb.webp`)];}
function cleanup(root:string,row:Pick<PhotoRow,"id"|"home_id">,app:FastifyInstance) {
  for(const filename of paths(root,row.home_id,row.id))try {unlinkSync(filename);}catch(error) {
    if((error as NodeJS.ErrnoException).code!=="ENOENT") app.log.warn({err:error,photoId:row.id},"Unable to remove photo file");
  }
}
function list(db:DatabaseSync,value:Target) {
  return db.prepare("SELECT * FROM inventory_photos WHERE home_id=? AND item_id=? AND batch_id IS ? ORDER BY created_at,id").all(value.homeId,value.itemId,value.batchId) as PhotoRow[];
}
function captionOf(value:unknown) {
  if(typeof value!=="string")return "photo.webp";
  try {return decodeURIComponent(value).replace(/[\u0000-\u001f\u007f]/g,"").slice(0,160).trim()||"photo.webp";}
  catch {throw new InventoryError(400,"PHOTO_INVALID","error.photoInvalid");}
}
async function encode(body:unknown) {
  if(!Buffer.isBuffer(body)||body.length===0)throw new InventoryError(400,"PHOTO_INVALID","error.photoInvalid");
  if(body.length>MAX_BYTES)throw new InventoryError(413,"PHOTO_TOO_LARGE","error.photoTooLarge");
  try {
    const source=sharp(body,{limitInputPixels:40_000_000,failOn:"warning"});
    const meta=await source.metadata();
    if(!["jpeg","png","webp"].includes(meta.format??"")||(meta.pages??1)>1)throw new Error("Unsupported image");
    // Re-encoding auto-orients and drops EXIF/GPS and other source metadata.
    const full=await source.rotate().resize({width:2000,height:2000,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer();
    const thumb=await sharp(full).resize({width:400,height:400,fit:"inside",withoutEnlargement:true}).webp({quality:80}).toBuffer();
    return {full,thumb};
  }catch {throw new InventoryError(400,"PHOTO_INVALID","error.photoInvalid");}
}

export async function registerPhotoRoutes(app:FastifyInstance,db:DatabaseSync,options:{uploadsDir?:string}) {
  const root=photoStorageRoot(db,options.uploadsDir);
  await app.register(async api=>{
    api.addContentTypeParser(/^image\/(jpeg|png|webp)(?:\s*;.*)?$/,{parseAs:"buffer",bodyLimit:MAX_BYTES},(_request,body,done)=>done(null,body));
    for(const batch of [false,true]) {
      const base=`/api/v1/homes/:homeId/${batch?"batches/:targetId":"items/:targetId"}/photos`;
      api.get<{Params:{homeId:string;targetId:string}}>(base,async request=>list(db,target(db,request.params.homeId,request.params.targetId,batch)).map(serialize));
      api.post<{Params:{homeId:string;targetId:string}}>(base,{bodyLimit:MAX_BYTES},async(request,reply)=>{
        const {homeId,targetId}=request.params;
        target(db,homeId,targetId,batch);
        const caption=captionOf(request.headers["x-photo-name"]);
        const {full,thumb}=await encode(request.body);
        const row:PhotoRow={id:randomUUID(),home_id:homeId,item_id:"",batch_id:batch?targetId:null,caption};
        const [fullPath,thumbPath]=paths(root,homeId,row.id);
        let old:PhotoRow[]=[];
        try {
          mkdirSync(join(root,homeId),{recursive:true,mode:0o700});
          writeFileSync(fullPath,full,{flag:"wx",mode:0o600});
          writeFileSync(thumbPath,thumb,{flag:"wx",mode:0o600});
          atomic(db,()=>{
            const current=target(db,homeId,targetId,batch);
            row.item_id=current.itemId;
            old=list(db,current);
            if(batch&&old.length>=6)throw new InventoryError(409,"PHOTO_LIMIT","error.photoLimit");
            if(!batch)db.prepare("DELETE FROM inventory_photos WHERE home_id=? AND item_id=? AND batch_id IS NULL").run(homeId,current.itemId);
            db.prepare("INSERT INTO inventory_photos(id,home_id,item_id,batch_id,caption,created_at) VALUES (?,?,?,?,?,?)").run(row.id,homeId,row.item_id,row.batch_id,caption,new Date().toISOString());
          });
        }catch(error){cleanup(root,row,api);throw error;}
        if(!batch)for(const previous of old)cleanup(root,previous,api);
        return reply.code(201).send(serialize(row));
      });
      api.delete<{Params:{homeId:string;targetId:string;photoId:string}}>(`${base}/:photoId`,async(request,reply)=>{
        const {homeId,targetId,photoId}=request.params;
        const current=target(db,homeId,targetId,batch);uuid.parse(photoId);
        const row=list(db,current).find(photo=>photo.id===photoId);
        if(!row)throw new InventoryError(404,"PHOTO_NOT_FOUND","error.photoNotFound");
        db.prepare("DELETE FROM inventory_photos WHERE id=? AND home_id=?").run(photoId,homeId);
        cleanup(root,row,api);
        return reply.code(204).send();
      });
    }
    api.get<{Params:{homeId:string;photoId:string};Querystring:{size?:string}}>("/api/v1/homes/:homeId/photos/:photoId",async(request,reply)=>{
      const {homeId,photoId}=request.params;uuid.parse(homeId);uuid.parse(photoId);
      const {size}=z.object({size:z.enum(["thumbnail"]).optional()}).strict().parse(request.query);
      const row=db.prepare("SELECT * FROM inventory_photos WHERE id=? AND home_id=?").get(photoId,homeId) as PhotoRow|undefined;
      if(!row)throw new InventoryError(404,"PHOTO_NOT_FOUND","error.photoNotFound");
      target(db,homeId,row.batch_id??row.item_id,!!row.batch_id);
      const path=paths(root,homeId,photoId)[size==="thumbnail"?1:0];
      let bytes:Buffer;
      try {bytes=readFileSync(path);}catch(error) {
        if((error as NodeJS.ErrnoException).code==="ENOENT")throw new InventoryError(404,"PHOTO_NOT_FOUND","error.photoNotFound");
        throw error;
      }
      return reply.type("image/webp").header("cache-control","private, no-store").header("x-content-type-options","nosniff").send(bytes);
    });
  });
}
