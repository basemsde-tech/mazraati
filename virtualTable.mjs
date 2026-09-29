/* Period grouping + virtual window math for heavy ledgers.
   Pure helpers — UI owns open-state and rendering. */

/** YYYY-MM from an ISO / day / Date-like value. */
export function periodKeyOf(iso) {
  if (!iso && iso !== 0) return "unknown";
  const s = String(iso);
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = iso instanceof Date ? iso : new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (!Number.isFinite(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Group items into month buckets (newest first).
 * @param {any[]} items
 * @param {(item:any)=>any} getAt
 */
export function groupByPeriod(items, getAt) {
  const map = new Map();
  (items || []).forEach((item, index) => {
    const key = periodKeyOf(typeof getAt === "function" ? getAt(item) : item?.at);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ item, index });
  });
  const keys = [...map.keys()].sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return b.localeCompare(a);
  });
  return keys.map((key) => ({
    key,
    items: map.get(key).map((x) => x.item),
    indices: map.get(key).map((x) => x.index),
    count: map.get(key).length,
  }));
}

/** Newest `recentOpen` period keys should start expanded. */
export function defaultOpenPeriodKeys(groups, recentOpen = 2) {
  const n = Math.max(0, Math.round(recentOpen) || 0);
  return new Set((groups || []).slice(0, n).map((g) => g.key));
}

/**
 * Flatten groups into a display list of {type:'group'|'row', ...}.
 * Closed groups contribute only the header row.
 */
export function flattenPeriodRows(groups, openKeys) {
  const open = openKeys instanceof Set ? openKeys : new Set(openKeys || []);
  const out = [];
  (groups || []).forEach((g) => {
    const isOpen = open.has(g.key);
    out.push({
      type: "group",
      key: g.key,
      count: g.count,
      open: isOpen,
      id: `g:${g.key}`,
    });
    if (isOpen) {
      (g.items || []).forEach((item, i) => {
        out.push({
          type: "row",
          key: g.key,
          item,
          id: item && (item.id != null) ? String(item.id) : `${g.key}:${i}`,
        });
      });
    }
  });
  return out;
}

/**
 * Compute a virtual window over a fixed-height row list.
 * Returns padTop/padBottom so the scroll height stays correct.
 */
export function virtualWindow({
  scrollTop = 0,
  viewportH = 400,
  rowCount = 0,
  rowHeight = 52,
  overscan = 8,
} = {}) {
  const h = Math.max(1, Math.round(rowHeight) || 52);
  const n = Math.max(0, Math.round(rowCount) || 0);
  const view = Math.max(1, Math.round(viewportH) || 400);
  const over = Math.max(0, Math.round(overscan) || 0);
  if (n === 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0, totalH: 0 };
  }
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / h) - over);
  const visible = Math.ceil(view / h) + over * 2;
  const end = Math.min(n, start + visible);
  return {
    start,
    end,
    padTop: start * h,
    padBottom: Math.max(0, (n - end) * h),
    totalH: n * h,
  };
}

/** Skip virtualization for small lists — still group, but render everything. */
export function shouldVirtualize(count, threshold = 48) {
  return (count || 0) >= threshold;
}
