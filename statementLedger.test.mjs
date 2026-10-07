import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stmtBuildDraft, stmtWithRunning, stmtTotals, stmtPresetBounds,
  customerStatementRawLines, supplierStatementRawLines,
} from "./statementLedger.mjs";

describe("statement ledger math", () => {
  it("opening + charges - credits = closing", () => {
    const raw = [
      { id: "1", at: "2026-01-01", day: "2026-01-01", chargeC: 10000, creditC: 0, sourceId: "a" },
      { id: "2", at: "2026-02-01", day: "2026-02-01", chargeC: 5000, creditC: 0, sourceId: "b" },
      { id: "3", at: "2026-02-10", day: "2026-02-10", chargeC: 0, creditC: 3000, sourceId: "c" },
    ];
    const draft = stmtBuildDraft(raw, { from: "2026-02-01", to: "2026-02-28" });
    assert.equal(draft.openingC, 10000);
    assert.equal(draft.totals.chargesC, 5000);
    assert.equal(draft.totals.creditsC, 3000);
    assert.equal(draft.totals.closingC, 12000);
    assert.equal(draft.rows[draft.rows.length - 1].balanceC, 12000);
  });

  it("selectedIds filters period but keeps full opening", () => {
    const raw = [
      { id: "1", at: "2026-01-01", day: "2026-01-01", chargeC: 10000, creditC: 0, sourceId: "a" },
      { id: "2", at: "2026-02-01", day: "2026-02-01", chargeC: 5000, creditC: 0, sourceId: "b" },
      { id: "2r", at: "2026-02-01", day: "2026-02-01", chargeC: 0, creditC: 500, sourceId: "b" },
      { id: "3", at: "2026-02-10", day: "2026-02-10", chargeC: 8000, creditC: 0, sourceId: "c" },
      { id: "4", at: "2026-02-15", day: "2026-02-15", chargeC: 0, creditC: 2000, sourceId: "p1" },
    ];
    const draft = stmtBuildDraft(raw, {
      from: "2026-02-01", to: "2026-02-28", selectedIds: ["b"],
    });
    assert.equal(draft.openingC, 10000);
    assert.equal(draft.rows.length, 2);
    assert.equal(draft.totals.chargesC, 5000);
    assert.equal(draft.totals.creditsC, 500);
    assert.equal(draft.totals.closingC, 14500);
  });

  it("allTime has zero opening and every line in period", () => {
    const raw = [
      { id: "1", at: "2026-01-01", day: "2026-01-01", chargeC: 1000, creditC: 0, sourceId: "a" },
      { id: "2", at: "2026-03-01", day: "2026-03-01", chargeC: 0, creditC: 400, sourceId: "b" },
    ];
    const draft = stmtBuildDraft(raw, { from: "", to: "" });
    assert.equal(draft.openingC, 0);
    assert.equal(draft.totals.closingC, 600);
    assert.equal(draft.rows.length, 2);
  });

  it("recomputes running balances after edits", () => {
    const rows = stmtWithRunning([
      { id: "1", chargeC: 1000, creditC: 0 },
      { id: "2", chargeC: 0, creditC: 400 },
    ], 200);
    assert.deepEqual(rows.map((r) => r.balanceC), [1200, 800]);
    assert.equal(stmtTotals(rows, 200).closingC, 800);
  });

  it("month preset starts on the 1st", () => {
    const b = stmtPresetBounds("month", "2026-09-29");
    assert.equal(b.from, "2026-09-01");
    assert.equal(b.to, "2026-09-29");
  });

  it("builds customer raw lines from ledger shape", () => {
    const ledger = {
      list: [{
        id: "s1", customerId: "c1", at: "2026-03-01T10:00:00", no: "INV-1",
        grossAmount: 50, qty: 1, product: "milk", price: 50,
        reimbRows: [{ id: "r1", amount: 5, name: "Fuel" }],
        discountAmount: 2,
      }],
      pays: [{ id: "p1", customerId: "c1", at: "2026-03-05", amount: 20, method: "cash" }],
      paymentDeductions: [],
    };
    const lines = customerStatementRawLines({ ledger, customerId: "c1" });
    const charges = lines.reduce((s, r) => s + r.chargeC, 0);
    const credits = lines.reduce((s, r) => s + r.creditC, 0);
    assert.equal(charges, 5000);
    assert.equal(credits, 500 + 200 + 2000);
  });

  it("does not double-count accountAlloc reimbursements already in paymentDeductions", () => {
    const ledger = {
      list: [{
        id: "s1", customerId: "c1", at: "2026-03-01T10:00:00", no: "INV-1",
        grossAmount: 100, qty: 1, product: "milk", price: 100,
        reimbRows: [{ id: "synth", amount: 15, name: "", accountAlloc: true }],
        discountAmount: 0,
      }],
      pays: [],
      paymentDeductions: [{ id: "pd1", customerId: "c1", at: "2026-03-02", amount: 15, note: "Fuel" }],
    };
    const lines = customerStatementRawLines({ ledger, customerId: "c1" });
    const credits = lines.reduce((s, r) => s + r.creditC, 0);
    assert.equal(credits, 1500);
  });

  it("builds supplier raw lines bills and payments", () => {
    const supplierLedger = {
      list: [
        { id: "b1", supplierId: "s1", at: "2026-04-01", amount: 80, no: "PO-1", category: "feed" },
        { id: "b2", supplierId: "s2", at: "2026-04-02", amount: 99, no: "PO-x", category: "feed" },
      ],
      allPays: [
        { id: "sp1", supplierId: "s1", at: "2026-04-10", amount: 30, method: "cash" },
      ],
    };
    const lines = supplierStatementRawLines({ supplierLedger, supplierId: "s1" });
    assert.equal(lines.length, 2);
    assert.equal(lines.reduce((s, r) => s + r.chargeC, 0), 8000);
    assert.equal(lines.reduce((s, r) => s + r.creditC, 0), 3000);
  });
});
