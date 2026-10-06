import assert from "node:assert/strict";
import { describe, it } from "node:test";

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);
function payFeedMoney(payments, grandTotal) {
  const paidC = (payments || []).reduce((sum, p) => sum + Math.max(0, toCents(p && p.amount)), 0);
  const grandC = Math.max(0, toCents(grandTotal));
  return { paidC, grandC, remainC: grandC - paidC, paidTotal: fromCents(paidC), remaining: fromCents(grandC - paidC) };
}

describe("payFeedMoney", () => {
  it("uses cent math for 50+50 against 100", () => {
    const m = payFeedMoney([{ amount: 50 }, { amount: 50 }], 100);
    assert.equal(m.paidC, 10000);
    assert.equal(m.remainC, 0);
    assert.equal(m.remaining, 0);
  });
  it("ignores float dust and negative amounts", () => {
    const m = payFeedMoney([{ amount: 33.333 }, { amount: -5 }, { amount: 0 }], 100);
    assert.equal(m.paidC, 3333);
    assert.equal(m.remainC, 10000 - 3333);
  });
  it("shows credit when payments exceed grand total", () => {
    const m = payFeedMoney([{ amount: 120 }], 100);
    assert.equal(m.remainC, -2000);
    assert.equal(fromCents(Math.abs(m.remainC)), 20);
  });
});
