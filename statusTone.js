/* Semantic status tones for pills, table accents, and stacked cards.
   Keep this mapping in one place so lists, tables, and print views agree. */
export const STATUS_PILL_TOKENS = {
  success: {
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  warning: {
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  danger: {
    pill: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
  info: {
    pill: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  neutral: {
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
};

const SUCCESS = new Set([
  "paid", "active", "completed", "complete", "healthy", "lactating",
  "laying", "clear", "success", "ok", "in", "paidS",
]);
const WARNING = new Set([
  "pending", "due", "warning", "partial", "owing", "pregnant", "warn",
  "remainder", "duetoday",
]);
const DANGER = new Set([
  "overdue", "unpaid", "critical", "sick", "danger", "error", "out",
  "outstanding",
]);
const INFO = new Set([
  "progress", "inprogress", "in-progress", "info", "served", "growing",
  "am", "pm", "day",
]);
const NEUTRAL = new Set([
  "draft", "inactive", "neutral", "dry", "stopped", "all", "idle",
]);

export function statusToneOf(kind) {
  const k = String(kind || "").toLowerCase().replace(/[\s_]+/g, "");
  if (SUCCESS.has(k)) return "success";
  if (WARNING.has(k)) return "warning";
  if (DANGER.has(k)) return "danger";
  if (INFO.has(k)) return "info";
  if (NEUTRAL.has(k)) return "neutral";
  return "neutral";
}

export function statusRowClass(kind) {
  return `status-row border-l-4 status-row--${statusToneOf(kind)}`;
}

export function payStatusKind(row) {
  if (!row) return "unpaid";
  if (row.overdue && row.status !== "paid") return "overdue";
  if (row.due > 0 && (row.lateDays || 0) > 30) return "overdue";
  return row.status || "unpaid";
}
