import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { nonnegativeQuantity } from "./quantity.js";
import { requireStockTarget } from "./stock.js";

export const locationMinimumInput=z.object({minimumQuantity:nonnegativeQuantity}).strict();

export function saveLocationMinimum(db:DatabaseSync,homeId:string,itemId:string,locationId:string,raw:unknown) {
  z.string().uuid().parse(itemId);
  z.string().uuid().parse(locationId);
  const {minimumQuantity}=locationMinimumInput.parse(raw);
  requireStockTarget(db,homeId,itemId,locationId);
  if(minimumQuantity===0) {
    db.prepare("DELETE FROM item_location_minimums WHERE home_id=? AND item_id=? AND location_id=?").run(homeId,itemId,locationId);
  } else {
    db.prepare(`INSERT INTO item_location_minimums(home_id,item_id,location_id,minimum_quantity) VALUES (?,?,?,?)
      ON CONFLICT(home_id,item_id,location_id) DO UPDATE SET minimum_quantity=excluded.minimum_quantity`).run(homeId,itemId,locationId,minimumQuantity);
  }
  return {itemId,locationId,minimumQuantity};
}

export function listLocationMinimums(db:DatabaseSync,homeId:string) {
  // Keep rules with no ledger rows so an empty destination still reminds the user.
  return db.prepare(`WITH balances AS (
    SELECT item_id,location_id,ROUND(SUM(CASE WHEN type='receipt' THEN quantity ELSE -quantity END),2) AS quantity
    FROM stock_transactions WHERE home_id=? GROUP BY item_id,location_id
  )
  SELECT r.item_id AS itemId,i.name AS itemName,i.base_unit AS baseUnit,
    r.location_id AS locationId,l.name AS locationName,r.minimum_quantity AS minimumQuantity,
    COALESCE(b.quantity,0) AS quantity,
    MAX(ROUND(r.minimum_quantity-COALESCE(b.quantity,0),2),0) AS shortage,
    ROUND(COALESCE((SELECT SUM(other.quantity) FROM balances other WHERE other.item_id=r.item_id AND other.location_id!=r.location_id),0),2) AS availableElsewhere
  FROM item_location_minimums r
  JOIN items i ON i.id=r.item_id AND i.home_id=r.home_id AND i.active=1
  JOIN locations l ON l.id=r.location_id AND l.home_id=r.home_id AND l.active=1
  LEFT JOIN balances b ON b.item_id=r.item_id AND b.location_id=r.location_id
  WHERE r.home_id=? ORDER BY i.name,i.id,l.name,l.id`).all(homeId,homeId);
}
