import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEDUCTION_REIMBURSEMENT, isDeductionReimbursement, deductionCents,
  deductionMemo, settleAmounts,
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
});
