import { Camera, ImagePlus, Images, Maximize2, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "./i18n/apiFetch.js";
import "./InventoryPhotos.css";

type Photo = { id: string; url: string; thumbnailUrl: string; caption: string };

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    let message = fallback;
    try { message = (await response.json()).message || fallback; } catch { /* Use the localized fallback for non-JSON errors. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function PhotoViewer({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="inventory-photo-viewer" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="inventory-photo-viewer-head"><div><span>{t("照片预览")}</span><h2 id={titleId}>{photo.caption}</h2></div><button type="button" onClick={onClose} aria-label={t("关闭")}><X size={21}/></button></div>
    <div className="inventory-photo-viewer-image"><img src={photo.url} alt={photo.caption}/></div>
  </dialog>;
}

function PhotoPanel({ scopeId, batch }: { scopeId: string; batch: boolean }) {
  const { t } = useTranslation();
  const [homeId, entityId] = scopeId.split(":");
  const endpoint = `/api/v1/homes/${homeId}/${batch ? "batches" : "items"}/${entityId}/photos`;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const mutation = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const limit = batch ? 6 : 1;
  const disabled = busy || loading || !loaded;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoaded(false);
    setError("");
    setSelected(null);
    setPhotos([]);
    apiFetch(endpoint, { signal: controller.signal })
      .then(response => readResponse<Photo[]>(response, t("无法加载照片")))
      .then(data => { if (!controller.signal.aborted) { setPhotos(data); setLoaded(true); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("无法加载照片")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); mutation.current?.abort(); };
  }, [endpoint, revision]);

  async function mutate(action: (signal: AbortSignal) => Promise<void>) {
    if (saving.current || loading || !loaded) return;
    saving.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    mutation.current = controller;
    let failure = "";
    try {
      await action(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted) failure = reason instanceof Error ? reason.message : t("照片保存失败");
    }
    // Always read the canonical list: earlier files may have uploaded before a later one failed.
    if (!controller.signal.aborted) {
      try {
        const canonical = await readResponse<Photo[]>(await apiFetch(endpoint, { signal: controller.signal }), t("无法加载照片"));
        if (!controller.signal.aborted) setPhotos(canonical);
      } catch (reason) {
        if (!controller.signal.aborted && !failure) failure = reason instanceof Error ? reason.message : t("无法加载照片");
      }
    }
    if (!controller.signal.aborted) {
      setError(failure);
      setBusy(false);
      saving.current = false;
      mutation.current = null;
    }
  }

  function remove(photo: Photo) {
    void mutate(async signal => {
      const response = await apiFetch(`${endpoint}/${photo.id}`, { method: "DELETE", signal });
      if (!response.ok) await readResponse(response, t("照片删除失败"));
      if (!signal.aborted) setSelected(null);
    });
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (disabled || !files.length) return;
    setError("");
    if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError(t("请选择 JPEG、PNG 或 WebP 图片。")); return;
    }
    if (files.some(file => file.size === 0 || file.size > 10 * 1024 * 1024)) {
      setError(t("请选择 10 MB 以内的图片。")); return;
    }
    const capacity = batch ? limit - photos.length : 1;
    if (files.length > capacity) { setError(t("批次最多添加 6 张照片。")); return; }
    void mutate(async signal => {
      for (const file of files) {
        await readResponse<Photo>(await apiFetch(endpoint, {
          method: "POST", signal,
          headers: { "Content-Type": file.type, "x-photo-name": encodeURIComponent(file.name) },
          body: file,
        }), t("照片保存失败"));
      }
    });
  }
  const picker = <input ref={input} className="inventory-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple={batch} disabled={disabled} aria-label={t(batch ? "添加批次照片" : "添加商品照片")} onChange={upload}/>;
  return <section className={`inventory-photos ${batch ? "inventory-photos-batch" : "inventory-photos-item"}`} aria-label={t(batch ? "批次照片" : "商品照片")}>
    {picker}
    {loading && <p className="muted" role="status">{t("加载中…")}</p>}
    {busy && <p className="muted" role="status">{t("正在保存照片…")}</p>}
    {batch ? <>
      <div className="inventory-photos-heading"><div className="inventory-photos-title"><span className="inventory-photos-mark"><Images size={17}/></span><div><h3>{t("批次照片")} <span>{photos.length} / 6</span></h3><p>{t("保留包装与日期标签，核对这一批的实物信息。")}</p></div></div><button type="button" className="inventory-photo-add" disabled={disabled || photos.length >= limit} onClick={() => input.current?.click()}><ImagePlus size={15}/>{t("添加照片")}</button></div>
      <div className="inventory-photo-gallery">{photos.map(photo => <article className="inventory-photo-card" key={photo.id}><button type="button" className="inventory-photo-thumbnail" disabled={disabled} onClick={() => setSelected(photo)} aria-label={t("查看 {{name}}", { name: photo.caption })}><img src={photo.thumbnailUrl} alt={photo.caption}/><span><Maximize2 size={14}/>{t("查看大图")}</span></button><div className="inventory-photo-caption"><span title={photo.caption}>{photo.caption}</span><button type="button" disabled={disabled} onClick={() => remove(photo)} aria-label={t("删除 {{name}}", { name: photo.caption })}><Trash2 size={14}/></button></div></article>)}
      {photos.length < limit && <button type="button" className="inventory-photo-drop" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={23}/><strong>{t("添加照片")}</strong><small>{t("包装、日期标签或实物状态")}</small></button>}</div>
      <div className="inventory-photo-note"><span>{t("照片属于该批次，调拨到其他位置仍可查看。")}</span><span>{t("可选")}</span></div>
    </> : <>
      {photos[0] ? <button type="button" className="inventory-item-photo" disabled={disabled} onClick={() => setSelected(photos[0])} aria-label={t("查看商品照片")}><img src={photos[0].thumbnailUrl} alt={t("商品照片")}/><span><Maximize2 size={14}/>{t("查看大图")}</span></button> : <button type="button" className="inventory-item-photo inventory-item-photo-empty" disabled={disabled} onClick={() => input.current?.click()}><Camera size={30}/><span>{t("添加商品照片")}</span></button>}
      <div className="inventory-item-photo-copy"><span className="inventory-photo-eyebrow">{t("实物参考")}</span><h2>{t("商品照片")}</h2><p>{t("记录熟悉的包装，查看详情时更容易辨认。")}</p><p className="inventory-photo-secondary">{t("所有位置共用一张商品照片；批次标签在批次中查看。")}</p><div className="inventory-photo-actions"><button type="button" className="inventory-photo-add" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={15}/>{t(photos.length ? "更换照片" : "添加照片")}</button>{photos[0] && <button type="button" className="inventory-photo-remove" disabled={disabled} onClick={() => remove(photos[0])}><Trash2 size={14}/>{t("移除")}</button>}</div></div>
    </>}
    {error && <p className="inventory-photo-error" role="alert">{error} <button type="button" className="text-button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>{t("重新加载")}</button></p>}
    {selected && <PhotoViewer photo={selected} onClose={() => setSelected(null)}/>}
  </section>;
}

export function ItemPhotoPanel({ scopeId }: { scopeId: string }) { return <PhotoPanel key={`item:${scopeId}`} scopeId={scopeId} batch={false}/>; }
export function BatchPhotoPanel({ scopeId }: { scopeId: string }) { return <PhotoPanel key={`batch:${scopeId}`} scopeId={scopeId} batch/>; }
