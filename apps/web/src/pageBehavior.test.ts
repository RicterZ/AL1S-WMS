import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Browser globals are installed before loading the application locale singleton.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: () => "zh-CN", setItem: () => {} },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { documentElement: { lang: "" } },
});
const { default: i18n } = await import("./i18n/index.js");
const { HierarchyManager } = await import("./HierarchyManager.js");
const { UnitOptions } = await import("./AppElements.js");
const { Setup, Login } = await import("./AuthScreens.js");
const { formatMoney } = await import("./formatMoney.js");
const { ProfileUserSettings, ProfileHomeSettings } =
  await import("./ProfilePage.js");

test("item creation error stays inside its form and preserves location selection", async () => {
  const { ItemForm } = await import("./ItemForm.js");
  const html=renderToStaticMarkup(createElement(ItemForm,{
    closeItemForm:()=>{}, itemFormRevision:1, addItem:async()=>{},
    barcodeInput:"",setBarcodeInput:()=>{},barcodeBusy:false,lookupItemBarcode:async()=>{},
    setShowBarcodeScanner:()=>{},prefillName:"玉米",prefillCategory:"",selectCategoryOptions:[{id:"other",name:"其他",parentId:null,depth:0}],
    prefillUnit:"个",shoppingChannels:[],prefillLocationId:"",locationOptions:[],busy:false,
    error:"有初始库存时必须指定地点",
  }));
  assert.match(html,/role="alert"[^>]*>有初始库存时必须指定地点/);
  assert.match(html,/name="locationId"/);
});

test("initial auth screens preserve password controls and setup gating", () => {
  const setup = renderToStaticMarkup(
    createElement(Setup, { onComplete: () => {} }),
  );
  assert.match(setup, /首次启动设置/);
  assert.match(setup, /<button[^>]+disabled=""[^>]*>继续<\/button>/);
  assert.match(setup, /type="password"/);
  const login = renderToStaticMarkup(
    createElement(Login, { onLogin: () => {} }),
  );
  assert.match(login, /使用初始化时创建的管理员账号继续/);
  assert.match(login, /type="password"/);
  assert.doesNotMatch(login, /<button[^>]+disabled/);
});

test("custom units remain selectable without duplicating preset units", () => {
  const custom = renderToStaticMarkup(
    createElement(
      "select",
      null,
      createElement(UnitOptions, { current: "自定义" }),
    ),
  );
  assert.match(custom, /<option value="自定义">自定义<\/option>/);
  const known = renderToStaticMarkup(
    createElement(
      "select",
      null,
      createElement(UnitOptions, { current: "瓶" }),
    ),
  );
  assert.equal((known.match(/value="瓶"/g) ?? []).length, 1);
});

test("hierarchy forms keep location names literal and localize only categories", async () => {
  await i18n.changeLanguage("en-US");
  try {
    const props = {
      name: "",
      parent: "",
      options: [{ id: "food", name: "食品", depth: 1 }],
      onNameChange: () => {},
      onParentChange: () => {},
      onSubmit: () => {},
    };
    const location = renderToStaticMarkup(
      createElement(HierarchyManager, { ...props, kind: "location" }),
    );
    const category = renderToStaticMarkup(
      createElement(HierarchyManager, { ...props, kind: "category" }),
    );
    assert.match(location, /<option value="food">　食品<\/option>/);
    assert.match(category, /<option value="food">　Food<\/option>/);
    assert.match(location, /required=""/);
    assert.match(category, /required=""/);
  } finally {
    await i18n.changeLanguage("zh-CN");
  }
});

test("money keeps two decimal places even for JPY and uses active locale", async () => {
  for (const locale of ["zh-CN", "en-US"]) {
    await i18n.changeLanguage(locale);
    for (const currency of ["CNY", "USD", "JPY"]) {
      assert.equal(
        formatMoney(12.3, currency),
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
        }).format(12.3),
      );
    }
  }
  await i18n.changeLanguage("zh-CN");
});

test("profile renders while user is absent and before opening a home editor", () => {
  const user = renderToStaticMarkup(
    createElement(ProfileUserSettings, {
      currentUser: null,
      busy: false,
      updateAvatar: async () => {},
      activeI18n: i18n,
      changePassword: async () => {},
      passwordNotice: "",
    }),
  );
  assert.match(user, /用户信息/);
  assert.match(user, /autoComplete="current-password"/i);
  const homes = renderToStaticMarkup(
    createElement(ProfileHomeSettings, {
      homes: [],
      busy: false,
      setEditingHome: () => {},
      setHomeNotice: () => {},
      setup: { complete: true },
      updateHomeCurrency: async () => {},
      editingHome: null,
      setBusy: () => {},
      setHomes: () => {},
      setSetup: () => {},
      homeNotice: "",
    }),
  );
  assert.match(homes, /新增家庭/);
  assert.doesNotMatch(homes, /home-edit-form/);
});

test("transaction pagination preserves empty, first and final page boundaries", async () => {
  const { TransactionPagination } = await import("./TransactionPagination.js");
  const props = {
    total: 12,
    page: 1,
    pageSize: 10,
    pageCount: 2,
    onPage: () => {},
    onPageSize: () => {},
  };
  assert.equal(
    renderToStaticMarkup(
      createElement(TransactionPagination, { ...props, total: 0 }),
    ),
    "",
  );
  const first = renderToStaticMarkup(
    createElement(TransactionPagination, props),
  );
  assert.match(first, /1–10/);
  assert.match(first, /aria-label="上一页" disabled=""/);
  assert.doesNotMatch(first, /aria-label="下一页" disabled/);
  const last = renderToStaticMarkup(
    createElement(TransactionPagination, { ...props, page: 2 }),
  );
  assert.match(last, /11–12/);
  assert.match(last, /aria-label="下一页" disabled=""/);
});

test("purchase consumption fields offer all types and preserve linked item settings",async()=>{
  const {ConsumptionFields}=await import("./ConsumptionFields.js");
  const html=renderToStaticMarkup(createElement(ConsumptionFields,{consumptionType:"long_term_consumable",openedShelfLifeDays:14}));
  for(const type of ["consumable","non_consumable","long_term_consumable"])assert.match(html,new RegExp(`value="${type}"`));
  assert.match(html, /value="long_term_consumable" selected=""/);
  assert.match(html, /value="14"/);
  const linked=renderToStaticMarkup(createElement(ConsumptionFields,{consumptionType:"non_consumable",disabled:true}));
  assert.match(linked, /name="consumptionType" disabled=""/);
  assert.match(linked, /value="non_consumable" selected=""/);
});

test("non-long-term consumption fields are disabled and display a literal dash marker",async()=>{
  const {ConsumptionFields}=await import("./ConsumptionFields.js");
  for(const consumptionType of ["consumable","non_consumable"] as const){
    const html=renderToStaticMarkup(createElement(ConsumptionFields,{consumptionType,openedShelfLifeDays:30}));
    assert.match(html, /<input(?=[^>]*name="openedShelfLifeDays")(?=[^>]*disabled="")(?=[^>]*value="--")[^>]*>/);
    assert.doesNotMatch(html,/value="30"/);
  }
});

test("saved automatic purchase plans can be deleted while live suggestions cannot", async () => {
  const { ShoppingPage } = await import("./ShoppingPage.js");
  const noop = () => {};
  const props: Parameters<typeof ShoppingPage>[0] = {
    selectedShoppingDate:"",visibleShoppingItems:[],items:[],locations:[],shoppingChannelName:()=>"",financialSummary:null,
    setEditShoppingItem:noop,setEditShoppingItemId:noop,openShoppingReceipt:noop,openItemDetail:noop,load:async()=>{},setMobileAction:noop,
    shoppingChannels:[],addShoppingChannel:async()=>{},newChannelName:"",setNewChannelName:noop,deleteShoppingChannel:async()=>{},
    moveShoppingMonth:noop,setShoppingMonth:noop,setSelectedShoppingDate:noop,calendarYear:2026,calendarMonthNumber:10,
    calendarIncludeCompleted:false,updateCalendarIncludeCompleted:noop,calendarFinancial:null,calendarCells:[],calendarItems:[],
  };
  for (const [id, source, deletable] of [
    ["auto:item", "automatic", false],
    ["saved-automatic", "automatic", true],
    ["saved-manual", "manual", true],
  ] as const) {
    const html=renderToStaticMarkup(createElement(ShoppingPage,{...props,visibleShoppingItems:[{id,source,name:"采购物品",quantity:2,completed:0}]}));
    assert.equal(/class="danger-action"/.test(html),deletable);
  }
});
