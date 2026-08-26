import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEDUCTION_REIMBURSEMENT, isDeductionReimbursement, deductionCents,
  deductionMemo, settleAmounts, recordPaymentSplit, cashBoxFromPayment,
} from "./settlement.mjs";

describe("settlement deductions", () => {
  it("recognises payment and sale reimbursement records", () => {
    assert.equal(isDeductionReimbursement({ kind: DEDUCTION_REIMBURSEMENT, amount: 10 }), true);
    assert.equal(isDeductionReimbursement({ origin: "payment_reimbursement", amount: 5 }), true);
    assert.equal(isDeductionReimbursement({ type: "saleReimburse", amount: 2 }), true);
    assert.equal(isDeductionReimbursement({ type: "payment", amount: 20 }), false);
  });

  it("reads amount or deductions field in cents", () => {
    assert.equal(deductionCents({ origin: "payment_reimbursement", amount: 12.34 }), 1234);
    assert.equal(deductionCents({ kind: DEDUCTION_REIMBURSEMENT, deductions: 8 }), 800);
    assert.equal(deductionMemo({ note: "Fuel", name: "x" }), "Fuel");
  });

  it("credits deductions against gross so due clears without treating them as cash collected", () => {
    const s = settleAmounts({ grossC: 10000, deductC: 2000, paidC: 8000 });
    assert.equal(s.netC, 8000);
    assert.equal(s.dueC, 0);
    assert.equal(s.creditC, 0);
  });

  it("leaves leftover as customer credit when credits exceed gross", () => {
    const s = settleAmounts({ grossC: 5000, deductC: 2000, paidC: 4000 });
    assert.equal(s.netC, 3000);
    assert.equal(s.dueC, 0);
    assert.equal(s.creditC, 1000);
  });

  it("closes a $100 owing with $50 pocket expense and $50 cash taken", () => {
    const s = settleAmounts({ grossC: 10000, deductC: 5000, paidC: 5000 });
    assert.equal(s.netC, 5000);
    assert.equal(s.dueC, 0);
    assert.equal(s.paidC, 5000);
    assert.equal(s.deductC, 5000);
    assert.equal(s.creditC, 0);
  });
});

describe("record payment split", () => {
  it("does not net the expense deduction off the cash collected", () => {
    const p = recordPaymentSplit({ dueC: 10000, cashC: 5000, deductC: 5000 });
    assert.equal(p.cashC, 5000);
    assert.equal(p.deductC, 5000);
    assert.equal(p.appliedC, 10000);
    assert.equal(p.remainingC, 0);
    assert.equal(p.suggestedCashC, 5000);
  });

  it("suggests cash as owing minus deductions so the cashier only takes the remainder", () => {
    const p = recordPaymentSplit({ dueC: 10000, cashC: 10000, deductC: 5000 });
    assert.equal(p.suggestedCashC, 5000);
    assert.equal(p.remainingC, 0);
    assert.equal(p.creditC, 5000);
  });

  it("allows a deduction-only close with no cash taken", () => {
    const p = recordPaymentSplit({ dueC: 10000, cashC: 0, deductC: 10000 });
    assert.equal(p.cashC, 0);
    assert.equal(p.remainingC, 0);
    assert.equal(p.suggestedCashC, 0);
  });
});

describe("cash box from a payment reimbursement", () => {
  it("records cash in only — offsets do not move the drawer", () => {
    const box = cashBoxFromPayment({ cashC: 5000, deductC: 5000 });
    assert.equal(box.inC, 5000);
    assert.equal(box.outC, 0);
    assert.equal(box.netC, 5000);
    assert.equal(box.expenseC, 5000);
  });
});
