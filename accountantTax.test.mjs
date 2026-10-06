import { test } from "node:test";
import assert from "node:assert/strict";
import { taxBreakdown, normalizeTax, taxDocLines } from "./accountantTax.mjs";

test("tax exclusive", () => {
  const b = taxBreakdown(100, { enabled: true, ratePct: 11 });
  assert.equal(b.net, 100);
  assert.equal(b.tax, 11);
  assert.equal(b.gross, 111);
});

test("tax inclusive", () => {
  const b = taxBreakdown(111, { enabled: true, ratePct: 11, pricesIncludeTax: true });
  assert.equal(b.gross, 111);
  assert.ok(Math.abs(b.net - 100) < 0.02);
});

test("normalize disabled when rate 0", () => {
  assert.equal(normalizeTax({ tax: { enabled: true, ratePct: 0 } }).enabled, false);
});

test("doc lines", () => {
  const lines = taxDocLines({ enabled: true, ratePct: 11, taxNumber: "123", showTaxOnDocs: true }, "en");
  assert.ok(lines.some((l) => l.includes("123")));
  assert.ok(lines.some((l) => l.includes("11%")));
});
