import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  groupByPeriod, defaultOpenPeriodKeys, flattenPeriodRows,
  virtualWindow, shouldVirtualize,
} from "./virtualTable.mjs";

const DEFAULT_MAX_H = "min(56vh, 520px)";
const ROW_H = 52;
const CARD_H = 92;
const GROUP_H = 40;

export function periodLabelOf(key, lang, months) {
  if (!key || key === "unknown") return lang === "ar" ? "بدون تاريخ" : "No date";
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const name = months && months[lang] && months[lang][m - 1]
    ? months[lang][m - 1]
    : key;
  return `${name} ${y}`;
}

/** Fixed-height scroll host — sticky thead sticks to this box. */
export function TableScroll({ maxHeight = DEFAULT_MAX_H, className = "", children, style }) {
  return (
    <div className={`table-scroll ${className}`.trim()} style={{ maxHeight, ...style }}>
      {children}
    </div>
  );
}

function useScrollWindow(rowCount, rowHeight, enabled) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => setViewportH(el.clientHeight || 400))
      : null;
    el.addEventListener("scroll", onScroll, { passive: true });
    if (ro) ro.observe(el);
    setViewportH(el.clientHeight || 400);
    setScrollTop(el.scrollTop || 0);
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (ro) ro.disconnect();
    };
  }, [enabled, rowCount, rowHeight]);

  const win = useMemo(
    () => (enabled
      ? virtualWindow({ scrollTop, viewportH, rowCount, rowHeight, overscan: 8 })
      : { start: 0, end: rowCount, padTop: 0, padBottom: 0, totalH: rowCount * rowHeight }),
    [enabled, scrollTop, viewportH, rowCount, rowHeight],
  );

  return { ref, win };
}

function LegacyScrollDataList({ cards, table, empty, maxHeight = DEFAULT_MAX_H }) {
  if (empty) return empty;
  return (
    <div className="data-display">
      <div className="data-display-cards grid grid-cols-1 gap-4">{cards}</div>
      <div className="data-display-table">
        <TableScroll maxHeight={maxHeight}>{table}</TableScroll>
      </div>
    </div>
  );
}

function HeavyDataListInner({
  items,
  getAt,
  recentOpen = 2,
  maxHeight = DEFAULT_MAX_H,
  rowHeight = ROW_H,
  cardHeight = CARD_H,
  groupHeight = GROUP_H,
  head,
  foot,
  colgroup,
  leadRows,
  renderRow,
  renderCard,
  colCount = 6,
  tableClassName = "",
  tableStyle,
  tableMinWidth,
  lang = "en",
  months,
  t,
  virtualThreshold = 48,
  ungrouped = false,
}) {
  const list = items || [];
  const atFn = getAt || ((x) => x && x.at);
  const groups = useMemo(
    () => (ungrouped ? null : groupByPeriod(list, atFn)),
    [list, atFn, ungrouped],
  );
  const groupsSig = groups ? groups.map((g) => `${g.key}:${g.count}`).join("|") : `flat:${list.length}`;
  const [openKeys, setOpenKeys] = useState(() => (groups ? defaultOpenPeriodKeys(groups, recentOpen) : new Set()));

  useEffect(() => {
    if (!groups) return;
    setOpenKeys((prev) => {
      const defaults = defaultOpenPeriodKeys(groups, recentOpen);
      const next = new Set();
      groups.forEach((g) => {
        if (prev.has(g.key) || defaults.has(g.key)) next.add(g.key);
      });
      return next;
    });
  }, [groupsSig, recentOpen, groups]);

  const toggle = useCallback((key) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const flat = useMemo(() => {
    if (ungrouped || !groups) {
      return list.map((item, i) => ({
        type: "row",
        item,
        id: item && item.id != null ? String(item.id) : `row:${i}`,
      }));
    }
    return flattenPeriodRows(groups, openKeys);
  }, [ungrouped, groups, openKeys, list]);

  const virt = shouldVirtualize(flat.length, virtualThreshold);
  const avgH = useMemo(() => {
    if (!flat.length) return rowHeight;
    let sum = 0;
    flat.forEach((e) => { sum += e.type === "group" ? groupHeight : rowHeight; });
    return Math.max(36, Math.round(sum / flat.length));
  }, [flat, rowHeight, groupHeight]);

  const { ref: tableRef, win: tableWin } = useScrollWindow(flat.length, avgH, virt);
  const { ref: cardRef, win: cardWin } = useScrollWindow(flat.length, cardHeight, virt);

  const groupTitle = (key, count) => {
    const base = periodLabelOf(key, lang, months);
    const rec = t ? t("periodRecords") : (lang === "ar" ? "سجل" : "records");
    return `${base} · ${count} ${rec}`;
  };

  const tableSlice = virt ? flat.slice(tableWin.start, tableWin.end) : flat;
  const cardSlice = virt ? flat.slice(cardWin.start, cardWin.end) : flat;

  return (
    <div className="data-display heavy-data">
      <div className="data-display-cards grid grid-cols-1 gap-3">
        <div ref={cardRef} className="table-scroll cards-scroll" style={{ maxHeight }}>
          {virt && cardWin.padTop > 0 ? <div style={{ height: cardWin.padTop }} aria-hidden="true" /> : null}
          {cardSlice.map((entry) => {
            if (entry.type === "group") {
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`period-group-card${entry.open ? " open" : ""}`}
                  onClick={() => toggle(entry.key)}
                >
                  <span aria-hidden="true">{entry.open ? "▾" : "▸"}</span>
                  <span>{groupTitle(entry.key, entry.count)}</span>
                </button>
              );
            }
            return (
              <div key={entry.id} className="heavy-card-slot">
                {renderCard(entry.item)}
              </div>
            );
          })}
          {virt && cardWin.padBottom > 0 ? <div style={{ height: cardWin.padBottom }} aria-hidden="true" /> : null}
        </div>
      </div>

      <div className="data-display-table">
        <div ref={tableRef} className="table-scroll" style={{ maxHeight }}>
          <table
            className={`heavy-table ${tableClassName}`.trim()}
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: tableMinWidth,
              ...tableStyle,
            }}
          >
            {colgroup}
            {head ? <thead>{head}</thead> : null}
            <tbody>
              {leadRows}
              {virt && tableWin.padTop > 0 ? (
                <tr className="virt-pad" aria-hidden="true">
                  <td colSpan={colCount} style={{ height: tableWin.padTop, padding: 0, border: "none" }} />
                </tr>
              ) : null}
              {tableSlice.map((entry) => {
                if (entry.type === "group") {
                  return (
                    <tr key={entry.id} className={`period-group-row${entry.open ? " open" : ""}`}>
                      <td colSpan={colCount}>
                        <button type="button" className="period-group-btn" onClick={() => toggle(entry.key)}>
                          <span aria-hidden="true">{entry.open ? "▾" : "▸"}</span>
                          <span>{groupTitle(entry.key, entry.count)}</span>
                        </button>
                      </td>
                    </tr>
                  );
                }
                return renderRow(entry.item);
              })}
              {virt && tableWin.padBottom > 0 ? (
                <tr className="virt-pad" aria-hidden="true">
                  <td colSpan={colCount} style={{ height: tableWin.padBottom, padding: 0, border: "none" }} />
                </tr>
              ) : null}
            </tbody>
            {foot ? <tfoot>{foot}</tfoot> : null}
          </table>
        </div>
      </div>
    </div>
  );
}

export function HeavyDataList(props) {
  if (props.empty) return props.empty;
  if (!props.items) {
    return <LegacyScrollDataList cards={props.cards} table={props.table} empty={null} maxHeight={props.maxHeight} />;
  }
  return <HeavyDataListInner {...props} />;
}

/** Drop-in DataList: sticky scroll host always; virtualized when `items` is passed. */
export function DataList(props) {
  return <HeavyDataList {...props} />;
}

export {
  groupByPeriod, defaultOpenPeriodKeys, flattenPeriodRows,
  virtualWindow, shouldVirtualize, periodKeyOf,
} from "./virtualTable.mjs";
