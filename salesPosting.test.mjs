import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OFFSET_CATEGORIES, migratePaymentEntry, migrateSalesEntries, paymentCashCents,
  paymentOffsetCents, paymentCreditedCents, posChangeCents, buildAccountPayment,
  buildQuickSale,
} from "./salesPosting.mjs";
import { settleAmounts, recordPaymentSplit, cashBoxFromPayment } from "./settlement.mjs";

describe("account payment posting", () => {
  it("credits cash plus expense offset as one settlement", () => {
    const p = recordPaymentSplit({ dueC: 10000, cashC: 5000, deductC: 5000 });
    assert.equal(p.appliedC, 10000);
    assert.equal(p.remainingC, 0);
    const s = settleAmounts({ grossC: 10000, deductC: 5000, paidC: 5000 });
    assert.equal(s.dueC, 0);
  });

  it("builds payment + expense entries atomically and only touches cashbox when cash > 0", () => {
    const built = buildAccountPayment({
      customerId: "c1",
      cashC: 5000,
      offsets: [{ category: "fuel", amount: 50, note: "Fuel" }],
      at: "2026-08-26T00:00:00.000Z",
      vendor: "Abu Ali",
      idFn: () => "x",
      groupOf: () => "machine",
    });
    assert.equal(built.ok, true);
    assert.equal(built.touchesCashbox, true);
    assert.equal(built.creditedC, 10000);
    assert.equal(built.entries.length, 2);
    const pay = built.payment;
    assert.equal(pay.amount_cash, 50);
    assert.equal(pay.amount_expense_offset, 50);
    assert.equal(pay.total_credited, 100);
    assert.equal(pay.amount, 50);
    const exp = built.expenses[0];
    assert.equal(exp.type, "expense");
    assert.equal(exp.paymentId, pay.id);
    assert.equal(exp.customerId, "c1");
    assert.equal(exp.origin, "payment_reimbursement");
    assert.equal(exp.amount, 50);
  });

  it("does not touch the cashbox when the settlement is offset-only", () => {
    const built = buildAccountPayment({
      customerId: "c1",
      cashC: 0,
      offsets: [{ category: "fuel", amount: 100, note: "Fuel" }],
      idFn: () => "y",
    });
    assert.equal(built.ok, true);
    assert.equal(built.touchesCashbox, false);
    assert.equal(built.payment.amount, 0);
    assert.equal(built.payment.total_credited, 100);
    assert.equal(built.entries.length, 2);
  });

  it("rejects an empty settlement", () => {
    const built = buildAccountPayment({ customerId: "c1", cashC: 0, offsets: [] });
    assert.equal(built.ok, false);
    assert.equal(built.entries.length, 0);
  });

  it("lists the required offset categories", () => {
    const keys = OFFSET_CATEGORIES.map((x) => x.key);
    assert.ok(keys.includes("fuel") && keys.includes("labour") && keys.includes("transport"));
    assert.ok(keys.includes("packaging") && keys.includes("repairs") && keys.includes("feed"));
  });
});

describe("payment schema migration", () => {
  it("fills amount_cash / offset / total_credited on older cash-only payments", () => {
    const e = migratePaymentEntry({ type: "payment", amount: 20, customerId: "c1" });
    assert.equal(paymentCashCents(e), 2000);
    assert.equal(paymentOffsetCents(e), 0);
    assert.equal(paymentCreditedCents(e), 2000);
    assert.equal(e.amount_cash, 20);
    assert.equal(e.total_credited, 20);
  });

  it("backfills amount_expense_offset from linked reimbursement expenses", () => {
    const next = migrateSalesEntries([
      { id: "pay-1", type: "payment", amount: 50, customerId: "c1" },
      { id: "exp-1", type: "expense", origin: "payment_reimbursement", paymentId: "pay-1", amount: 50 },
    ]);
    const pay = next.find((e) => e.id === "pay-1");
    assert.equal(pay.amount_cash, 50);
    assert.equal(pay.amount_expense_offset, 50);
    assert.equal(pay.total_credited, 100);
  });
});

describe("physical cash box routing", () => {
  it("records cash in only — offsets do not move the drawer", () => {
    const box = cashBoxFromPayment({ cashC: 5000, deductC: 5000 });
    assert.equal(box.inC, 5000);
    assert.equal(box.outC, 0);
    assert.equal(box.netC, 5000);
    assert.equal(box.expenseC, 5000);
  });

  it("leaves the drawer unchanged when no cash is received", () => {
    const box = cashBoxFromPayment({ cashC: 0, deductC: 5000 });
    assert.equal(box.inC, 0);
    assert.equal(box.netC, 0);
  });
});

describe("quick sale POS tender", () => {
  it("computes change due from cash tendered", () => {
    const t = posChangeCents({ dueC: 10000, tenderC: 20000 });
    assert.equal(t.paidC, 10000);
    assert.equal(t.changeC, 10000);
  });

  it("posts a POS sale and cash-in payment together", () => {
    const built = buildQuickSale({
      customerId: "walk-in",
      product: "milk",
      qty: 2,
      price: 50,
      amount: 100,
      payNowC: 10000,
      tenderC: 20000,
      at: "2026-08-26T00:00:00.000Z",
      idFn: () => "z",
    });
    assert.equal(built.ok, true);
    assert.equal(built.touchesCashbox, true);
    assert.equal(built.changeC, 10000);
    assert.equal(built.entries[0].channel, "pos");
    assert.equal(built.entries[1].amount_cash, 100);
    assert.equal(built.entries[1].tenderAmount, 200);
    assert.equal(built.entries[1].changeAmount, 100);
  });

  it("posts a one-time cash sale without a customer account", () => {
    const built = buildQuickSale({
      oneTime: true,
      product: "milk",
      qty: 2,
      price: 50,
      amount: 100,
      payNowC: 10000,
      tenderC: 10000,
      at: "2026-08-26T00:00:00.000Z",
      idFn: () => "z",
    });
    assert.equal(built.ok, true);
    assert.equal(built.touchesCashbox, true);
    assert.equal(built.entries[0].oneTime, true);
    assert.equal(built.entries[0].customerId, undefined);
    assert.equal(built.entries[0].channel, "pos");
    assert.equal(built.entries[1].oneTime, true);
    assert.equal(built.entries[1].customerId, undefined);
    assert.equal(built.entries[1].amount_cash, 100);
  });

  it("rejects a one-time sale with no cash in", () => {
    const built = buildQuickSale({
      oneTime: true,
      product: "milk",
      qty: 1,
      price: 10,
      amount: 10,
      payNowC: 0,
      idFn: () => "z",
    });
    assert.equal(built.ok, false);
    assert.equal(built.error, "tenderShort");
    assert.equal(built.entries.length, 0);
  });
});
