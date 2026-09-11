import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  openingBillId, isOpeningBillId, openingBalanceCents, openingBillFor, openingBillsFor,
} from "./supplierOpen.mjs";

describe("supplier opening balances", () => {
  it("builds a synthetic opening bill from the supplier field", () => {
    const bill = openingBillFor({ id: "s1", name: "Feed Co", openingBalance: 150.5, at: "2025-01-01T00:00:00.000Z" });
    assert.equal(bill.id, openingBillId("s1"));
    assert.equal(isOpeningBillId(bill.id), true);
    assert.equal(bill.amount, 150.5);
    assert.equal(bill.opening, true);
    assert.equal(openingBalanceCents({ openingBalance: -5 }), 0);
  });

  it("skips suppliers with no opening debt", () => {
    assert.equal(openingBillFor({ id: "s1", openingBalance: 0 }), null);
    assert.equal(openingBillsFor([{ id: "a", openingBalance: 0 }, { id: "b", openingBalance: 10 }]).length, 1);
  });
});
