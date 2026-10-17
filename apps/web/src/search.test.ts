import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesSearch } from "./search.js";

test("search preserves literal matching and adds pinyin substrings", () => {
  for (const text of ["dadada", "XX大麦茶"]) {
    assert.equal(matchesSearch(text, "da"), true);
    assert.equal(matchesSearch(text, " DA "), true);
  }
  assert.equal(matchesSearch("XX大麦茶", "damaicha"), true);
  assert.equal(matchesSearch("XX大麦茶", "maicha"), true);
  assert.equal(matchesSearch("XX大麦茶", "大麦"), true);
  assert.equal(matchesSearch("XX大麦茶", "coffee"), false);
  assert.equal(matchesSearch("XX大麦茶", "  "), true);
  assert.equal(matchesSearch("", "da"), false);
});

test("search matches category and SKU in the existing searchable text", () => {
  assert.equal(matchesSearch("茶包 饮料 ABC-123", "yinliao"), true);
  assert.equal(matchesSearch("茶包 饮料 ABC-123", "abc-123"), true);
});
