import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAccountPayPool, isAccountLevelPay } from "./accountPay.mjs";

test("one payment reduces account due without inventing bill splits", () => {
  const next = applyAccountPayPool({ due: 100, paid: 0, credit: 0 }, 4000); /* $40 */
  assert.equal(next.due, 60);
  assert.equal(next.paid, 40);
  assert.equal(next.credit, 0);
});

test("overpay becomes account credit, still one amount", () => {
  const next = applyAccountPayPool({ due: 25, paid: 75, credit: 0 }, 4000); /* $40 */
  assert.equal(next.due, 0);
  assert.equal(next.paid, 100);
  assert.equal(next.credit, 15);
});

test("isAccountLevelPay", () => {
  assert.equal(isAccountLevelPay({ amount: 10 }), true);
  assert.equal(isAccountLevelPay({ saleId: "s1" }), false);
  assert.equal(isAccountLevelPay({ expenseId: "b1" }), false);
});
