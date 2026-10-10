"""Build compact inventory details without creating per-batch entities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def build_details(overview: dict, items: list, batches: list, opened: list, shopping: list, url: str) -> dict:
    """Use the server snapshot's date and expiry window for consistent summaries."""
    today = datetime.fromisoformat(overview["generatedAt"].replace("Z", "+00:00")).astimezone(timezone.utc).date()
    through = today + timedelta(days=overview["expiryWindow"]["days"])
    by_item = {item["id"]: item for item in items}

    def detail(row: dict) -> dict:
        item_id = row.get("itemId", row.get("id"))
        return {
            "item_id": item_id,
            "name": row.get("itemName", row.get("name")),
            "quantity": row["quantity"],
            "unit": row.get("baseUnit", row.get("unit")),
            "location_id": row.get("locationId"),
            "location": row.get("locationName"),
            "url": f"{url}/items/{item_id}" if item_id in by_item else f"{url}/shopping",
        }

    low_stock = []
    critical = []
    empty = []
    for item in items:
        shortage = round(item["reorderPoint"] - item["quantity"], 2)
        if shortage > 0 and not item.get("replenishmentPaused"):
            row = detail(item)
            # An item's default location is not necessarily where its stock is.
            row.pop("location_id")
            row.pop("location")
            row.update(reorder_point=item["reorderPoint"], suggested_quantity=shortage)
            low_stock.append(row)
        elif not item.get("replenishmentPaused") and item["quantity"] > 0 and round(item["quantity"] - item["reorderPoint"], 2) == 0:
            row = detail(item)
            row.pop("location_id")
            row.pop("location")
            row.update(reorder_point=item["reorderPoint"], suggested_quantity=0)
            critical.append(row)
        if item["quantity"] == 0 and not item.get("replenishmentPaused"):
            row = detail(item)
            row.pop("location_id")
            row.pop("location")
            row.update(reorder_point=item["reorderPoint"], suggested_quantity=max(shortage, 0))
            empty.append(row)

    expiring, expired = [], []
    for batch in batches:
        if batch["quantity"] <= 0 or not batch.get("expiryDate"):
            continue
        expiry = datetime.fromisoformat(batch["expiryDate"]).date()
        row = detail(batch)
        row.update(batch_id=batch["batchId"], expiry_date=batch["expiryDate"], days_remaining=(expiry - today).days)
        if expiry < today:
            expired.append(row)
        elif expiry <= through:
            expiring.append(row)

    opened_details = []
    for record in opened:
        if record["quantity"] <= 0:
            continue
        dates = [record[key] for key in ("expiryDate", "openedExpiryDate") if record.get(key)]
        effective_expiry = min(dates) if dates else None
        row = detail(record)
        row.update(opened_id=record["id"], batch_id=record["batchId"], opened_at=record["openedAt"], expiry_date=effective_expiry)
        row["days_remaining"] = (datetime.fromisoformat(effective_expiry).date() - today).days if effective_expiry else None
        opened_details.append(row)

    shopping_details = []
    for record in shopping:
        row = detail(record)
        row.update(shopping_id=record["id"], source=record["source"], planned_date=record.get("plannedDate"))
        shopping_details.append(row)

    return {
        "low_stock": low_stock,
        "critical": critical,
        "empty": empty,
        "expiring": sorted(expiring, key=lambda row: row["expiry_date"]),
        "expired": sorted(expired, key=lambda row: row["expiry_date"]),
        "opened": opened_details,
        "shopping": shopping_details,
    }


def attention_rows(details: dict) -> list[dict]:
    """One row per issue; a physical item can have multiple independent issues."""
    rows = []
    for row in details["empty"]:
        rows.append({**row, "status": "out_of_stock"})
    for row in details["low_stock"]:
        if row["quantity"] > 0:
            rows.append({**row, "status": "low_stock"})
    for row in details["critical"]:
        rows.append({**row, "status": "critical"})
    for status in ("expired", "expiring"):
        for row in details[status]:
            rows.append({**row, "status": status})
    return rows
