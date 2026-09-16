import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseNumberInput, checkLineMath, checkStockCover, checkDiscount,
  checkPaymentSplit, checkExpenseAmounts, checkTender, checkCashTrail,
  hasBlockingIssues, worstSeverity, formatIssue,
} from "./validate.mjs";

describe("parseNumberInput", () => {
  it("accepts empty as zero when allowed", () => {
    assert.equal(parseNumberInput("").ok, true);
    assert.equal(parseNumberInput("").value, 0);
  });
  it("rejects garbage and negatives below min", () => {
    assert.equal(parseNumberInput("abc").ok, false);
    assert.equal(parseNumberInput("-3", { min: 0 }).ok, false);
    assert.equal(parseNumberInput("12,5").value, 12.5);
  });
});

describe("sale line math", () => {
  it("flags qty×price vs total mismatch beyond 1 cent", () => {
    const issues = checkLineMath({ qty: 10, price: 2, amount: 25, priceMode: "unit" });
    assert.ok(issues.some((i) => i.code === "valLineMismatch"));
  });
  it("allows 1-cent rounding drift", () => {
    const issues = checkLineMath({ qty: 3, price: 0.1, amount: 0.3, priceMode: "unit" });
    assert.equal(issues.filter((i) => i.code === "valLineMismatch").length, 0);
  });
  it("warns when stock is short", () => {
    const issues = checkStockCover({ qty: 12, available: 10, product: "milk" });
    assert.equal(issues[0].code, "valStockShort");
    assert.equal(issues[0].severity, "warn");
  });
});

describe("payment + discount", () => {
  it("requires a settlement and warns on overpay credit", () => {
    assert.ok(hasBlockingIssues(checkPaymentSplit({ due: 100, cash: 0, deduct: 0 })));
    const over = checkPaymentSplit({ due: 50, cash: 80, deduct: 0 });
    assert.ok(over.some((i) => i.code === "valOverpay"));
    assert.equal(worstSeverity(over), "warn");
  });
  it("flags discount above line total", () => {
    const issues = checkDiscount({ amount: 40, discount: 50, mode: "usd" });
    assert.ok(issues.some((i) => i.code === "valDiscountOver"));
  });
});

describe("expense + tender + cash trail", () => {
  it("checks expense qty×unit against amount", () => {
    const issues = checkExpenseAmounts({ amount: 100, qty: 4, unitCost: 20 });
    assert.ok(issues.some((i) => i.code === "valExpenseMath"));
  });
  it("requires full tender for walk-in and reports change", () => {
    const short = checkTender({ due: 20, tender: 10, requireFull: true });
    assert.ok(hasBlockingIssues(short));
    const change = checkTender({ due: 20, tender: 50, requireFull: true });
    assert.ok(change.some((i) => i.code === "valChangeDue"));
  });
  it("detects running balance drift on cash rows", () => {
    const issues = checkCashTrail([
      { debit: 100, credit: 0, balance: 100 },
      { debit: 0, credit: 30, balance: 50 }, /* should be 70 */
    ]);
    assert.ok(issues.some((i) => i.code === "valCashBalanceDrift"));
  });
});

describe("formatIssue", () => {
  it("substitutes params into why copy", () => {
    const t = (k) => ({ valOverpay: "Overpay", valWhyOverpay: "Applied {applied} vs due {due} (credit {credit})" }[k] || k);
    const { title, why } = formatIssue({
      code: "valOverpay", why: "valWhyOverpay",
      params: { applied: 80, due: 50, credit: 30 },
    }, t, (n) => `$${n}`);
    assert.equal(title, "Overpay");
    assert.match(why, /\$80/);
    assert.match(why, /\$50/);
  });
});
