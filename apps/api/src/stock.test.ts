import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openDatabase, seedShoppingChannels } from "@al1s-wms/db";
import { buildApp } from "./app.js";
import { getHomeOverview, listBatches, listItems, listTransactions } from "./queries.js";
import { receiveShopping, saveShopping } from "./shopping.js";
import { exhaustOpenedConsumable, InventoryError, listOpenedConsumables, reconcileStock, recordStock, stockAt } from "./stock.js";

function fixture() {
  const db = openDatabase(":memory:");
  const homeId = randomUUID(), locationId = randomUUID(), itemId = randomUUID();
  db.prepare("INSERT INTO homes(id,name) VALUES (?,?)").run(homeId,"测试家庭");
  db.prepare("INSERT INTO locations(id,home_id,name) VALUES (?,?,?)").run(locationId,homeId,"储物柜");
  db.prepare("INSERT INTO items(id,home_id,sku,name,category,base_unit,default_location_id) VALUES (?,?,?,?,?,?,?)")
    .run(itemId,homeId,itemId,"牛奶","食品","瓶",locationId);
  return {db,homeId,locationId,itemId};
}

test("fractional stock rounds to hundredths without ghost balances or replenishment", async () => {
  const {db,homeId,itemId,locationId}=fixture();
  db.prepare("UPDATE items SET reorder_point=0.67 WHERE id=?").run(itemId);
  const userId=randomUUID(),sessionId=randomUUID();
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)").run(userId,"fractional-user","unused",new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)").run(sessionId,userId,"2099-01-01T00:00:00.000Z");
  const app=await buildApp(db);
  const headers={cookie:`session=${sessionId}`};
  try {
    const receipt=recordStock(db,homeId,"receipt",{itemId,locationId,quantity:0.66700000001,idempotencyKey:"fractional-receipt"});
    assert.equal(receipt.afterQuantity,0.67);
    assert.equal((listItems(db,homeId,{}) as {quantity:number}[])[0].quantity,0.67);
    assert.equal(getHomeOverview(db,homeId,{}).needsReplenishment.total,0);
    const issued=recordStock(db,homeId,"issue",{itemId,locationId,quantity:0.67,idempotencyKey:"fractional-issue"});
    assert.equal(issued.afterQuantity,0);
    assert.equal(stockAt(db,homeId,itemId,locationId),0);
    assert.equal((listBatches(db,homeId,{itemId,includeEmpty:"true"}) as unknown as {items:{quantity:number}[]}).items[0].quantity,0);
    const home=await app.inject({method:"GET",url:`/api/v1/homes/${homeId}/shopping-list`,headers});
    assert.equal(home.json()[0].quantity,0.67);
    assert.equal(getHomeOverview(db,homeId,{}).needsReplenishment.items[0].suggestedQuantity,0.67);
    assert.equal((await app.inject({method:"GET",url:`/api/v1/homes/${homeId}/stock`,headers})).json()[0].quantity,0);

    // Older ledgers can contain high-precision values; their visible and allocatable balance is still 0.01-based.
    const legacy=recordStock(db,homeId,"receipt",{itemId,locationId,quantity:0.67,idempotencyKey:"legacy-fractional"});
    db.prepare("UPDATE stock_transactions SET quantity=? WHERE id=?").run(0.66700000001,legacy.transactions[0].id);
    assert.equal(stockAt(db,homeId,itemId,locationId),0.67);
    assert.equal(recordStock(db,homeId,"issue",{itemId,locationId,quantity:0.67,idempotencyKey:"legacy-issue"}).afterQuantity,0);
    assert.equal(getHomeOverview(db,homeId,{}).needsReplenishment.items[0].suggestedQuantity,0.67);
  } finally { await app.close(); db.close(); }
});

test("item creation requires location for fractional initial stock and normalizes quantity", async () => {
  const {db,homeId,locationId}=fixture();
  const userId=randomUUID(),sessionId=randomUUID();
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)").run(userId,"create-fractional","unused",new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)").run(sessionId,userId,"2099-01-01T00:00:00.000Z");
  const app=await buildApp(db),headers={cookie:`session=${sessionId}`},url=`/api/v1/homes/${homeId}/items`;
  const payload={name:"玉米",category:"食品",baseUnit:"个",reorderPoint:0.66700000001,reorderQuantity:0,initialStock:0.66700000001};
  try {
    const invalid=await app.inject({method:"POST",url,headers,payload});
    assert.equal(invalid.statusCode,400,invalid.body);
    assert.equal(invalid.json().code,"LOCATION_REQUIRED");
    assert.equal((db.prepare("SELECT count(*) AS n FROM items WHERE name='玉米'").get() as {n:number}).n,0);
    const created=await app.inject({method:"POST",url,headers,payload:{...payload,locationId}});
    assert.equal(created.statusCode,201,created.body);
    const id=created.json().id;
    assert.equal(stockAt(db,homeId,id,locationId),0.67);
    assert.equal((listItems(db,homeId,{query:"玉米"}) as {reorderPoint:number}[])[0].reorderPoint,0.67);
    assert.equal(getHomeOverview(db,homeId,{}).needsReplenishment.total,0);
    const changed=await app.inject({method:"PATCH",url:`${url}/${id}`,headers,payload:{reorderPoint:1.33700000001}});
    assert.equal(changed.statusCode,200,changed.body);
    assert.equal((listItems(db,homeId,{query:"玉米"}) as {reorderPoint:number}[])[0].reorderPoint,1.34);
    assert.equal(getHomeOverview(db,homeId,{}).needsReplenishment.items[0].suggestedQuantity,0.67);
  } finally { await app.close(); db.close(); }
});

test("editing a batch expiry refreshes item dates and preserves other batches", async () => {
  const {db, homeId, locationId, itemId} = fixture();
  const userId=randomUUID(), sessionId=randomUUID();
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)").run(userId,"batch-editor","unused",new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)").run(sessionId,userId,"2099-01-01T00:00:00.000Z");
  const first=recordStock(db,homeId,"receipt",{itemId,locationId,quantity:2,expiryDate:"2028-01-01",idempotencyKey:"batch-first"}).transactions[0].batchId;
  const second=recordStock(db,homeId,"receipt",{itemId,locationId,quantity:3,expiryDate:"2029-01-01",idempotencyKey:"batch-second"}).transactions[0].batchId;
  const app=await buildApp(db);
  const url=`/api/v1/homes/${homeId}/batches/${first}`;
  const headers={cookie:`session=${sessionId}`};
  try {
    const changed=await app.inject({method:"PATCH",url,headers,payload:{expiryDate:"2030-06-30"}});
    assert.equal(changed.statusCode,200,changed.body);
    assert.equal(changed.json().expiryDate,"2030-06-30");
    const batches=await app.inject({method:"GET",url:`/api/v1/homes/${homeId}/batches?itemId=${itemId}&batchId=${first}&includeEmpty=true`,headers});
    assert.equal(batches.statusCode,200,batches.body);
    assert.equal(batches.json().items[0].expiryDate,"2030-06-30");
    assert.equal(batches.json().items.length,1);
    const unrelated=await app.inject({method:"GET",url:`/api/v1/homes/${homeId}/batches?itemId=${itemId}&batchId=${randomUUID()}&includeEmpty=true`,headers});
    assert.equal(unrelated.json().total,0);
    assert.equal((db.prepare("SELECT expiry_date AS expiryDate FROM stock_batches WHERE id=?").get(second) as {expiryDate:string}).expiryDate,"2029-01-01");
    assert.equal((listItems(db,homeId,{}) as {expiryDate:string|null}[])[0].expiryDate,"2029-01-01");
    assert.equal((await app.inject({method:"PATCH",url,headers,payload:{expiryDate:"2027-12-31"}})).statusCode,200);
    assert.equal((listItems(db,homeId,{}) as {expiryDate:string|null}[])[0].expiryDate,"2027-12-31");
    assert.equal((await app.inject({method:"PATCH",url,headers,payload:{expiryDate:null}})).statusCode,200);
    assert.equal((listItems(db,homeId,{}) as {expiryDate:string|null}[])[0].expiryDate,"2029-01-01");
    assert.equal((await app.inject({method:"PATCH",url,headers,payload:{expiryDate:"not-a-date"}})).statusCode,400);
  } finally {
    await app.close();
    db.close();
  }
});

test("item query is unambiguous and supports paged results", () => {
  const {db,homeId,itemId} = fixture();
  const rows = listItems(db,homeId,{}) as {id:string}[];
  assert.deepEqual(rows.map(row=>row.id),[itemId]);
  const page = listItems(db,homeId,{paged:"true",limit:"1",offset:"0"}) as unknown as {items:{id:string}[];total:number};
  assert.equal(page.total,1);
  assert.equal(page.items[0].id,itemId);
  db.close();
});

test("item query includes the most recent receipt time", () => {
  const {db,homeId,itemId,locationId}=fixture();
  recordStock(db,homeId,"receipt",{itemId,locationId,quantity:1,idempotencyKey:"latest-receipt"});
  db.prepare("UPDATE stock_batches SET received_at=? WHERE item_id=?").run("2026-09-18T12:00:00.000Z",itemId);
  const item=listItems(db,homeId,{}) as {latestReceivedAt:string|null}[];
  assert.equal(item[0].latestReceivedAt,"2026-09-18T12:00:00.000Z");
  db.close();
});

test("long-term consumables open before they are exhausted", () => {
  const {db,homeId,itemId,locationId}=fixture();
  db.prepare("UPDATE items SET consumption_type='long_term_consumable',opened_shelf_life_days=5 WHERE id=?").run(itemId);
  recordStock(db,homeId,"receipt",{itemId,locationId,quantity:2,expiryDate:"2099-01-01",idempotencyKey:"long-term-receipt"});
  const opened=recordStock(db,homeId,"issue",{itemId,locationId,quantity:1,idempotencyKey:"long-term-open"});
  assert.equal(opened.action,"opened");
  assert.equal(opened.afterQuantity,2);
  assert.equal(listOpenedConsumables(db,homeId).length,1);
  assert.ok(listOpenedConsumables(db,homeId)[0]!.openedExpiryDate);
  assert.throws(()=>recordStock(db,homeId,"issue",{itemId,locationId,quantity:2,idempotencyKey:"open-too-many"}),error=>error instanceof InventoryError&&error.code==="INSUFFICIENT_UNOPENED_STOCK");
  const record=listOpenedConsumables(db,homeId)[0]!;
  const exhausted=exhaustOpenedConsumable(db,homeId,{id:record.id,idempotencyKey:"long-term-exhaust"});
  assert.equal(exhausted.afterQuantity,1);
  assert.equal(listOpenedConsumables(db,homeId).length,0);
  db.close();
});

test("item history is paged by newest transaction and has supporting indexes", () => {
  const {db,homeId,itemId,locationId}=fixture();
  for(let index=0;index<12;index++) {
    recordStock(db,homeId,"receipt",{itemId,locationId,quantity:1,idempotencyKey:`history-${index}`});
    db.prepare("UPDATE stock_transactions SET occurred_at=? WHERE idempotency_key=?").run(`2026-09-${String(index+1).padStart(2,"0")}T10:00:00.000Z`,`history-${index}:0`);
  }
  const first=listTransactions(db,homeId,{itemId,limit:10,offset:0}) as unknown as {items:{idempotencyKey:string}[];total:number;hasMore:boolean};
  const second=listTransactions(db,homeId,{itemId,limit:10,offset:10}) as unknown as typeof first;
  assert.equal(first.total,12);
  assert.equal(first.items[0].idempotencyKey,"history-11:0");
  assert.equal(first.hasMore,true);
  assert.equal(second.items.length,2);
  const indexNames=(table:string)=>new Set((db.prepare(`PRAGMA index_list(${table})`).all() as {name:string}[]).map(index=>index.name));
  const expected:Record<string,string[]>={
    stock_transactions:["idx_stock_item_history","idx_stock_batch_balance","idx_stock_batch_receipts"],
    stock_batches:["idx_batches_item_received","idx_batches_financial_received","idx_batches_item_channel_price","idx_batches_item_price_history","idx_batches_expiry","idx_batches_shopping_item"],
    shopping_list:["idx_shopping_pending","idx_shopping_pending_item","idx_shopping_category","idx_shopping_location"],
    items:["idx_items_active_name","idx_items_active_category","idx_items_active_location"],
    locations:["idx_locations_tree"],
    item_categories:["idx_categories_tree"],
    shopping_channels:["idx_channels_active_sort"],
    api_tokens:["idx_api_tokens_user_active"],
  };
  for(const [table,names] of Object.entries(expected))for(const name of names)assert.ok(indexNames(table).has(name),`${table}.${name}`);
  db.close();
});

test("receipts create batches and issues allocate FEFO idempotently", () => {
  const {db,homeId,locationId,itemId} = fixture();
  const receive = (quantity:number, expiryDate:string|null, key:string) =>
    recordStock(db,homeId,"receipt",{itemId,locationId,quantity,expiryDate,idempotencyKey:key});
  const late = receive(5,"2027-06-01","late").transactions[0].batchId;
  const early = receive(3,"2027-01-01","early").transactions[0].batchId;
  const undated = receive(2,null,"undated").transactions[0].batchId;
  assert.equal(db.prepare("SELECT reason FROM stock_transactions WHERE idempotency_key='early:0'").get()?.reason,"reason.newBatch");
  const issueInput = {itemId,locationId,quantity:6,idempotencyKey:"issue-fefo"};
  const issued = recordStock(db,homeId,"issue",issueInput);
  assert.deepEqual(issued.transactions.map(row=>[row.batchId,row.quantity]),[[early,3],[late,3]]);
  assert.equal(issued.issueReason,"used");
  assert.deepEqual(db.prepare("SELECT DISTINCT reason FROM stock_transactions WHERE type='issue'").all().map(row=>row.reason),["reason.fefoIssue"]);
  const englishHistory=listTransactions(db,homeId,{type:"issue"},"en-US") as unknown as {items:{reason:string}[]};
  assert.equal(englishHistory.items[0].reason,"Issue by earliest expiry");
  assert.deepEqual(recordStock(db,homeId,"issue",issueInput),issued);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stock_transactions WHERE type='issue'").get() as {n:number}).n,2);
  const batches = listBatches(db,homeId,{itemId,includeEmpty:"true"}) as unknown as {items:{batchId:string;quantity:number}[]};
  assert.deepEqual(new Map(batches.items.map(row=>[row.batchId,row.quantity])),new Map([[early,0],[late,2],[undated,2]]));
  assert.throws(
    () => recordStock(db,homeId,"issue",{itemId,locationId,batchId:early,quantity:1,idempotencyKey:"empty-batch"}),
    (error:unknown) => error instanceof InventoryError && error.code === "INSUFFICIENT_STOCK",
  );
  recordStock(db,homeId,"issue",{itemId,locationId,quantity:1,idempotencyKey:"expired-disposal",issueReason:"expired"});
  recordStock(db,homeId,"issue",{itemId,locationId,quantity:1,idempotencyKey:"damaged-disposal",issueReason:"damaged"});
  assert.deepEqual(
    db.prepare("SELECT issue_reason AS issueReason FROM stock_transactions WHERE idempotency_key IN ('expired-disposal:0','damaged-disposal:0') ORDER BY issue_reason").all().map(row=>row.issueReason),
    ["damaged","expired"],
  );
  db.close();
});

test("shopping receipt creates one batch and safe retries do not duplicate stock", () => {
  const {db,homeId,locationId} = fixture();
  const purchase = saveShopping(db,homeId,{name:"纸巾",quantity:4,unit:"包",category:"日用品",locationId});
  const input = {actualQuantity:5,idempotencyKey:"purchase-retry",manufacturedDate:"2026-09-01",expiryDate:"2028-09-01"};
  const first = receiveShopping(db,homeId,purchase.id,input);
  const second = receiveShopping(db,homeId,purchase.id,input);
  assert.deepEqual(second,first);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stock_transactions WHERE item_id=?").get(first.itemId) as {n:number}).n,1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stock_batches WHERE item_id=?").get(first.itemId) as {n:number}).n,1);
  db.close();
});

test("receiving an automatic suggestion materializes a completed purchase", () => {
  const {db,homeId,itemId,locationId}=fixture();
  db.prepare("UPDATE items SET reorder_point=3 WHERE id=?").run(itemId);
  const received=receiveShopping(db,homeId,`auto:${itemId}`,{actualQuantity:3,idempotencyKey:"auto-purchase"});
  assert.match(received.shoppingItemId,/^[0-9a-f-]{36}$/i);
  const purchase=db.prepare("SELECT source,completed,item_id AS itemId,quantity FROM shopping_list WHERE id=?").get(received.shoppingItemId) as {source:string;completed:number;itemId:string;quantity:number};
  assert.equal(purchase.source,"automatic");
  assert.equal(purchase.completed,1);
  assert.equal(purchase.itemId,itemId);
  assert.equal(purchase.quantity,3);
  assert.equal((db.prepare("SELECT shopping_item_id AS shoppingItemId FROM stock_batches WHERE item_id=?").get(itemId) as {shoppingItemId:string}).shoppingItemId,received.shoppingItemId);
  db.close();
});

test("shopping plans validate channels and materialize automatic suggestions",()=>{
  const {db,homeId,itemId}=fixture();
  seedShoppingChannels(db,homeId);
  const channelId=db.prepare("SELECT id FROM shopping_channels WHERE home_id=? AND name='京东'").get(homeId)?.id as string;
  db.prepare("UPDATE items SET reorder_point=3 WHERE id=?").run(itemId);
  const planned=saveShopping(db,homeId,{channelId,plannedDate:"2026-10-08"},`auto:${itemId}`);
  assert.equal(planned.itemId,itemId);
  assert.equal(planned.channelName,"京东");
  assert.equal(planned.plannedDate,"2026-10-08");
  assert.equal(planned.id.startsWith("auto:"),false);
  assert.equal(planned.source,"automatic");
  assert.equal(saveShopping(db,homeId,{plannedDate:"2026-10-09"},planned.id).source,"automatic","editing a persisted recommendation retains its automatic source");
  const otherHome=randomUUID(),otherChannel=randomUUID();
  db.prepare("INSERT INTO homes(id,name) VALUES (?,?)").run(otherHome,"其他家");
  db.prepare("INSERT INTO shopping_channels(id,home_id,name) VALUES (?,?,?)").run(otherChannel,otherHome,"其他渠道");
  assert.throws(()=>saveShopping(db,homeId,{itemId,channelId:otherChannel}),/购买渠道/);
  db.close();
});

test("overview returns actionable stock, expiry, and shopping state", () => {
  const {db,homeId,locationId,itemId} = fixture();
  db.prepare("UPDATE items SET reorder_point=5 WHERE id=?").run(itemId);
  recordStock(db,homeId,"receipt",{itemId,locationId,quantity:2,idempotencyKey:"overview-stock",expiryDate:"2020-01-01"});
  saveShopping(db,homeId,{itemId,quantity:3});
  const overview=getHomeOverview(db,homeId,{expiryDays:"30",limit:"10"});
  assert.equal(overview.needsReplenishment.total,1);
  assert.equal(overview.expired.total,1);
  assert.equal(overview.shopping.total,1,"a persisted purchase suppresses its duplicate automatic recommendation");
  assert.equal(overview.recommendedActions[0].type,"handle_expired");
  assert.equal(overview.recommendedActions[0].message,"牛奶 批次已于 2020-01-01 过期");
  assert.equal(overview.recommendedActions.some(action=>action.type==="buy_pending"),true);
  db.close();
});

test("physical reconciliation records shortages by FEFO and gains as a new batch", () => {
  const {db,homeId,locationId,itemId} = fixture();
  recordStock(db,homeId,"receipt",{itemId,locationId,quantity:10,idempotencyKey:"opening",expiryDate:"2027-01-01"});
  const shortage={itemId,locationId,countedQuantity:7,idempotencyKey:"count-short"};
  const first=reconcileStock(db,homeId,shortage);
  assert.equal(first.difference,-3);
  assert.equal(first.action,"issue");
  assert.deepEqual(reconcileStock(db,homeId,shortage),first);
  const gain=reconcileStock(db,homeId,{itemId,locationId,countedQuantity:12,idempotencyKey:"count-gain",manufacturedDate:"2026-09-01",expiryDate:"2027-09-01"});
  assert.equal(gain.difference,5);
  assert.equal(gain.action,"receipt");
  assert.equal(gain.transactions.length,1);
  const unchanged=reconcileStock(db,homeId,{itemId,locationId,countedQuantity:12,idempotencyKey:"count-same"});
  assert.equal(unchanged.action,"none");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM stock_transactions WHERE item_id=?").get(itemId) as {n:number}).n,3);
  db.close();
});

test("pausing replenishment preserves stock and manual purchase plans",async()=>{
  const {db,homeId,itemId,locationId}=fixture();
  const userId=randomUUID(),sessionId=randomUUID(),otherHomeId=randomUUID();
  db.prepare("INSERT INTO homes(id,name) VALUES (?,?)").run(otherHomeId,"Other");
  db.prepare("UPDATE items SET reorder_point=2 WHERE id=?").run(itemId);
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)").run(userId,"pause-user","unused",new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)").run(sessionId,userId,"2099-01-01T00:00:00.000Z");
  const app=await buildApp(db),headers={cookie:`session=${sessionId}`},base=`/api/v1/homes/${homeId}`;
  try {
    assert.equal((await app.inject({method:"GET",url:`${base}/shopping-list`,headers})).json().some((row:{itemId:string})=>row.itemId===itemId),true);
    const manual=await app.inject({method:"POST",url:`${base}/shopping-list`,headers,payload:{itemId,quantity:1}});
    assert.equal(manual.statusCode,201);
    const paused=await app.inject({method:"PATCH",url:`${base}/items/${itemId}`,headers,payload:{replenishmentPaused:true}});
    assert.equal(paused.statusCode,200);
    assert.equal(paused.json().replenishmentPaused,true);
    assert.equal((await app.inject({method:"GET",url:`${base}/shopping-list`,headers})).json().some((row:{id:string})=>row.id===manual.json().id),true);
    assert.equal((await app.inject({method:"GET",url:`${base}/items`,headers})).json()[0].replenishmentPaused,true);
    assert.equal((await app.inject({method:"GET",url:`${base}/overview`,headers})).json().needsReplenishment.total,0);
    assert.equal((await app.inject({method:"PATCH",url:`/api/v1/homes/${otherHomeId}/items/${itemId}`,headers,payload:{replenishmentPaused:false}})).statusCode,404);
    recordStock(db,homeId,"receipt",{itemId,locationId,quantity:1,idempotencyKey:"paused-receipt"});
    assert.equal((await app.inject({method:"GET",url:`${base}/items/${itemId}`,headers})).json().replenishmentPaused,true);
    const resumed=await app.inject({method:"PATCH",url:`${base}/items/${itemId}`,headers,payload:{replenishmentPaused:false}});
    assert.equal(resumed.json().replenishmentPaused,false);
    assert.equal((await app.inject({method:"GET",url:`${base}/overview`,headers})).json().needsReplenishment.total,1);
  } finally {await app.close();db.close();}
});

test("automatic purchases estimate from the latest priced receipt and preserve estimates on receiving", async () => {
  const {db,homeId,itemId,locationId}=fixture();
  db.prepare("UPDATE items SET reorder_point=10 WHERE id=?").run(itemId);
  const userId=randomUUID(),sessionId=randomUUID();
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)").run(userId,"price-user","unused",new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)").run(sessionId,userId,"2099-01-01T00:00:00.000Z");
  const app=await buildApp(db);
  const suggestions=async()=> (await app.inject({method:"GET",url:`/api/v1/homes/${homeId}/shopping-list`,headers:{cookie:`session=${sessionId}`}})).json();
  try {
    assert.equal((await suggestions())[0].estimatedTotal,null);
    recordStock(db,homeId,"receipt",{itemId,locationId,quantity:2,totalPrice:5,purchaseDate:"2026-01-01",idempotencyKey:"older-price"});
    recordStock(db,homeId,"receipt",{itemId,locationId,quantity:3,totalPrice:10,purchaseDate:"2026-02-01",idempotencyKey:"latest-price"});
    recordStock(db,homeId,"receipt",{itemId,locationId,quantity:1,purchaseDate:"2026-03-01",idempotencyKey:"unknown-price"});
    assert.equal((await suggestions())[0].estimatedTotal,13.33);
    assert.equal(getHomeOverview(db,homeId,{}).shopping.items[0].estimatedTotal,13.33);
    const other=randomUUID();
    db.prepare("INSERT INTO homes(id,name) VALUES (?,?)").run(other,"Other");
    const {estimateShoppingTotal}=await import("./shopping.js");
    assert.equal(estimateShoppingTotal(db,other,itemId,4),null);
    const saved=saveShopping(db,homeId,{quantity:2},`auto:${itemId}`);
    assert.equal(saved.estimatedTotal,6.67);
    db.prepare("DELETE FROM shopping_list WHERE id=?").run(saved.id);
    const receipt=receiveShopping(db,homeId,`auto:${itemId}`,{actualQuantity:1,completion:"keep",idempotencyKey:"automatic-priced-receipt"});
    assert.equal(receipt.estimatedTotal,13.33);
    assert.equal(db.prepare("SELECT estimated_total_minor AS total FROM shopping_list WHERE id=?").get(receipt.shoppingItemId)!.total,1000);
  } finally {await app.close();db.close();}
});
