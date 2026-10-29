import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openDatabase } from "@al1s-wms/db";
import { buildApp } from "./app.js";
import { recordStock, transferStock } from "./stock.js";

test("purchasing uses household item totals across locations, including filtered views and transfers", async () => {
  const db = openDatabase(":memory:");
  const homeId = randomUUID(), itemId = randomUUID(), fridge = randomUUID(), living = randomUUID();
  const user = randomUUID(), session = randomUUID();
  db.prepare("INSERT INTO homes(id,name) VALUES (?,?)").run(homeId, "Home");
  db.prepare("INSERT INTO locations(id,home_id,name) VALUES (?,?,?),(?,?,?)")
    .run(fridge, homeId, "Fridge", living, homeId, "Living room");
  db.prepare("INSERT INTO items(id,home_id,sku,name,base_unit,reorder_point,default_location_id) VALUES (?,?,?,?,?,?,?)")
    .run(itemId, homeId, itemId, "Oolong tea", "bottle", 4, living);
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)")
    .run(user, "scope-user", "unused", new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)")
    .run(session, user, "2099-01-01T00:00:00.000Z");
  const app = await buildApp(db), headers = { cookie: `session=${session}` };
  const base = `/api/v1/homes/${homeId}`;
  async function read(path: string) {
    const response = await app.inject({ method: "GET", url: `${base}/${path}`, headers });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }
  async function assertScope(total: number, shortage: number) {
    for (const query of ["", `?locationId=${living}`, `?locationId=${fridge}`]) {
      const items = await read(`items${query}`);
      assert.equal(items.length, 1);
      assert.equal(items[0].id, itemId);
      assert.equal(items[0].quantity, total, "location filtering must retain the household stock quantity");
    }
    const low = await read(`items?locationId=${living}&lowStockOnly=true`);
    assert.equal(low.length, shortage > 0 ? 1 : 0);
    const overview = await read("overview");
    assert.equal(overview.needsReplenishment.total, shortage > 0 ? 1 : 0);
    const shopping = await read("shopping-list");
    assert.equal(shopping.length, shortage > 0 ? 1 : 0, "a purchase suggestion belongs to the item, not each location");
    if (shortage > 0) {
      assert.equal(shopping[0].itemId, itemId);
      assert.equal(shopping[0].source, "automatic");
      assert.equal(shopping[0].quantity, shortage);
      assert.equal(overview.needsReplenishment.items[0].quantity, total);
      assert.equal(overview.needsReplenishment.items[0].suggestedQuantity, shortage);
    }
  }
  try {
    recordStock(db, homeId, "receipt", { itemId, locationId: fridge, quantity: 4, idempotencyKey: "fridge-stock" });
    recordStock(db, homeId, "receipt", { itemId, locationId: living, quantity: 4, idempotencyKey: "living-stock" });
    await assertScope(8, 0);
    recordStock(db, homeId, "issue", { itemId, locationId: living, quantity: 1, idempotencyKey: "drink-one" });
    await assertScope(7, 0);
    transferStock(db, homeId, { itemId, sourceLocationId: fridge, targetLocationId: living, quantity: 1, idempotencyKey: "fill-living-room" });
    await assertScope(7, 0);
    recordStock(db, homeId, "issue", { itemId, locationId: living, quantity: 3, idempotencyKey: "drink-three" });
    await assertScope(4, 0);
    recordStock(db, homeId, "issue", { itemId, locationId: fridge, quantity: 1, idempotencyKey: "below-household-minimum" });
    await assertScope(3, 1);
  } finally {
    await app.close();
    db.close();
  }
});

test("same-name items and other households cannot cover an item's purchase shortage", async () => {
  const db = openDatabase(":memory:");
  const home = randomUUID(), otherHome = randomUUID(), location = randomUUID(), otherLocation = randomUUID();
  const tea = randomUUID(), differentTea = randomUUID(), otherTea = randomUUID();
  const user = randomUUID(), session = randomUUID();
  db.prepare("INSERT INTO homes(id,name) VALUES (?,?),(?,?)").run(home, "Home", otherHome, "Other home");
  db.prepare("INSERT INTO locations(id,home_id,name) VALUES (?,?,?),(?,?,?)")
    .run(location, home, "Shelf", otherLocation, otherHome, "Shelf");
  const insert = db.prepare("INSERT INTO items(id,home_id,sku,name,base_unit,reorder_point,default_location_id) VALUES (?,?,?,?,?,?,?)");
  insert.run(tea, home, tea, "Oolong tea", "bottle", 4, location);
  insert.run(differentTea, home, differentTea, "Oolong tea", "bottle", 4, location);
  insert.run(otherTea, otherHome, otherTea, "Oolong tea", "bottle", 4, otherLocation);
  recordStock(db, home, "receipt", { itemId: tea, locationId: location, quantity: 3, idempotencyKey: "tea" });
  recordStock(db, home, "receipt", { itemId: differentTea, locationId: location, quantity: 20, idempotencyKey: "different-tea" });
  recordStock(db, otherHome, "receipt", { itemId: otherTea, locationId: otherLocation, quantity: 20, idempotencyKey: "other-home-tea" });
  db.prepare("INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)")
    .run(user, "isolation-user", "unused", new Date().toISOString());
  db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)")
    .run(session, user, "2099-01-01T00:00:00.000Z");
  const app = await buildApp(db), headers = { cookie: `session=${session}` };
  try {
    const response = await app.inject({ url: `/api/v1/homes/${home}/shopping-list`, headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().map((row: { itemId: string; quantity: number }) => ({ itemId: row.itemId, quantity: row.quantity })),
      [{ itemId: tea, quantity: 1 }]);
    const other = await app.inject({ url: `/api/v1/homes/${otherHome}/shopping-list`, headers });
    assert.equal(other.statusCode, 200, other.body);
    assert.deepEqual(other.json(), []);
  } finally {
    await app.close();
    db.close();
  }
});
