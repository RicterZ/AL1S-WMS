import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "./i18n/apiFetch.js";
import { displayUnit } from "./i18n/index.js";
import type { Item, Location, Stock } from "./webTypes.js";

export type LocationMinimum = {
  itemId: string;
  itemName: string;
  baseUnit: string;
  locationId: string;
  locationName: string;
  minimumQuantity: number;
  quantity: number;
  shortage: number;
  availableElsewhere: number;
};

type Props = {
  homeId: string;
  items: Item[];
  locations: Location[];
  stock: Stock[];
  onTransfer: (item: Item) => void;
};

async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || String(response.status));
  return body;
}

export function LocationMinimumRows({ rows, busy, onEdit, onRemove, onTransfer }: {
  rows: LocationMinimum[];
  busy: boolean;
  onEdit: (row: LocationMinimum) => void;
  onRemove: (row: LocationMinimum) => void;
  onTransfer: (row: LocationMinimum) => void;
}) {
  const { t } = useTranslation();
  return <div className="table-wrap"><table><thead><tr>
    <th>{t("物资")}</th><th>{t("存放地点")}</th><th>{t("本位置库存")}</th>
    <th>{t("位置最低量")}</th><th>{t("调拨提醒")}</th><th>{t("操作")}</th>
  </tr></thead><tbody>{rows.map(row => <tr key={`${row.itemId}:${row.locationId}`}>
    <td>{row.itemName}</td><td>{row.locationName}</td>
    <td>{row.quantity} {displayUnit(row.baseUnit)}</td>
    <td>{row.minimumQuantity} {displayUnit(row.baseUnit)}</td>
    <td>{row.shortage > 0 ? <>
      <strong>{t("本位置缺少 {{quantity}}", { quantity: `${row.shortage} ${displayUnit(row.baseUnit)}` })}</strong>
      <p className="muted">{t("其他位置共 {{quantity}}", { quantity: `${row.availableElsewhere} ${displayUnit(row.baseUnit)}` })}</p>
    </> : t("充足")}</td>
    <td><button type="button" disabled={busy} onClick={() => onEdit(row)}>{t("编辑")}</button>{" "}
      <button type="button" disabled={busy} onClick={() => onRemove(row)}>{t("移除")}</button>{" "}
      {row.shortage > 0 && row.availableElsewhere > 0 && <button type="button" disabled={busy} onClick={() => onTransfer(row)}>{t("移动库存")}</button>}
    </td>
  </tr>)}</tbody></table></div>;
}

export function LocationMinimums({ homeId, items, locations, stock, onTransfer }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<LocationMinimum[]>([]);
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [minimum, setMinimum] = useState("1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const saving = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setRows([]);
    setItemId("");
    setLocationId("");
    setMinimum("1");
    setBusy(false);
    saving.current = false;
    return () => mutation.current?.abort();
  }, [homeId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    apiFetch(`/api/v1/homes/${homeId}/location-minimums`, { signal: controller.signal })
      .then(readResponse)
      .then((data: LocationMinimum[]) => {
        if (!controller.signal.aborted) setRows(data);
      })
      .catch(reason => {
        if (!controller.signal.aborted) { setError(reason.message); setRows([]); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [homeId, items, locations, stock, refresh]);

  async function save(ruleItemId: string, ruleLocationId: string, minimumQuantity: number) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    mutation.current = controller;
    try {
      await readResponse(await apiFetch(`/api/v1/homes/${homeId}/items/${ruleItemId}/location-minimums/${ruleLocationId}`, {
        method: "PUT", signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minimumQuantity }),
      }));
      if (!controller.signal.aborted) setRefresh(value => value + 1);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!controller.signal.aborted) { saving.current = false; setBusy(false); }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(itemId, locationId, Number(minimum));
  }

  function transfer(row: LocationMinimum) {
    const item = items.find(value => value.id === row.itemId);
    const source = stock.find(value => value.itemId === row.itemId && value.locationId !== row.locationId && value.quantity > 0);
    if (item && source) onTransfer({ ...item, locationId: source.locationId });
  }

  const shortages = rows.filter(row => row.shortage > 0).length;
  return <details className="panel location-minimums">
    <summary>{t("位置调拨提醒")} · {shortages}</summary>
    <p className="muted">{t("位置最低量仅用于调拨提醒，不生成采购建议；采购按家庭总库存判断。")}</p>
    <form ref={formRef} onSubmit={submit}>
      <fieldset className="form-row" disabled={busy || loading || items.length === 0 || locations.length === 0}>
        <label>{t("物资")}<select required value={itemId} onChange={event => setItemId(event.target.value)}>
          <option value="">{t("请选择")}</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>{t("存放地点")}<select required value={locationId} onChange={event => setLocationId(event.target.value)}>
          <option value="">{t("请选择")}</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select></label>
        <label>{t("位置最低量")}<input type="number" min="0" step="0.01" required value={minimum} onChange={event => setMinimum(event.target.value)} /></label>
        <button type="submit" disabled={busy || loading}>{busy ? t("处理中…") : t("保存")}</button>
      </fieldset>
      <p className="muted">{t("设置为 0 可移除该位置的提醒。")}</p>
    </form>
    {error && <p role="alert" className="setup-error">{error} <button type="button" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>{t("重新加载")}</button></p>}
    {loading ? <p role="status">{t("加载中…")}</p> : rows.length > 0 ? <LocationMinimumRows rows={rows} busy={busy}
      onEdit={row => { setItemId(row.itemId); setLocationId(row.locationId); setMinimum(String(row.minimumQuantity)); formRef.current?.querySelector("input")?.focus(); }}
      onRemove={row => { void save(row.itemId, row.locationId, 0); }} onTransfer={transfer} />
      : !error && <p className="empty">{t("尚未设置位置最低量")}</p>}
  </details>;
}
