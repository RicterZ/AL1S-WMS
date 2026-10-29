import { ArrowLeft, CalendarDays, MapPin, Package, X } from "lucide-react";
import { useEffect,useState,type FormEvent } from "react";
import { BatchFields } from "./BatchFields.js";
import { BatchPhotoPanel } from "./InventoryPhotos.js";
import "./BatchDialog.css";
import { apiFetch,apiJson } from "./i18n/apiFetch.js";
import i18n,{ displayUnit,localeForDates } from "./i18n/index.js";
import { PageSizeSelect } from "./PageSizeSelect.js";
import { channelLabel } from "./systemLabels.js";
const t = i18n.t.bind(i18n);

export type Batch = {
  batchId: string;
  itemId: string;
  label: string | null;
  locationId: string;
  locationName: string;
  quantity: number;
  manufacturedDate: string | null;
  expiryDate: string | null;
  receivedAt: string;
  legacy: number;
  totalPrice:number|null;
  unitPrice:number|null;
  purchaseCurrency:string|null;
  purchasedDate:string|null;
  channelId:string|null;
  channelName:string|null;
};
export function Batches({
  homeId,
  item,
  onClose,
  onChange,
  initialBatchId,
}: {
  homeId: string;
  item: { id: string; name: string; baseUnit: string };
  onClose: () => void;
  onChange: () => void;
  initialBatchId?: string | null;
}) {
  const [pageSize,setPageSize]=useState(10);
  const [rows, setRows] = useState<Batch[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [includeEmpty, setIncludeEmpty] = useState(false),
    [edit, setEdit] = useState<Batch | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [channels,setChannels]=useState<{id:string;name:string}[]>([]);
  useEffect(()=>{void apiFetch(`/api/v1/homes/${homeId}/shopping-channels`).then(response=>response.ok?response.json():[]).then(setChannels);},[homeId]);
  useEffect(() => {
    if (!initialBatchId) return;
    const controller = new AbortController();
    apiFetch(`/api/v1/homes/${homeId}/batches?itemId=${item.id}&batchId=${initialBatchId}&includeEmpty=true&limit=1`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(t("无法加载批次"));
        return response.json();
      })
      .then(data => {
        if (data.items[0]) setEdit(data.items[0]);
        else setError(t("无法加载批次"));
      })
      .catch(error => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [homeId, item.id, initialBatchId]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    apiFetch(
      `/api/v1/homes/${homeId}/batches?itemId=${item.id}&includeEmpty=${includeEmpty}&limit=${pageSize}&offset=${(page - 1) * pageSize}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(t("无法加载批次"));
        return response.json();
      })
      .then((data) => {
        setRows(data.items);
        setTotal(data.total);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [homeId, item.id, page, pageSize, includeEmpty, revision]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || busy) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiJson(`/api/v1/homes/${homeId}/batches/${edit.batchId}`, "PATCH", {
            label: data.get("label") || null,
            manufacturedDate: data.get("manufacturedDate") || null,
            expiryDate: data.get("expiryDate") || null,
            totalPrice:data.get("totalPrice")===""?null:Number(data.get("totalPrice")),
            purchaseDate:data.get("purchaseDate")||null,
            channelId:data.get("channelId")||null,
          });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || t("保存失败"));
      setEdit(null);
      setRevision((value) => value + 1);
      onChange();
    } catch (error) {
      setError(error instanceof Error ? error.message : t("保存失败"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className={`modal batches-modal batch-design-dialog ${edit ? "batch-design-edit" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batches-title"
      >
        <div className="modal-head">
          <div>
            <p className="batch-dialog-eyebrow"><Package size={13}/>{t("库存批次")}</p>
            <h2 id="batches-title">{item.name}</h2>
            <p className="muted">{t("同一批次可分布在多个地点；日期独立管理。")}</p>
          </div>
          <button className="close" aria-label={t("关闭")} disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}
        {edit ? (
          <form key={edit.batchId} onSubmit={save} className="batch-detail-form">
            <div className="batch-context-bar">
              <button type="button" className="batch-return" disabled={busy} onClick={() => setEdit(null)}><ArrowLeft size={14}/>{t("返回批次")}</button>
              <span className="batch-context-divider"/>
              <span className="batch-context-label">{edit.label || t("批次详情")}</span>
              <code>#{edit.batchId.slice(0,8).toUpperCase()}</code>
            </div>
            <div className="batch-detail-columns">
              <div className="batch-details-main">
                <div className="batch-stock-context"><span><MapPin size={15}/>{edit.locationName || t("未指定")}</span><strong>{edit.quantity} <small>{displayUnit(item.baseUnit)}</small></strong><span className="batch-current-stock">{t("当前库存")}</span></div>
                <section className="batch-form-section"><div className="batch-section-heading"><span>01</span><h3>{t("批次信息")}</h3></div>
                  <label>{t("批次备注")}<input name="label" maxLength={100} defaultValue={edit.label || ""} placeholder={t("例如：本月采购、备用装")}/></label>
                  <BatchFields manufacturedDate={edit.manufacturedDate || ""} expiryDate={edit.expiryDate || ""}/>
                  <p className="batch-received-note"><CalendarDays size={13}/>{t("入库时间")} {new Date(edit.receivedAt).toLocaleDateString(localeForDates(),{year:"numeric",month:"long",day:"numeric"})}</p>
                </section>
                <section className="batch-form-section"><div className="batch-section-heading"><span>02</span><h3>{t("采购信息")}</h3><small>{t("可选")}</small></div>
                  <div className="form-row"><label>{t("实付总价")}<input name="totalPrice" type="number" min="0" step="0.01" defaultValue={edit.totalPrice??""}/></label><label>{t("采购日期")}<input name="purchaseDate" type="date" defaultValue={edit.purchasedDate??""}/></label></div>
                  <label>{t("购买渠道")}<select name="channelId" defaultValue={edit.channelId??""}><option value="">{t("未指定")}</option>{edit.channelId&&!channels.some(channel=>channel.id===edit.channelId)&&<option value={edit.channelId}>{edit.channelName?channelLabel(edit.channelName):t("未指定")}</option>}{channels.map(channel=><option key={channel.id} value={channel.id}>{channelLabel(channel.name)}</option>)}</select></label>
                </section>
              </div>
              <aside className="batch-details-photos"><BatchPhotoPanel scopeId={homeId+":"+edit.batchId}/></aside>
            </div>
            <div className="batch-dialog-footer">
              <p>{t("照片修改会立即保存，无需保存批次。")}</p>
              <button className="secondary" type="button" disabled={busy} onClick={() => setEdit(null)}>{t("返回批次")}</button>
              <button className="primary" disabled={busy}>{busy?t("处理中…"):t("保存批次")}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="batch-toolbar">
              <div>
                <strong>{t("显示范围")}</strong>
                <small>
                  {includeEmpty
                    ? t("全部批次，包括库存为 0")
                    : t("仅显示当前有库存的批次")}
                </small>
              </div>
              <label className="batch-toggle">
                <input
                  type="checkbox"
                  checked={includeEmpty}
                  onChange={(event) => {
                    setIncludeEmpty(event.target.checked);
                    setPage(1);
                  }}
                />
                <span aria-hidden="true" />
                <b>{t("显示已用完")}</b>
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("批次")}</th>
                    <th>{t("地点")}</th>
                    <th>{t("剩余")}</th>
                    <th>{t("生产 / 到期")}</th>
                    <th>{t("采购成本")}</th>
                    <th>{t("操作")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.batchId}:${row.locationId}`}>
                      <td>
                        {row.label ||
                          new Date(row.receivedAt).toLocaleString(
                            localeForDates(),
                          )}
                        {row.legacy ? (
                          <small className="muted">{t("（历史库存）")}</small>
                        ) : null}
                      </td>
                      <td>{row.locationName || t("未指定")}</td>
                      <td>
                        {row.quantity} {displayUnit(item.baseUnit)}
                      </td>
                      <td>
                        <div className="date-cell">
                          <span>{row.manufacturedDate || t("未设置")}</span>
                          <span>{row.expiryDate || t("未设置")}</span>
                        </div>
                      </td>
                      <td>{row.totalPrice==null?t("未知"):<div className="date-cell"><span>{new Intl.NumberFormat(localeForDates(),{style:"currency",currency:row.purchaseCurrency??"CNY"}).format(row.totalPrice)}</span><span>{row.unitPrice==null?"":t("{{price}} / {{unit}}",{price:new Intl.NumberFormat(localeForDates(),{style:"currency",currency:row.purchaseCurrency??"CNY"}).format(row.unitPrice),unit:displayUnit(item.baseUnit)})}</span><span>{row.channelName?channelLabel(row.channelName):t("未指定")}</span></div>}</td>
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setEdit(row)}
                        >
                          {t("查看 / 编辑")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="batch-mobile-list">
                {rows.map(row => (
                  <div className="batch-mobile-row" key={`${row.batchId}:${row.locationId}`}>
                    <div><strong>{row.label || new Date(row.receivedAt).toLocaleString(localeForDates())}</strong><button type="button" className="text-button" onClick={() => setEdit(row)}>{t("查看 / 编辑")}</button></div>
                    <span>{row.locationName || t("未指定")} · {row.quantity} {displayUnit(item.baseUnit)}</span>
                    <span>{t("到期日期")}：{row.expiryDate || t("未设置")}</span>
                  </div>
                ))}
              </div>
              {!rows.length && <p className="empty">{t("暂无批次")}</p>}
            </div>
            <div className="pagination"><PageSizeSelect value={pageSize} onChange={size=>{setPageSize(size);setPage(1);}}/>
              <span>
                {t("共")}
                {total} {t("条")}
              </span>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                {t("上一页")}
              </button>
              <span>
                {page} / {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <button
                disabled={page * pageSize >= total}
                onClick={() => setPage(page + 1)}
              >
                {t("下一页")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function BatchSelect({
  homeId,
  itemId,
  locationId,
}: {
  homeId: string;
  itemId: string;
  locationId: string;
}) {
  const [rows, setRows] = useState<Batch[]>([]),
    [offset, setOffset] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setRows([]);
    setOffset(0);
  }, [itemId, locationId]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    apiFetch(
      `/api/v1/homes/${homeId}/batches?itemId=${itemId}&locationId=${locationId}&limit=100&offset=${offset}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(t("无法加载批次"));
        return response.json();
      })
      .then((data) => {
        setRows((previous) =>
          offset ? [...previous, ...data.items] : data.items,
        );
        setHasMore(data.hasMore);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [homeId, itemId, locationId, offset]);
  return (
    <>
      <label>
        {t("领用批次")}
        <select name="batchId" key={locationId}>
          <option value="">{t("自动分配：最早到期优先，无日期最后")}</option>
          {rows.map((row) => (
            <option key={row.batchId} value={row.batchId}>
              {row.label ||
                new Date(row.receivedAt).toLocaleString(localeForDates())}{" "}
              {t("· 剩余")}
              {row.quantity} · {row.expiryDate || t("无到期日")}
            </option>
          ))}
        </select>
      </label>
      {hasMore && (
        <button
          type="button"
          className="text-button"
          onClick={() => setOffset(offset + 100)}
        >
          {t("加载更多批次")}
        </button>
      )}
      {error && <p className="setup-error">{error}</p>}
    </>
  );
}
