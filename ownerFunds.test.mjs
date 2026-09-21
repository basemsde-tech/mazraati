import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OWNER_FUND_TYPE, OWNER_FUND_WITHDRAW_TYPE, OWNER_FUNDED_BY,
  isOwnerInjection, isOwnerFundedExpense, isOwnerWithdraw,
  ownerSpendCents, ownerWithdrawCents, cashTakeCents, buildOwnerFund,
  buildFunderAccounts, syncFundersFromEntries, matchFunderId,
  normalizeAllocations, formatAllocations, allocationTotal, contributorOf,
} from "./ownerFunds.mjs";

describe("owner fund tracking", () => {
  it("recognises injections, withdraws, and owner-funded expenses", () => {
    assert.equal(isOwnerInjection({ type: OWNER_FUND_TYPE, amount: 100 }), true);
    assert.equal(isOwnerInjection({ type: "payment", amount: 100 }), false);
    assert.equal(isOwnerWithdraw({ type: OWNER_FUND_WITHDRAW_TYPE, amount: 40 }), true);
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
    assert.equal(ownerWithdrawCents({
      type: OWNER_FUND_WITHDRAW_TYPE, amount: 12.5,
    }), 1250);
  });

  it("attributes cash takes to a named person without double-counting owner spend", () => {
    assert.equal(cashTakeCents({
      type: "expense", amount: 30, payStatus: "paid",
      funderId: "f1", contributorLabel: "Manager", purpose: "diesel",
    }), 3000);
    assert.equal(cashTakeCents({
      type: "expense", amount: 30, payStatus: "paid", origin: "cash_take",
      contributorLabel: "Manager",
    }), 3000);
    assert.equal(cashTakeCents({
      type: "expense", fundedBy: "owner", amount: 30, payStatus: "paid",
      recipientLabel: "Market",
    }), 0);
    assert.equal(cashTakeCents({
      type: "expense", amount: 30, payStatus: "paid",
      recipientLabel: "Someone",
    }), 0);
    assert.equal(cashTakeCents({
      type: "expense", amount: 30, payStatus: "paid", supplierId: "s1",
      funderId: "f1",
    }), 0);
  });

  it("keeps an independent running balance: inject, spend, withdraw", () => {
    const fund = buildOwnerFund([
      { id: "1", type: OWNER_FUND_TYPE, amount: 200, at: "2026-01-01T10:00:00.000Z",
        contributorLabel: "Khaled", purpose: "season",
        allocations: [{ label: "cows", amount: 120 }, { label: "feed", amount: 80 }] },
      { id: "2", type: "expense", fundedBy: "owner", amount: 75, payStatus: "paid",
        at: "2026-01-02T10:00:00.000Z", recipientLabel: "Market" },
      { id: "3", type: OWNER_FUND_WITHDRAW_TYPE, amount: 25,
        at: "2026-01-03T10:00:00.000Z", contributorLabel: "Khaled", purpose: "return" },
    ]);
    assert.equal(fund.injected, 200);
    assert.equal(fund.spent, 75);
    assert.equal(fund.withdrawn, 25);
    assert.equal(fund.balance, 100);
    assert.equal(fund.rows.length, 3);
    assert.equal(fund.rows[0].contributor, "Khaled");
    assert.equal(fund.rows[0].allocations.length, 2);
    assert.equal(fund.rows[2].kind, "withdraw");
    assert.equal(fund.rows[2].balance, 100);
  });

  it("builds per-person accounts for deposits and cash takes", () => {
    const funders = [{ id: "f1", name: "Manager" }, { id: "f2", name: "Owner" }];
    const entries = [
      { id: "d1", type: OWNER_FUND_TYPE, amount: 500, at: "2026-02-01T10:00:00.000Z",
        funderId: "f2", contributorLabel: "Owner" },
      { id: "t1", type: "expense", amount: 40, payStatus: "paid", category: "fuel",
        at: "2026-02-02T10:00:00.000Z", funderId: "f1", takenBy: "f1",
        contributorLabel: "Manager", purpose: "diesel", origin: "cash_take" },
      { id: "d2", type: OWNER_FUND_TYPE, amount: 100, at: "2026-02-03T10:00:00.000Z",
        funderId: "f1", contributorLabel: "Manager" },
    ];
    const { list, byId } = buildFunderAccounts(entries, funders);
    assert.equal(byId.f1.injected, 100);
    assert.equal(byId.f1.withdrawn, 40);
    assert.equal(byId.f1.balance, 60);
    assert.equal(byId.f2.injected, 500);
    assert.equal(byId.f2.balance, 500);
    assert.ok(list.some((a) => a.id === "f1" && a.rows.some((r) => r.kind === "take")));
    assert.equal(matchFunderId(funders, "manager"), "f1");
  });

  it("syncs funder accounts from legacy contributor labels", () => {
    const { funders, changed } = syncFundersFromEntries([], [
      { type: OWNER_FUND_TYPE, amount: 10, contributorLabel: "Sara", at: "2026-01-01T00:00:00.000Z" },
    ], () => "f-sara");
    assert.equal(changed, true);
    assert.equal(funders.length, 1);
    assert.equal(funders[0].name, "Sara");
    assert.equal(funders[0].id, "f-sara");
  });

  it("normalizes allocations and formats a usage summary", () => {
    const rows = normalizeAllocations([
      { label: "cows", amount: 6000 },
      { label: "  ", amount: 10 },
      { label: "feed", amount: 5000 },
    ], 10000);
    assert.equal(rows.length, 2);
    assert.equal(allocationTotal(rows), 10000);
    assert.equal(formatAllocations(rows, (n) => `$${n}`), "cows $6000 · feed $4000");
    assert.equal(contributorOf({ contributorLabel: "Sara" }), "Sara");
    assert.equal(contributorOf({ recipientLabel: "Ali" }), "Ali");
  });
});
