import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocationMinimum } from "./LocationMinimums.js";

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: () => "zh-CN", setItem: () => {} },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { documentElement: { lang: "" } },
});
const { LocationMinimumRows, LocationMinimums } = await import("./LocationMinimums.js");
const { default: i18n } = await import("./i18n/index.js");

const tea: LocationMinimum = {
  itemId: "tea", itemName: "乌龙茶", baseUnit: "瓶", locationId: "living",
  locationName: "客厅", minimumQuantity: 4, quantity: 0, shortage: 4, availableElsewhere: 7,
};
function render(rows: LocationMinimum[], busy = false) {
  return renderToStaticMarkup(createElement(LocationMinimumRows, {
    rows, busy, onEdit: () => {}, onRemove: () => {}, onTransfer: () => {},
  }));
}

test("an empty configured location still displays its shortage and other-location stock", () => {
  const html = render([tea]);
  assert.match(html, /客厅/);
  assert.match(html, /0 瓶/);
  assert.match(html, /本位置缺少 4 瓶/);
  assert.match(html, /其他位置共 7 瓶/);
  assert.match(html, />移动库存<\/button>/);
  assert.doesNotMatch(html, /采购|购买/);
});

test("location shortages without other stock do not offer a stock move", () => {
  const html = render([{ ...tea, availableElsewhere: 0 }]);
  assert.match(html, /本位置缺少 4 瓶/);
  assert.doesNotMatch(html, />移动库存<\/button>/);
});

test("a satisfied location shows no transfer prompt and mutation controls disable while saving", () => {
  const satisfied = render([{ ...tea, quantity: 4, shortage: 0 }]);
  assert.match(satisfied, /充足/);
  assert.doesNotMatch(satisfied, /本位置缺少|>移动库存<\/button>/);
  const busy = render([tea], true);
  assert.equal((busy.match(/disabled=""/g) ?? []).length, 3);
});

test("English settings and reminder actions use translated labels", async () => {
  await i18n.changeLanguage("en-US");
  try {
    const form = renderToStaticMarkup(createElement(LocationMinimums, {
      homeId: "home", items: [], locations: [], stock: [], onTransfer: () => {},
    }));
    assert.match(form, /Location transfer reminders/);
    assert.match(form, /Choose…/);
    assert.match(form, />Save<\/button>/);
    assert.match(form, /Loading…/);
    assert.match(render([tea]), />Remove<\/button>/);
  } finally {
    await i18n.changeLanguage("zh-CN");
  }
});
