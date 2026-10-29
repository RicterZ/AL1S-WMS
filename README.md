<div align="center">
  
# AL1S WMS

[English](README.md) | [中文](README.zh-CN.md)

AL1S WMS is a lightweight, self-hosted warehouse manager for the home. 

<a href="https://github.com/RicterZ/AL1S-WMS/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/RicterZ/AL1S-WMS?display_name=tag" /></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/RicterZ/AL1S-WMS" /></a>
[![M8ven Score](https://m8ven.ai/badge/mcp/ricterz-al1s-wms-11mcqg?v=3dc0245adb600db176193f70c659d0e1)](https://m8ven.ai/mcp/ricterz-al1s-wms-11mcqg?s=readme)

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=RicterZ&repository=AL1S-WMS&category=integration"><img alt="Install with HACS" src="https://my.home-assistant.io/badges/hacs_repository.svg" /></a>

<img width="1600" height="448" alt="AL1S-WMS-README-banner" src="https://github.com/user-attachments/assets/1aeb25ec-4633-4d3b-9655-8b1a7ce13350" />
</div>
It helps a household answer practical questions: what is on hand, where it is stored, what needs buying, what is nearing expiry, and how much has been spent this month. Inspired by Grocy (https://grocy.info/).

Stocktaking, purchasing, and finance share one data trail. Receiving a purchase creates a stock batch and transaction; recording its cost updates actual spending, price history, and inventory value. AL1S WMS also exposes an MCP interface so an AI agent can assist within an explicitly authorized scope.

## Who It Is For

- Households organizing food, household supplies, medicine, consumables, or storage rooms.
- Anyone tracking the same item across rooms, cabinets, and refrigerator zones.
- People who want purchase plans, actual costs, and monthly budgets to stay connected instead of maintaining separate spreadsheets.
- Users who want an AI agent to help check stock, expiry, and replenishment suggestions while retaining approval over consequential actions.

<img width="1585" height="986" alt="image" src="https://github.com/user-attachments/assets/00117ee5-ac0e-41e2-8045-b5356c5bbe11" />

## How It Compares

| Feature | AL1S WMS | [Grocy](https://grocy.info/) | [HomeBox](https://homebox.software/) |
| --- | --- | --- | --- |
| Cute | Tendou Arisu is indisputably cute | - | - |
| Core focus | Household consumables | Food and household routines | Durable household assets |
| Inventory model | Batches and stock ledger | Comprehensive, configurable inventory | Quantity as an item attribute |
| Consumption | Issue, open, and exhaust | Consume and open | Manual quantity changes |
| Expiry | Batch expiry and FEFO | Expiry rules and prioritized consumption | - |
| Replenishment | Stock alerts, purchase plans, and receiving | Shopping lists and automatic replenishment | - |
| Household finance | Budgets, planned and actual spending | Price history and spending reports | Purchase value of assets |
| Broader scope | Inventory, purchasing, and spending | Recipes, meal plans, chores, and tasks | Documents, warranties, and maintenance |
| Agent integration | Built-in MCP | REST API and community MCP servers | REST API |

## Features

### Inventory and Batches

- Manage item names, barcodes, units, default locations, reorder points, and reorder quantities.
- Organize household inventory through hierarchical locations and categories, with tree views for both.
- Each receipt creates an independent batch with optional production date, expiry date, actual cost, purchase date, and purchase channel.
- A batch may exist in several locations. Stock can be issued from a selected batch or automatically by FEFO, first expiry first out.
- Record receipts, issues, transfers, stocktakes, and batch changes in a complete transaction history.
- Item details bring together stock, batches, purchase records, price trends, and paginated transaction history.

<img width="1585" height="986" alt="image" src="https://github.com/user-attachments/assets/a9b3002f-b90a-4393-a5e8-da09e5e201cf" />


### Alerts and Stocktakes

- Classify stock as insufficient, critical, or depleted from its reorder threshold.
- Purchase thresholds use each item’s total stock across all locations in the household, including when filtering by location. Inventory rows show local stock and the household total.
- Configure optional item/location minimums under “Location transfer reminders” on the inventory page. Empty locations can have rules too. Local shortages create transfer reminders without adding purchase quantities; set a minimum to zero to remove it.
- Highlight expired and soon-to-expire batches so they can be used or handled first.
- Filter inventory by item, location, status, and expiry; sort by receipt time or urgency.
- Enter a physical count directly. Differences are recorded as a receipt or issue with a stocktake reason.

### Purchasing

- Create shopping items with a planned date, destination, purchase channel, and estimated amount; review them in a purchase calendar.
- Linked inventory items bring along their category, unit, and default location. A selected channel can estimate cost from its latest recorded price.
- Low stock produces dynamic replenishment suggestions. Suggestions do not create stock; they become a real shopping item only after a purchase is planned.
- Receiving records the actual quantity, cost, and date as a new batch. The completed item leaves the active list while its purchase and finance history remain traceable.
- Maintain purchase channels and look up products by barcode. Barcode lookup checks household data and local cache before public product sources.

<img width="1585" height="986" alt="image" src="https://github.com/user-attachments/assets/9876cb1f-9f54-47e5-b3de-fcbe1aadfc79" />


### Finance

- Set a monthly total budget and category budgets; a future month can inherit the latest saved budget until it is changed.
- Track actual spending, planned spending, forecast spending, remaining budget, and budget execution together.
- Category budgets support parent and child categories: a parent cap covers descendant spending while more specific child caps can still be set.
- Review monthly spending trends, budget comparisons, category and channel rankings, paginated purchase records, and inventory valuation.
- Actual spending belongs to the month of stock receipt. Planned amounts affect the forecast only and never replace actual costs.
- Item price history keeps batch-level and channel-level prices for comparing the latest, lowest, and average prices.

<img width="1585" height="986" alt="image" src="https://github.com/user-attachments/assets/835318bd-0119-4588-8040-da61be1e0f7d" />


### Multiple Homes and AI Agents

- One account can create and switch between multiple homes. Inventory, locations, purchases, and finance data are isolated per home.
- Household-scoped MCP tokens restrict an agent to one home; account-scoped tokens can select an authorized home.
- MCP covers home status, items, locations, categories, batches, receipts, issues, transfers, stocktakes, purchasing, price history, and financial analysis.
- Agents should obtain explicit confirmation before budget changes, deletions, or other consequential operations. Inventory writes use idempotency keys for safe retries.

<img width="1196" height="875" alt="image" src="https://github.com/user-attachments/assets/1d966aa9-2f0e-4e80-8695-6bcb57c75046" />


## What It Is Not For

- Businesses, studios, stores, or other commercial settings that need approvals, supplier contracts, fulfillment, and complex role models.
- Professional finance workflows such as bank synchronization, income, invoices, reimbursement, tax, freight allocation, coupons, double-entry bookkeeping, or currency conversion.
- ERP, WMS, POS, or supply-chain workloads requiring bulk operations, warehouse slotting, wave picking, or compliance-grade audit controls.
- Turning the household into a logistics center solely because a three-month-old cucumber appeared in the refrigerator. It can, however, help deal with that cucumber first.

## TODOs

- [ ] Multi-user support, including household membership and role-based access control (RBAC).
- [ ] Import, export, backup, and restore for household data.
- [ ] Recurring shopping templates and replenishment rules for regularly purchased items.
- [ ] Configurable expiry and stock reminders, exposed through MCP so an AI agent or external automation can deliver them.

## Home Assistant

Connect a household to view stock alerts and opened items on separate HA dashboard cards, or use inventory status in automations. Install AL1S WMS from HACS as a custom integration, then add it from **Settings → Devices & services** using an AL1S address and access token. Add **Inventory attention** and **In use** separately from your dashboard's **Add card** menu.

See the [Home Assistant guide](docs/home-assistant.md) for setup steps, card details, and YAML dashboard instructions.

## Deployment

### Docker

Docker with Compose is required. The following commands build the image, start the service, and persist SQLite data in a Docker volume:

```bash
git clone https://github.com/RicterZ/AL1S-WMS.git
cd AL1S-WMS
docker compose up -d --build
```

Open `http://localhost:8080` and complete the initial setup. The SQLite database is stored at `/data/al1s-wms.db` inside the container. Persist `/data`, or all household data will be lost when the container is recreated.

A host directory can be easier to integrate with an existing backup policy:

```bash
mkdir -p /srv/al1s-wms/data
docker run -d \
  --name al1s-wms \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /srv/al1s-wms/data:/data \
  al1s-wms:local
```

Back up the entire `/data` directory, including the SQLite database and `uploads/` photo files, together while the service is stopped. Restoring only the database does not restore photos. For an internet-facing deployment, place the application behind a reverse proxy with HTTPS and restrict access to its management surface.

### Photo storage

Item details support one reference photo per item. Batch dialogs support up to six photos per batch, shared across all locations of that batch. Selecting, replacing, and removing photos takes effect immediately, separately from saving batch metadata. List icons remain unchanged.

Uploads accept JPEG, PNG, and WebP up to 10 MiB per image. The server decodes and orients images, strips embedded metadata, and generates a WebP image (at most 2000 px per side) and a thumbnail (at most 400 px per side). Original uploads are not retained. Images are read through authenticated household API routes.

The storage layout is:

```text
/data/
  al1s-wms.db                 # includes photo ownership and captions
  uploads/
    <household UUID>/
      <photo UUID>.webp
      <photo UUID>.thumb.webp
```

Directories are created on the first upload. Docker Compose already persists both database and images in the `/data` volume. For local development, storage defaults to an `uploads/` directory next to the opened database. Changing `UPLOADS_DIR` requires moving existing files to that directory. Replacing or deleting a photo removes its stored files; transferring inventory retains batch photo associations.

### Optional Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP service port. |
| `BIND_ADDRESS` | `0.0.0.0` | HTTP listen address. |
| `DATABASE_URL` | `/data/al1s-wms.db` in the image | SQLite database path. |
| `UPLOADS_DIR` | `/data/uploads` in the image; otherwise `uploads/` beside the database | Private photo storage directory. Persist it alongside the database; never expose it as a public static directory. |
| `APIZERO_API_KEY` | unset | Enables authenticated ApiZero barcode lookup; without it, AL1S WMS uses an anonymous quota and public sources. |

## MCP and AI Agents

AL1S WMS exposes a Streamable HTTP MCP endpoint:

```text
https://your-domain.example/mcp
```

Create a token under **Settings -> MCP Access Tokens**, then configure an MCP client:

```json
{
  "mcpServers": {
    "al1s-wms": {
      "url": "https://your-domain.example/mcp",
      "headers": {
        "Authorization": "Bearer al1s_REPLACE_WITH_YOUR_TOKEN"
      }
    }
  }
}
```

An agent should begin with `get_home_context` and `get_home_overview`, then inspect items, locations, batches, or shopping plans for the task at hand. `get_agent_guide` describes the supported receipt, purchase, expiry-handling, and stocktake workflows.

- A household-scoped token needs no `homeId` and can access only its bound home.
- An account-scoped token can access multiple homes, so the agent must select and provide a `homeId`.
- Confirm targets and amounts before writes such as budgeting, deletion, issuing, or receiving. Every inventory write needs a unique `idempotencyKey`; reuse it only to retry the same operation.

## Development and Verification

The project uses a pnpm workspace. After installing dependencies:

```bash
pnpm install
pnpm dev
```

Run the full verification suite with:

```bash
pnpm typecheck
pnpm test
pnpm build
```
