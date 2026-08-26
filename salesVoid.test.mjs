import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { milkOnHandLiters, purgeSaleClusters, voidSales, VOID_RESTORE, VOID_WRITEOFF } from "./salesVoid.mjs";

const milkLot = (id, liters, at = "2026-08-01T06:00:00.000Z") => ({
  id, type: "milk", liters, kg: liters * 1.03, at, animalId: "a1", session: "am",
});
const sale = (id, extra = {}) => ({
  id, type: "sale", product: "milk", qty: 50, liters: 50, kg: 51.5, unit: "L",
  amount: 100, customerId: "c1", at: "2026-08-02T10:00:00.000Z", ...extra,
});

describe("purgeSaleClusters", () => {
  it("removes the sale, its payment, and a reimbursement expense", () => {
    const list = [
      sale("s1"),
      { id: "p1", type: "payment", saleId: "s1", amount: 100, customerId: "c1" },
      { id: "r1", type: "saleReimburse", saleId: "s1", amount: 10 },
      { id: "e1", type: "expense", saleReimburseId: "r1", amount: 10, origin: "payment_reimbursement" },
      { id: "keep", type: "sale", product: "eggs", qty: 12, amount: 6, customerId: "c2" },
    ];
    const next = purgeSaleClusters(list, ["s1"]);
    assert.deepEqual(next.map((e) => e.id), ["keep"]);
  });
});

describe("voidSales restore vs write-off", () => {
  it("rejects a short or missing reason", () => {
    const r = voidSales({ entries: [sale("s1")], saleIds: ["s1"], mode: VOID_RESTORE, reason: "no" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "voidReasonNeeded");
  });

  it("restore removes the milk sale so on-hand milk comes back", () => {
    const entries = [milkLot("m1", 80), sale("s1")];
    assert.equal(milkOnHandLiters(entries), 30);
    const r = voidSales({
      entries, saleIds: ["s1"], mode: VOID_RESTORE, reason: "Wrong customer",
      idFn: () => "x", at: "2026-08-26T00:00:00.000Z",
    });
    assert.equal(r.ok, true);
    assert.equal(r.entries.some((e) => e.id === "s1"), false);
    assert.equal(r.entries.some((e) => e.type === "saleVoid" && e.mode === "restore"), true);
    assert.equal(r.entries.some((e) => e.type === "milkUse"), false);
    assert.equal(milkOnHandLiters(r.entries), 80);
  });

  it("write-off posts milkUse so the tank stays down after the sale is gone", () => {
    const entries = [milkLot("m1", 80), sale("s1")];
    const r = voidSales({
      entries, saleIds: ["s1"], mode: VOID_WRITEOFF, reason: "Dumped spoiled milk",
      idFn: () => "w", at: "2026-08-26T00:00:00.000Z",
    });
    assert.equal(r.ok, true);
    const use = r.entries.find((e) => e.type === "milkUse");
    assert.ok(use);
    assert.equal(use.voidOf, "s1");
    assert.equal(use.liters, 50);
    assert.equal(use.reason, "void-writeoff");
    assert.equal(milkOnHandLiters(r.entries), 30);
  });

  it("blocks restore when the tank would overflow", () => {
    const entries = [milkLot("m1", 80), sale("s1")];
    const r = voidSales({
      entries, saleIds: ["s1"], mode: VOID_RESTORE, reason: "Put it back",
      tankMaxLiters: 40, idFn: () => "t",
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "voidTankOverflow");
    assert.ok(r.overflowLiters > 40);
  });

  it("restores a sold animal on restore, and leaves it on write-off", () => {
    const livestock = {
      id: "s2", type: "sale", product: "animal", qty: 1, amount: 800,
      customerId: "c1", animalId: "cow1", at: "2026-08-03T00:00:00.000Z",
    };
    const animals = [{ id: "cow1", status: "sold", name: "Lulu" }];
    const restored = voidSales({
      entries: [livestock], animals, saleIds: ["s2"], mode: VOID_RESTORE,
      reason: "Buyer returned her", idFn: () => "a",
    });
    assert.equal(restored.ok, true);
    assert.equal(restored.animalUpdates[0].status, "healthy");

    const written = voidSales({
      entries: [livestock], animals, saleIds: ["s2"], mode: VOID_WRITEOFF,
      reason: "Died after sale", idFn: () => "b",
    });
    assert.equal(written.ok, true);
    assert.equal(written.animalUpdates.length, 0);
  });

  it("voids several sales in one pass and records who/why", () => {
    const entries = [milkLot("m1", 200), sale("s1"), sale("s3", { id: "s3", qty: 10, liters: 10 })];
    const r = voidSales({
      entries, saleIds: ["s1", "s3"], mode: VOID_RESTORE, reason: "Duplicate invoices",
      byId: "u1", byName: "Basem", idFn: () => "z",
    });
    assert.equal(r.ok, true);
    assert.equal(r.audit.byName, "Basem");
    assert.equal(r.audit.count, 2);
    assert.deepEqual(r.audit.saleIds, ["s1", "s3"]);
  });
});
