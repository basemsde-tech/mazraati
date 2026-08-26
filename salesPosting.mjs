/* Sales channels, payment schema, and atomic posting.
   Farm data is one JSON document; a "transaction" is a validated
   entry bundle written in a single commit. All money is integer cents. */

import { DEDUCTION_REIMBURSEMENT } from "./settlement.mjs";
export { DEDUCTION_REIMBURSEMENT };

export const OFFSET_CATEGORIES = [
  { key: "fuel", en: "Fuel", ar: "وقود" },
  { key: "labour", en: "Labor", ar: "عمال وأجور" },
  { key: "transport", en: "Transport", ar: "نقل" },
  { key: "packaging", en: "Packaging", ar: "تغليف" },
  { key: "repairs", en: "Maintenance", ar: "صيانة" },
  { key: "feed", en: "Inputs", ar: "مستلزمات / علف" },
  { key: "other", en: "Other", ar: "أخرى" },
];

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);

export function offsetCategoryLabel(key, lang = "en") {
  const row = OFFSET_CATEGORIES.find((x) => x.key === key);
  if (!row) return key || "";
  return lang === "ar" ? row.ar : row.en;
}

/* Normalize a payment row to the sales_payments shape. */
export function migratePaymentEntry(e) {
  if (!e || e.type !== "payment") return e;
  const cashC = toCents(e.amount_cash != null ? e.amount_cash : e.amount);
  const offsetC = toCents(e.amount_expense_offset != null ? e.amount_expense_offset : 0);
  const totalC = e.total_credited != null ? toCents(e.total_credited) : cashC + offsetC;
  return {
    ...e,
    amount: fromCents(cashC),
    amount_cash: fromCents(cashC),
    amount_expense_offset: fromCents(offsetC),
    total_credited: fromCents(totalC),
    currency: e.currency || "usd",
    saleId: e.saleId || null,
  };
}

export function migrateSalesEntries(entries) {
  const list = entries || [];
  const offsetByPay = {};
  list.forEach((e) => {
    if (e && e.origin === "payment_reimbursement" && e.paymentId) {
      offsetByPay[e.paymentId] = (offsetByPay[e.paymentId] || 0) + toCents(e.amount);
    }
  });
  return list.map((e) => {
    if (!e || e.type !== "payment") return e;
    if (e.amount_expense_offset == null && offsetByPay[e.id]) {
      return migratePaymentEntry({ ...e, amount_expense_offset: fromCents(offsetByPay[e.id]) });
    }
    return migratePaymentEntry(e);
  });
}

export function paymentCashCents(e) {
  if (!e || e.type !== "payment") return 0;
  if (e.amount_cash != null) return Math.max(0, toCents(e.amount_cash));
  return Math.max(0, toCents(e.amount));
}

export function paymentOffsetCents(e) {
  if (!e || e.type !== "payment") return 0;
  return Math.max(0, toCents(e.amount_expense_offset));
}

export function paymentCreditedCents(e) {
  if (!e || e.type !== "payment") return 0;
  if (e.total_credited != null) return Math.max(0, toCents(e.total_credited));
  return paymentCashCents(e) + paymentOffsetCents(e);
}

export function posChangeCents({ dueC = 0, tenderC = 0 } = {}) {
  const due = Math.max(0, Math.round(dueC));
  const tender = Math.max(0, Math.round(tenderC));
  const paidC = Math.min(due, tender);
  const changeC = Math.max(0, tender - due);
  return { dueC: due, tenderC: tender, paidC, changeC };
}

function cleanOffset(row) {
  const amountC = Math.max(0, toCents(row && row.amount));
  const category = String((row && row.category) || "other").trim() || "other";
  const known = OFFSET_CATEGORIES.some((x) => x.key === category);
  return {
    category: known ? category : "other",
    amountC,
    note: String((row && (row.note || row.name || row.description)) || "").trim(),
    receipt: (row && row.receipt) || "",
  };
}

/* Build the payment + expense entries as one atomic bundle.
   Cashbox is only touched when amount_cash > 0.
   Offsets become farm expenses linked to the payment id. */
export function buildAccountPayment({
  customerId, saleId = null, cashC = 0, offsets = [],
  method = "cash", currency = "usd", rateUsed = 0,
  at, note = "", vendor = "", idFn, groupOf, catFromName,
} = {}) {
  if (!customerId) return { ok: false, error: "needCustomer", entries: [] };
  const cash = Math.max(0, Math.round(cashC));
  const rows = (offsets || []).map(cleanOffset).filter((r) => r.amountC > 0);
  const deduct = rows.reduce((sum, r) => sum + r.amountC, 0);
  if (!(cash > 0) && !(deduct > 0)) return { ok: false, error: "needAmount", entries: [] };
  const missingNote = rows.find((r) => !r.note && !r.category);
  if (missingNote) return { ok: false, error: "reimburseNameNeeded", entries: [] };
  const unnamed = rows.find((r) => !r.note);
  if (unnamed) {
    unnamed.note = offsetCategoryLabel(unnamed.category);
  }
  const nid = typeof idFn === "function" ? idFn : () => `id-${Math.random().toString(36).slice(2, 9)}`;
  const payId = `pay-${nid()}`;
  const payment = {
    id: payId,
    type: "payment",
    customerId,
    saleId: saleId || null,
    amount: fromCents(cash),
    amount_cash: fromCents(cash),
    amount_expense_offset: fromCents(deduct),
    total_credited: fromCents(cash + deduct),
    method,
    currency,
    rateUsed,
    at,
    note: String(note || "").trim(),
    channel: "accounts",
  };
  const expenses = rows.map((r) => {
    const cat = (typeof catFromName === "function" ? catFromName(r.note) : null) || r.category || "other";
    const amt = fromCents(r.amountC);
    return {
      id: `exp-${nid()}`,
      type: "expense",
      category: cat,
      group: typeof groupOf === "function" ? groupOf(cat) : "otherGrp",
      amount: amt,
      paidAmount: amt,
      payStatus: "paid",
      customerId,
      paymentId: payId,
      vendor: vendor || "",
      note: r.note,
      name: r.note,
      memo: r.note,
      receipt: r.receipt || "",
      origin: "payment_reimbursement",
      kind: DEDUCTION_REIMBURSEMENT,
      deductions: amt,
      amount_expense_offset: amt,
      currency,
      rateUsed,
      at,
    };
  });
  return {
    ok: true,
    paymentId: payId,
    payment,
    expenses,
    entries: [payment, ...expenses],
    cashC: cash,
    deductC: deduct,
    creditedC: cash + deduct,
    touchesCashbox: cash > 0,
  };
}

export function isOneTimeSale(e) {
  if (!e) return false;
  if (e.oneTime === true) return true;
  return e.channel === "pos" && !e.customerId;
}

export function buildQuickSale({
  customerId, product, qty, price, amount, priceMode = "unit", unit,
  payNowC = 0, tenderC = 0, currency = "usd", rateUsed = 0,
  at, note = "", idFn, oneTime = false,
} = {}) {
  const onAccount = !oneTime && !!customerId;
  if (!onAccount && !oneTime) return { ok: false, error: "needCustomer", entries: [] };
  const amtC = Math.max(0, toCents(amount));
  if (!(amtC > 0) || !(qty > 0)) return { ok: false, error: "needAmount", entries: [] };
  const nid = typeof idFn === "function" ? idFn : () => `id-${Math.random().toString(36).slice(2, 9)}`;
  const saleId = `sale-${nid()}`;
  const paidC = Math.max(0, Math.min(amtC, Math.round(payNowC)));
  const tender = Math.max(paidC, Math.round(tenderC || 0));
  const changeC = Math.max(0, tender - amtC);
  if (oneTime && !(paidC > 0)) return { ok: false, error: "tenderShort", entries: [] };
  const sale = {
    id: saleId,
    type: "sale",
    product,
    qty,
    unit,
    price,
    amount: fromCents(amtC),
    priceMode,
    at,
    note: String(note || "").trim(),
    currency,
    rateUsed,
    channel: "pos",
  };
  if (onAccount) sale.customerId = customerId;
  else sale.oneTime = true;
  const entries = [sale];
  if (paidC > 0) {
    const pay = {
      id: `pay-${nid()}`,
      type: "payment",
      saleId,
      amount: fromCents(paidC),
      amount_cash: fromCents(paidC),
      amount_expense_offset: 0,
      total_credited: fromCents(paidC),
      method: "cash",
      currency,
      rateUsed,
      at,
      tenderAmount: fromCents(tender),
      changeAmount: fromCents(changeC),
      channel: "pos",
    };
    if (onAccount) pay.customerId = customerId;
    else pay.oneTime = true;
    entries.push(pay);
  }
  return {
    ok: true,
    saleId,
    entries,
    paidC,
    tenderC: tender,
    changeC,
    touchesCashbox: paidC > 0,
  };
}
