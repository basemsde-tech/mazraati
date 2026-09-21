/* Owner capital in the cash box: injections raise an independent fund balance;
   disbursements tagged fundedBy:"owner" spend that balance and post as farm expenses.
   Withdrawals return capital to a named person without posting a farm expense. */

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);

export const OWNER_FUND_TYPE = "ownerFund";
export const OWNER_FUND_WITHDRAW_TYPE = "ownerFundWithdraw";
export const OWNER_FUNDED_BY = "owner";

export function isOwnerInjection(e) {
  return !!(e && e.type === OWNER_FUND_TYPE && toCents(e.amount) > 0);
}

export function isOwnerWithdraw(e) {
  return !!(e && e.type === OWNER_FUND_WITHDRAW_TYPE && toCents(e.amount) > 0);
}

export function isOwnerFundedExpense(e) {
  if (!e || e.type !== "expense") return false;
  return e.fundedBy === OWNER_FUNDED_BY || e.origin === "owner_fund";
}

/* Cash that left the drawer from an owner-funded expense (paid portion only). */
export function ownerSpendCents(e) {
  if (!isOwnerFundedExpense(e)) return 0;
  if (e.supplierId) return 0;
  const st = e.payStatus || "paid";
  if (st === "unpaid") return 0;
  const billC = Math.max(0, toCents(e.amount));
  if (st === "partial") return Math.min(billC, Math.max(0, toCents(e.paidAmount)));
  return billC;
}

export function ownerWithdrawCents(e) {
  if (!isOwnerWithdraw(e)) return 0;
  return Math.max(0, toCents(e.amount));
}

/** Sanitize allocation lines; amounts clamped to ≥0 and rounded to cents. */
export function normalizeAllocations(list = [], maxAmount = Infinity) {
  const maxC = Number.isFinite(+maxAmount) ? Math.max(0, toCents(maxAmount)) : Infinity;
  let usedC = 0;
  const out = [];
  (Array.isArray(list) ? list : []).forEach((row) => {
    const label = String(row?.label || row?.purpose || "").trim();
    let amtC = Math.max(0, toCents(row?.amount));
    if (!label || !(amtC > 0)) return;
    if (Number.isFinite(maxC)) {
      const room = Math.max(0, maxC - usedC);
      amtC = Math.min(amtC, room);
    }
    if (!(amtC > 0)) return;
    usedC += amtC;
    out.push({ label, amount: fromCents(amtC) });
  });
  return out;
}

export function allocationTotal(list) {
  return fromCents((normalizeAllocations(list)).reduce((s, a) => s + toCents(a.amount), 0));
}

/** Short human summary: "cows $6,000 · feed $4,000". */
export function formatAllocations(list, moneyFmt) {
  const rows = normalizeAllocations(list);
  if (!rows.length) return "";
  const fmt = typeof moneyFmt === "function" ? moneyFmt : (n) => String(n);
  return rows.map((a) => `${a.label} ${fmt(a.amount)}`).join(" · ");
}

export function contributorOf(e) {
  if (!e) return "";
  return String(e.contributorLabel || e.recipientLabel || "").trim();
}

export function buildOwnerFund(entries) {
  const rows = (entries || [])
    .filter((e) => isOwnerInjection(e) || ownerSpendCents(e) > 0 || ownerWithdrawCents(e) > 0)
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.at) || 0;
      const tb = Date.parse(b.at) || 0;
      if (ta !== tb) return ta - tb;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  let balC = 0;
  let injectedC = 0;
  let spentC = 0;
  let withdrawnC = 0;
  const ledger = rows.map((e) => {
    if (isOwnerInjection(e)) {
      const amtC = toCents(e.amount);
      balC += amtC;
      injectedC += amtC;
      return {
        id: e.id, at: e.at, dir: "in", amount: fromCents(amtC),
        balance: fromCents(balC),
        note: e.note || "",
        contributor: contributorOf(e),
        purpose: e.purpose || "",
        subAccount: e.subAccount || "",
        allocations: normalizeAllocations(e.allocations, e.amount),
        source: e,
      };
    }
    if (isOwnerWithdraw(e)) {
      const amtC = ownerWithdrawCents(e);
      balC -= amtC;
      withdrawnC += amtC;
      spentC += amtC;
      return {
        id: e.id, at: e.at, dir: "out", kind: "withdraw", amount: fromCents(amtC),
        balance: fromCents(balC),
        note: e.note || "",
        contributor: contributorOf(e),
        purpose: e.purpose || "",
        subAccount: e.subAccount || "",
        allocations: [],
        source: e,
      };
    }
    const amtC = ownerSpendCents(e);
    balC -= amtC;
    spentC += amtC;
    return {
      id: e.id, at: e.at, dir: "out", kind: "spend", amount: fromCents(amtC),
      balance: fromCents(balC),
      note: e.note || e.vendor || "",
      contributor: contributorOf(e),
      purpose: e.purpose || e.spendPurpose || "",
      subAccount: e.ownerFundSubAccount || e.subAccount || "",
      allocations: [],
      source: e,
    };
  });
  return {
    injected: fromCents(injectedC),
    spent: fromCents(spentC),
    withdrawn: fromCents(withdrawnC),
    balance: fromCents(balC),
    rows: ledger,
  };
}
