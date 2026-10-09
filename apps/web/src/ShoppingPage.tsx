import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type * as React from "react";
import { FormEvent } from "react";
import { itemIconFor, MaterialIcon } from "./Icons.js";
import { getHomeId } from "./apiClient.js";
import { formatMoney } from "./formatMoney.js";
import { apiFetch } from "./i18n/apiFetch.js";
import i18n, { displayUnit } from "./i18n/index.js";
import { isPurchaseOverdue } from "./purchaseSchedule.js";
import { categoryLabel, channelLabel } from "./systemLabels.js";
import type {
  FinancialSummary,
  Item,
  Location,
  LocationScopedItem,
  ShoppingChannel,
  ShoppingItem,
} from "./webTypes.js";
const t = i18n.t.bind(i18n);
type ShoppingPageProps = {
  selectedShoppingDate: string;
  visibleShoppingItems: ShoppingItem[];
  items: Item[];
  locations: Location[];
  shoppingChannelName: (item: ShoppingItem) => string;
  financialSummary: FinancialSummary | null;
  setEditShoppingItem: React.Dispatch<
    React.SetStateAction<ShoppingItem | null>
  >;
  setEditShoppingItemId: React.Dispatch<React.SetStateAction<string>>;
  openShoppingReceipt: (item: ShoppingItem) => void;
  openItemDetail: (itemId: string) => void;
  load: () => Promise<void>;
  setMobileAction: React.Dispatch<
    React.SetStateAction<
      | { kind: "shopping"; item: ShoppingItem }
      | { kind: "inventory"; item: LocationScopedItem }
      | null
    >
  >;
  shoppingChannels: ShoppingChannel[];
  addShoppingChannel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  newChannelName: string;
  setNewChannelName: React.Dispatch<React.SetStateAction<string>>;
  deleteShoppingChannel: (channel: ShoppingChannel) => Promise<void>;
  moveShoppingMonth: (offset: number) => void;
  setShoppingMonth: React.Dispatch<React.SetStateAction<string>>;
  setSelectedShoppingDate: React.Dispatch<React.SetStateAction<string>>;
  calendarYear: number;
  calendarMonthNumber: number;
  calendarIncludeCompleted: boolean;
  updateCalendarIncludeCompleted: (value: boolean) => void;
  calendarFinancial: FinancialSummary | null;
  calendarCells: (string | null)[];
  calendarItems: ShoppingItem[];
};
export function ShoppingPage({
  selectedShoppingDate,
  visibleShoppingItems,
  items,
  locations,
  shoppingChannelName,
  financialSummary,
  setEditShoppingItem,
  setEditShoppingItemId,
  openShoppingReceipt,
  openItemDetail,
  load,
  setMobileAction,
  shoppingChannels,
  addShoppingChannel,
  newChannelName,
  setNewChannelName,
  deleteShoppingChannel,
  moveShoppingMonth,
  setShoppingMonth,
  setSelectedShoppingDate,
  calendarYear,
  calendarMonthNumber,
  calendarIncludeCompleted,
  updateCalendarIncludeCompleted,
  calendarFinancial,
  calendarCells,
  calendarItems,
}: ShoppingPageProps) {
  return (
    <section className="shopping-workspace">
      <section className="panel shopping-list">
        <div className="panel-head">
          <div>
            <h2>{t("采购清单")}</h2>
            <p className="muted">
              {selectedShoppingDate
                ? t("{{date}} 的采购项 · 再次点击日期恢复全部", {
                    date: selectedShoppingDate,
                  })
                : t("自动建议与手动采购项")}
            </p>
          </div>
        </div>
        {visibleShoppingItems.length === 0 ? (
          <p className="empty">
            {selectedShoppingDate
              ? t("{{date}} 暂无采购项", {
                  date: selectedShoppingDate,
                })
              : t("暂无采购项")}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("采购项")}</th>
                  <th>{t("数量")}</th>
                  <th>{t("采购计划")}</th>
                  <th>{t("预计总价")}</th>
                  <th>{t("操作")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleShoppingItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="item-name">
                        <span className="item-icon">
                          <MaterialIcon
                            value={itemIconFor(
                              items.find(
                                (existing) => existing.id === item.itemId,
                              ) || item,
                            )}
                          />
                        </span>
                        <span>
                          {item.itemId ? (
                            <button
                              type="button"
                              className="item-link"
                              onClick={() => openItemDetail(item.itemId!)}
                            >
                              {item.name}
                            </button>
                          ) : (
                            <strong>{item.name}</strong>
                          )}
                          <small>
                            {[
                              item.category
                                ? categoryLabel(item.category)
                                : t("未分类"),
                              locations.find(
                                (location) => location.id === item.locationId,
                              )?.name || t("未指定存放地点"),
                              item.source === "automatic"
                                ? t("低库存建议")
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {item.quantity} {displayUnit(item.unit) || t("件")}
                    </td>
                    <td>
                      <span className="shopping-plan">
                        <b>{shoppingChannelName(item)}</b>
                        <small>
                          {item.plannedDate || t("未安排日期")}
                          {isPurchaseOverdue(item) && (
                            <span className="purchase-overdue">
                              {t("逾期")}
                            </span>
                          )}
                        </small>
                      </span>
                    </td>
                    <td>
                      {item.estimatedTotal == null
                        ? "-"
                        : formatMoney(
                            item.estimatedTotal,
                            financialSummary?.currency,
                          )}
                    </td>
                    <td>
                      <div className="row-actions desktop-row-actions">
                        {!item.completed && (
                          <button
                            onClick={() => {
                              setEditShoppingItem(item);
                              setEditShoppingItemId(item.itemId || "");
                            }}
                          >
                            {item.source === "automatic"
                              ? t("安排")
                              : t("编辑")}
                          </button>
                        )}
                        {!item.completed && (
                          <button onClick={() => openShoppingReceipt(item)}>
                            {t("入库")}
                          </button>
                        )}
                        {item.source === "manual" && (
                          <button
                            className="danger-action"
                            onClick={() =>
                              apiFetch(
                                `/api/v1/homes/${getHomeId()}/shopping-list/${item.id}`,
                                { method: "DELETE" },
                              ).then(load)
                            }
                          >
                            {t("删除")}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="mobile-action-trigger"
                        onClick={() =>
                          setMobileAction({ kind: "shopping", item })
                        }
                      >
                        {t("操作")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="channel-manager">
          <summary>
            {t("购买渠道管理")}
            <span>
              {shoppingChannels.length} {t("个渠道")}
            </span>
          </summary>
          <form onSubmit={addShoppingChannel}>
            <input
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
              maxLength={80}
              placeholder={t("新增购买渠道")}
              required
            />
            <button className="secondary">{t("添加")}</button>
          </form>
          <div>
            {shoppingChannels.map((channel) => (
              <span key={channel.id}>
                <b>{channelLabel(channel.name)}</b>
                <button
                  type="button"
                  className="channel-remove"
                  title={t("删除渠道")}
                  aria-label={t("删除{{name}}", {
                    name: channelLabel(channel.name),
                  })}
                  onClick={() => deleteShoppingChannel(channel)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </details>
      </section>
      <section className="panel shopping-calendar">
        <div className="panel-head">
          <div>
            <h2>{t("采购日历")}</h2>
            <p className="muted">{t("按计划采购日查看物品和购买渠道")}</p>
          </div>
          <div className="calendar-controls">
            <button
              type="button"
              className="secondary"
              onClick={() => moveShoppingMonth(-1)}
            >
              <ArrowLeft size={15} />
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setShoppingMonth(new Date().toISOString().slice(0, 7));
                setSelectedShoppingDate("");
              }}
            >
              {t("今天")}
            </button>
            <strong>
              {t("{{year}} 年 {{month}} 月", {
                year: calendarYear,
                month: calendarMonthNumber,
              })}
            </strong>
            <button
              type="button"
              className="secondary"
              onClick={() => moveShoppingMonth(1)}
            >
              <ArrowRight size={15} />
            </button>
            <label>
              <input
                type="checkbox"
                checked={calendarIncludeCompleted}
                onChange={(event) =>
                  updateCalendarIncludeCompleted(event.target.checked)
                }
              />
              {t("显示已完成")}
            </label>
          </div>
        </div>
        <div className="finance-strip">
          <span>
            <small>{t("预计支出")}</small>
            <b>
              {formatMoney(
                calendarFinancial?.estimatedTotal ?? 0,
                calendarFinancial?.currency,
              )}
            </b>
          </span>
          <span>
            <small>{t("实际支出")}</small>
            <b>
              {formatMoney(
                calendarFinancial?.spendingTotal ?? 0,
                calendarFinancial?.currency,
              )}
            </b>
          </span>
          <span>
            <small>{t("预算差额")}</small>
            <b>
              {formatMoney(
                calendarFinancial?.variance ?? 0,
                calendarFinancial?.currency,
              )}
            </b>
          </span>
        </div>
        <div className="calendar-wrap">
          <div className="calendar-weekdays">
            {[
              t("一"),
              t("二"),
              t("三"),
              t("四"),
              t("五"),
              t("六"),
              t("日"),
            ].map((day) => (
              <span key={day}>
                {t("周")}
                {day}
              </span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarCells.map((date, index) => {
              if (!date)
                return (
                  <span
                    className="calendar-day empty-day"
                    key={`empty-${index}`}
                  />
                );
              const entries = calendarItems.filter(
                  (item) => item.plannedDate === date,
                ),
                today = date === new Date().toISOString().slice(0, 10);
              return (
                <button
                  type="button"
                  className={`calendar-day ${today ? "today" : ""} ${selectedShoppingDate === date ? "selected" : ""}`}
                  key={date}
                  onClick={() =>
                    setSelectedShoppingDate((current) =>
                      current === date ? "" : date,
                    )
                  }
                >
                  <time>{Number(date.slice(-2))}</time>
                  <span className="calendar-mobile-count">
                    {entries.length || ""}
                  </span>
                  <div>
                    {entries.slice(0, 2).map((item) => (
                      <span
                        className={
                          item.completed
                            ? "completed"
                            : isPurchaseOverdue(item)
                              ? "overdue"
                              : ""
                        }
                        key={item.id}
                      >
                        <b>
                          {item.name}
                          {isPurchaseOverdue(item) && (
                            <span className="purchase-overdue">
                              {t("逾期")}
                            </span>
                          )}
                        </b>
                        <small>{shoppingChannelName(item)}</small>
                      </span>
                    ))}
                    {entries.length > 2 && <em>+{entries.length - 2}</em>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </section>
  );
}
