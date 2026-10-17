import { pinyin } from "pinyin-pro";

export function matchesSearch(text: string, query: string): boolean {
  const term = query.trim().toLowerCase();
  const normalized = text.toLowerCase();
  return normalized.includes(term) || pinyin(normalized, {
    toneType: "none",
    type: "array",
  }).join("").includes(term);
}
