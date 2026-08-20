import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWalkthroughFarm, walkthroughCounts,
  walkthroughHoldActive, setWalkthroughHold, savePreWalkthrough, readPreWalkthrough, clearPreWalkthrough,
} from "./walkthroughFarm.mjs";

test("walkthrough farm keeps the signed-in profile", () => {
  const me = { id: "u-owner", name: "Basem", role: "owner", emoji: "👨‍🌾", pin: "x", salt: "y", color: "#1B6B5A" };
  const farm = buildWalkthroughFarm({ keep: { me, profiles: [me] }, setupV: "1.6.4" });
  assert.equal(farm.settings.demoWalkthrough, true);
  assert.equal(farm.settings.setupV, "1.6.4");
  assert.equal(farm.settings.farmName.includes("Walkthrough"), true);
  assert.ok(farm.profiles.some((p) => p.id === "u-owner" && p.name === "Basem"));
});

test("walkthrough farm covers every main module a client should see", () => {
  const farm = buildWalkthroughFarm();
  const c = walkthroughCounts(farm);
  const species = new Set(farm.animals.map((a) => a.species));
  assert.equal(species.has("cow") && species.has("goat") && species.has("sheep") && species.has("chicken"), true);
  assert.ok(c.animals >= 7);
  assert.ok(c.customers >= 4);
  assert.ok(c.suppliers >= 3);
  assert.ok(c.workers >= 2);
  assert.ok(c.obligations >= 2);
  assert.ok(c.types.sale >= 6);
  assert.ok(c.types.payment >= 3);
  assert.ok(c.types.expense >= 4);
  assert.ok(c.types.supplierPay >= 3);
  assert.ok(c.types.milkBulk >= 20);
  assert.ok(c.types.eggs >= 8);
  assert.ok(c.types.attend >= 8);
  assert.ok(farm.animals.some((a) => a.status === "pregnant" && a.due));
  assert.ok(farm.animals.some((a) => a.status === "lactating"));
  assert.equal(farm.settings.rate > 0, true);
  assert.equal(farm.settings.milkPrice > 0, true);
});

test("sales mix paid, partial and overdue unpaid invoices", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");
  const farm = buildWalkthroughFarm({ now });
  const sales = farm.entries.filter((e) => e.type === "sale");
  const pays = farm.entries.filter((e) => e.type === "payment");
  const paidSaleIds = new Set(pays.filter((p) => p.saleId).map((p) => p.saleId));
  const unpaid = sales.filter((s) => !paidSaleIds.has(s.id));
  const partialCustomer = pays.find((p) => p.customerId === "demo-cust-bekaa");
  assert.ok(unpaid.length >= 2);
  assert.ok(partialCustomer);
  const overdue = unpaid.find((s) => s.id === "demo-sale-sam-1");
  assert.ok(overdue);
  const ageDays = (now - new Date(overdue.at)) / 864e5;
  assert.ok(ageDays > 30);
});

test("walkthrough hold helpers are safe without a browser store", () => {
  assert.equal(typeof walkthroughHoldActive(), "boolean");
  setWalkthroughHold(true);
  savePreWalkthrough({ settings: { demoWalkthrough: true }, entries: [] });
  assert.equal(readPreWalkthrough() === null || typeof readPreWalkthrough() === "object", true);
  clearPreWalkthrough();
  setWalkthroughHold(false);
});
