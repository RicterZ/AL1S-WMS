# Agent guide

AL1S WMS is a household inventory application built with React, Fastify, SQLite, and pnpm workspaces. Use the feature map below to follow a task from its view through frontend handlers, HTTP routes, business logic, and tests. Locate symbols by name rather than relying on line numbers.

## Module responsibilities

- [Web App](apps/web/src/App.tsx) owns shared state, effects, action handlers, navigation, and page composition. Extracted page components mostly receive data and callbacks, but some still perform requests: ProfileHomeSettings saves households, while FinanceReports, ItemDetail, Batches, and MissingCosts load their own data.
- [Read client](apps/web/src/apiClient.ts) reads data for the current household. [apiFetch / apiJson](apps/web/src/i18n/apiFetch.ts) supply the language header and construct requests. `apiJson` returns the raw Response without retries, error presentation, or refreshes.
- [API app](apps/api/src/app.ts), through `buildApp(db)`, registers authentication hooks and routes. It also contains household, item, category, location, and batch CRUD. Inventory, purchasing, and finance logic live in `stock.ts`, `shopping.ts`, and `pricing.ts`. Tests can inject an in-memory database.
- [Database entry](packages/db/src/index.ts), through `openDatabase`, creates and upgrades SQLite tables and indexes. Inventory balances derive from the ledger; business writes primarily use raw SQL. [Drizzle schema](packages/db/src/schema.ts) is not the complete runtime schema.
- [Contracts](packages/contracts/src/index.ts) define shared Zod input/domain schemas. [Web types](apps/web/src/webTypes.ts) describe frontend data needs. These serve different purposes.

## Feature map

Frontend filenames below are relative to `apps/web/src/`; backend filenames are relative to `apps/api/src/`. Household endpoint suffixes are relative to `/api/v1/homes/:homeId`. Authentication, setup, and MCP paths are shown in full.

| Feature | View or interaction entry | Frontend handlers and state | Routes and backend implementation | Tests to read first |
| --- | --- | --- | --- | --- |
| Setup, login, logout | `AuthScreens.tsx`: Setup, Login | AuthScreens submits requests; `App.logout`, setup/authenticated state | `/api/v1/setup`, `/api/v1/auth/login`, `/api/v1/auth/logout`; `app.ts`, `auth.ts:createAuth` | API `auth.test.ts`, `mcp-workflow.test.ts`; Web `pageBehavior.test.ts` |
| Households, profile, tokens | `ProfilePage.tsx`: ProfileUserSettings, ProfileHomeSettings, ProfileTokens | `App.updateAvatar`, `changePassword`, `updateHomeCurrency`, `createApiToken`, `revokeApiToken`; household save remains inside ProfileHomeSettings | `/api/v1/homes`, `/api/v1/auth/*`; `app.ts`, `auth.ts` | API `auth.test.ts`, `mcp-workflow.test.ts` |
| Dashboard | `DashboardPage.tsx`; summary cards remain in App | `App.load`, `dashboardItems`, `shoppingItems`, category/location summaries | Web aggregates several reads; the separate `/overview` endpoint is `queries.ts:getHomeOverview`, not the dashboard's sole data source | API `stock.test.ts`, `queries.test.ts`; Web `hierarchy.test.ts` |
| Inventory list, filters, sorting | `InventoryPage.tsx`, `LocationMinimums.tsx` | LocationMinimums loads/saves optional item/location rules; App's `locationScopedItems`, `filtered`, `stockStatusFor`, `expiryStatusFor`, pagination effects | `/items`, `/stock`; `queries.ts:listItems`, stock query in `app.ts`; `/location-minimums`, PUT `/items/:itemId/location-minimums/:locationId` in `location-minimums.ts` | API `queries.test.ts`, `stock.test.ts`, `replenishment-scope.test.ts`, `location-minimums.test.ts`; Web `hierarchy.test.ts` |
| Item creation and editing | `ItemForm.tsx`; edit dialog remains in App's `detailItem` branch | `App.addItem`, `updateItem`, `openItemForm` | POST `/items`, PATCH `/items/:itemId`; `app.ts`, contracts validation, `stock.ts` for initial stock | API `stock.test.ts`, `mcp-workflow.test.ts`; Web `pageBehavior.test.ts` |
| Receipts, issues, opening, exhaustion | `StockDialog.tsx`; exhaustion dialog in App | `App.openStockAction`, `recordStock`, `exhaustOpened`, `stockOperationKey` | `/stock/:type`, `/opened-consumables`, `/opened-consumables/:openedId/exhaust`; `stock.ts:recordStock/exhaustOpenedConsumable` | API `stock.test.ts`, `pricing.test.ts` |
| Batches, reconciliation, transfers | `InventoryWorkflows.tsx`: TransferDialog; `Batches.tsx`: Batches, BatchSelect; `BatchFields.tsx`; batch edit buttons in `ItemDetail.tsx` | Batches loads/saves locally; App's `batchItem` and `initialBatchId` open the list or a specific batch editor, then `batchRevision` refreshes detail data | `/batches` (supports `batchId` filter), PATCH `/batches/:batchId`, `/stock/reconcile`, `/stock/transfers`; `app.ts`, `queries.ts`, `stock.ts` | API `stock.test.ts`, `pricing.test.ts` |
| Location/category stocktake and undo | `InventoryWorkflows.tsx`: LocationStocktake, OperationHistoryDialog; `LocationLink.tsx` | Location and category trees open the same count dialog; inventory location links use `/count#stocktake=<id>` to keep list filters and scroll; home location links use `/locations#stocktake=<id>`; recent transactions opens undo | `/stocktake/:locationId`, `/stocktake/category/:categoryId`, `/stocktake`, `/stock/operations`, `/stock/operations/:id/undo`; `workflows.ts` | API `workflows.test.ts`, `mcp-workflow.test.ts`; Web `appBehavior.test.ts` |
| Item detail, history, prices | `ItemDetail.tsx`, `AppElements.tsx:TransactionRow`, `TransactionPagination.tsx` | ItemDetail makes its own requests; `App.openItemDetail`, `closeItemDetail`, `transactionSnapshot` | `/transactions`, `/items/:itemId/price-history`, `/batches`; `queries.ts:listTransactions`, `pricing.ts:itemPriceHistory` | API `stock.test.ts`, `pricing.test.ts`; Web `appBehavior.test.ts`, `pageBehavior.test.ts` |
| Location/category trees and deletion | `HierarchyManager.tsx`; tree rendering and edit/delete dialogs remain in App | `App.addHierarchyNode`, `updateTreeNode`, `renderTreeNode`, `moveTreeItem`, `deleteSelected`; `hierarchy.ts` | `/locations`, `/categories`, resource DELETE routes; `app.ts`, `inventory-delete.ts:deleteInventoryEntity` | API `inventory-delete.test.ts`, `queries.test.ts`; Web `hierarchy.test.ts`, `pageBehavior.test.ts` |
| Purchase plans, channels, calendar | `ShoppingPage.tsx`, `ShoppingForm.tsx`, `EditShoppingDialog.tsx`, `ConsumptionFields.tsx` | `App.addShoppingItem`, `updateShoppingItem`, `addShoppingChannel`, `moveShoppingMonth`; calendar effect | `/shopping-list`, `/shopping-channels`, `/shopping-calendar`; `shopping.ts:saveShopping`, list/calendar SQL in `app.ts` | API `shopping.test.ts`, `stock.test.ts`, `mcp-workflow.test.ts`; Web `purchaseSchedule.test.ts`, `pageBehavior.test.ts` |
| Purchase receiving (partial or complete) | `ReceiveShoppingDialog.tsx` | `App.openShoppingReceipt`, `receiveShopping`, `receiveOperationKey` | POST `/shopping-list/:shoppingId/receive` → `shopping.ts:receiveShopping` → `stock.ts:recordStock` | API `shopping.test.ts`, `stock.test.ts`, `pricing.test.ts`, `mcp-workflow.test.ts` |
| Budgets, spending, costs | `FinancePage.tsx`, `FinanceReports.tsx`, `BudgetCategories.tsx`, `MissingCosts.tsx` | `App.saveFinanceBudget`, finance loading/layout effects; reports and missing-cost components also fetch independently | `/financial-dashboard`, `/financial-budget`, `/financial-trend`, `/purchase-records`, `/inventory-cost-analysis`, `/missing-costs`; `pricing.ts`; cost updates use batch PATCH | API `pricing.test.ts`; Web `budgetTree.test.ts`, `inventoryCohorts.test.ts`, `spendingTrend.test.ts` |
| Barcode lookup and scanning | `BarcodeScanner.tsx`, `ItemForm.tsx` | `App.lookupItemBarcode`, prefilled fields, `itemFormRevision` | `/barcodes/:barcode`; `barcodes.ts:lookupBarcode` | API `barcodes.test.ts` |
| Home Assistant | `custom_components/al1s_wms/config_flow.py`: household binding | HA coordinator in `__init__.py`, summary and household detail sensors in `sensor.py`; `snapshot.py` builds detail attributes | Reuses `/overview`, `/items`, `/batches` (all pages), `/opened-consumables`, `/shopping-list`; no write routes | HACS and Hassfest workflow; bundled Card in `frontend/al1s-inventory-card.js`, automatically served by `__init__.py`; guide in `docs/home-assistant.md` |
| MCP tools | Token management in Profile; no dedicated business page | MCP bypasses the Web App | `/mcp` → `mcp.ts:handleMcpRequest/createMcpServer` → injected REST requests reusing API logic | API `mcp-workflow.test.ts`, `auth.test.ts` |
| Localization, navigation, formatting | `navigation.ts`, `displayDates.ts`, `formatMoney.ts`, `systemLabels.ts` | App navigation functions and popstate effect; `i18n/index.ts` and locale catalogs | API `i18n/index.ts`: language negotiation and localized errors | Both apps' `i18n/*.test.ts`; Web `appBehavior.test.ts`, `systemLabels.test.ts` |

## Example: changing purchase receiving

1. Find fields and `onSubmit` in [ReceiveShoppingDialog](apps/web/src/ReceiveShoppingDialog.tsx), then follow the `receiveShopping` callback in [App](apps/web/src/App.tsx).
2. Check how `openShoppingReceipt` generates the operation key and how submitted empty fields become `null` or `undefined`.
3. Search [API app](apps/api/src/app.ts) for `shopping-list/:shoppingId/receive`, then follow `receiveShopping` in [shopping.ts](apps/api/src/shopping.ts).
4. Inspect `recordStock`, `withStockOperation`, and transaction handling in [stock.ts](apps/api/src/stock.ts). For costs, also inspect [pricing.ts](apps/api/src/pricing.ts).
5. Read [shopping tests](apps/api/src/shopping.test.ts) for consumption settings and migration compatibility, [stock tests](apps/api/src/stock.test.ts) for retry behavior, and [pricing tests](apps/api/src/pricing.test.ts) for channels and actual cost. Verify stock, batches, purchase completion, and spending together.

Run from the repository root:

```sh
rg -n 'openShoppingReceipt|receiveShopping|receiveOperationKey' apps/web/src/App.tsx
rg -n 'shopping-list/:shoppingId/receive|receiveShopping|withStockOperation' apps/api/src
```

## Behavior boundaries to preserve

- `App.load` refreshes inventory, locations, transactions, purchases, categories, channels, and current-month finance. Some callers await it and others do not; preserve that timing during refactors.
- Calendar and finance pages have separate fetching effects. Budget connector layout depends on `useLayoutEffect` and DOM refs. These coordination effects remain in App.
- Page changes close several dialogs. Item-detail return navigation uses history state. Moving state ownership or changing component keys can alter form reset behavior.
- Stock business logic owns idempotency, FEFO allocation, and long-term consumable behavior: opening does not deduct inventory; exhaustion does. Avoid duplicating these rules in views.
- API preHandler and auth jointly enforce household scope, REST Session/Token precedence, and MCP's Token requirement.
- Opened shelf life applies only to `long_term_consumable`. `ConsumptionFields.tsx` handles all four item/purchase create/edit forms; other types show a disabled `--`. API `consumption.ts` ignores inapplicable input and clears the stored value on type changes. See `consumption.test.ts` and `shopping.test.ts`.
- Purchase `consumptionType` and `openedShelfLifeDays` are stored in shopping_list. Receiving an unlinked purchase uses them to create the item; linked purchases retain the existing item's settings. `openDatabase` adds columns to older databases, defaulting to consumable. See `shopping.test.ts`.

Similar code may have different semantics:

- `displayDates.ts` and ItemDetail use different opened-expiry display algorithms. `formatMoney` uses at least two decimal places; some detail views use currency-default precision.
- Inventory offset pagination does not clamp out-of-range pages the way financial purchase pagination does. Transaction pagination also uses `snapshotAt`.
- Omitted fields and explicit `null` can mean different things in create/update requests. `apiJson` only serializes; it does not normalize defaults.
- Web view types and contracts' Zod schemas are not interchangeable. Do not strengthen input requirements merely to eliminate type duplication.

## Validation and maintenance

Add behavior tests before refactoring affected logic. Preserve public interfaces, household isolation, inventory idempotency, and refresh timing. Keep formatting separate from business changes, and commit independently verifiable stages.

| Change | Start with | Additional checks |
| --- | --- | --- |
| Web helpers, requests, views | `pnpm --filter @al1s-wms/web test` | Exercise changed interactions against a temporary database; static render tests do not cover real submissions and refreshes |
| Inventory, purchasing, finance, auth | `pnpm --filter @al1s-wms/api test` | Check household isolation, transactions, retries, money, and date boundaries |
| Integration before delivery | Commands below | Report bundle-size changes separately from behavioral validation |

```sh
pnpm typecheck
pnpm test
pnpm build
```

Use temporary/in-memory databases for tests. Explicitly set a temporary `DATABASE_URL` for browser checks so test records do not enter everyday data. Coverage is defined by actual test cases; this map does not imply that every form branch is automated.

Update the corresponding feature row when moving an entry point or changing module ownership. See [README](README.md) and [Chinese README](README.zh-CN.md) for development and deployment instructions.
