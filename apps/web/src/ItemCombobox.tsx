import { useEffect, useMemo, useState } from "react";
import i18n from "./i18n/index.js";
const t = i18n.t.bind(i18n);
import { Search, X } from "lucide-react";
import { categoryLabel } from "./systemLabels.js";
import { matchesSearch } from "./search.js";

type ItemOption = { id: string; name: string; category: string; sku: string };

export function ItemCombobox({
  items,
  value,
  onChange,
}: {
  items: ItemOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = items.find((item) => item.id === value);
  const [query, setQuery] = useState(selected?.name ?? ""),
    [open, setOpen] = useState(false);
  useEffect(
    () => setQuery(selected?.name ?? ""),
    [selected?.id, selected?.name],
  );
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("zh-CN");
    if (!term || selected?.name === query) return [];
    return items
      .filter((item) =>
        matchesSearch(`${item.name} ${item.category} ${item.sku}`, term),
      )
      .slice(0, 8);
  }, [items, query, selected?.name]);
  return (
    <label className="item-combobox-label">
      {t("关联物资（可选）")}
      <div className="item-combobox">
        <Search size={15} />
        <input
          value={query}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-autocomplete="list"
          placeholder={t("搜索名称、分类或 SKU")}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value) onChange("");
            setOpen(true);
          }}
        />
        <input
          className="item-combobox-value"
          type="hidden"
          name="itemId"
          value={value}
        />
        {(query || value) && (
          <button
            type="button"
            aria-label={t("清除关联物资")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              onChange("");
              setOpen(false);
            }}
          >
            <X size={14} />
          </button>
        )}
        {open && query && selected?.name !== query && (
          <div className="item-combobox-results" role="listbox">
            {matches.length ? (
              matches.map((item) => (
                <button
                  type="button"
                  role="option"
                  key={item.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(item.id);
                    setQuery(item.name);
                    setOpen(false);
                  }}
                >
                  <strong>{item.name}</strong>
                  <small>
                    {categoryLabel(item.category)} · {item.sku}
                  </small>
                </button>
              ))
            ) : (
              <p>{t("没有匹配物资")}</p>
            )}
          </div>
        )}
      </div>
    </label>
  );
}
