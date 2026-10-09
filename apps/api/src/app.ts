import {listWorkflowOperations,undoWorkflowOperation,previewStocktake,previewCategoryStocktake,confirmStocktake} from "./workflows.js";
import {normalizeConsumptionInput} from "./consumption.js";
import { itemBalanceSqlFor } from "./queryHelpers.js";
import { nonnegativeQuantity, roundQuantity } from "./quantity.js";
import {createAuth} from "./auth.js";
import Fastify from "fastify";
import { z } from "zod";
import { listItems, listTransactions, listBatches, getHomeOverview } from "./queries.js";
import { atomic, batchDates, batchBalanceQuery, exhaustOpenedConsumable, InventoryError, listOpenedConsumables, moneySchema, reconcileStock, recordItemEvent, recordStock, refreshItemDates, requireStockTarget, transferStock, validateDates } from "./stock.js";
import { saveShopping, receiveShopping, estimateShoppingTotal } from "./shopping.js";
import { lookupBarcode, normalizeBarcode } from "./barcodes.js";
import { financialDashboard, financialSummary, financialTrend, inventoryCostAnalysis, listMissingCosts, listPurchaseRecords, itemPriceHistory, saveFinancialBudget } from "./pricing.js";
import fastifyStatic from "@fastify/static";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createItemSchema,
  updateItemSchema,
  type Item,
} from "@al1s-wms/contracts";
import { openDatabase, seedShoppingChannels } from "@al1s-wms/db";
import { handleMcpRequest } from "./mcp.js";
import { deleteInventoryEntity, DeleteError } from "./inventory-delete.js";
import { parseAcceptLanguage, sendCodeError, sendError } from "./i18n/index.js";

export async function buildApp(db = openDatabase()) {
const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
const localeOf = (request: { headers: Record<string, unknown> }) =>
  parseAcceptLanguage(request.headers["accept-language"]);
app.setErrorHandler((error, request, reply) => {
  const locale = localeOf(request);
  if (error instanceof z.ZodError) return sendError(reply,locale,400,{ code: "VALIDATION_ERROR", key: "error.validation", details: error.flatten() });
  if (error instanceof InventoryError) return reply.code(error.status).send({ code: error.code, message: error.localized(locale) });
  request.log.error(error);
  return sendError(reply,locale,500,{ code: "INTERNAL_ERROR", key: "error.internal" });
});
const defaultCategories = [
  "食品",
  "饮品",
  "日用品",
  "药品与健康",
  "衣物",
  "工具",
  "电器",
  "文具",
  "宠物用品",
  "其他",
];
const supportedCurrencies=["CNY","USD","EUR","JPY","GBP","HKD"] as const;
for (const home of db.prepare("SELECT id FROM homes").all() as { id: string }[]) {
  for (const name of defaultCategories)
    db.prepare(
      "INSERT OR IGNORE INTO item_categories (id, home_id, name, is_system) VALUES (?, ?, ?, 1)",
    ).run(randomUUID(), home.id, name);
  seedShoppingChannels(db,home.id);
}

const {setSession,passwordMatches,sessionUser,tokenUser}=createAuth(db);
function wouldCreateCycle(
  table: "locations" | "item_categories",
  id: string,
  parentId: string | null,
  homeId: string,
) {
  let current = parentId;
  while (current) {
    if (current === id) return true;
    const row = db
      .prepare(
        `SELECT parent_id AS parentId FROM ${table} WHERE id = ? AND home_id = ? AND active = 1`,
      )
      .get(current, homeId) as { parentId: string | null } | undefined;
    current = row?.parentId ?? null;
  }
  return false;
}

app.addHook("preHandler", async (request, reply) => {
  if (request.url.split("?")[0] === "/mcp") {
    if (!tokenUser(request))
      return sendCodeError(reply.header("www-authenticate", "Bearer"),localeOf(request),401,"INVALID_API_TOKEN","error.invalidApiToken");
    return;
  }
  const publicPath =
    (!request.url.startsWith("/api/") &&
      !request.url.startsWith("/mcp")) ||
    request.url === "/healthz" ||
    request.url === "/api/v1/setup/status" ||
    request.url === "/api/v1/setup" ||
    request.url === "/api/v1/auth/login";
  if (publicPath) return;
  if (sessionUser(request)) return;
  const token = request.url.startsWith("/api/v1/homes") ? tokenUser(request) : undefined;
  if (!token) return sendCodeError(reply,localeOf(request),401,"UNAUTHENTICATED","error.unauthenticated");
  const requestedHome = request.url.split("?")[0].match(/^\/api\/v1\/homes\/([^/]+)/)?.[1];
  if (token.homeId && requestedHome && requestedHome !== token.homeId)
    return sendError(reply,localeOf(request),403,{ code: "HOME_SCOPE_FORBIDDEN", key: "error.homeScopeOther" });
  if (token.homeId && request.url.split("?")[0] === "/api/v1/homes" && request.method !== "GET")
    return sendError(reply,localeOf(request),403,{ code: "HOME_SCOPE_FORBIDDEN", key: "error.homeScopeCreate" });
});

app.get("/api/v1/auth/tokens", async (request) => {
  const user = sessionUser(request) as { id: string };
  return db
    .prepare(
      "SELECT api_tokens.id, api_tokens.name, api_tokens.home_id AS homeId, homes.name AS homeName, token_prefix AS tokenPrefix, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM api_tokens LEFT JOIN homes ON homes.id=api_tokens.home_id WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
    )
    .all(user.id);
});

app.post<{ Body: unknown }>("/api/v1/auth/tokens", async (request, reply) => {
  const user = sessionUser(request) as { id: string };
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const homeId = body.homeId === null ? null : typeof body.homeId === "string" ? body.homeId : undefined;
  if (!name || name.length > 80)
    return sendCodeError(reply,localeOf(request),400,"INVALID_TOKEN_NAME","error.invalidTokenName");
  if (homeId === undefined)
    return sendError(reply,localeOf(request),400,{ code: "TOKEN_SCOPE_REQUIRED", key: "error.tokenScopeRequired" });
  if (homeId && !db.prepare("SELECT 1 FROM homes WHERE id=? AND active=1").get(homeId))
    return sendError(reply,localeOf(request),400,{ code: "HOME_NOT_FOUND", key: "error.selectedHomeNotFound" });
  const token = `al1s_${randomBytes(32).toString("hex")}`;
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const tokenPrefix = `${token.slice(0, 13)}…`;
  db.prepare(
    "INSERT INTO api_tokens (id, user_id, home_id, name, token_hash, token_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    user.id,
    homeId,
    name,
    createHash("sha256").update(token).digest("hex"),
    tokenPrefix,
    createdAt,
  );
  return reply.code(201).send({ id, name, homeId, token, tokenPrefix, createdAt });
});

app.delete<{ Params: { tokenId: string } }>(
  "/api/v1/auth/tokens/:tokenId",
  async (request, reply) => {
    const user = sessionUser(request) as { id: string };
    const result = db
      .prepare(
        "UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
      )
      .run(new Date().toISOString(), request.params.tokenId, user.id);
    return result.changes
      ? { id: request.params.tokenId, revoked: true }
      : sendCodeError(reply,localeOf(request),404,"TOKEN_NOT_FOUND","error.tokenNotFound");
  },
);

app.get(
  "/api/v1/auth/me",
  async (request, reply) =>
    sessionUser(request) ?? sendCodeError(reply,localeOf(request),401,"UNAUTHENTICATED","error.unauthenticated"),
);
app.patch<{Body:unknown}>("/api/v1/auth/me",async(request,reply)=>{
  const user=sessionUser(request) as {id:string}|undefined;
  if(!user)return sendCodeError(reply,localeOf(request),401,"UNAUTHENTICATED","error.unauthenticated");
  const input=z.object({avatar:z.enum(["user","woman","cat","dog","bot"])}).strict().parse(request.body);
  db.prepare("UPDATE users SET avatar=? WHERE id=?").run(input.avatar,user.id);
  return {...user,avatar:input.avatar};
});
app.post<{Body:unknown}>("/api/v1/auth/password",async(request,reply)=>{
  const user=sessionUser(request) as {id:string}|undefined;
  if(!user)return sendCodeError(reply,localeOf(request),401,"UNAUTHENTICATED","error.unauthenticated");
  const body=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
  const currentPassword=typeof body.currentPassword==="string"?body.currentPassword:"";
  const newPassword=typeof body.newPassword==="string"?body.newPassword:"";
  if(newPassword.length<8||newPassword.length>256)
    return sendError(reply,localeOf(request),400,{code:"INVALID_NEW_PASSWORD",key:"error.invalidNewPassword"});
  const row=db.prepare("SELECT password_hash AS passwordHash FROM users WHERE id=?").get(user.id) as {passwordHash:string};
  if(!passwordMatches(currentPassword,row.passwordHash))
    return sendError(reply,localeOf(request),401,{code:"INVALID_CURRENT_PASSWORD",key:"error.invalidCurrentPassword"});
  if(passwordMatches(newPassword,row.passwordHash))
    return sendError(reply,localeOf(request),400,{code:"PASSWORD_UNCHANGED",key:"error.passwordUnchanged"});
  const salt=randomBytes(16).toString("hex");
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(`${salt}:${scryptSync(newPassword,salt,64).toString("hex")}`,user.id);
  return {changed:true};
});
app.post<{ Body: unknown }>("/api/v1/auth/login", async (request, reply) => {
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const user = db
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: string; password_hash: string } | undefined;
  if (!user)
    return sendError(reply,localeOf(request),401,{ code: "INVALID_CREDENTIALS", key: "error.invalidCredentials" });
  if (!passwordMatches(password,user.password_hash))
    return sendError(reply,localeOf(request),401,{ code: "INVALID_CREDENTIALS", key: "error.invalidCredentials" });
  setSession(reply, user.id);
  return { username };
});

app.get("/api/v1/setup/status", async () => {
  const setting = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };
  const home = db
    .prepare("SELECT id, name, icon, default_currency AS defaultCurrency FROM homes ORDER BY rowid LIMIT 1")
    .get() as { id: string; name: string; icon: string; defaultCurrency:string } | undefined;
  return { complete: setting.count > 0, home };
});

app.post<{ Body: unknown }>("/api/v1/setup", async (request, reply) => {
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const homeName =
    typeof body.homeName === "string" ? body.homeName.trim() : "";
  const homeIcon =
    typeof body.homeIcon === "string" && body.homeIcon ? body.homeIcon : "🏠";
  const timezone =
    typeof body.timezone === "string" && body.timezone
      ? body.timezone
      : "Asia/Shanghai";
  const currency =
    typeof body.currency === "string" && body.currency ? body.currency : "CNY";
  const locationNames = Array.isArray(body.locations)
    ? body.locations
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  if (
    username.length < 2 ||
    password.length < 8 ||
    !homeName ||
    locationNames.length === 0
  )
    return sendError(reply,localeOf(request),400,{ code: "SETUP_INVALID", key: "error.setupInvalid" });
  const complete = db
    .prepare("SELECT value FROM app_settings WHERE key = 'setup_complete'")
    .get() as { value: string } | undefined;
  if (complete?.value === "true")
    return sendCodeError(reply,localeOf(request),409,"SETUP_COMPLETE","error.setupComplete");
  const homeId = randomUUID();
  const userId = randomUUID();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const insert = db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
  );
  const home = db.prepare(
    "INSERT INTO homes (id, name, icon, timezone, default_currency) VALUES (?, ?, ?, ?, ?)",
  );
  const location = db.prepare(
    "INSERT INTO locations (id, home_id, name) VALUES (?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    insert.run(userId, username, passwordHash, new Date().toISOString());
    home.run(homeId, homeName, homeIcon, timezone, currency);
    for (const name of defaultCategories)
      db.prepare(
        "INSERT INTO item_categories (id, home_id, name, is_system) VALUES (?, ?, ?, 1)",
      ).run(randomUUID(), homeId, name);
    seedShoppingChannels(db,homeId);
    for (const name of [...new Set(locationNames)])
      location.run(randomUUID(), homeId, name);
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('setup_complete', 'true')",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  setSession(reply, userId);
  return reply
    .code(201)
    .send({ home: { id: homeId, name: homeName, icon: homeIcon }, username });
});

app.get("/healthz", async () => ({ status: "ok" }));

app.get("/api/v1/homes", async request => {
  const token = tokenUser(request);
  return token?.homeId
    ? db.prepare("SELECT id, name, icon, default_currency AS defaultCurrency FROM homes WHERE active=1 AND id=?").all(token.homeId)
    : db.prepare("SELECT id, name, icon, default_currency AS defaultCurrency FROM homes WHERE active = 1 ORDER BY rowid").all();
});
app.post<{ Body: unknown }>("/api/v1/homes", async (request, reply) => {
  const body = request.body as { name?: unknown; icon?: unknown;defaultCurrency?:unknown } | null;
  if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80 || typeof body.icon !== "string" || !["house", "building", "trees", "warehouse", "castle", "leaf", "star", "🏠", "🏡", "🏢", "🏘️", "🌿", "⭐"].includes(body.icon)||body.defaultCurrency!==undefined&&!supportedCurrencies.includes(body.defaultCurrency as typeof supportedCurrencies[number]))
    return sendError(reply,localeOf(request),400,{ key: "error.homeFields" });
  const home = { id: randomUUID(), name: body.name.trim(), icon: body.icon,defaultCurrency:(body.defaultCurrency as string|undefined)??"CNY" };
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO homes (id, name, icon, timezone, default_currency) VALUES (?, ?, ?, 'Asia/Shanghai', ?)").run(home.id, home.name, home.icon,home.defaultCurrency);
    for (const name of defaultCategories)
      db.prepare("INSERT INTO item_categories (id, home_id, name, is_system) VALUES (?, ?, ?, 1)").run(randomUUID(), home.id, name);
    seedShoppingChannels(db,home.id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return reply.code(201).send(home);
});
app.patch<{ Params: { homeId: string }; Body: unknown }>("/api/v1/homes/:homeId", async (request, reply) => {
  const body = request.body as { name?: unknown; icon?: unknown;defaultCurrency?:unknown } | null;
  if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80 || typeof body.icon !== "string" || !["house", "building", "trees", "warehouse", "castle", "leaf", "star", "🏠", "🏡", "🏢", "🏘️", "🌿", "⭐"].includes(body.icon)||body.defaultCurrency!==undefined&&!supportedCurrencies.includes(body.defaultCurrency as typeof supportedCurrencies[number]))
    return sendError(reply,localeOf(request),400,{ key: "error.homeFields" });
  const currentCurrency=(db.prepare("SELECT default_currency AS currency FROM homes WHERE id=? AND active=1").get(request.params.homeId) as {currency:string}|undefined)?.currency;
  const defaultCurrency=(body.defaultCurrency as string|undefined)??currentCurrency??"CNY";
  if(currentCurrency&&defaultCurrency!==currentCurrency&&db.prepare("SELECT 1 FROM stock_batches WHERE home_id=? AND purchase_total_minor IS NOT NULL LIMIT 1").get(request.params.homeId))
    return sendError(reply,localeOf(request),409,{key:"error.currencyHasHistory"});
  const result = db.prepare("UPDATE homes SET name = ?, icon = ?,default_currency=? WHERE id = ? AND active = 1").run(body.name.trim(), body.icon,defaultCurrency, request.params.homeId);
  if (!result.changes) return sendError(reply,localeOf(request),404,{ key: "error.homeNotFound" });
  return { id: request.params.homeId, name: body.name.trim(), icon: body.icon,defaultCurrency };
});
app.post("/api/v1/auth/logout", async (request, reply) => {
  const session = request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith("session="))?.slice(8);
  if (session) db.prepare("DELETE FROM sessions WHERE id = ?").run(session);
  reply.header("set-cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  return { ok: true };
});

app.get<{ Params: { homeId: string } }>("/api/v1/homes/:homeId/items", async request => listItems(db,request.params.homeId,request.query));
app.get<{ Params: { homeId: string } }>("/api/v1/homes/:homeId/overview", async request => getHomeOverview(db,request.params.homeId,request.query,localeOf(request)));
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/financial-summary",async request=>financialSummary(db,request.params.homeId,request.query));
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/financial-dashboard",async request=>financialDashboard(db,request.params.homeId,request.query));
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/financial-trend",async request=>financialTrend(db,request.params.homeId,request.query));
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/inventory-cost-analysis",async request=>inventoryCostAnalysis(db,request.params.homeId,request.query));
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/missing-costs",async request=>listMissingCosts(db,request.params.homeId,request.query));
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/purchase-records",async request=>listPurchaseRecords(db,request.params.homeId,request.query));
app.patch<{Params:{homeId:string};Body:unknown}>("/api/v1/homes/:homeId/financial-budget",async request=>saveFinancialBudget(db,request.params.homeId,request.body));
app.get<{Params:{homeId:string;itemId:string}}>("/api/v1/homes/:homeId/items/:itemId/price-history",async request=>itemPriceHistory(db,request.params.homeId,request.params.itemId));
app.get<{Params:{homeId:string;barcode:string}}>("/api/v1/homes/:homeId/barcodes/:barcode",async request=>lookupBarcode(db,request.params.homeId,request.params.barcode));

app.get<{ Params: { homeId: string; itemId: string } }>(
  "/api/v1/homes/:homeId/items/:itemId",
  async (request, reply) => {
    const item = db
      .prepare(
        "SELECT items.icon, items.id, items.home_id AS homeId, items.sku, items.barcode, items.name, items.category, items.base_unit AS baseUnit, items.consumption_type AS consumptionType, items.opened_shelf_life_days AS openedShelfLifeDays, items.replenishment_paused AS replenishmentPaused, items.reorder_point AS reorderPoint, items.reorder_quantity AS reorderQuantity, items.manufactured_date AS manufacturedDate, items.expiry_date AS expiryDate, items.default_location_id AS locationId, locations.name AS locationName, items.active FROM items LEFT JOIN locations ON locations.id = items.default_location_id WHERE items.home_id = ? AND items.id = ? AND items.active = 1",
      )
      .get(request.params.homeId, request.params.itemId);
    return item ? {...item,replenishmentPaused:Boolean(item.replenishmentPaused)} : sendCodeError(reply,localeOf(request),404,"ITEM_NOT_FOUND","error.itemNotFound");
  },
);

app.patch<{Params:{homeId:string;itemId:string};Body:unknown}>("/api/v1/homes/:homeId/items/:itemId", async request => {
  const {homeId,itemId}=request.params;
  const existing=db.prepare("SELECT consumption_type FROM items WHERE id=? AND home_id=? AND active=1").get(itemId,homeId);
  const {syncPurchaseCategory=false,...changes}=updateItemSchema.parse(normalizeConsumptionInput(request.body,existing?.consumption_type));
  if(changes.reorderPoint!==undefined)changes.reorderPoint=nonnegativeQuantity.parse(changes.reorderPoint);
  if(changes.barcode)changes.barcode=normalizeBarcode(changes.barcode);
  requireStockTarget(db,homeId,itemId,changes.locationId??undefined);
  const current=db.prepare("SELECT * FROM items WHERE id=? AND home_id=?").get(itemId,homeId) as Record<string,any>;
  const columns:Record<string,string>={baseUnit:"base_unit",consumptionType:"consumption_type",openedShelfLifeDays:"opened_shelf_life_days",reorderPoint:"reorder_point",replenishmentPaused:"replenishment_paused",locationId:"default_location_id"};
  if(changes.barcode&&db.prepare("SELECT 1 FROM items WHERE home_id=? AND barcode=? AND id!=? AND active=1").get(homeId,changes.barcode,itemId))
    throw new InventoryError(409,"BARCODE_EXISTS","error.barcodeExists");
  if(changes.baseUnit && changes.baseUnit!==current.base_unit && db.prepare("SELECT 1 FROM stock_transactions WHERE home_id=? AND item_id=? LIMIT 1").get(homeId,itemId))
    throw new InventoryError(409,"UNIT_HAS_HISTORY","error.unitHasHistory");
  if(changes.locationId===null && db.prepare("SELECT 1 FROM stock_transactions WHERE home_id=? AND item_id=? GROUP BY item_id HAVING SUM(CASE WHEN type='receipt' THEN quantity ELSE -quantity END)>0").get(homeId,itemId))
    throw new InventoryError(409,"LOCATION_HAS_STOCK","error.locationHasStock");
  return atomic(db,()=>{
    const fields=Object.entries(changes).filter(([key,value])=>current[columns[key]??key] !== (typeof value === "boolean" ? Number(value) : value));
    if(fields.length) db.prepare(`UPDATE items SET ${fields.map(([key])=>`${columns[key]??key}=?`).join(",")} WHERE id=? AND home_id=?`).run(...fields.map(([,value])=>typeof value === "boolean" ? Number(value) : value??null),itemId,homeId);
    if(changes.locationId && changes.locationId!==current.default_location_id) {
      const balances=db.prepare("SELECT location_id AS locationId,SUM(CASE WHEN type='receipt' THEN quantity ELSE -quantity END) AS quantity FROM stock_transactions WHERE home_id=? AND item_id=? GROUP BY location_id HAVING SUM(CASE WHEN type='receipt' THEN quantity ELSE -quantity END)>0").all(homeId,itemId) as {locationId:string;quantity:number}[];
      let moved=false;
      for(const balance of balances) if(balance.locationId!==changes.locationId) {
        transferStock(db,homeId,{itemId,sourceLocationId:balance.locationId,targetLocationId:changes.locationId,quantity:balance.quantity,idempotencyKey:randomUUID()}); moved=true;
      }
      if(!moved) recordItemEvent(db,homeId,itemId,"move","更改默认存放地点",changes.locationId);
    }
    if(changes.category && changes.category!==current.category) {
      if(syncPurchaseCategory) db.prepare("UPDATE stock_batches SET purchase_category=? WHERE home_id=? AND item_id=?").run(changes.category,homeId,itemId);
      recordItemEvent(db,homeId,itemId,"reclassify",`分类变更：${current.category} → ${changes.category}`);
    }
    const other=fields.filter(([key])=>!["category","locationId"].includes(key));
    if(other.length) {
      const labels:Record<string,string>={name:"名称",icon:"图标",barcode:"条码",baseUnit:"单位",consumptionType:"消耗类型",openedShelfLifeDays:"开封后保质期（天）",reorderPoint:"最低库存",replenishmentPaused:"补货管理"};
      const consumptionLabels:Record<string,string>={non_consumable:"非消耗品",consumable:"消耗品",long_term_consumable:"长期消耗品"};
      recordItemEvent(db,homeId,itemId,"update",other.map(([key,value])=>{
        const before=current[columns[key]??key]??"自动",after=value??"自动";
        if(key==="replenishmentPaused") return `补货管理：${before?"已停购":"正常补货"} → ${after?"已停购":"正常补货"}`;
        return `${labels[key]??key}：${key==="consumptionType"?(consumptionLabels[String(before)]??before):before} → ${key==="consumptionType"?(consumptionLabels[String(after)]??after):after}`;
      }).join("；"));
    }
    const updated=db.prepare("SELECT id,icon,barcode,name,category,base_unit AS baseUnit,consumption_type AS consumptionType,opened_shelf_life_days AS openedShelfLifeDays,replenishment_paused AS replenishmentPaused,reorder_point AS reorderPoint,default_location_id AS locationId FROM items WHERE id=? AND home_id=?").get(itemId,homeId)!;
    return {...updated,replenishmentPaused:Boolean(updated.replenishmentPaused)};
  });
});

app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/stock", async request => {
  const filters=z.object({itemId:z.string().uuid().optional(),locationId:z.string().uuid().optional(),batchId:z.string().uuid().optional()}).parse(request.query);
  const where=["home_id=?"],params:string[]=[request.params.homeId];
  for(const [key,column] of [["itemId","item_id"],["locationId","location_id"],["batchId","batch_id"]] as const) if(filters[key]) {where.push(`${column}=?`);params.push(filters[key]!);}
  return (db.prepare(`SELECT item_id AS itemId,location_id AS locationId,ROUND(SUM(CASE WHEN type='receipt' THEN quantity ELSE -quantity END),2) AS quantity,MAX(CASE WHEN type='receipt' THEN occurred_at END) AS latestReceivedAt FROM stock_transactions WHERE ${where.join(" AND ")} GROUP BY item_id,location_id`).all(...params) as {quantity:number}[]).map(row=>({...row,quantity:roundQuantity(row.quantity)}));
});

app.get<{ Params: { homeId: string } }>(
  "/api/v1/homes/:homeId/locations",
  async (request) => {
    return db
      .prepare(
        "SELECT id, home_id AS homeId, parent_id AS parentId, name, active FROM locations WHERE home_id = ? AND active = 1 ORDER BY parent_id, name",
      )
      .all(request.params.homeId);
  },
);

app.get<{ Params: { homeId: string } }>(
  "/api/v1/homes/:homeId/categories",
  async (request) =>
    db
      .prepare(
        "SELECT id, parent_id AS parentId, name, is_system AS isSystem, active FROM item_categories WHERE home_id = ? AND active = 1 ORDER BY parent_id, name",
      )
      .all(request.params.homeId),
);
app.post<{ Params: { homeId: string }; Body: unknown }>(
  "/api/v1/homes/:homeId/categories",
  async (request, reply) => {
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    let name = typeof body.name === "string" ? body.name.trim() : "";
    const parentId = typeof body.parentId === "string" ? body.parentId : null;
    if (!name)
      return sendError(reply,localeOf(request),400,{ code: "VALIDATION_ERROR", key: "error.categoryNameRequired" });
    if (
      parentId &&
      !db
        .prepare(
          "SELECT id FROM item_categories WHERE id = ? AND home_id = ? AND active = 1",
        )
        .get(parentId, request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),400,"PARENT_CATEGORY_NOT_FOUND","error.parentCategoryNotFound");
    const id = randomUUID();
    try {
      db.prepare(
        "INSERT INTO item_categories (id, home_id, parent_id, name) VALUES (?, ?, ?, ?)",
      ).run(id, request.params.homeId, parentId, name);
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        return sendCodeError(reply,localeOf(request),409,"CATEGORY_EXISTS","error.categoryExists");
      throw error;
    }
    return reply
      .code(201)
      .send({ id, parentId, name, isSystem: false, active: true });
  },
);

app.patch<{ Params: { homeId: string; categoryId: string }; Body: unknown }>(
  "/api/v1/homes/:homeId/categories/:categoryId",
  async (request, reply) => {
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const parentId =
      body.parentId === null || body.parentId === ""
        ? null
        : typeof body.parentId === "string"
          ? body.parentId
          : undefined;
    if (!name || parentId === undefined)
      return sendCodeError(reply,localeOf(request),400,"VALIDATION_ERROR","error.validation");
    if (
      !db
        .prepare(
          "SELECT id FROM item_categories WHERE id = ? AND home_id = ? AND active = 1",
        )
        .get(request.params.categoryId, request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),404,"CATEGORY_NOT_FOUND","error.categoryNotFound");
    const current = db
      .prepare("SELECT name FROM item_categories WHERE id = ? AND home_id = ?")
      .get(request.params.categoryId, request.params.homeId) as {
      name: string;
    };
    if (
      parentId &&
      !db
        .prepare(
          "SELECT id FROM item_categories WHERE id = ? AND home_id = ? AND active = 1",
        )
        .get(parentId, request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),400,"PARENT_CATEGORY_NOT_FOUND","error.parentCategoryNotFound");
    if (
      wouldCreateCycle(
        "item_categories",
        request.params.categoryId,
        parentId,
        request.params.homeId,
      )
    )
      return sendCodeError(reply,localeOf(request),400,"CATEGORY_CYCLE","error.categoryCycle");
    try {
      db.exec("BEGIN");
      db.prepare(
        "UPDATE item_categories SET name = ?, parent_id = ? WHERE id = ? AND home_id = ?",
      ).run(name, parentId, request.params.categoryId, request.params.homeId);
      if (current.name !== name)
        db.prepare(
          "UPDATE items SET category = ? WHERE home_id = ? AND category = ?",
        ).run(name, request.params.homeId, current.name);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      if (String(error).includes("UNIQUE"))
        return sendCodeError(reply,localeOf(request),409,"CATEGORY_EXISTS","error.categoryExists");
      throw error;
    }
    return { id: request.params.categoryId, parentId, name };
  },
);

app.post<{ Params: { homeId: string }; Body: unknown }>(
  "/api/v1/homes/:homeId/locations",
  async (request, reply) => {
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const parentId = typeof body.parentId === "string" ? body.parentId : null;
    if (!name)
      return sendError(reply,localeOf(request),400,{ code: "VALIDATION_ERROR", key: "error.locationNameRequired" });
    if (
      parentId &&
      !db
        .prepare(
          "SELECT id FROM locations WHERE id = ? AND home_id = ? AND active = 1",
        )
        .get(parentId, request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),400,"PARENT_LOCATION_NOT_FOUND","error.parentLocationNotFound");
    const id = randomUUID();
    try {
      db.prepare(
        "INSERT INTO locations (id, home_id, parent_id, name) VALUES (?, ?, ?, ?)",
      ).run(id, request.params.homeId, parentId, name);
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        return sendCodeError(reply,localeOf(request),409,"LOCATION_EXISTS","error.locationExists");
      throw error;
    }
    return reply.code(201).send({
      id,
      homeId: request.params.homeId,
      parentId,
      name,
      active: true,
    });
  },
);
app.patch<{ Params: { homeId: string; locationId: string }; Body: unknown }>(
  "/api/v1/homes/:homeId/locations/:locationId",
  async (request, reply) => {
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const parentId =
      body.parentId === null || body.parentId === ""
        ? null
        : typeof body.parentId === "string"
          ? body.parentId
          : undefined;
    if (!name || parentId === undefined)
      return sendCodeError(reply,localeOf(request),400,"VALIDATION_ERROR","error.validation");
    if (
      !db
        .prepare(
          "SELECT id FROM locations WHERE id = ? AND home_id = ? AND active = 1",
        )
        .get(request.params.locationId, request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),404,"LOCATION_NOT_FOUND","error.locationNotFound");
    if (
      parentId &&
      !db
        .prepare(
          "SELECT id FROM locations WHERE id = ? AND home_id = ? AND active = 1",
        )
        .get(parentId, request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),400,"PARENT_LOCATION_NOT_FOUND","error.parentLocationNotFound");
    if (
      wouldCreateCycle(
        "locations",
        request.params.locationId,
        parentId,
        request.params.homeId,
      )
    )
      return sendCodeError(reply,localeOf(request),400,"LOCATION_CYCLE","error.locationCycle");
    try {
      db.prepare(
        "UPDATE locations SET name = ?, parent_id = ? WHERE id = ? AND home_id = ?",
      ).run(name, parentId, request.params.locationId, request.params.homeId);
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        return sendCodeError(reply,localeOf(request),409,"LOCATION_EXISTS","error.locationExists");
      throw error;
    }
    return { id: request.params.locationId, parentId, name };
  },
);

for (const [resource, kind] of [["items", "item"], ["categories", "category"], ["locations", "location"]] as const) {
  app.delete<{ Params: { homeId: string; id: string } }>(`/api/v1/homes/:homeId/${resource}/:id`, async (request, reply) => {
    try { return deleteInventoryEntity(db, request.params.homeId, kind, request.params.id); }
    catch (error) {
      if (error instanceof DeleteError) return reply.code(error.status).send({ message: error.localized(localeOf(request)) });
      throw error;
    }
  });
}

app.get<{ Params: { homeId: string } }>("/api/v1/homes/:homeId/transactions", async request => listTransactions(db,request.params.homeId,request.query,localeOf(request)));
app.get<{ Params: { homeId: string } }>("/api/v1/homes/:homeId/opened-consumables", async request => listOpenedConsumables(db,request.params.homeId));
app.post<{ Params: { homeId: string; openedId: string }; Body: unknown }>("/api/v1/homes/:homeId/opened-consumables/:openedId/exhaust", async request =>
  exhaustOpenedConsumable(db,request.params.homeId,{...(request.body&&typeof request.body==="object"?request.body:{}),id:request.params.openedId}),
);
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/stock/operations",async request=>listWorkflowOperations(db,request.params.homeId));
app.post<{Params:{homeId:string;id:string}}>("/api/v1/homes/:homeId/stock/operations/:id/undo",async request=>undoWorkflowOperation(db,request.params.homeId,request.params.id));
app.get<{Params:{homeId:string;locationId:string}}>("/api/v1/homes/:homeId/stocktake/:locationId",async request=>previewStocktake(db,request.params.homeId,request.params.locationId));
app.get<{Params:{homeId:string;categoryId:string}}>("/api/v1/homes/:homeId/stocktake/category/:categoryId",async request=>previewCategoryStocktake(db,request.params.homeId,request.params.categoryId));
app.post<{Params:{homeId:string};Body:unknown}>("/api/v1/homes/:homeId/stocktake",async request=>confirmStocktake(db,request.params.homeId,request.body));
app.post<{Params:{homeId:string};Body:unknown}>("/api/v1/homes/:homeId/stock/transfers",async request => transferStock(db,request.params.homeId,request.body));
app.post<{Params:{homeId:string};Body:unknown}>("/api/v1/homes/:homeId/stock/reconcile",async request => reconcileStock(db,request.params.homeId,request.body));

app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/batches",async request => listBatches(db,request.params.homeId,request.query));
app.patch<{Params:{homeId:string;batchId:string};Body:unknown}>("/api/v1/homes/:homeId/batches/:batchId",async request => {
  const input=z.object({label:z.string().trim().min(1).max(100).nullable().optional(),totalPrice:moneySchema.nullable().optional(),purchaseDate:z.string().date().nullable().optional(),channelId:z.string().uuid().nullable().optional(),...batchDates}).strict().refine(value=>Object.keys(value).length>0).parse(request.body);
  const {homeId,batchId}=request.params;
  const current=db.prepare("SELECT * FROM stock_batches WHERE id=? AND home_id=?").get(batchId,homeId) as {item_id:string;label:string|null;manufactured_date:string|null;expiry_date:string|null;purchase_total_minor:number|null;purchase_currency:string|null;purchased_date:string|null;channel_id:string|null}|undefined;
  if(!current)throw new InventoryError(404,"BATCH_NOT_FOUND","error.batchNotFound");
  requireStockTarget(db,homeId,current.item_id);
  const manufactured=input.manufacturedDate===undefined?current.manufactured_date:input.manufacturedDate;
  const expiry=input.expiryDate===undefined?current.expiry_date:input.expiryDate;
  const label=input.label===undefined?current.label:input.label;
  const totalMinor=input.totalPrice===undefined?current.purchase_total_minor:input.totalPrice===null?null:Math.round(input.totalPrice*100);
  const purchaseDate=input.purchaseDate===undefined?current.purchased_date:input.purchaseDate;
  const channelId=input.channelId===undefined?current.channel_id:input.channelId;
  if(channelId&&channelId!==current.channel_id&&!db.prepare("SELECT 1 FROM shopping_channels WHERE id=? AND home_id=? AND active=1").get(channelId,homeId))throw new InventoryError(400,"SHOPPING_CHANNEL_NOT_FOUND","error.shoppingChannelNotFound");
  const currency=totalMinor===null?null:current.purchase_currency??(db.prepare("SELECT default_currency AS currency FROM homes WHERE id=?").get(homeId) as {currency:string}).currency;
  validateDates(manufactured,expiry);
  return atomic(db,()=>{
    db.prepare("UPDATE stock_batches SET label=?,manufactured_date=?,expiry_date=?,purchase_total_minor=?,purchase_currency=?,purchased_date=?,channel_id=? WHERE id=? AND home_id=?").run(label,manufactured,expiry,totalMinor,currency,purchaseDate,channelId,batchId,homeId);
    if(label!==current.label || manufactured!==current.manufactured_date || expiry!==current.expiry_date)
      recordItemEvent(db,homeId,current.item_id,"update",`批次 ${label??batchId.slice(0,8)}：生产日期 ${current.manufactured_date??"未设置"} → ${manufactured??"未设置"}；到期日期 ${current.expiry_date??"未设置"} → ${expiry??"未设置"}`,null,null,batchId);
    refreshItemDates(db,homeId,current.item_id);
    return {batchId,label,manufacturedDate:manufactured,expiryDate:expiry,totalPrice:totalMinor===null?null:totalMinor/100,purchaseDate,channelId};
  });
});

app.post<{ Params: { homeId: string }; Body: unknown }>(
  "/api/v1/homes/:homeId/items",
  async (request, reply) => {
    const body =
      request.body && typeof request.body === "object" ? request.body : {};
    const parsed = createItemSchema.extend({initialStock:nonnegativeQuantity.default(0),reorderPoint:nonnegativeQuantity}).safeParse(normalizeConsumptionInput({
      ...body,
      homeId: request.params.homeId,
    }));
    if (!parsed.success)
      return sendCodeError(reply,localeOf(request),400,"VALIDATION_ERROR","error.validation",parsed.error.flatten());

    if (
      !db
        .prepare("SELECT id FROM homes WHERE id = ?")
        .get(request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),404,"HOME_NOT_FOUND","error.homeNotFound");
    const id = randomUUID();
    const sku = parsed.data.sku || `ITEM-${id.slice(0, 8).toUpperCase()}`;
    const item: Item = { ...parsed.data,barcode:parsed.data.barcode?normalizeBarcode(parsed.data.barcode):null,id, sku, active: true };
    if(parsed.data.barcode&&db.prepare("SELECT 1 FROM items WHERE home_id=? AND barcode=? AND active=1").get(item.homeId,parsed.data.barcode))
      throw new InventoryError(409,"BARCODE_EXISTS","error.barcodeExists");
    const locationId = parsed.data.locationId ?? null;
    if (parsed.data.initialStock > 0 && !locationId)
      return sendError(reply,localeOf(request),400,{ code: "LOCATION_REQUIRED", key: "error.initialLocationRequired" });
    if (
      locationId &&
      !db
        .prepare(
          "SELECT id FROM locations WHERE id = ? AND home_id = ? AND active = 1",
        )
        .get(locationId, request.params.homeId)
    )
      return sendCodeError(reply,localeOf(request),400,"LOCATION_NOT_FOUND","error.locationNotFound");
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO items (id, home_id, sku, barcode, name, category, base_unit, consumption_type, opened_shelf_life_days, reorder_point, reorder_quantity, default_location_id, manufactured_date, expiry_date, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        item.id,
        item.homeId,
        sku,
        item.barcode??null,
        item.name,
        item.category,
        item.baseUnit,
        item.consumptionType,
        item.openedShelfLifeDays??null,
        item.reorderPoint,
        item.reorderQuantity,
        locationId,
        parsed.data.manufacturedDate ?? null,
        parsed.data.expiryDate ?? null,
        parsed.data.icon ?? null,
      );
      validateDates(parsed.data.manufacturedDate,parsed.data.expiryDate);
      if (parsed.data.initialStock > 0) recordStock(db,item.homeId,"receipt",{
        itemId:item.id,locationId,quantity:parsed.data.initialStock,idempotencyKey:`initial:${item.id}`,reason:"reason.initialStock",
        manufacturedDate:parsed.data.manufacturedDate,expiryDate:parsed.data.expiryDate,
        totalPrice:parsed.data.totalPrice,purchaseDate:parsed.data.purchaseDate,channelId:parsed.data.channelId
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return reply.code(201).send({ ...item, sku, locationId });
  },
);

app.post<{Params:{homeId:string;type:string};Body:unknown}>("/api/v1/homes/:homeId/stock/:type",async(request,reply)=>{
  if(request.params.type!=="receipt"&&request.params.type!=="issue")return sendCodeError(reply,localeOf(request),404,"NOT_FOUND","error.notFound");
  return recordStock(db,request.params.homeId,request.params.type,request.body);
});

app.get<{ Params: { homeId: string } }>(
  "/api/v1/homes/:homeId/shopping-list",
  async (request) => {
    const manual = db
      .prepare(
        "SELECT s.id,s.item_id AS itemId,s.name,s.quantity,s.unit,s.consumption_type AS consumptionType,s.opened_shelf_life_days AS openedShelfLifeDays,s.category,s.location_id AS locationId,s.channel_id AS channelId,c.name AS channelName,s.planned_date AS plannedDate,s.estimated_total_minor/100.0 AS estimatedTotal,s.source,s.completed,s.created_at AS createdAt FROM shopping_list s LEFT JOIN shopping_channels c ON c.id=s.channel_id WHERE s.home_id=? AND s.completed=0 ORDER BY s.planned_date IS NULL,s.planned_date,s.created_at DESC",
      )
      .all(request.params.homeId);
    const automatic = db
      .prepare(
        `SELECT 'auto:' || items.id AS id, items.id AS itemId, items.name, MAX(ROUND(items.reorder_point - ${itemBalanceSqlFor("items")},2), 0) AS quantity, items.base_unit AS unit, items.consumption_type AS consumptionType, items.opened_shelf_life_days AS openedShelfLifeDays, items.category, items.default_location_id AS locationId,NULL AS channelId,NULL AS channelName,NULL AS plannedDate,NULL AS estimatedTotal,'automatic' AS source,0 AS completed,NULL AS createdAt FROM items WHERE items.home_id=? AND items.active=1 AND items.replenishment_paused=0 AND ROUND(items.reorder_point - ${itemBalanceSqlFor("items")},2)>0 AND NOT EXISTS (SELECT 1 FROM shopping_list s WHERE s.home_id=items.home_id AND s.item_id=items.id AND s.completed=0) GROUP BY items.id ORDER BY items.name`,
      )
      .all(request.params.homeId);
    return [...manual, ...automatic.map(row=>({...row,estimatedTotal:estimateShoppingTotal(db,request.params.homeId,String(row.itemId),Number(row.quantity))}))];
  },
);
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/shopping-channels",async request=>
  db.prepare("SELECT id,name,is_system AS isSystem,sort_order AS sortOrder FROM shopping_channels WHERE home_id=? AND active=1 ORDER BY sort_order,name").all(request.params.homeId));
app.post<{Params:{homeId:string};Body:unknown}>("/api/v1/homes/:homeId/shopping-channels",async(request,reply)=>{
  const input=z.object({name:z.string().trim().min(1).max(80)}).strict().parse(request.body),id=randomUUID();
  const order=(db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS value FROM shopping_channels WHERE home_id=?").get(request.params.homeId) as {value:number}).value;
  try{db.prepare("INSERT INTO shopping_channels(id,home_id,name,sort_order) VALUES (?,?,?,?)").run(id,request.params.homeId,input.name,order);}
  catch(error){if(String(error).includes("UNIQUE"))return sendError(reply,localeOf(request),409,{code:"SHOPPING_CHANNEL_EXISTS",key:"error.shoppingChannelExists"});throw error;}
  return reply.code(201).send({id,name:input.name,isSystem:false,sortOrder:order});
});
app.patch<{Params:{homeId:string;channelId:string};Body:unknown}>("/api/v1/homes/:homeId/shopping-channels/:channelId",async(request,reply)=>{
  const input=z.object({name:z.string().trim().min(1).max(80)}).strict().parse(request.body);
  try{const result=db.prepare("UPDATE shopping_channels SET name=? WHERE id=? AND home_id=? AND active=1").run(input.name,request.params.channelId,request.params.homeId);if(!result.changes)return sendCodeError(reply,localeOf(request),404,"SHOPPING_CHANNEL_NOT_FOUND","error.shoppingChannelNotFound");}
  catch(error){if(String(error).includes("UNIQUE"))return sendError(reply,localeOf(request),409,{code:"SHOPPING_CHANNEL_EXISTS",key:"error.shoppingChannelExists"});throw error;}
  return {id:request.params.channelId,name:input.name};
});
app.delete<{Params:{homeId:string;channelId:string}}>("/api/v1/homes/:homeId/shopping-channels/:channelId",async(request,reply)=>{
  const result=db.prepare("UPDATE shopping_channels SET active=0 WHERE id=? AND home_id=? AND active=1").run(request.params.channelId,request.params.homeId);
  return result.changes?{id:request.params.channelId,deleted:true}:sendCodeError(reply,localeOf(request),404,"SHOPPING_CHANNEL_NOT_FOUND","error.shoppingChannelNotFound");
});
app.get<{Params:{homeId:string}}>("/api/v1/homes/:homeId/shopping-calendar",async request=>{
  const input=z.object({month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),includeCompleted:z.enum(["true","false"]).default("false")}).strict().parse(request.query);
  const start=`${input.month}-01`,nextMonth=new Date(`${start}T00:00:00Z`);nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
  const completed=input.includeCompleted==="true"?"":" AND s.completed=0";
  return db.prepare(`SELECT s.id,s.item_id AS itemId,s.name,s.quantity,s.unit,s.consumption_type AS consumptionType,s.opened_shelf_life_days AS openedShelfLifeDays,s.channel_id AS channelId,c.name AS channelName,s.planned_date AS plannedDate,s.estimated_total_minor/100.0 AS estimatedTotal,s.completed FROM shopping_list s LEFT JOIN shopping_channels c ON c.id=s.channel_id WHERE s.home_id=? AND s.planned_date>=? AND s.planned_date<?${completed} ORDER BY s.planned_date,c.sort_order,s.name`).all(request.params.homeId,start,nextMonth.toISOString().slice(0,10));
});
app.post<{Params:{homeId:string};Body:unknown}>("/api/v1/homes/:homeId/shopping-list",async(request,reply)=>reply.code(201).send(saveShopping(db,request.params.homeId,request.body)));
app.patch<{Params:{homeId:string;shoppingId:string};Body:unknown}>("/api/v1/homes/:homeId/shopping-list/:shoppingId",async request=>saveShopping(db,request.params.homeId,request.body,request.params.shoppingId));
app.post<{Params:{homeId:string;shoppingId:string};Body:unknown}>("/api/v1/homes/:homeId/shopping-list/:shoppingId/receive",async request=>receiveShopping(db,request.params.homeId,request.params.shoppingId,request.body));

app.delete<{ Params: { homeId: string; shoppingId: string } }>(
  "/api/v1/homes/:homeId/shopping-list/:shoppingId",
  async (request, reply) => {
    const result = db
      .prepare("DELETE FROM shopping_list WHERE id = ? AND home_id = ?")
      .run(request.params.shoppingId, request.params.homeId);
    return result.changes
      ? { id: request.params.shoppingId, deleted: true }
      : sendCodeError(reply,localeOf(request),404,"SHOPPING_ITEM_NOT_FOUND","error.shoppingItemNotFound");
  },
);

app.all("/mcp", async (request, reply) => handleMcpRequest(request, reply, async (method, url, body) => {
  const response = await app.inject({
    method,
    url,
    headers: {
      authorization: request.headers.authorization || "",
      "accept-language": request.headers["accept-language"] || "",
    },
    payload: body,
  });
  return { status: response.statusCode, body: response.json() };
}, tokenUser(request)?.homeId??null));

const staticRoot = resolve("./public");
if (existsSync(staticRoot)) {
  await app.register(fastifyStatic, { root: staticRoot });
  app.setNotFoundHandler((request, reply) => {
    if (
      request.method === "GET" &&
      !request.url.startsWith("/api/") &&
      !request.url.startsWith("/mcp")
    )
      return reply.sendFile("index.html");
    return sendCodeError(reply,localeOf(request),404,"NOT_FOUND","error.notFound");
  });
}

return app;
}
