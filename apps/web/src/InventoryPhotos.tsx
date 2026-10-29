import { Camera, ImagePlus, Images, Maximize2, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import "./InventoryPhotos.css";

type Photo = { id: string; url: string; caption: string; objectUrl?: boolean };
const drafts = new Map<string, Photo[]>();
function initialPhotos(key: string, batch: boolean): Photo[] {
  if (!drafts.has(key)) {
    const sample = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("photoPreview") === "1";
    drafts.set(key, sample ? [
      { id: "front", url: "/photo-preview/tea-front.svg", caption: "包装正面" },
      ...(batch ? [{ id: "label", url: "/photo-preview/tea-label.svg", caption: "日期标签" }] : []),
    ] : []);
  }
  return drafts.get(key)!;
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
    <div className="inventory-photo-viewer-head"><div><span>{t("照片预览")}</span><h2 id={titleId}>{t(photo.caption)}</h2></div><button type="button" onClick={onClose} aria-label={t("关闭")}><X size={21}/></button></div>
    <div className="inventory-photo-viewer-image"><img src={photo.url} alt={t(photo.caption)}/></div>
  </dialog>;
}

function PhotoPanel({ scopeId, batch }: { scopeId: string; batch: boolean }) {
  const { t } = useTranslation();
  const key = `${batch ? "batch" : "item"}:${scopeId}`;
  const [photos, setPhotos] = useState<Photo[]>(() => initialPhotos(key, batch));
  const [selected, setSelected] = useState<Photo | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const limit = batch ? 6 : 1;
  useEffect(() => { setPhotos(initialPhotos(key, batch)); setSelected(null); setError(""); }, [key, batch]);
  function update(next: Photo[]) { drafts.set(key, next); setPhotos(next); }
  function remove(photo: Photo) {
    if (photo.objectUrl) URL.revokeObjectURL(photo.url);
    update(photos.filter(value => value.id !== photo.id));
  }
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    if (!files.length) return;
    if (files.some(file => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)) { setError(t("请选择 10 MB 以内的图片。")); return; }
    const capacity = batch ? limit - photos.length : 1;
    if (files.length > capacity) { setError(t("批次最多添加 6 张照片。")); return; }
    const added = files.map(file => ({ id: crypto.randomUUID(), url: URL.createObjectURL(file), caption: file.name, objectUrl: true }));
    if (!batch) photos.forEach(photo => { if (photo.objectUrl) URL.revokeObjectURL(photo.url); });
    update(batch ? [...photos, ...added] : added);
  }
  const picker = <input ref={input} className="inventory-photo-input" type="file" accept="image/*" multiple={batch} aria-label={t(batch ? "添加批次照片" : "添加商品照片")} onChange={upload}/>;
  return <section className={`inventory-photos ${batch ? "inventory-photos-batch" : "inventory-photos-item"}`} aria-label={t(batch ? "批次照片" : "商品照片")}>
    {picker}
    <span className="photo-prototype-note">{t("照片功能预览 · 仅当前页面会话保留")}</span>
    {batch ? <>
      <div className="inventory-photos-heading"><div className="inventory-photos-title"><span className="inventory-photos-mark"><Images size={17}/></span><div><h3>{t("批次照片")} <span>{photos.length} / 6</span></h3><p>{t("保留包装与日期标签，核对这一批的实物信息。")}</p></div></div><button type="button" className="inventory-photo-add" disabled={photos.length >= limit} onClick={() => input.current?.click()}><ImagePlus size={15}/>{t("添加照片")}</button></div>
      <div className="inventory-photo-gallery">{photos.map(photo => <article className="inventory-photo-card" key={photo.id}><button type="button" className="inventory-photo-thumbnail" onClick={() => setSelected(photo)} aria-label={t("查看 {{name}}", { name: t(photo.caption) })}><img src={photo.url} alt={t(photo.caption)}/><span><Maximize2 size={14}/>{t("查看大图")}</span></button><div className="inventory-photo-caption"><span title={t(photo.caption)}>{t(photo.caption)}</span><button type="button" onClick={() => remove(photo)} aria-label={t("删除 {{name}}", { name: t(photo.caption) })}><Trash2 size={14}/></button></div></article>)}
      {photos.length < limit && <button type="button" className="inventory-photo-drop" onClick={() => input.current?.click()}><ImagePlus size={23}/><strong>{t("添加照片")}</strong><small>{t("包装、日期标签或实物状态")}</small></button>}</div>
      <div className="inventory-photo-note"><span>{t("照片属于该批次，调拨到其他位置仍可查看。")}</span><span>{t("可选")}</span></div>
    </> : <>
      {photos[0] ? <button type="button" className="inventory-item-photo" onClick={() => setSelected(photos[0])} aria-label={t("查看商品照片")}><img src={photos[0].url} alt={t("商品照片")}/><span><Maximize2 size={14}/>{t("查看大图")}</span></button> : <button type="button" className="inventory-item-photo inventory-item-photo-empty" onClick={() => input.current?.click()}><Camera size={30}/><span>{t("添加商品照片")}</span></button>}
      <div className="inventory-item-photo-copy"><span className="inventory-photo-eyebrow">{t("实物参考")}</span><h2>{t("商品照片")}</h2><p>{t("记录熟悉的包装，查看详情时更容易辨认。")}</p><p className="inventory-photo-secondary">{t("所有位置共用一张商品照片；批次标签在批次中查看。")}</p><div className="inventory-photo-actions"><button type="button" className="inventory-photo-add" onClick={() => input.current?.click()}><ImagePlus size={15}/>{t(photos.length ? "更换照片" : "添加照片")}</button>{photos[0] && <button type="button" className="inventory-photo-remove" onClick={() => remove(photos[0])}><Trash2 size={14}/>{t("移除")}</button>}</div></div>
    </>}
    {error && <p className="inventory-photo-error" role="alert">{error}</p>}
    {selected && <PhotoViewer photo={selected} onClose={() => setSelected(null)}/>}
  </section>;
}

export function ItemPhotoPanel({ scopeId }: { scopeId: string }) { return <PhotoPanel key={`item:${scopeId}`} scopeId={scopeId} batch={false}/>; }
export function BatchPhotoPanel({ scopeId }: { scopeId: string }) { return <PhotoPanel key={`batch:${scopeId}`} scopeId={scopeId} batch/>; }
