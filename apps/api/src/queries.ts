import { estimateShoppingTotal } from "./shopping.js";
import {pageQuery,itemBalanceSql} from "./queryHelpers.js";
export {pageQuery} from "./queryHelpers.js";
import { z } from "zod";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { transactionQuery } from "./inventory-delete.js";
import { batchBalanceQuery } from "./stock.js";
import { InventoryError } from "./stock.js";
import { roundQuantity } from "./quantity.js";
import { displayUnit, localizeReason, translate, type Locale } from "./i18n/index.js";

const bool = z.enum(["true","false"]).transform(value=>value==="true");
const paging = { limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).default(0) };
export const transactionFilters = z.object({...paging,itemId:z.string().uuid().optional(),locationId:z.string().uuid().optional(),batchId:z.string().uuid().optional(),type:z.enum(["receipt","issue","move","delete","reclassify","update"]).optional(),query:z.string().trim().max(200).optional(),occurredFrom:z.string().datetime().optional(),occurredTo:z.string().datetime().optional(),snapshotAt:z.string().datetime().optional()}).strict();
export const itemFilters = z.object({...paging,paged:bool.optional(),query:z.string().trim().max(200).optional(),category:z.string().trim().max(200).optional(),locationId:z.string().uuid().optional(),includeDescendantLocations:bool.default("true"),includeDescendantCategories:bool.default("true"),lowStockOnly:bool.optional(),expiryBefore:z.string().date().optional()}).strict();
export const batchFilters = z.object({...paging,itemId:z.string().uuid().optional(),locationId:z.string().uuid().optional(),batchId:z.string().uuid().optional(),includeEmpty:bool.default("false")}).strict();
export const overviewFilters = z.object({expiryDays:z.coerce.number().int().min(1).max(365).default(30),limit:z.coerce.number().int().min(1).max(50).default(10)}).strict();
export function listTransactions(db:DatabaseSync,homeId:string,raw:unknown,locale:Locale="zh-CN") {
  const filters=transactionFilters.parse(raw), snapshotAt=filters.snapshotAt??new Date().toISOString();
  const where=["homeId=?","occurredAt<=?"],params:SQLInputValue[]=[homeId,snapshotAt];
  for(const key of ["itemId","locationId","batchId","type"] as const) if(filters[key]) {where.push(`${key}=?`);params.push(filters[key]!);}
  if(filters.query) {where.push("(itemName LIKE ? OR reason LIKE ?)");params.push(`%${filters.query}%`,`%${filters.query}%`);}
  if(filters.occurredFrom) {where.push("occurredAt>=?");params.push(filters.occurredFrom);}
  if(filters.occurredTo) {where.push("occurredAt<=?");params.push(filters.occurredTo);}
  const page=pageQuery(db,`SELECT * FROM (${transactionQuery}) WHERE ${where.join(" AND ")}`,params,filters.limit,filters.offset,"occurredAt DESC,id DESC");
  return {...page,items:(page.items as Record<string,unknown>[]).map(item=>({...item,reason:localizeReason(locale,item.reason)})),snapshotAt};
}
function descendants(db:DatabaseSync,homeId:string,table:"locations"|"item_categories",id:string,include:boolean) {
  const result=[id];
  if(include) for(let index=0;index<result.length;index++) {
    const rows=db.prepare(`SELECT id FROM ${table} WHERE home_id=? AND parent_id=? AND active=1`).all(homeId,result[index]) as {id:string}[];
    for(const row of rows) if(!result.includes(row.id)) result.push(row.id);
  }
  return result;
}
export function listItems(db:DatabaseSync,homeId:string,raw:unknown): any {
  const filters=itemFilters.parse(raw),where=["i.home_id=?","i.active=1"],params:SQLInputValue[]=[homeId];
  const balance=itemBalanceSql;
  if(filters.query){where.push("i.name LIKE ?");params.push(`%${filters.query}%`);}
  if(filters.locationId) {
    const ids=descendants(db,homeId,"locations",filters.locationId,filters.includeDescendantLocations),marks=ids.map(()=>"?").join(",");
    where.push(`(i.default_location_id IN (${marks}) OR EXISTS (SELECT 1 FROM stock_transactions st WHERE st.home_id=i.home_id AND st.item_id=i.id AND st.location_id IN (${marks}) GROUP BY st.location_id HAVING SUM(CASE WHEN st.type='receipt' THEN st.quantity ELSE -st.quantity END)>0))`);params.push(...ids,...ids);
  }
  if(filters.category) {
    const roots=db.prepare("SELECT id FROM item_categories WHERE home_id=? AND name=? AND active=1").all(homeId,filters.category) as {id:string}[];
    const ids=roots.flatMap(root=>descendants(db,homeId,"item_categories",root.id,filters.includeDescendantCategories));
    const names=ids.length?(db.prepare(`SELECT name FROM item_categories WHERE home_id=? AND id IN (${ids.map(()=>"?").join(",")})`).all(homeId,...ids) as {name:string}[]).map(row=>row.name):[filters.category];
    where.push(`i.category IN (${names.map(()=>"?").join(",")})`);params.push(...names);
  }
  if(filters.lowStockOnly)where.push(`i.replenishment_paused=0 AND ROUND(i.reorder_point-${balance},2)>0`);
  if(filters.expiryBefore){where.push("i.expiry_date<=?");params.push(filters.expiryBefore);}
  const latestUnitPrice=`(SELECT ROUND((b.purchase_total_minor/100.0)/NULLIF((SELECT SUM(origin.quantity) FROM stock_transactions origin WHERE origin.batch_id=b.id AND origin.type='receipt' AND origin.idempotency_key NOT LIKE 'event:%'),0),2) FROM cost_batches b WHERE b.home_id=i.home_id AND b.item_id=i.id AND b.purchase_total_minor IS NOT NULL ORDER BY b.purchased_date DESC,b.received_at DESC LIMIT 1)`;
  const latestReceivedAt="(SELECT MAX(received_at) FROM cost_batches b WHERE b.home_id=i.home_id AND b.item_id=i.id)";
  const sql=`SELECT i.icon,i.id,i.home_id AS homeId,i.sku,i.barcode,i.name,i.category,i.base_unit AS baseUnit,i.consumption_type AS consumptionType,i.opened_shelf_life_days AS openedShelfLifeDays,i.replenishment_paused AS replenishmentPaused,i.reorder_point AS reorderPoint,i.reorder_quantity AS reorderQuantity,i.manufactured_date AS manufacturedDate,i.expiry_date AS expiryDate,i.default_location_id AS locationId,l.name AS locationName,i.active,${balance} AS quantity,${latestUnitPrice} AS lastUnitPrice,${latestReceivedAt} AS latestReceivedAt,(SELECT default_currency FROM homes WHERE id=i.home_id) AS currency FROM items i LEFT JOIN locations l ON l.id=i.default_location_id WHERE ${where.join(" AND ")}`;
  const normalize=(row:Record<string,unknown>)=>({...row,replenishmentPaused:Boolean(row.replenishmentPaused)});
  if(filters.paged) {
    const result=pageQuery(db,sql,params,filters.limit,filters.offset,"name,id");
    return {...result,items:(result.items as Record<string,unknown>[]).map(normalize)};
  }
  return (db.prepare(`SELECT * FROM (${sql}) ORDER BY name,id`).all(...params) as Record<string,unknown>[]).map(normalize);

}
export function listBatches(db:DatabaseSync,homeId:string,raw:unknown) {
  const filters=batchFilters.parse(raw),where=["homeId=?"],params:SQLInputValue[]=[homeId];
  for(const key of ["itemId","locationId","batchId"] as const)if(filters[key]){where.push(`${key}=?`);params.push(filters[key]!);}
  if(!filters.includeEmpty)where.push("quantity>0");
  const page=pageQuery(db,`SELECT * FROM (${batchBalanceQuery}) WHERE ${where.join(" AND ")}`,params,filters.limit,filters.offset,"expiryDate IS NULL,expiryDate,receivedAt,batchId,locationId");
  return {...page,items:(page.items as Record<string,unknown>[]).map(row=>({
    ...row,quantity:roundQuantity(Number(row.quantity)),totalPrice:row.purchaseTotalMinor==null?null:Number(row.purchaseTotalMinor)/100,
    unitPrice:row.purchaseTotalMinor==null||!Number(row.initialQuantity)?null:Math.round(Number(row.purchaseTotalMinor)/Number(row.initialQuantity))/100,
  }))};
}

export function getHomeOverview(db:DatabaseSync,homeId:string,raw:unknown,locale:Locale="zh-CN") {
  const filters=overviewFilters.parse(raw);
  const home=db.prepare("SELECT id,name,icon,timezone FROM homes WHERE id=? AND active=1").get(homeId) as {id:string;name:string;icon:string;timezone:string}|undefined;
  if(!home)throw new InventoryError(404,"HOME_NOT_FOUND","error.homeNotFound");
  const today=new Date().toISOString().slice(0,10);
  const threshold=new Date(Date.now()+filters.expiryDays*86400000).toISOString().slice(0,10);
  const balance=itemBalanceSql;
  const lowSql=`SELECT i.id AS itemId,i.name,i.base_unit AS unit,i.replenishment_paused AS replenishmentPaused,i.reorder_point AS reorderPoint,${balance} AS quantity,MAX(ROUND(i.reorder_point-${balance},2),0) AS suggestedQuantity,i.default_location_id AS locationId,l.name AS locationName FROM items i LEFT JOIN locations l ON l.id=i.default_location_id WHERE i.home_id=? AND i.active=1 AND i.replenishment_paused=0 AND ROUND(i.reorder_point-${balance},2)>0`;
  const needsCount=(db.prepare(`SELECT COUNT(*) AS n FROM (${lowSql})`).get(homeId) as {n:number}).n;
  const needsReplenishment=db.prepare(`SELECT * FROM (${lowSql}) ORDER BY suggestedQuantity DESC,name LIMIT ?`).all(homeId,filters.limit);
  const batchBase=`SELECT * FROM (${batchBalanceQuery}) WHERE homeId=? AND quantity>0 AND expiryDate IS NOT NULL`;
  const expiredCount=(db.prepare(`SELECT COUNT(*) AS n FROM (${batchBase}) WHERE expiryDate<?`).get(homeId,today) as {n:number}).n;
  const expired=db.prepare(`SELECT * FROM (${batchBase}) WHERE expiryDate<? ORDER BY expiryDate,receivedAt LIMIT ?`).all(homeId,today,filters.limit);
  const expiringCount=(db.prepare(`SELECT COUNT(*) AS n FROM (${batchBase}) WHERE expiryDate>=? AND expiryDate<=?`).get(homeId,today,threshold) as {n:number}).n;
  const expiring=db.prepare(`SELECT * FROM (${batchBase}) WHERE expiryDate>=? AND expiryDate<=? ORDER BY expiryDate,receivedAt LIMIT ?`).all(homeId,today,threshold,filters.limit);
  const manualSql="SELECT s.id,s.item_id AS itemId,s.name,s.quantity,s.unit,s.category,s.location_id AS locationId,s.channel_id AS channelId,c.name AS channelName,s.planned_date AS plannedDate,s.estimated_total_minor/100.0 AS estimatedTotal,'manual' AS source FROM shopping_list s LEFT JOIN shopping_channels c ON c.id=s.channel_id WHERE s.home_id=? AND s.completed=0";
  const manual=db.prepare(`${manualSql} ORDER BY s.planned_date IS NULL,s.planned_date,s.created_at LIMIT ?`).all(homeId,filters.limit) as Record<string,unknown>[];
  const automaticSql=`SELECT * FROM (${lowSql}) low WHERE NOT EXISTS (SELECT 1 FROM shopping_list s WHERE s.home_id=? AND s.item_id=low.itemId AND s.completed=0)`;
  const automaticRows=db.prepare(`${automaticSql} ORDER BY suggestedQuantity DESC,name LIMIT ?`).all(homeId,homeId,filters.limit) as Record<string,unknown>[];
  const automatic=automaticRows.map(row=>({id:`auto:${row.itemId}`,itemId:row.itemId,name:row.name,quantity:row.suggestedQuantity,unit:row.unit,locationId:row.locationId,channelId:null,channelName:null,plannedDate:null,estimatedTotal:estimateShoppingTotal(db,homeId,String(row.itemId),Number(row.suggestedQuantity)),source:"automatic"}));
  const automaticCount=(db.prepare(`SELECT COUNT(*) AS n FROM (${automaticSql})`).get(homeId,homeId) as {n:number}).n;
  const pendingCount=(db.prepare("SELECT COUNT(*) AS n FROM shopping_list WHERE home_id=? AND completed=0").get(homeId) as {n:number}).n+automaticCount;
  const pending=[...manual,...automatic].slice(0,filters.limit);
  const actions=[
    ...(expired as Record<string,unknown>[]).map(row=>({type:"handle_expired",priority:"urgent",itemId:row.itemId,batchId:row.batchId,message:translate(locale,"action.expired",{itemName:row.itemName,expiryDate:row.expiryDate})})),
    ...(expiring as Record<string,unknown>[]).map(row=>({type:"use_expiring",priority:"high",itemId:row.itemId,batchId:row.batchId,message:translate(locale,"action.expiring",{itemName:row.itemName,expiryDate:row.expiryDate})})),
    ...pending.filter(row=>row.source==="manual").map(row=>({type:"buy_pending",priority:"normal",shoppingItemId:row.id,itemId:row.itemId,message:translate(locale,"action.buyPending",{name:row.name,quantity:row.quantity,unit:displayUnit(locale,row.unit??"")}).trim()})),
    ...(needsReplenishment as Record<string,unknown>[]).map(row=>({type:"replenish",priority:"normal",itemId:row.itemId,message:translate(locale,"action.replenish",{name:row.name,quantity:row.suggestedQuantity,unit:displayUnit(locale,row.unit)})})),
  ].slice(0,filters.limit);
  return {
    home,
    generatedAt:new Date().toISOString(),
    expiryWindow:{days:filters.expiryDays,through:threshold},
    needsReplenishment:{items:needsReplenishment,total:needsCount,hasMore:needsCount>needsReplenishment.length},
    expiring:{items:expiring,total:expiringCount,hasMore:expiringCount>expiring.length},
    expired:{items:expired,total:expiredCount,hasMore:expiredCount>expired.length},
    shopping:{items:pending,total:pendingCount,hasMore:pendingCount>pending.length},
    recommendedActions:actions,
  };
}
