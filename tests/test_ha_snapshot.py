"""Business boundaries for the HA snapshot derived from AL1S responses."""

import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "al1s_snapshot", Path(__file__).resolve().parents[1] / "custom_components/al1s_wms/snapshot.py"
)
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SnapshotTest(unittest.TestCase):
    def test_opened_stock_is_still_in_total_and_uses_earlier_expiry(self):
        item = {"id": "milk", "name": "Milk", "baseUnit": "bottle", "quantity": 2, "reorderPoint": 3}
        batch = {"itemId": "milk", "itemName": "Milk", "baseUnit": "bottle", "quantity": 2,
                 "batchId": "b1", "locationId": "fridge", "locationName": "Fridge", "expiryDate": "2026-10-08"}
        opened = {"id": "o1", "itemId": "milk", "itemName": "Milk", "baseUnit": "bottle",
                  "quantity": 1, "batchId": "b1", "locationId": "fridge", "locationName": "Fridge",
                  "expiryDate": "2026-10-08", "openedExpiryDate": "2026-10-03", "openedAt": "2026-09-29T08:00:00Z"}
        overview = {"generatedAt": "2026-09-29T08:00:00Z", "expiryWindow": {"days": 30}}
        details = snapshot.build_details(overview, [item], [batch], [opened], [], "https://inventory.test")
        self.assertEqual(details["low_stock"][0]["suggested_quantity"], 1)
        self.assertEqual(details["opened"][0]["expiry_date"], "2026-10-03")
        self.assertEqual(details["opened"][0]["quantity"], 1)
        self.assertEqual(details["opened"][0]["expiry_date"], "2026-10-03")

    def test_original_batch_expiry_and_opened_expiry_are_separate(self):
        overview = {"generatedAt": "2026-09-29T08:00:00Z", "expiryWindow": {"days": 30}}
        item = {"id": "shampoo", "name": "Shampoo", "baseUnit": "bottle", "quantity": 1, "reorderPoint": 0}
        batch = {"itemId": "shampoo", "itemName": "Shampoo", "baseUnit": "bottle", "quantity": 1,
                 "batchId": "b1", "expiryDate": "2027-09-01", "locationId": "bath", "locationName": "Bathroom"}
        opened = {"id": "o1", "itemId": "shampoo", "itemName": "Shampoo", "baseUnit": "bottle", "quantity": 1,
                  "batchId": "b1", "expiryDate": "2027-09-01", "openedExpiryDate": "2026-09-30",
                  "locationId": "bath", "locationName": "Bathroom", "openedAt": "2026-09-01T00:00:00Z"}
        details = snapshot.build_details(overview, [item], [batch], [opened], [], "https://inventory.test")
        self.assertEqual(details["expiring"], [])
        self.assertEqual(details["opened"][0]["days_remaining"], 1)
        self.assertEqual(batch["expiryDate"], "2027-09-01")


class AttentionTest(unittest.TestCase):
    def test_paused_replenishment_is_not_a_stock_alert(self):
        items = [
            {"id": "paused-empty", "name": "Paused empty", "baseUnit": "box", "quantity": 0,
             "reorderPoint": 2, "replenishmentPaused": True},
            {"id": "paused-low", "name": "Paused low", "baseUnit": "box", "quantity": 1,
             "reorderPoint": 2, "replenishmentPaused": True},
            {"id": "active-empty", "name": "Active empty", "baseUnit": "box", "quantity": 0,
             "reorderPoint": 2, "replenishmentPaused": False},
        ]
        overview = {"generatedAt": "2026-09-29T08:00:00Z", "expiryWindow": {"days": 30}}
        batches = [{"itemId": "paused-low", "itemName": "Paused low", "baseUnit": "box", "quantity": 1,
                    "batchId": "b1", "expiryDate": "2026-09-30"}]
        details = snapshot.build_details(overview, items, batches, [], [], "https://inventory.test")
        self.assertEqual(details["low_stock"][0]["item_id"], "active-empty")
        self.assertEqual([row["item_id"] for row in details["empty"]], ["active-empty"])
        self.assertEqual([(row["item_id"], row["status"]) for row in snapshot.attention_rows(details)],
                         [("active-empty", "out_of_stock"), ("paused-low", "expiring")])

    def test_all_stock_states_and_expiry_rows_are_available_without_item_selection(self):
        items = [
            {"id": "zero", "name": "Zero", "baseUnit": "box", "quantity": 0, "reorderPoint": 0},
            {"id": "low", "name": "Low", "baseUnit": "box", "quantity": 1, "reorderPoint": 3},
            {"id": "critical", "name": "Critical", "baseUnit": "box", "quantity": 2, "reorderPoint": 2},
        ]
        batches = [{"itemId": "low", "itemName": "Low", "baseUnit": "box", "quantity": 1,
                    "batchId": "b1", "expiryDate": "2026-09-30", "locationId": "pantry", "locationName": "Pantry"}]
        overview = {"generatedAt": "2026-09-29T08:00:00Z", "expiryWindow": {"days": 30}}
        details = snapshot.build_details(overview, items, batches, [], [], "https://inventory.test")
        rows = snapshot.attention_rows(details)
        self.assertEqual([row["status"] for row in rows], ["out_of_stock", "low_stock", "critical", "expiring"])
        self.assertEqual(rows[0]["suggested_quantity"], 0)
        self.assertEqual(rows[-1]["days_remaining"], 1)


if __name__ == "__main__":
    unittest.main()
