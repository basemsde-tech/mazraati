/* Owner capital in the cash box: injections raise an independent fund balance;
   disbursements tagged fundedBy:"owner" spend that balance and post as farm expenses. */

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);

export const OWNER_FUND_TYPE = "ownerFund";
export const OWNER_FUNDED_BY = "owner";

export function isOwnerInjection(e) {
  return !!(e && e.type === OWNER_FUND_TYPE && toCents(e.amount) > 0);
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

export function buildOwnerFund(entries) {
  const rows = (entries || [])
    .filter((e) => isOwnerInjection(e) || ownerSpendCents(e) > 0)
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
  const ledger = rows.map((e) => {
    if (isOwnerInjection(e)) {
      const amtC = toCents(e.amount);
      balC += amtC;
      injectedC += amtC;
      return {
        id: e.id, at: e.at, dir: "in", amount: fromCents(amtC),
        balance: fromCents(balC), note: e.note || "", source: e,
      };
    }
    const amtC = ownerSpendCents(e);
    balC -= amtC;
    spentC += amtC;
    return {
      id: e.id, at: e.at, dir: "out", amount: fromCents(amtC),
      balance: fromCents(balC), note: e.note || e.vendor || "", source: e,
    };
  });
  return {
    injected: fromCents(injectedC),
    spent: fromCents(spentC),
    balance: fromCents(balC),
    rows: ledger,
  };
}
