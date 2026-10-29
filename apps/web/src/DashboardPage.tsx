import type * as React from "react";
import { TransactionRow } from "./AppElements.js";
import { itemIconFor, MaterialIcon } from "./Icons.js";
import { LocationLink } from "./LocationLink.js";
import { TransactionPagination } from "./TransactionPagination.js";
import { openedExpiryForDisplay } from "./displayDates.js";
import i18n, { displayUnit } from "./i18n/index.js";
import { type Page } from "./navigation.js";
import { categoryLabel } from "./systemLabels.js";
import type {
  Category,
  Item,
  Location,
  OpenedConsumable,
  ShoppingItem,
  Transaction,
} from "./webTypes.js";
const t = i18n.t.bind(i18n);
type DashboardPageProps = {
  navigate: (page: Page) => void;
  dashboardItems: Item[];
  displayStatusFor: (item: Item) => {
    priority: number;
    level: string;
    label: string;
  };
  openItemDetail: (itemId: string) => void;
  balanceFor: (itemId: string) => number;
  pagedTransactions: Transaction[];
  transactionTotal: number;
  transactionPageSize: number;
  setTransactionPageSize: React.Dispatch<React.SetStateAction<number>>;
  setTransactionPage: React.Dispatch<React.SetStateAction<number>>;
  transactionPage: number;
  transactionPageCount: number;
  shoppingItems: ShoppingItem[];
  openedConsumables: OpenedConsumable[];
  categorySummary: (Category & { count: number; depth: number })[];
  locationSummary: (Location & { count: number; depth: number })[];
};
export function DashboardPage({
  navigate,
  dashboardItems,
  displayStatusFor,
  openItemDetail,
  balanceFor,
  pagedTransactions,
  transactionTotal,
  transactionPageSize,
  setTransactionPageSize,
  setTransactionPage,
  transactionPage,
  transactionPageCount,
  shoppingItems,
  openedConsumables,
  categorySummary,
  locationSummary,
}: DashboardPageProps) {
  return (
    <>
      <section className="dashboard-grid">
        <div className="dashboard-main">
          <div className="panel dashboard-inventory">
            <div className="panel-head">
              <div>
                <h2>{t("库存概览")}</h2>
                <p className="muted">{t("优先显示需要补充的物资")}</p>
              </div>
              <button className="text-button" onClick={() => navigate("count")}>
                {t("查看全部")}
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("物资")}</th>
                    <th>{t("库存")}</th>
                    <th className="dashboard-minimum">{t("家庭最低库存")}</th>
                    <th>{t("状态")}</th>
                    <th className="dashboard-location">{t("位置")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardItems.map((item) => {
                    const status = displayStatusFor(item);
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="item-name">
                            <span className="item-icon">
                              <MaterialIcon value={itemIconFor(item)} />
                            </span>
                            <button
                              type="button"
                              className="item-link"
                              onClick={() => openItemDetail(item.id)}
                            >
                              {item.name}
                            </button>
                          </div>
                        </td>
                        <td>
                          {balanceFor(item.id)} {displayUnit(item.baseUnit)}
                        </td>
                        <td className="dashboard-minimum">
                          {item.reorderPoint} {displayUnit(item.baseUnit)}
                        </td>
                        <td>
                          <span className={`stock-status ${status.level}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="dashboard-location">
                          <LocationLink locationId={item.locationId}>{item.locationName || t("未指定")}</LocationLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {dashboardItems.length === 0 && (
                <p className="empty">{t("暂无物资")}</p>
              )}
            </div>
          </div>
          <section className="panel recent-log dashboard-log">
            <div className="panel-head">
              <div>
                <h2>{t("最近变动")}</h2>
                <p className="muted">{t("按时间倒序的库存流水")}</p>
              </div>
            </div>
            {pagedTransactions.length === 0 ? (
              <p className="empty">{t("暂无库存变动")}</p>
            ) : (
              <div className="log-list">
                {pagedTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    onOpenItem={
                      transaction.type === "delete" ? undefined : openItemDetail
                    }
                  />
                ))}
              </div>
            )}
            <TransactionPagination
              total={transactionTotal}
              page={transactionPage}
              pageSize={transactionPageSize}
              pageCount={transactionPageCount}
              onPage={setTransactionPage}
              onPageSize={setTransactionPageSize}
            />
          </section>
        </div>
        <aside className="dashboard-side">
          <section className="panel dashboard-shopping">
            <div className="panel-head">
              <div>
                <h2>{t("待采购")}</h2>
                <p className="muted">{t("自动建议与手动采购项")}</p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("shopping")}
              >
                {t("查看全部")}
              </button>
            </div>
            <div className="dashboard-list">
              {shoppingItems.length === 0 ? (
                <p className="empty compact">{t("暂无待采购项")}</p>
              ) : (
                shoppingItems.map((item) => (
                  <button
                    type="button"
                    className="dashboard-list-row"
                    key={item.id}
                    onClick={() => navigate("shopping")}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.category
                          ? categoryLabel(item.category)
                          : t("未分类")}
                      </small>
                    </span>
                    <b>
                      {item.quantity} {displayUnit(item.unit) || t("件")}
                    </b>
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="panel dashboard-opened">
            <div className="panel-head">
              <div>
                <h2>{t("已开封")}</h2>
                <p className="muted">{t("等待用尽扣减的长期消耗品")}</p>
              </div>
              <button className="text-button" onClick={() => navigate("count")}>
                {t("查看全部")}
              </button>
            </div>
            <div className="dashboard-list">
              {openedConsumables.length === 0 ? (
                <p className="empty compact">{t("暂无已开封消耗品")}</p>
              ) : (
                openedConsumables.slice(0, 4).map((opened) => {
                  const expiry = openedExpiryForDisplay(opened);
                  return (
                    <button
                      type="button"
                      className="dashboard-list-row"
                      key={opened.id}
                      onClick={() => openItemDetail(opened.itemId)}
                    >
                      <span>
                        <strong>{opened.itemName}</strong>
                        <small>
                          {opened.locationName || t("未指定")}
                          {expiry ? ` · ${t("开封后到期")} ${expiry}` : ""}
                        </small>
                      </span>
                      <b>
                        {opened.quantity} {displayUnit(opened.baseUnit)}
                      </b>
                    </button>
                  );
                })
              )}
            </div>
          </section>
          <section className="panel dashboard-categories">
            <div className="panel-head">
              <div>
                <h2>{t("分类结构")}</h2>
                <p className="muted">{t("包含子分类的物资种类")}</p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("categories")}
              >
                {t("管理")}
              </button>
            </div>
            <div className="category-summary">
              {categorySummary.map((category) => (
                <div key={category.id}>
                  <span style={{ paddingLeft: category.depth * 14 }}>
                    {categoryLabel(category.name)}
                  </span>
                  <strong>{category.count}</strong>
                </div>
              ))}
              {categorySummary.length === 0 && (
                <p className="empty compact">{t("暂无分类数据")}</p>
              )}
            </div>
          </section>
          <section className="panel dashboard-locations">
            <div className="panel-head">
              <div>
                <h2>{t("地点结构")}</h2>
                <p className="muted">{t("包含子地点的物资种类")}</p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("locations")}
              >
                {t("管理")}
              </button>
            </div>
            <div className="location-summary">
              {locationSummary.map((location) => (
                <div key={location.id}>
                  <span style={{ paddingLeft: location.depth * 14 }}>
                    {location.name}
                  </span>
                  <strong>{location.count}</strong>
                </div>
              ))}
              {locationSummary.length === 0 && (
                <p className="empty compact">{t("暂无地点数据")}</p>
              )}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}
