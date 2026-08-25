/* Customer settlement: reimbursements are credits against gross sales,
   not a separate cash payout. All money is integer cents. */

export const DEDUCTION_REIMBURSEMENT = "DEDUCTION_REIMBURSEMENT";

export function isDeductionReimbursement(e) {
  if (!e) return false;
  if (e.kind === DEDUCTION_REIMBURSEMENT || e.origin === "payment_reimbursement") return true;
  return e.type === "saleReimburse" && +(e.amount || 0) > 0;
}

export function deductionCents(e) {
  if (!isDeductionReimbursement(e)) return 0;
  return Math.max(0, Math.round((+(e.amount || e.deductions || 0)) * 100));
}

export function deductionMemo(e) {
  return String((e && (e.note || e.name || e.memo)) || "").trim();
}

/* Net obligation after credits, then cash collected.
   Gross − Deductions = Net sales   |   Net − Collected = Due */
export function settleAmounts({ grossC = 0, deductC = 0, paidC = 0 } = {}) {
  const g = Math.max(0, Math.round(grossC));
  const d = Math.max(0, Math.round(deductC));
  const p = Math.max(0, Math.round(paidC));
  const netC = Math.max(0, g - d);
  const dueC = Math.max(0, netC - p);
  const creditC = Math.max(0, p + d - g);
  return { grossC: g, deductC: d, paidC: p, netC, dueC, creditC };
}

