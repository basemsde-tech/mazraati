import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OWNER_FUND_TYPE, OWNER_FUNDED_BY, isOwnerInjection, isOwnerFundedExpense,
  ownerSpendCents, buildOwnerFund,
} from "./ownerFunds.mjs";

describe("owner fund tracking", () => {
  it("recognises injections and owner-funded expenses", () => {
    assert.equal(isOwnerInjection({ type: OWNER_FUND_TYPE, amount: 100 }), true);
    assert.equal(isOwnerInjection({ type: "payment", amount: 100 }), false);
    assert.equal(isOwnerFundedExpense({ type: "expense", fundedBy: OWNER_FUNDED_BY, amount: 40 }), true);
    assert.equal(isOwnerFundedExpense({ type: "expense", origin: "owner_fund", amount: 10 }), true);
    assert.equal(isOwnerFundedExpense({ type: "expense", amount: 10 }), false);
  });

  it("counts only the paid portion of owner-funded expenses as spend", () => {
    assert.equal(ownerSpendCents({
      type: "expense", fundedBy: "owner", amount: 50, payStatus: "paid",
    }), 5000);
    assert.equal(ownerSpendCents({
      type: "expense", fundedBy: "owner", amount: 50, payStatus: "partial", paidAmount: 20,
    }), 2000);
    assert.equal(ownerSpendCents({
      type: "expense", fundedBy: "owner", amount: 50, payStatus: "unpaid",
    }), 0);
  });

  it("keeps an independent running balance: inject then spend clears to remainder", () => {
    const fund = buildOwnerFund([
      { id: "1", type: OWNER_FUND_TYPE, amount: 200, at: "2026-01-01T10:00:00.000Z" },
      { id: "2", type: "expense", fundedBy: "owner", amount: 75, payStatus: "paid",
        at: "2026-01-02T10:00:00.000Z" },
      { id: "3", type: "expense", fundedBy: "owner", amount: 50, payStatus: "partial",
        paidAmount: 25, at: "2026-01-03T10:00:00.000Z" },
    ]);
    assert.equal(fund.injected, 200);
    assert.equal(fund.spent, 100);
    assert.equal(fund.balance, 100);
    assert.equal(fund.rows.length, 3);
    assert.equal(fund.rows[2].balance, 100);
  });
});
