import { ArrowLeft, ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import type * as React from "react";
import { itemIconFor, MaterialIcon } from "./Icons.js";
import { InventoryMoreActions } from "./InventoryMoreActions.js";
import { LocationLink } from "./LocationLink.js";
import { LocationMinimums } from "./LocationMinimums.js";
import { getHomeId } from "./apiClient.js";
import { PageSizeSelect } from "./PageSizeSelect.js";
import { formatDateTime, openedExpiryForDisplay } from "./displayDates.js";
import { formatMoney } from "./formatMoney.js";
import i18n, { displayUnit } from "./i18n/index.js";
import { categoryLabel } from "./systemLabels.js";
import type {
  Stock,
  Category,
  FinancialSummary,
  Item,
  Location,
  LocationScopedItem,
  OpenedConsumable,
  ShoppingItem,
} from "./webTypes.js";
const t = i18n.t.bind(i18n);
type InventoryPageProps = {
  toggleReplenishment?: (item: Item) => void;
  openTransfer: (item: Item) => void;
  stockStatusFilter: string;
  expiryFilter: string;
  setStockStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  setExpiryFilter: React.Dispatch<React.SetStateAction<string>>;
  items: Item[];
  locations: Location[];
  stock: Stock[];
  belowStockCount: number;
  criticalStockCount: number;
  emptyStockCount: number;
  expiringItems: Item[];
  openedConsumables: OpenedConsumable[];
  openItemDetail: (itemId: string) => void;
  busy: boolean;
  setExhaustTarget: React.Dispatch<
    React.SetStateAction<OpenedConsumable | null>
  >;
  inventorySort: "urgency" | "recent";
  filtered: (Item & { treeQuantity: number })[];
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  categoryFilter: string;
  setCategoryFilter: React.Dispatch<React.SetStateAction<string>>;
  categoryOptions: (Category & { depth: number })[];
  locationFilter: string;
  setLocationFilter: React.Dispatch<React.SetStateAction<string>>;
  locationOptions: (Location & { depth: number })[];
  setInventorySort: React.Dispatch<React.SetStateAction<"urgency" | "recent">>;
  pagedItems: (Item & { treeQuantity: number })[];
  displayStatusFor: (item: Item) => {
    level: string;
    label: string;
    priority: number;
  };
  replenishmentFor: (item: Item) => number;
  balanceFor: (itemId: string) => number;
  financialSummary: FinancialSummary | null;
  openStockAction: (type: "receipt" | "issue", item: Item) => void;
  setBatchItem: React.Dispatch<React.SetStateAction<Item | null>>;
  setDetailItem: React.Dispatch<React.SetStateAction<Item | null>>;
  confirmDelete: (
    kind: "item" | "category" | "location",
    node: { id: string; name: string; parentId?: string | null },
  ) => void;
  setMobileAction: React.Dispatch<
    React.SetStateAction<
      | { kind: "shopping"; item: ShoppingItem }
      | { kind: "inventory"; item: LocationScopedItem }
      | null
    >
  >;
  pageSize: number;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageStart: number;
  pageEnd: number;
  page: number;
  pageCount: number;
};
export function InventoryPage({
  toggleReplenishment,
  openTransfer,
  stockStatusFilter,
  expiryFilter,
  setStockStatusFilter,
  setExpiryFilter,
  items,
  locations,
  stock,
  belowStockCount,
  criticalStockCount,
  emptyStockCount,
  expiringItems,
  openedConsumables,
  openItemDetail,
  busy,
  setExhaustTarget,
  inventorySort,
  filtered,
  query,
  setQuery,
  categoryFilter,
  setCategoryFilter,
  categoryOptions,
  locationFilter,
  setLocationFilter,
  locationOptions,
  setInventorySort,
  pagedItems,
  displayStatusFor,
  replenishmentFor,
  balanceFor,
  financialSummary,
  openStockAction,
  setBatchItem,
  setDetailItem,
  confirmDelete,
  setMobileAction,
  pageSize,
  setPageSize,
  setPage,
  pageStart,
  pageEnd,
  page,
  pageCount,
}: InventoryPageProps) {
  return (
    <section className="count-workspace">
      <LocationMinimums homeId={getHomeId()} items={items} locations={locations} stock={stock} onTransfer={openTransfer}/>
      <div className="count-summary" aria-label={t("库存状态概览")}>
        <button
          className={!stockStatusFilter && !expiryFilter ? "active" : ""}
          onClick={() => {
            setStockStatusFilter("");
            setExpiryFilter("");
          }}
        >
          <span className="count-summary-copy">
            <b>{t("全部物资")}</b>
            <small>{t("当前在管物资")}</small>
          </span>
          <strong>{items.length}</strong>
        </button>
        <button
          className={
            stockStatusFilter === "replenishment" ? "active danger" : ""
          }
          onClick={() => {
            setStockStatusFilter("replenishment");
            setExpiryFilter("");
          }}
        >
          <span className="count-summary-copy">
            <b>{t("不足")}</b>
            <small>{t("低于最低库存")}</small>
          </span>
          <strong>{belowStockCount}</strong>
        </button>
        <button
          className={stockStatusFilter === "warning" ? "active warning" : ""}
          onClick={() => {
            setStockStatusFilter("warning");
            setExpiryFilter("");
          }}
        >
          <span className="count-summary-copy">
            <b>{t("临界")}</b>
            <small>{t("等于最低库存")}</small>
          </span>
          <strong>{criticalStockCount}</strong>
        </button>
        <button
          className={stockStatusFilter === "empty" ? "active warning" : ""}
          onClick={() => {
            setStockStatusFilter("empty");
            setExpiryFilter("");
          }}
        >
          <span className="count-summary-copy">
            <b>{t("耗尽")}</b>
            <small>{t("当前库存为 0")}</small>
          </span>
          <strong>{emptyStockCount}</strong>
        </button>
        <button
          className={expiryFilter === "expiring" ? "active" : ""}
          onClick={() => {
            setStockStatusFilter("");
            setExpiryFilter("expiring");
          }}
        >
          <span className="count-summary-copy">
            <b>{t("临期")}</b>
            <small>{t("未来 30 天到期")}</small>
          </span>
          <strong>{expiringItems.length}</strong>
        </button>
      </div>
      <div className="panel inventory-panel count-inventory">
        <div className="panel-head">
          <div>
            <h2>{t("库存明细")}</h2>
            <p className="muted">
              {t("按{{sort}}排序，共", {
                sort: t(inventorySort === "recent" ? "近期入库" : "紧急程度"),
              })}
              {filtered.length} {t("项")}
            </p>
          </div>
          <label className="search count-search">
            <Search size={16} strokeWidth={1.8} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("搜索物资")}
            />
          </label>
        </div>
        <div className="count-filters">
          <SlidersHorizontal size={15} strokeWidth={1.8} />
          <label>
            {t("分类")}
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">{t("全部分类")}</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.name}>
                  {"　".repeat(category.depth)}
                  {categoryLabel(category.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("地点")}
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
            >
              <option value="">{t("全部地点")}</option>
              {locationOptions.map((location) => (
                <option key={location.id} value={location.id}>
                  {"　".repeat(location.depth)}
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("库存状态")}
            <select
              value={stockStatusFilter}
              onChange={(event) => setStockStatusFilter(event.target.value)}
            >
              <option value="">{t("全部状态")}</option>
              <option value="replenishment">{t("不足")}</option>
              <option value="warning">{t("临界")}</option>
              <option value="empty">{t("耗尽")}</option>
              <option value="normal">{t("正常")}</option>
              <option value="paused">{t("停购")}</option>
            </select>
          </label>
          <label>
            {t("到期状态")}
            <select
              value={expiryFilter}
              onChange={(event) => setExpiryFilter(event.target.value)}
            >
              <option value="">{t("全部")}</option>
              <option value="expired">{t("过期")}</option>
              <option value="expiring">{t("临期")}</option>
              <option value="valid">{t("有效")}</option>
              <option value="none">{t("未设")}</option>
            </select>
          </label>
          <label>
            {t("排序")}
            <select
              value={inventorySort}
              onChange={(event) =>
                setInventorySort(event.target.value as "urgency" | "recent")
              }
            >
              <option value="urgency">{t("紧急程度")}</option>
              <option value="recent">{t("近期入库")}</option>
            </select>
          </label>
          {(query ||
            categoryFilter ||
            locationFilter ||
            stockStatusFilter ||
            expiryFilter) && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery("");
                setCategoryFilter("");
                setLocationFilter("");
                setStockStatusFilter("");
                setExpiryFilter("");
              }}
            >
              {t("重置")}
            </button>
          )}
        </div>
        <div className="table-wrap count-table-wrap">
          <table className="count-table">
            <thead>
              <tr>
                <th>{t("物资")}</th>
                <th>{t("本位置库存")}</th>
                <th>{t("家庭最低库存")}</th>
                <th>{t("家庭采购建议")}</th>
                <th>{t("状态")}</th>
                <th>{t("存放地点")}</th>
                <th>{t("日期")}</th>
                <th>{t("最近单价")}</th>
                <th>{t("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">
                    {t("没有符合当前条件的物资。")}
                  </td>
                </tr>
              ) : (
                pagedItems.map((item) => {
                  const stockStatus = displayStatusFor(item);
                  const replenishment = replenishmentFor(item);
                  return (
                    <tr className={item.replenishmentPaused && balanceFor(item.id)===0 ? "inventory-paused" : undefined} key={`${item.id}:${item.locationId ?? "none"}`}>
                      <td>
                        <div className="item-name">
                          <span className="item-icon">
                            <MaterialIcon value={itemIconFor(item)} />
                          </span>
                          <div>
                            <button
                              type="button"
                              className="item-link"
                              onClick={() => openItemDetail(item.id)}
                            >
                              {item.name}
                            </button>
                            <span>
                              {item.category
                                ? categoryLabel(item.category)
                                : t("未分类")}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>
                          {item.treeQuantity ?? balanceFor(item.id)}{" "}
                          {displayUnit(item.baseUnit)}
                        </strong>
                        <small className="muted">{t("家庭共 {{quantity}} {{unit}}", {quantity:balanceFor(item.id),unit:displayUnit(item.baseUnit)})}</small>
                      </td>
                      <td>
                        {item.reorderPoint} {displayUnit(item.baseUnit)}
                      </td>
                      <td
                        className={
                          replenishment > 0 ? "replenishment" : "muted-cell"
                        }
                      >
                        {item.replenishmentPaused ? "—" : replenishment > 0
                          ? `${replenishment} ${displayUnit(item.baseUnit)}`
                          : "—"}
                      </td>
                      <td>
                        <span className={`stock-status ${item.replenishmentPaused && stockStatus.level === "empty" ? "paused" : stockStatus.level}`}>
                          {stockStatus.label}
                        </span>
                      </td>
                      <td><LocationLink page="count" locationId={item.locationId}>{item.locationName || t("未指定")}</LocationLink></td>
                      <td>
                        <div className="date-cell">
                          <span>
                            {t("生产")}
                            {item.manufacturedDate || "—"}
                          </span>
                          <span>
                            {t("到期")}
                            {item.expiryDate || "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {item.lastUnitPrice == null ? (
                          "-"
                        ) : (
                          <div className="date-cell">
                            <span>
                              {formatMoney(
                                item.lastUnitPrice,
                                item.currency ?? financialSummary?.currency,
                              )}
                            </span>
                            <span>
                              {t("价值 {{amount}}", {
                                amount: formatMoney(
                                  (item.treeQuantity ?? balanceFor(item.id)) *
                                    item.lastUnitPrice,
                                  item.currency ?? financialSummary?.currency,
                                ),
                              })}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="row-actions desktop-row-actions">
                          <button
                            onClick={() => openStockAction("receipt", item)}
                          >
                            {t("入库")}
                          </button>
                          <button
                            onClick={() => openStockAction("issue", item)}
                          >
                            {t("领用")}
                          </button>
                          <InventoryMoreActions>
                          <button type="button" disabled={busy} onClick={()=>toggleReplenishment?.(item)}>{t(item.replenishmentPaused?"复购":"停购")}</button>
                          <button onClick={() => setBatchItem(item)}>
                            {t("批次")}
                          </button>
                          <button type="button" onClick={()=>openTransfer(item)}>{t("移动")}</button>
                          <button
                            onClick={() =>
                              setDetailItem(
                                items.find(
                                  (current) => current.id === item.id,
                                ) ?? item,
                              )
                            }
                          >
                            {t("编辑")}
                          </button>
                          <button
                            className="danger-action"
                            onClick={() => confirmDelete("item", item)}
                          >
                            {t("删除")}
                          </button>
                          </InventoryMoreActions>
                        </div>
                        <button
                          type="button"
                          className="mobile-action-trigger"
                          onClick={() =>
                            setMobileAction({ kind: "inventory", item })
                          }
                        >
                          {t("操作")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="pagination">
            <PageSizeSelect
              value={pageSize}
              onChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
            <span>
              {pageStart}–{pageEnd} {t("/ 共")}
              {filtered.length} {t("项")}
            </span>
            <button
              type="button"
              aria-label={t("上一页")}
              title={t("上一页")}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={15} />
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              type="button"
              aria-label={t("下一页")}
              title={t("下一页")}
              disabled={page === pageCount}
              onClick={() => setPage(page + 1)}
            >
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
      <section className="panel opened-consumables-panel">
        <div className="panel-head">
          <div>
            <h2>{t("已开封消耗品")}</h2>
            <p className="muted">{t("开封后仍计入库存，用尽后才扣减")}</p>
          </div>
        </div>
        {openedConsumables.length === 0 ? (
          <p className="empty">{t("暂无已开封消耗品")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("物资")}</th>
                  <th>{t("数量")}</th>
                  <th>{t("地点")}</th>
                  <th>{t("开封时间")}</th>
                  <th>{t("开封后到期")}</th>
                  <th>{t("操作")}</th>
                </tr>
              </thead>
              <tbody>
                {openedConsumables.map((opened) => (
                  <tr key={opened.id}>
                    <td>
                      <button
                        type="button"
                        className="item-link"
                        onClick={() => openItemDetail(opened.itemId)}
                      >
                        {opened.itemName}
                      </button>
                    </td>
                    <td>
                      {opened.quantity} {displayUnit(opened.baseUnit)}
                    </td>
                    <td><LocationLink page="count" locationId={opened.locationId}>{opened.locationName || t("未指定")}</LocationLink></td>
                    <td>{formatDateTime(opened.openedAt)}</td>
                    <td>{openedExpiryForDisplay(opened) || "--"}</td>
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => setExhaustTarget(opened)}
                      >
                        {t("用尽")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
