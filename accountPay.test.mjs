import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAccountPayPool, isAccountLevelPay, reconcileAccountKpis, paymentRoomCents,
} from "./accountPay.mjs";

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

test("reconcileAccountKpis clears overdue when account is paid", () => {
  const k = reconcileAccountKpis({
    due: 0, paid: 100, credit: 0, overdueDue: 80, openCount: 2, oldest: 12, openingDue: 40,
  });
  assert.equal(k.overdueDue, 0);
  assert.equal(k.openCount, 0);
  assert.equal(k.oldest, 0);
  assert.equal(k.openingDue, 0);
});

test("reconcileAccountKpis caps overdue at remaining due", () => {
  const k = reconcileAccountKpis({
    due: 30, paid: 70, credit: 0, overdueDue: 90, openCount: 3, oldest: 5, openingDue: 50,
  });
  assert.equal(k.overdueDue, 30);
  assert.equal(k.openingDue, 30);
  assert.equal(k.openCount, 3);
});

test("paymentRoomCents never exceeds account due", () => {
  assert.equal(paymentRoomCents(5000, 8000), 5000);
  assert.equal(paymentRoomCents(5000, 2000), 2000);
  assert.equal(paymentRoomCents(5000, null), 5000);
});
