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

/* Record Payment: cash collected is independent of expense deductions.
   Example: owing 100, pocket farm expense 50, take 50 cash → due 0.
   Cash is stored as the payment; deductions post as farm expenses / cash-out. */
export function recordPaymentSplit({ dueC = 0, cashC = 0, deductC = 0 } = {}) {
  const due = Math.max(0, Math.round(dueC));
  const cash = Math.max(0, Math.round(cashC));
  const deduct = Math.max(0, Math.round(deductC));
  const settled = settleAmounts({ grossC: due, deductC: deduct, paidC: cash });
  return {
    dueC: due,
    cashC: cash,
    deductC: deduct,
    suggestedCashC: Math.max(0, due - deduct),
    appliedC: cash + deduct,
    remainingC: settled.dueC,
    creditC: settled.creditC,
    netC: settled.netC,
  };
}

/* Gross cash-box view of a payment with expense deductions:
   receipt is cash + deductions, the deduction is a cash-out expense,
   so drawer net equals cash actually taken. */
export function cashBoxFromPayment({ cashC = 0, deductC = 0 } = {}) {
  const cash = Math.max(0, Math.round(cashC));
  const deduct = Math.max(0, Math.round(deductC));
  const inC = cash + deduct;
  const outC = deduct;
  return { inC, outC, netC: inC - outC };
}
