import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export const defaultShoppingChannels = ["京东","淘宝","美团外卖","淘宝闪购","大润发","盒马鲜生","新世纪百货","沃尔玛","永辉超市"] as const;
export function seedShoppingChannels(db:DatabaseSync,homeId:string) {
  for(const [sortOrder,name] of defaultShoppingChannels.entries())
    db.prepare("INSERT OR IGNORE INTO shopping_channels(id,home_id,name,active,is_system,sort_order) VALUES (?,?,?,1,1,?)").run(randomUUID(),homeId,name,sortOrder);
}

export function openDatabase(
  filename = process.env.DATABASE_URL ?? "./data/al1s-wms.db",
) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS homes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🏠',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      default_currency TEXT NOT NULL DEFAULT 'CNY',
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id),
      sku TEXT NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '其他',
      base_unit TEXT NOT NULL,
      consumption_type TEXT NOT NULL DEFAULT 'consumable',
      opened_shelf_life_days INTEGER,
      reorder_point REAL NOT NULL DEFAULT 0,
      replenishment_paused INTEGER NOT NULL DEFAULT 0,
      reorder_quantity REAL NOT NULL DEFAULT 1,
      default_location_id TEXT,
      manufactured_date TEXT,
      expiry_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(home_id, sku)
    );
    CREATE TABLE IF NOT EXISTS item_categories (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id),
      parent_id TEXT REFERENCES item_categories(id),
      name TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(home_id, parent_id, name)
    );
    CREATE TABLE IF NOT EXISTS stock_transactions (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id),
      item_id TEXT NOT NULL REFERENCES items(id),
      location_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('receipt', 'issue')),
      quantity REAL NOT NULL CHECK(quantity > 0),
      issue_reason TEXT,
      reason TEXT,
      idempotency_key TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      UNIQUE(home_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      avatar TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS item_events (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id),
      item_id TEXT NOT NULL REFERENCES items(id),
      item_name TEXT NOT NULL,
      location_id TEXT,
      location_name TEXT,
      type TEXT NOT NULL CHECK(type IN ('delete', 'reclassify', 'move', 'update')),
      quantity REAL,
      reason TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id),
      parent_id TEXT REFERENCES locations(id),
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(home_id, name)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      home_id TEXT REFERENCES homes(id),
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS shopping_channels (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id),
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(home_id, name)
    );
    CREATE TABLE IF NOT EXISTS shopping_list (
      id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(id),
      item_id TEXT REFERENCES items(id),
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      channel_id TEXT REFERENCES shopping_channels(id),
      planned_date TEXT,
      estimated_total_minor INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS finance_budgets (
      home_id TEXT NOT NULL REFERENCES homes(id),
      month TEXT NOT NULL,
      total_minor INTEGER NOT NULL CHECK(total_minor >= 0),
      currency TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(home_id, month)
    );
    CREATE TABLE IF NOT EXISTS finance_category_budgets (
      home_id TEXT NOT NULL REFERENCES homes(id),
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
      PRIMARY KEY(home_id, month, category)
    );
  `);
  try {
    db.exec("ALTER TABLE items ADD COLUMN default_location_id TEXT");
  } catch {
    /* existing column */
  }
  const shoppingColumns = db.prepare("PRAGMA table_info(shopping_list)").all() as {name:string}[];
  if(!shoppingColumns.some(column=>column.name==="consumption_type"))db.exec("ALTER TABLE shopping_list ADD COLUMN consumption_type TEXT NOT NULL DEFAULT 'consumable'");
  if(!shoppingColumns.some(column=>column.name==="opened_shelf_life_days"))db.exec("ALTER TABLE shopping_list ADD COLUMN opened_shelf_life_days INTEGER");
  if(!shoppingColumns.some(column=>column.name==="channel_id"))db.exec("ALTER TABLE shopping_list ADD COLUMN channel_id TEXT REFERENCES shopping_channels(id)");
  if(!shoppingColumns.some(column=>column.name==="planned_date"))db.exec("ALTER TABLE shopping_list ADD COLUMN planned_date TEXT");
  if(!shoppingColumns.some(column=>column.name==="estimated_total_minor"))db.exec("ALTER TABLE shopping_list ADD COLUMN estimated_total_minor INTEGER");
  for(const home of db.prepare("SELECT id FROM homes WHERE active=1").all() as {id:string}[])seedShoppingChannels(db,home.id);
  try {
    db.exec("ALTER TABLE shopping_list ADD COLUMN category TEXT");
  } catch {
    /* existing column */
  }
  try {
    db.exec(
      "ALTER TABLE shopping_list ADD COLUMN location_id TEXT REFERENCES locations(id)",
    );
  } catch {
    /* existing column */
  }
  try {
    db.exec("ALTER TABLE homes ADD COLUMN icon TEXT NOT NULL DEFAULT '🏠'");
  } catch {
    /* existing column */
  }
  try {
    db.exec("ALTER TABLE items ADD COLUMN manufactured_date TEXT");
  } catch {
    /* existing column */
  }
  try {
    db.exec("ALTER TABLE items ADD COLUMN expiry_date TEXT");
  } catch {
    /* existing column */
  }
  try {
    db.exec(
      "ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT '其他'",
    );
  } catch {
    /* existing column */
  }
  try {
    db.exec(
      "ALTER TABLE locations ADD COLUMN parent_id TEXT REFERENCES locations(id)",
    );
  } catch {
    /* existing column */
  }
  const tokenColumns = db.prepare("PRAGMA table_info(api_tokens)").all() as { name: string }[];
  if (!tokenColumns.some(column => column.name === "home_id"))
    db.exec("ALTER TABLE api_tokens ADD COLUMN home_id TEXT REFERENCES homes(id)");
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userColumns.some(column => column.name === "avatar"))
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT 'user'");
  const itemColumns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
  if (!itemColumns.some(column => column.name === "icon")) db.exec("ALTER TABLE items ADD COLUMN icon TEXT");
  if (!itemColumns.some(column => column.name === "barcode")) db.exec("ALTER TABLE items ADD COLUMN barcode TEXT");
  if (!itemColumns.some(column => column.name === "consumption_type")) db.exec("ALTER TABLE items ADD COLUMN consumption_type TEXT NOT NULL DEFAULT 'consumable'");
  if (!itemColumns.some(column => column.name === "replenishment_paused")) db.exec("ALTER TABLE items ADD COLUMN replenishment_paused INTEGER NOT NULL DEFAULT 0");
  if (!itemColumns.some(column => column.name === "opened_shelf_life_days")) db.exec("ALTER TABLE items ADD COLUMN opened_shelf_life_days INTEGER");
  const eventDefinition = db.prepare("SELECT sql FROM sqlite_master WHERE name='item_events'").get() as { sql: string };
  if (!eventDefinition.sql.includes("'update'")) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(eventDefinition.sql.replace("item_events", "item_events_next").replace("'move'", "'move', 'update'"));
      db.exec("INSERT INTO item_events_next SELECT * FROM item_events; DROP TABLE item_events; ALTER TABLE item_events_next RENAME TO item_events; COMMIT;");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS stock_batches (
    id TEXT PRIMARY KEY, home_id TEXT NOT NULL REFERENCES homes(id), item_id TEXT NOT NULL REFERENCES items(id),
    label TEXT, manufactured_date TEXT, expiry_date TEXT, received_at TEXT NOT NULL, legacy INTEGER NOT NULL DEFAULT 0,
    purchase_total_minor INTEGER, purchase_currency TEXT, purchased_date TEXT, channel_id TEXT REFERENCES shopping_channels(id)
  );
  CREATE TABLE IF NOT EXISTS stock_operations (
    home_id TEXT NOT NULL REFERENCES homes(id), idempotency_key TEXT NOT NULL, payload TEXT NOT NULL, response TEXT NOT NULL,
    PRIMARY KEY(home_id, idempotency_key)
  );
  CREATE TABLE IF NOT EXISTS barcode_catalog (
    barcode TEXT PRIMARY KEY,
    found INTEGER NOT NULL,
    name TEXT,
    brand TEXT,
    category TEXT,
    base_unit TEXT,
    image_url TEXT,
    provider TEXT,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS opened_consumables (
    id TEXT PRIMARY KEY, home_id TEXT NOT NULL REFERENCES homes(id), item_id TEXT NOT NULL REFERENCES items(id),
    location_id TEXT NOT NULL REFERENCES locations(id), batch_id TEXT NOT NULL REFERENCES stock_batches(id),
    quantity REAL NOT NULL CHECK(quantity > 0), opened_at TEXT NOT NULL, opened_expiry_date TEXT
  );`);
  const openedColumns=db.prepare("PRAGMA table_info(opened_consumables)").all() as {name:string}[];
  if(!openedColumns.some(column=>column.name==="opened_expiry_date"))db.exec("ALTER TABLE opened_consumables ADD COLUMN opened_expiry_date TEXT");
  const batchColumns=db.prepare("PRAGMA table_info(stock_batches)").all() as {name:string}[];
  if(!batchColumns.some(column=>column.name==="purchase_total_minor"))db.exec("ALTER TABLE stock_batches ADD COLUMN purchase_total_minor INTEGER");
  if(!batchColumns.some(column=>column.name==="purchase_currency"))db.exec("ALTER TABLE stock_batches ADD COLUMN purchase_currency TEXT");
  if(!batchColumns.some(column=>column.name==="purchased_date"))db.exec("ALTER TABLE stock_batches ADD COLUMN purchased_date TEXT");
  if(!batchColumns.some(column=>column.name==="channel_id"))db.exec("ALTER TABLE stock_batches ADD COLUMN channel_id TEXT REFERENCES shopping_channels(id)");
  if(!batchColumns.some(column=>column.name==="shopping_item_id"))db.exec("ALTER TABLE stock_batches ADD COLUMN shopping_item_id TEXT");
  if(!batchColumns.some(column=>column.name==="purchase_category"))db.exec("ALTER TABLE stock_batches ADD COLUMN purchase_category TEXT");
  const stockColumns = db.prepare("PRAGMA table_info(stock_transactions)").all() as {name:string}[];
  if (!stockColumns.some(column => column.name === "batch_id")) db.exec("ALTER TABLE stock_transactions ADD COLUMN batch_id TEXT REFERENCES stock_batches(id)");
  if (!stockColumns.some(column => column.name === "issue_reason")) db.exec("ALTER TABLE stock_transactions ADD COLUMN issue_reason TEXT");
  const eventColumns = db.prepare("PRAGMA table_info(item_events)").all() as {name:string}[];
  if (!eventColumns.some(column => column.name === "batch_id")) db.exec("ALTER TABLE item_events ADD COLUMN batch_id TEXT REFERENCES stock_batches(id)");
  if (!db.prepare("SELECT 1 FROM app_settings WHERE key='batch_migration_v1'").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const legacyItems = db.prepare("SELECT id, home_id, manufactured_date, expiry_date FROM items WHERE id IN (SELECT item_id FROM stock_transactions WHERE batch_id IS NULL)").all() as {id:string;home_id:string;manufactured_date:string|null;expiry_date:string|null}[];
      for (const item of legacyItems) {
        const batchId = randomUUID();
        const first = db.prepare("SELECT MIN(occurred_at) AS date FROM stock_transactions WHERE item_id=? AND home_id=?").get(item.id,item.home_id) as {date:string};
        db.prepare("INSERT INTO stock_batches(id,home_id,item_id,label,manufactured_date,expiry_date,received_at,legacy) VALUES (?,?,?,'历史库存',?,?,?,1)").run(batchId,item.home_id,item.id,item.manufactured_date,item.expiry_date,first.date);
        db.prepare("UPDATE stock_transactions SET batch_id=? WHERE item_id=? AND home_id=? AND batch_id IS NULL").run(batchId,item.id,item.home_id);
      }
      db.prepare("INSERT INTO app_settings(key,value) VALUES ('batch_migration_v1','true')").run();
      db.exec("COMMIT");
    } catch(error) { db.exec("ROLLBACK"); throw error; }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_batch ON stock_transactions(home_id,item_id,batch_id,location_id);
    CREATE INDEX IF NOT EXISTS idx_stock_batch_balance ON stock_transactions(home_id,batch_id,location_id,type);
    CREATE INDEX IF NOT EXISTS idx_stock_batch_receipts ON stock_transactions(batch_id,type);
    CREATE INDEX IF NOT EXISTS idx_stock_history ON stock_transactions(home_id,occurred_at,id);
    CREATE INDEX IF NOT EXISTS idx_stock_item_history ON stock_transactions(home_id,item_id,occurred_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_item_history ON item_events(home_id,occurred_at,id);
    CREATE INDEX IF NOT EXISTS idx_item_event_history ON item_events(home_id,item_id,occurred_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_opened_consumables_home_opened ON opened_consumables(home_id,opened_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_opened_consumables_batch ON opened_consumables(home_id,item_id,location_id,batch_id);
    CREATE INDEX IF NOT EXISTS idx_shopping_calendar ON shopping_list(home_id,planned_date,completed);
    CREATE INDEX IF NOT EXISTS idx_shopping_pending ON shopping_list(home_id,completed,planned_date,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shopping_pending_item ON shopping_list(home_id,item_id,completed);
    CREATE INDEX IF NOT EXISTS idx_shopping_category ON shopping_list(home_id,category);
    CREATE INDEX IF NOT EXISTS idx_shopping_location ON shopping_list(home_id,location_id);
    CREATE INDEX IF NOT EXISTS idx_batches_item_received ON stock_batches(home_id,item_id,received_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_batches_financial_received ON stock_batches(home_id,received_at DESC,id DESC) WHERE purchase_total_minor IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_batches_item_channel_price ON stock_batches(home_id,item_id,channel_id,purchased_date DESC,received_at DESC) WHERE purchase_total_minor IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_batches_item_price_history ON stock_batches(home_id,item_id,purchased_date DESC,received_at DESC) WHERE purchase_total_minor IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_batches_expiry ON stock_batches(home_id,expiry_date,received_at,id);
    CREATE INDEX IF NOT EXISTS idx_batches_shopping_item ON stock_batches(home_id,shopping_item_id);
    CREATE INDEX IF NOT EXISTS idx_items_active_name ON items(home_id,active,name,id);
    CREATE INDEX IF NOT EXISTS idx_items_active_category ON items(home_id,active,category);
    CREATE INDEX IF NOT EXISTS idx_items_active_location ON items(home_id,active,default_location_id);
    CREATE INDEX IF NOT EXISTS idx_locations_tree ON locations(home_id,parent_id,active,name);
    CREATE INDEX IF NOT EXISTS idx_categories_tree ON item_categories(home_id,parent_id,active,name);
    CREATE INDEX IF NOT EXISTS idx_channels_active_sort ON shopping_channels(home_id,active,sort_order,name);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user_active ON api_tokens(user_id,revoked_at,created_at DESC);
    DROP INDEX IF EXISTS idx_items_home_barcode;
    CREATE UNIQUE INDEX idx_items_home_barcode ON items(home_id,barcode) WHERE barcode IS NOT NULL AND active=1;`);
  // SQLite treats NULLs as distinct in UNIQUE constraints; normalize the
  // catalog before enforcing one name per sibling branch.
  db.exec(`
    DELETE FROM item_categories
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM item_categories
      GROUP BY home_id, COALESCE(parent_id, ''), name
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_sibling_name
      ON item_categories(home_id, COALESCE(parent_id, ''), name);
  `);
  // Workflow reversals retain the ledger; cost views omit cancelled effects.
  for (const [table,column,definition] of [
    ["stock_transactions","reversed_by","TEXT"],
    ["stock_batches","voided","INTEGER NOT NULL DEFAULT 0"],
    ["shopping_list","planned_quantity","REAL"],
    ["shopping_list","received_quantity","REAL NOT NULL DEFAULT 0"],
  ]) {
    const columns=db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[];
    if(!columns.some(row=>row.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_operations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,home_id TEXT NOT NULL REFERENCES homes(id),
    operation_key TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL,summary TEXT NOT NULL,changes TEXT NOT NULL,
    undone_at TEXT, UNIQUE(home_id,operation_key)
  );
  CREATE INDEX IF NOT EXISTS idx_workflow_home ON workflow_operations(home_id,sequence DESC);
  CREATE VIEW IF NOT EXISTS cost_transactions AS SELECT * FROM stock_transactions WHERE reversed_by IS NULL;
  CREATE VIEW IF NOT EXISTS cost_batches AS SELECT * FROM stock_batches WHERE voided=0;`);
  db.exec(`CREATE TABLE IF NOT EXISTS item_location_minimums (
    home_id TEXT NOT NULL REFERENCES homes(id),
    item_id TEXT NOT NULL REFERENCES items(id),
    location_id TEXT NOT NULL REFERENCES locations(id),
    minimum_quantity REAL NOT NULL CHECK(minimum_quantity>0),
    PRIMARY KEY(home_id,item_id,location_id)
  );`);
  return db;
}
