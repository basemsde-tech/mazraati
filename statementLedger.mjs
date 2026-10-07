/* Statement of Account: date-filtered opening/period/closing math.
   Pure helpers — UI keeps an editable draft and never mutates source ledgers. */

export function stmtDay(iso) {
  if (!iso) return "";
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function stmtInRange(day, from, to) {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Recompute running balance: opening + charge − credit per row (ASC). */
export function stmtWithRunning(rows, openingC = 0) {
  let run = Math.round(openingC) || 0;
  return (rows || []).map((r) => {
    const charge = Math.round(r.chargeC || 0);
    const credit = Math.round(r.creditC || 0);
    run += charge - credit;
    return { ...r, chargeC: charge, creditC: credit, balanceC: run };
  });
}

export function stmtTotals(rows, openingC = 0) {
  const open = Math.round(openingC) || 0;
  let charges = 0;
  let credits = 0;
  (rows || []).forEach((r) => {
    charges += Math.round(r.chargeC || 0);
    credits += Math.round(r.creditC || 0);
  });
  return {
    openingC: open,
    chargesC: charges,
    creditsC: credits,
    closingC: open + charges - credits,
  };
}

/**
 * Split raw lines into opening (before from) vs period (from..to).
 * Optional selectedIds: only those sourceIds appear in the period (opening still uses all prior).
 */
export function stmtPartition(rawLines, { from = "", to = "", selectedIds = null } = {}) {
  const sel = selectedIds && selectedIds.length ? new Set(selectedIds) : null;
  let openingC = 0;
  const period = [];
  (rawLines || []).forEach((r) => {
    const day = r.day || stmtDay(r.at);
    const charge = Math.round(r.chargeC || 0);
    const credit = Math.round(r.creditC || 0);
    if (from && day && day < from) {
      openingC += charge - credit;
      return;
    }
    if (!stmtInRange(day, from || "", to || "")) return;
    if (sel && r.sourceId && !sel.has(r.sourceId) && !sel.has(r.id)) return;
    if (sel && !r.sourceId && !sel.has(r.id)) return;
    period.push({ ...r, day });
  });
  period.sort((a, b) => String(a.at || a.day).localeCompare(String(b.at || b.day))
    || String(a.id || "").localeCompare(String(b.id || "")));
  return { openingC, period };
}

export function stmtBuildDraft(rawLines, opts = {}) {
  const { openingC, period } = stmtPartition(rawLines, opts);
  const rows = stmtWithRunning(period, openingC);
  const totals = stmtTotals(rows, openingC);
  return {
    from: opts.from || "",
    to: opts.to || "",
    openingC,
    rows,
    totals,
  };
}

/** Customer ledger → flat charge/credit lines (cents). */
export function customerStatementRawLines({ ledger, customerId, labelSale, labelPay, labelReimb, labelDiscount }) {
  const list = (ledger && ledger.list) || [];
  const pays = (ledger && ledger.pays) || [];
  const deducts = (ledger && ledger.paymentDeductions) || [];
  const out = [];
  list.filter((x) => x.customerId === customerId).forEach((x) => {
    const chargeC = Math.round((+(x.grossAmount) || 0) * 100);
    out.push({
      id: `sale:${x.id}`,
      sourceId: x.id,
      kind: "sale",
      at: x.at,
      day: stmtDay(x.at),
      ref: x.no || "",
      desc: typeof labelSale === "function" ? labelSale(x) : (x.no || "Sale"),
      chargeC,
      creditC: 0,
    });
    (x.reimbRows || []).forEach((r, i) => {
      /* accountAlloc rows are synthetic invoice displays of payment offsets —
         paymentDeductions already credits those once. Skip to avoid double-count. */
      if (r && r.accountAlloc) return;
      const c = Math.round((+(r.amount) || 0) * 100);
      if (!(c > 0)) return;
      out.push({
        id: `reimb:${x.id}:${r.id || i}`,
        sourceId: x.id,
        kind: "reimb",
        at: r.at || x.at,
        day: stmtDay(r.at || x.at),
        ref: x.no || "",
        desc: typeof labelReimb === "function" ? labelReimb(r, x) : "Reimbursement",
        chargeC: 0,
        creditC: c,
      });
    });
    const discC = Math.round((+(x.discountAmount) || 0) * 100);
    if (discC > 0) {
      out.push({
        id: `disc:${x.id}`,
        sourceId: x.id,
        kind: "discount",
        at: x.at,
        day: stmtDay(x.at),
        ref: x.no || "",
        desc: typeof labelDiscount === "function" ? labelDiscount(x) : "Discount",
        chargeC: 0,
        creditC: discC,
      });
    }
  });
  deducts.filter((e) => e.customerId === customerId).forEach((e) => {
    const c = Math.round((+(e.amount) || 0) * 100);
    if (!(c > 0)) return;
    out.push({
      id: `pd:${e.id}`,
      sourceId: e.id,
      kind: "reimb",
      at: e.at,
      day: stmtDay(e.at),
      ref: "",
      desc: typeof labelReimb === "function" ? labelReimb(e, null) : (e.note || e.name || "Reimbursement"),
      chargeC: 0,
      creditC: c,
    });
  });
  pays.filter((p) => p.customerId === customerId && Math.round((+(p.amount) || 0) * 100) > 0).forEach((p) => {
    const c = Math.round((+(p.amount) || 0) * 100);
    out.push({
      id: `pay:${p.id}`,
      sourceId: p.id,
      kind: "payment",
      at: p.at,
      day: stmtDay(p.at),
      ref: "",
      desc: typeof labelPay === "function" ? labelPay(p) : "Payment",
      chargeC: 0,
      creditC: c,
    });
  });
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id));
}

/** Supplier ledger → flat charge/credit lines (cents). */
export function supplierStatementRawLines({ supplierLedger, supplierId, labelBill, labelPay }) {
  const sl = supplierLedger || { list: [], pays: [], allPays: [] };
  const out = [];
  (sl.list || []).filter((x) => x.supplierId === supplierId).forEach((x) => {
    const chargeC = Math.round((+(x.amount) || 0) * 100);
    out.push({
      id: `bill:${x.id}`,
      sourceId: x.id,
      kind: "bill",
      at: x.at,
      day: stmtDay(x.at),
      ref: x.no || (x.opening ? "OPEN" : ""),
      desc: typeof labelBill === "function" ? labelBill(x) : (x.no || "Bill"),
      chargeC,
      creditC: 0,
    });
  });
  const pays = sl.allPays || sl.pays || [];
  pays.filter((p) => p.supplierId === supplierId).forEach((p) => {
    const c = Math.round((+(p.amount) || 0) * 100);
    if (!(c > 0)) return;
    out.push({
      id: `spay:${p.id}`,
      sourceId: p.id,
      kind: "payment",
      at: p.at,
      day: stmtDay(p.at),
      ref: "",
      desc: typeof labelPay === "function" ? labelPay(p) : "Payment",
      chargeC: 0,
      creditC: c,
    });
  });
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id));
}

export function stmtPresetBounds(key, today = "") {
  const now = today || new Date().toISOString().slice(0, 10);
  const d = new Date(`${now}T12:00:00`);
  if (key === "all" || key === "allTime") return { from: "", to: "" };
  if (key === "month" || key === "thisMonth") {
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: now };
  }
  if (key === "last30" || key === "30") {
    const a = new Date(d);
    a.setDate(a.getDate() - 29);
    const from = a.toISOString().slice(0, 10);
    return { from, to: now };
  }
  return { from: "", to: now };
}
