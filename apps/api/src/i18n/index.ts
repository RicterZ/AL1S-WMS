import type { FastifyReply } from "fastify";

export const supportedLocales = ["zh-CN", "en-US"] as const;
export type Locale = (typeof supportedLocales)[number];

const messages = {
  "zh-CN": {
    "error.operationNotFound": "操作不存在",
    "error.undoHasDependencies": "相关库存、批次或采购记录已变化，不能直接撤销；请先核对后续操作",
    "error.stocktakeStale": "盘点期间库存已变化，请重新加载后核对",
    "error.stocktakeOpened": "实盘数量少于已开封数量，请先处理已开封记录",
    "reason.undoOperation": "撤销库存操作（冲正）",
    "reason.reversedOperation": "已撤销的库存操作",

    "error.childBudgetExceedsParent": "{category}的子分类预算合计超过该分类额度",
    "error.validation": "参数格式不正确",
    "error.internal": "操作失败，请稍后重试",
    "error.photoInvalid": "请选择有效的 JPEG、PNG 或 WebP 图片（不超过 10 MB、4000 万像素）",
    "error.photoLimit": "每个批次最多保存 6 张照片",
    "error.photoNotFound": "照片不存在",
    "error.photoTooLarge": "图片不能超过 10 MB",
    "error.homeScopeOther": "该令牌不能访问其他家庭",
    "error.homeScopeCreate": "家庭令牌不能创建其他家庭",
    "error.tokenScopeRequired": "请选择令牌管理的家庭",
    "error.selectedHomeNotFound": "所选家庭不存在",
    "error.invalidNewPassword": "新密码至少需要 8 个字符",
    "error.invalidCurrentPassword": "当前密码不正确",
    "error.passwordUnchanged": "新密码不能与当前密码相同",
    "error.invalidCredentials": "用户名或密码错误",
    "error.setupInvalid": "账号、密码、家庭名称和至少一个地点不能为空",
    "error.homeFields": "请填写家庭名称并选择图标",
    "error.homeNotFound": "家庭不存在",
    "error.categoryNameRequired": "分类名称不能为空",
    "error.locationNameRequired": "地点名称不能为空",
    "error.barcodeExists": "该条码已关联其他物资",
    "error.unitHasHistory": "已有库存流水的物资暂不支持更改单位，避免改变历史数量含义",
    "error.locationHasStock": "仍有库存，不能清空地点；请选择新地点",
    "error.batchNotFound": "批次不存在",
    "error.initialLocationRequired": "有初始库存时必须指定地点",
    "error.shoppingChannelExists": "购买渠道已存在",
    "error.invalidDates": "到期日期不能早于生产日期",
    "error.itemNotFoundOrDeleted": "物资不存在或已删除",
    "error.locationNotInHome": "地点不存在或不属于当前家庭",
    "error.insufficientStock": "该地点库存不足，可用 {available}",
    "error.insufficientBatchStock": "该地点的指定批次库存不足，可用 {available}",
    "error.insufficientUnopenedStock": "可开封库存不足，可用 {available}",
    "error.openedConsumableNotFound": "已开封消耗品不存在",
    "error.openedConsumableQuantity": "用尽数量超过已开封数量",
    "error.idempotencyConflict": "该操作编号已用于其他参数，请使用新的编号",
    "error.receiptExistingBatch": "每次入库创建独立批次，不可指定已有批次",
    "error.issueBatchDates": "领用不能修改批次日期",
    "error.sameLocation": "调出和调入地点不能相同",
    "error.reconcileGainBatch": "盘盈会创建新批次，不能指定已有批次",
    "error.reconcileLossDates": "盘亏不能修改批次日期",
    "error.shoppingItemNotFound": "采购项不存在",
    "error.shoppingSuggestionResolved": "该物资已不需要补货",
    "error.shoppingCompletedEdit": "已入库的采购项不能再编辑",
    "error.linkedItemNotFound": "关联物资不存在",
    "error.shoppingFieldsRequired": "独立采购项需要名称、单位、分类和地点",
    "error.shoppingLocationInvalid": "请选择当前家庭的有效地点",
    "error.shoppingChannelInvalid": "请选择当前家庭的有效购买渠道",
    "error.shoppingAlreadyReceived": "该采购项已入库",
    "error.linkedItemDeleted": "关联物资已删除",
    "error.shoppingLocationRequired": "请选择入库地点",
    "error.shoppingDetailsRequired": "请先补齐采购项的单位和分类",
    "error.invalidBarcodeChecksum": "条码校验位不正确",
    "error.barcodeLookupUnavailable": "在线条码数据库暂时不可用，请稍后重试",
    "error.deleteNotFound": "对象不存在或已删除",
    "error.deleteParentMissing": "上一级节点不存在，请先调整层级",
    "error.deleteNameConflict": "上一级存在同名节点或默认归属名称已被占用，请先重命名后再删除",
    "error.invalidApiToken": "API 令牌无效",
    "error.unauthenticated": "请先登录",
    "error.invalidTokenName": "令牌名称无效",
    "error.tokenNotFound": "令牌不存在",
    "error.setupComplete": "系统已完成初始化",
    "error.itemNotFound": "物资不存在",
    "error.parentCategoryNotFound": "上级分类不存在",
    "error.categoryExists": "分类已存在",
    "error.categoryNotFound": "分类不存在",
    "error.categoryCycle": "分类层级不能形成循环",
    "error.parentLocationNotFound": "上级地点不存在",
    "error.locationExists": "地点已存在",
    "error.locationNotFound": "地点不存在",
    "error.locationCycle": "地点层级不能形成循环",
    "error.notFound": "资源不存在",
    "error.shoppingChannelNotFound": "购买渠道不存在",
    "error.currencyHasHistory": "已有采购价格历史，不能更改默认币种",
    "action.expired": "{itemName} 批次已于 {expiryDate} 过期",
    "action.expiring": "{itemName} 批次将于 {expiryDate} 到期",
    "action.buyPending": "待采购 {name} {quantity} {unit}",
    "action.replenish": "{name} 建议补充 {quantity} {unit}",
    "reason.initialStock": "初始库存",
    "reason.purchaseReceipt": "采购入库",
    "reason.newBatch": "入库新批次",
    "reason.specifiedBatchIssue": "领用指定批次",
    "reason.fefoIssue": "按到期顺序领用",
    "reason.stocktakeGain": "盘点盘盈",
    "reason.stocktakeLoss": "盘点盘亏",
    "reason.openLongTermConsumable": "开封长期消耗品",
  },
  "en-US": {
    "error.operationNotFound": "Operation not found",
    "error.undoHasDependencies": "Related stock, batch or purchase records have changed; review later operations before undoing.",
    "error.stocktakeStale": "Stock changed during counting; reload and verify the quantities.",
    "error.stocktakeOpened": "Counted quantity is below the opened quantity; resolve opened records first.",
    "reason.undoOperation": "Inventory operation reversed",
    "reason.reversedOperation": "Reversed inventory operation",

    "error.childBudgetExceedsParent": "Child budgets exceed the budget for {category}",
    "error.validation": "Invalid request parameters",
    "error.photoInvalid": "Choose a valid JPEG, PNG or WebP image (up to 10 MB and 40 megapixels)",
    "error.photoLimit": "Each batch can have up to 6 photos",
    "error.photoNotFound": "Photo not found",
    "error.photoTooLarge": "Images must not exceed 10 MB",
    "error.internal": "Operation failed. Please try again later",
    "error.homeScopeOther": "This token cannot access another home",
    "error.homeScopeCreate": "A home-scoped token cannot create another home",
    "error.tokenScopeRequired": "Select the home managed by this token",
    "error.selectedHomeNotFound": "The selected home does not exist",
    "error.invalidNewPassword": "The new password must contain at least 8 characters",
    "error.invalidCurrentPassword": "The current password is incorrect",
    "error.passwordUnchanged": "The new password must differ from the current password",
    "error.invalidCredentials": "Incorrect username or password",
    "error.setupInvalid": "Account, password, home name, and at least one location are required",
    "error.homeFields": "Enter a home name and select an icon",
    "error.homeNotFound": "Home not found",
    "error.categoryNameRequired": "Category name is required",
    "error.locationNameRequired": "Location name is required",
    "error.barcodeExists": "This barcode is already linked to another item",
    "error.unitHasHistory": "The unit cannot be changed after stock history has been recorded",
    "error.locationHasStock": "The location cannot be cleared while stock remains; select a new location",
    "error.batchNotFound": "Batch not found",
    "error.initialLocationRequired": "A location is required when initial stock is provided",
    "error.shoppingChannelExists": "Purchase channel already exists",
    "error.invalidDates": "The expiry date cannot be earlier than the production date",
    "error.itemNotFoundOrDeleted": "Item not found or deleted",
    "error.locationNotInHome": "Location not found or does not belong to this home",
    "error.insufficientStock": "Insufficient stock at this location; available: {available}",
    "error.insufficientBatchStock": "Insufficient stock in the specified batch at this location; available: {available}",
    "error.insufficientUnopenedStock": "Only {available} unopened stock is available",
    "error.openedConsumableNotFound": "Opened consumable not found",
    "error.openedConsumableQuantity": "The exhausted quantity exceeds the opened quantity",
    "error.idempotencyConflict": "This operation key was used with different parameters; use a new key",
    "error.receiptExistingBatch": "Each receipt creates a new batch; an existing batch cannot be specified",
    "error.issueBatchDates": "Batch dates cannot be changed when issuing stock",
    "error.sameLocation": "Source and destination locations must differ",
    "error.reconcileGainBatch": "A reconciliation gain creates a new batch; an existing batch cannot be specified",
    "error.reconcileLossDates": "Batch dates cannot be changed for a reconciliation loss",
    "error.shoppingItemNotFound": "Purchase item not found",
    "error.shoppingSuggestionResolved": "This item no longer needs replenishment",
    "error.shoppingCompletedEdit": "A received purchase item cannot be edited",
    "error.linkedItemNotFound": "Linked item not found",
    "error.shoppingFieldsRequired": "A standalone purchase requires a name, unit, category, and location",
    "error.shoppingLocationInvalid": "Select a valid location in this home",
    "error.shoppingChannelInvalid": "Select a valid purchase channel in this home",
    "error.shoppingAlreadyReceived": "This purchase item has already been received",
    "error.linkedItemDeleted": "The linked item has been deleted",
    "error.shoppingLocationRequired": "Select a receiving location",
    "error.shoppingDetailsRequired": "Add the purchase item's unit and category first",
    "error.invalidBarcodeChecksum": "Invalid barcode check digit",
    "error.barcodeLookupUnavailable": "The online barcode database is temporarily unavailable. Please try again later",
    "error.deleteNotFound": "Object not found or already deleted",
    "error.deleteParentMissing": "The parent node no longer exists; adjust the hierarchy first",
    "error.deleteNameConflict": "The parent contains a conflicting name; rename it before deleting",
    "error.invalidApiToken": "Invalid API token",
    "error.unauthenticated": "Authentication required",
    "error.invalidTokenName": "Invalid token name",
    "error.tokenNotFound": "Token not found",
    "error.setupComplete": "Setup has already been completed",
    "error.itemNotFound": "Item not found",
    "error.parentCategoryNotFound": "Parent category not found",
    "error.categoryExists": "Category already exists",
    "error.categoryNotFound": "Category not found",
    "error.categoryCycle": "Category hierarchy cannot contain a cycle",
    "error.parentLocationNotFound": "Parent location not found",
    "error.locationExists": "Location already exists",
    "error.locationNotFound": "Location not found",
    "error.locationCycle": "Location hierarchy cannot contain a cycle",
    "error.notFound": "Resource not found",
    "error.shoppingChannelNotFound": "Purchase channel not found",
    "error.currencyHasHistory": "The default currency cannot be changed after purchase prices have been recorded",
    "action.expired": "{itemName} batch expired on {expiryDate}",
    "action.expiring": "{itemName} batch expires on {expiryDate}",
    "action.buyPending": "Buy {name} {quantity} {unit}",
    "action.replenish": "Replenish {name} by {quantity} {unit}",
    "reason.initialStock": "Initial stock",
    "reason.purchaseReceipt": "Purchase receipt",
    "reason.newBatch": "New batch receipt",
    "reason.specifiedBatchIssue": "Issue specified batch",
    "reason.fefoIssue": "Issue by earliest expiry",
    "reason.stocktakeGain": "Stocktake gain",
    "reason.stocktakeLoss": "Stocktake loss",
    "reason.openLongTermConsumable": "Opened long-term consumable",
  },
} as const;

export type TranslationKey = keyof (typeof messages)["zh-CN"];
type TranslationParams = {
  "error.insufficientStock": { available: number };
  "error.insufficientBatchStock": { available: number };
  "error.insufficientUnopenedStock": { available: number };
  "action.expired": { itemName: unknown; expiryDate: unknown };
  "action.expiring": { itemName: unknown; expiryDate: unknown };
  "action.buyPending": { name: unknown; quantity: unknown; unit: unknown };
  "action.replenish": { name: unknown; quantity: unknown; unit: unknown };
};
export type ParamsFor<K extends TranslationKey> =
  K extends keyof TranslationParams ? TranslationParams[K] : undefined;

const quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;
const range = /^(?:\*|[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*)$/;

export function parseAcceptLanguage(header: unknown): Locale {
  if (typeof header !== "string" || !header.trim()) return "zh-CN";
  const choices: { locale: Locale; q: number; index: number }[] = [];
  const entries = header.split(",");
  for (let index = 0; index < entries.length; index++) {
    const parts = entries[index].trim().split(";").map(part => part.trim());
    if (!parts[0] || !range.test(parts[0]) || parts.length > 2) return "zh-CN";
    let q = 1;
    if (parts[1]) {
      const match = /^q=(.+)$/i.exec(parts[1]);
      if (!match || !quality.test(match[1])) return "zh-CN";
      q = Number(match[1]);
    }
    if (q === 0) continue;
    const language = parts[0].toLowerCase();
    const locale = language === "en" || language.startsWith("en-")
      ? "en-US"
      : language === "zh" || language.startsWith("zh-")
        ? "zh-CN"
        : undefined;
    if (locale) choices.push({ locale, q, index });
  }
  choices.sort((a, b) => b.q - a.q || a.index - b.index);
  return choices[0]?.locale ?? "zh-CN";
}

export function renderTranslation(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, unknown>,
): string {
  return messages[locale][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name] ?? ""),
  );
}

const units = {
  "zh-CN": {
    个: "个",
    瓶: "瓶",
    盒: "盒",
    包: "包",
    箱: "箱",
    袋: "袋",
    罐: "罐",
    桶: "桶",
    卷: "卷",
    支: "支",
    根: "根",
    条: "条",
    片: "片",
    张: "张",
    块: "块",
    颗: "颗",
    把: "把",
    双: "双",
    套: "套",
    份: "份",
    克: "克",
    市斤: "市斤",
    千克: "千克",
    毫升: "毫升",
    升: "升",
    厘米: "厘米",
    米: "米",
    其他: "其他",
    件: "件",
  },
  "en-US": {
    个: "unit",
    瓶: "bottle(s)",
    盒: "box(es)",
    包: "pack(s)",
    箱: "carton(s)",
    袋: "bag(s)",
    罐: "can(s)",
    桶: "bucket(s)",
    卷: "roll(s)",
    支: "piece(s)",
    根: "piece(s)",
    条: "strip(s)",
    片: "slice(s)",
    张: "sheet(s)",
    块: "piece(s)",
    颗: "piece(s)",
    把: "bunch(es)",
    双: "pair(s)",
    套: "set(s)",
    份: "serving(s)",
    克: "g",
    市斤: "jin",
    千克: "kg",
    毫升: "mL",
    升: "L",
    厘米: "cm",
    米: "m",
    其他: "other",
    件: "piece(s)",
  },
} as const;

export function displayUnit(locale: Locale, unit: unknown) {
  const value = String(unit ?? "");
  return (units[locale] as Record<string, string>)[value] ?? value;
}

export function translate<K extends TranslationKey>(
  locale: Locale,
  key: K,
  ...args: ParamsFor<K> extends undefined ? [] : [ParamsFor<K>]
): string {
  return renderTranslation(locale, key, args[0] as Record<string, unknown> | undefined);
}

const legacyReasons:Record<string,TranslationKey>={
  "初始库存":"reason.initialStock","采购入库":"reason.purchaseReceipt","入库新批次":"reason.newBatch",
  "领用指定批次":"reason.specifiedBatchIssue","按到期顺序领用":"reason.fefoIssue",
  "盘点盘盈":"reason.stocktakeGain","盘点盘亏":"reason.stocktakeLoss",
  "开封长期消耗品":"reason.openLongTermConsumable",
};
export function localizeReason(locale:Locale,reason:unknown) {
  const value=String(reason??"");
  const key=(value.startsWith("reason.")?value:legacyReasons[value]) as TranslationKey|undefined;
  return key&&key in messages[locale]?renderTranslation(locale,key):value;
}

type ErrorBody = { code?: string; message?: string; details?: unknown };

export function sendError<K extends TranslationKey>(
  reply: FastifyReply,
  locale: Locale,
  status: number,
  options: { code?: string; key?: K; params?: ParamsFor<K>; details?: unknown },
) {
  const body: ErrorBody = {};
  if (options.code !== undefined) body.code = options.code;
  if (options.key !== undefined)
    body.message = translate(locale, options.key, ...(
      options.params === undefined ? [] : [options.params]
    ) as ParamsFor<K> extends undefined ? [] : [ParamsFor<K>]);
  if (options.details !== undefined) body.details = options.details;
  return reply.code(status).send(body);
}

export function sendCodeError<K extends TranslationKey>(
  reply: FastifyReply,
  locale: Locale,
  status: number,
  code: string,
  key: K,
  details?: unknown,
) {
  return sendError(reply, locale, status, {
    code,
    ...(locale === "en-US" ? { key } : {}),
    details,
  });
}
