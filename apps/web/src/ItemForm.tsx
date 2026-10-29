import {ConsumptionFields} from "./ConsumptionFields.js";
import { X } from "lucide-react";
import type * as React from "react";
import { FormEvent, useEffect, useRef } from "react";
import { UnitOptions } from "./AppElements.js";
import { BatchFields } from "./BatchFields.js";
import { IconPicker } from "./Icons.js";
import i18n from "./i18n/index.js";
import { categoryLabel, channelLabel } from "./systemLabels.js";
import type { Category, Location, ShoppingChannel } from "./webTypes.js";
const t = i18n.t.bind(i18n);
type ItemFormProps = {
  closeItemForm: () => void;
  itemFormRevision: number;
  addItem: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  barcodeInput: string;
  setBarcodeInput: React.Dispatch<React.SetStateAction<string>>;
  barcodeBusy: boolean;
  lookupItemBarcode: (raw?: string) => Promise<void>;
  setShowBarcodeScanner: React.Dispatch<React.SetStateAction<boolean>>;
  prefillName: string;
  prefillCategory: string;
  selectCategoryOptions:
    | (Category & { depth: number })[]
    | { id: string; name: string; parentId: null; depth: number }[];
  prefillUnit: string;
  shoppingChannels: ShoppingChannel[];
  prefillLocationId: string;
  locationOptions: (Location & { depth: number })[];
  busy: boolean;
  error: string;
};
export function ItemForm({
  closeItemForm,
  itemFormRevision,
  addItem,
  barcodeInput,
  setBarcodeInput,
  barcodeBusy,
  lookupItemBarcode,
  setShowBarcodeScanner,
  prefillName,
  prefillCategory,
  selectCategoryOptions,
  prefillUnit,
  shoppingChannels,
  prefillLocationId,
  locationOptions,
  busy,
  error,
}: ItemFormProps) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && closeItemForm()
      }
    >
      <form
        className="modal item-form-modal"
        key={itemFormRevision}
        onSubmit={addItem}
      >
        <div className="modal-head">
          <div>
            <h2>{t("添加物资")}</h2>
            <p className="muted">{t("登记名称、当前库存和补充规则")}</p>
          </div>
          <button
            type="button"
            className="close"
            onClick={closeItemForm}
            aria-label={t("关闭")}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        {error && <p ref={errorRef} className="setup-error item-form-error" role="alert">{error}</p>}
        <div className="barcode-lookup">
          <label>
            {t("商品条码（可选）")}
            <input
              name="barcode"
              inputMode="numeric"
              pattern="[0-9]{8,14}"
              value={barcodeInput}
              onChange={(event) => setBarcodeInput(event.target.value)}
              placeholder={t("输入 EAN / UPC / GTIN")}
            />
          </label>
          <div>
            <button
              type="button"
              className="secondary"
              disabled={barcodeBusy || !barcodeInput}
              onClick={() => lookupItemBarcode()}
            >
              {barcodeBusy ? t("查询中…") : t("查询")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowBarcodeScanner(true)}
            >
              {t("摄像头扫描")}
            </button>
          </div>
        </div>
        <label>
          {t("物资名称")}
          <input
            name="name"
            required
            defaultValue={prefillName}
            placeholder={t("例如：洗衣液")}
          />
        </label>
        <label>
          {t("类型")}
          <select name="category" defaultValue={prefillCategory || "其他"}>
            {selectCategoryOptions.map((category) => (
              <option key={category.id} value={category.name}>
                {"　".repeat(category.depth)}
                {categoryLabel(category.name)}
              </option>
            ))}
          </select>
        </label>
        <ConsumptionFields/>
        <div className="form-row">
          <label>
            {t("单位")}
            <select name="baseUnit" defaultValue={prefillUnit}>
              <UnitOptions current={prefillUnit} />
            </select>
          </label>
          <label>
            {t("库存")}
            <input
              name="initialStock"
              type="number"
              min="0"
              step="any"
              defaultValue="0"
            />
          </label>
        </div>
        <label>
          {t("家庭最低库存")}
          <input
            name="reorderPoint"
            type="number"
            min="0"
            step="any"
            defaultValue="0"
          />
        </label>
        <p className="form-hint">{t("汇总所有存放位置，低于此数量时建议采购。")}</p>
        <BatchFields title={t("初始库存批次（可选）")} />
        <fieldset className="purchase-cost">
          <legend>{t("初始库存成本（可选）")}</legend>
          <div className="form-row">
            <label>
              {t("实付总价")}
              <input
                name="totalPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </label>
            <label>
              {t("采购日期")}
              <input
                name="purchaseDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              {t("购买渠道")}
              <select name="channelId" defaultValue="">
                <option value="">{t("未指定")}</option>
                {shoppingChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channelLabel(channel.name)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <label>
          {t("存放地点")}
          <select name="locationId" defaultValue={prefillLocationId}>
            <option value="">{t("暂不指定")}</option>
            {locationOptions.map((location) => (
              <option key={location.id} value={location.id}>
                {"　".repeat(location.depth)}
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <IconPicker />
        <button className="primary full" disabled={busy}>
          {busy ? t("保存中…") : t("保存物资")}
        </button>
      </form>
    </div>
  );
}
