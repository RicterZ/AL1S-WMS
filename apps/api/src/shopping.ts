import {openedShelfLife} from "./consumption.js";
import { consumptionTypeSchema } from "@al1s-wms/contracts";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { batchDates, InventoryError, moneySchema, recordStock, withStockOperation } from "./stock.js";
import { itemBalanceSqlFor } from "./queryHelpers.js";
import { positiveQuantity, roundQuantity } from "./quantity.js";

export function estimateShoppingTotal(db:DatabaseSync,homeId:string,itemId:string,quantity:number,channelId?:string) {
  const latest=db.prepare(`SELECT b.purchase_total_minor AS totalMinor,
    COALESCE((SELECT SUM(t.quantity) FROM cost_transactions t WHERE t.batch_id=b.id AND t.type='receipt' AND t.idempotency_key NOT LIKE 'event:%'),0) AS quantity
    FROM cost_batches b WHERE b.home_id=? AND b.item_id=? AND b.purchase_total_minor IS NOT NULL${channelId ? " AND b.channel_id=?" : ""}
    ORDER BY b.purchased_date DESC,b.received_at DESC,b.id DESC LIMIT 1`).get(homeId,itemId,...(channelId?[channelId]:[])) as {totalMinor:number;quantity:number}|undefined;
  return latest&&latest.quantity>0?Math.round(latest.totalMinor/latest.quantity*quantity)/100:null;
}

const fields = {consumptionType:consumptionTypeSchema.optional(),openedShelfLifeDays:z.unknown().optional(),itemId:z.string().uuid().nullable().optional(),name:z.string().trim().min(1).max(200).optional(),quantity:positiveQuantity.optional(),unit:z.string().trim().min(1).max(30).optional(),category:z.string().trim().min(1).max(100).optional(),locationId:z.string().uuid().nullable().optional(),channelId:z.string().uuid().nullable().optional(),plannedDate:z.string().date().nullable().optional(),estimatedTotal:moneySchema.nullable().optional()};
export const shoppingSchema=z.object(fields).strict();
type Purchase={consumptionType:z.infer<typeof consumptionTypeSchema>;openedShelfLifeDays:number|null;id:string;itemId:string|null;name:string;quantity:number;unit:string|null;category:string|null;locationId:string|null;channelId:string|null;plannedDate:string|null;estimatedTotal:number|null;source?:string;completed:number};
export function saveShopping(db:DatabaseSync,homeId:string,raw:unknown,id?:string) {
  const input=shoppingSchema.parse(raw);
  const automaticId=id?.startsWith("auto:")?id.slice(5):null;
  const current=automaticId
    ? db.prepare(`SELECT ? AS id,id AS itemId,name,MAX(ROUND(reorder_point-${itemBalanceSqlFor("items")},2),0) AS quantity,base_unit AS unit,consumption_type AS consumptionType,opened_shelf_life_days AS openedShelfLifeDays,category,default_location_id AS locationId,NULL AS channelId,NULL AS plannedDate,NULL AS estimatedTotal,0 AS completed FROM items WHERE id=? AND home_id=? AND active=1 AND replenishment_paused=0`).get(id!,automaticId,homeId) as Purchase|undefined
    : id?db.prepare("SELECT id,item_id AS itemId,name,quantity,unit,consumption_type AS consumptionType,opened_shelf_life_days AS openedShelfLifeDays,category,location_id AS locationId,channel_id AS channelId,planned_date AS plannedDate,estimated_total_minor/100.0 AS estimatedTotal,source,completed FROM shopping_list WHERE id=? AND home_id=?").get(id,homeId) as Purchase|undefined:undefined;
  if(id&&!current)throw new InventoryError(404,"SHOPPING_ITEM_NOT_FOUND","error.shoppingItemNotFound");
  if(automaticId&&current!.quantity<=0)throw new InventoryError(409,"SHOPPING_SUGGESTION_RESOLVED","error.shoppingSuggestionResolved");
  if(current?.completed)throw new InventoryError(409,"SHOPPING_COMPLETED","error.shoppingCompletedEdit");
  const itemId=automaticId?current!.itemId:input.itemId===undefined?current?.itemId??null:input.itemId;
  const linked=itemId?db.prepare("SELECT name,base_unit AS unit,consumption_type AS consumptionType,opened_shelf_life_days AS openedShelfLifeDays,category,default_location_id AS locationId FROM items WHERE home_id=? AND id=? AND active=1").get(homeId,itemId) as Partial<Purchase>|undefined:undefined;
  if(itemId&&!linked)throw new InventoryError(404,"ITEM_NOT_FOUND","error.linkedItemNotFound");
  const merged={consumptionType:"consumable" as z.infer<typeof consumptionTypeSchema>,openedShelfLifeDays:null as number|null,...current,...input,...linked,id:id??randomUUID(),itemId,quantity:input.quantity??current?.quantity??1};
  const result={...merged,openedShelfLifeDays:openedShelfLife(merged.consumptionType,merged.openedShelfLifeDays)};
  if(!result.name||!result.unit||!result.category||(!itemId&&!result.locationId))throw new InventoryError(400,"SHOPPING_FIELDS_REQUIRED","error.shoppingFieldsRequired");
  if(result.locationId&&!db.prepare("SELECT 1 FROM locations WHERE id=? AND home_id=? AND active=1").get(result.locationId,homeId))throw new InventoryError(400,"LOCATION_NOT_FOUND","error.shoppingLocationInvalid");
  if(result.channelId&&result.channelId!==current?.channelId&&!db.prepare("SELECT 1 FROM shopping_channels WHERE id=? AND home_id=? AND active=1").get(result.channelId,homeId))throw new InventoryError(400,"SHOPPING_CHANNEL_NOT_FOUND","error.shoppingChannelInvalid");
  if(result.estimatedTotal==null&&itemId&&(result.channelId||automaticId)) {
    result.estimatedTotal=estimateShoppingTotal(db,homeId,itemId,result.quantity,result.channelId??undefined);
  }
  const resultId=automaticId?randomUUID():result.id;
  const estimatedTotalMinor=result.estimatedTotal==null?null:Math.round(result.estimatedTotal*100);
  if(id&&!automaticId) db.prepare("UPDATE shopping_list SET item_id=?,name=?,quantity=?,unit=?,category=?,location_id=?,channel_id=?,planned_date=?,estimated_total_minor=?,consumption_type=?,opened_shelf_life_days=? WHERE id=? AND home_id=?").run(itemId,result.name,result.quantity,result.unit,result.category,result.locationId??null,result.channelId??null,result.plannedDate??null,estimatedTotalMinor,result.consumptionType,result.openedShelfLifeDays,id,homeId);
  else db.prepare("INSERT INTO shopping_list(id,home_id,item_id,name,quantity,unit,category,location_id,channel_id,planned_date,estimated_total_minor,consumption_type,opened_shelf_life_days,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(resultId,homeId,itemId,result.name,result.quantity,result.unit,result.category,result.locationId??null,result.channelId??null,result.plannedDate??null,estimatedTotalMinor,result.consumptionType,result.openedShelfLifeDays,automaticId?"automatic":"manual",new Date().toISOString());
  const channel=result.channelId?db.prepare("SELECT name FROM shopping_channels WHERE id=?").get(result.channelId) as {name:string}|undefined:undefined;
  return {...result,id:resultId,channelName:channel?.name??null,completed:0,source:automaticId?"automatic":result.source??"manual"};
}
export const receiveSchema=z.object({actualQuantity:positiveQuantity,idempotencyKey:z.string().trim().min(1).max(200),locationId:z.string().uuid().optional(),totalPrice:moneySchema.optional(),completion:z.enum(["keep","complete"]).default("complete"),purchaseDate:z.string().date().nullable().optional(),...batchDates}).strict();
export function receiveShopping(db:DatabaseSync,homeId:string,shoppingId:string,raw:unknown) {
  const input=receiveSchema.parse(raw);
  return withStockOperation(db,homeId,input.idempotencyKey,{type:"purchase",shoppingId,...input},()=>{
    const automatic=shoppingId.startsWith("auto:");
    const row=automatic?db.prepare(`SELECT id AS itemId,name,base_unit AS unit,consumption_type AS consumptionType,opened_shelf_life_days AS openedShelfLifeDays,category,default_location_id AS locationId,MAX(ROUND(reorder_point-${itemBalanceSqlFor("items")},2),0) AS quantity,0 AS completed FROM items WHERE home_id=? AND id=? AND active=1 AND replenishment_paused=0`).get(homeId,shoppingId.slice(5)) as Purchase|undefined
      :db.prepare("SELECT id,item_id AS itemId,name,quantity,unit,consumption_type AS consumptionType,opened_shelf_life_days AS openedShelfLifeDays,category,location_id AS locationId,channel_id AS channelId,planned_date AS plannedDate,estimated_total_minor/100.0 AS estimatedTotal,completed FROM shopping_list WHERE home_id=? AND id=?").get(homeId,shoppingId) as Purchase|undefined;
    if(!row)throw new InventoryError(404,"SHOPPING_ITEM_NOT_FOUND","error.shoppingItemNotFound");
    if(row.completed)throw new InventoryError(409,"SHOPPING_COMPLETED","error.shoppingAlreadyReceived");
    const linked=row.itemId?db.prepare("SELECT default_location_id AS locationId FROM items WHERE id=? AND home_id=? AND active=1").get(row.itemId,homeId) as {locationId:string|null}|undefined:undefined;
    if(row.itemId&&!linked)throw new InventoryError(404,"ITEM_NOT_FOUND","error.linkedItemDeleted");
    const locationId=input.locationId??linked?.locationId??row.locationId;
    if(!locationId)throw new InventoryError(400,"SHOPPING_LOCATION_REQUIRED","error.shoppingLocationRequired");
    let itemId=row.itemId;
    if(!itemId) {
      if(!row.unit||!row.category)throw new InventoryError(400,"SHOPPING_FIELDS_REQUIRED","error.shoppingDetailsRequired");
      itemId=randomUUID();
      db.prepare("INSERT INTO items(id,home_id,sku,name,category,base_unit,default_location_id,consumption_type,opened_shelf_life_days) VALUES (?,?,?,?,?,?,?,?,?)").run(itemId,homeId,`ITEM-${itemId.slice(0,8).toUpperCase()}`,row.name,row.category,row.unit,locationId,row.consumptionType,openedShelfLife(row.consumptionType,row.openedShelfLifeDays));
    }
    if(automatic&&row.itemId)row.estimatedTotal=estimateShoppingTotal(db,homeId,row.itemId,row.quantity);
    const persistedShoppingId=automatic?randomUUID():shoppingId;
    const remaining=input.completion==="keep"?roundQuantity(Math.max(0,row.quantity-input.actualQuantity)):0;
    const completed=remaining===0;
    if(automatic)db.prepare("INSERT INTO shopping_list(id,home_id,item_id,name,quantity,unit,category,location_id,source,completed,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)").run(persistedShoppingId,homeId,itemId,row.name,row.quantity,row.unit,row.category,locationId,"automatic",new Date().toISOString(),new Date().toISOString());
    const receipt=recordStock(db,homeId,"receipt",{itemId,locationId,quantity:input.actualQuantity,idempotencyKey:`purchase:${input.idempotencyKey}`,reason:"reason.purchaseReceipt",manufacturedDate:input.manufacturedDate,expiryDate:input.expiryDate,totalPrice:input.totalPrice,purchaseDate:input.purchaseDate,channelId:row.channelId,shoppingItemId:persistedShoppingId});
    db.prepare(`UPDATE shopping_list SET item_id=?,planned_quantity=COALESCE(planned_quantity,quantity),received_quantity=ROUND(received_quantity+?,2),quantity=?,estimated_total_minor=?,completed=?,completed_at=? WHERE home_id=? AND id=?`).run(itemId,input.actualQuantity,completed?row.quantity:remaining,row.estimatedTotal==null?null:Math.round(row.estimatedTotal*100*(completed?1:remaining/row.quantity)),completed?1:0,completed?new Date().toISOString():null,homeId,persistedShoppingId);
    return {id:shoppingId,shoppingItemId:persistedShoppingId,completed,remaining,received:input.actualQuantity,itemId,locationId,estimatedTotal:row.estimatedTotal,actualTotal:input.totalPrice??null,beforeQuantity:receipt.beforeQuantity,afterQuantity:receipt.afterQuantity,difference:receipt.difference,transactions:receipt.transactions};
  });
}
