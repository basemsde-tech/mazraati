import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OWNER_FUND_TYPE, OWNER_FUND_WITHDRAW_TYPE, MGR_FUNDED, MGR_OOP_ORIGIN, MGR_RETAINED,
  classifyManagerMove, buildManagerAccounts, buildManagerStatement,
  managerPeriodBounds, migrateManagersFarm, isManagerOop, isManagerSupplierPay,
  isManagerRetainedSale, resolveManagerRef,
} from "./managerLedger.mjs";

const managers = [
  { id: "m1", name: "Khaled" },
  { id: "m2", name: "Sara" },
];

describe("manager ledger classification", () => {
  it("inject raises owed; withdraw lowers owed", () => {
    const inj = classifyManagerMove({
      id: "a", type: OWNER_FUND_TYPE, amount: 100, managerId: "m1", at: "2026-03-01T12:00:00.000Z",
    });
    assert.equal(inj.deltaC, 10000);
    assert.equal(inj.dept, "cashbox");
    const w = classifyManagerMove({
      id: "b", type: OWNER_FUND_WITHDRAW_TYPE, amount: 40, managerId: "m1", at: "2026-03-02T12:00:00.000Z",
    });
    assert.equal(w.deltaC, -4000);
  });

  it("OOP expense raises owed without being a cashbox kind", () => {
    const m = classifyManagerMove({
      id: "c", type: "expense", amount: 25, payStatus: "paid", managerId: "m1",
      fundedBy: MGR_FUNDED, origin: MGR_OOP_ORIGIN, at: "2026-03-03T12:00:00.000Z",
    });
    assert.equal(isManagerOop(m.source), true);
    assert.equal(m.dept, "expenses");
    assert.equal(m.deltaC, 2500);
  });

  it("supplier pay by manager raises owed", () => {
    assert.equal(isManagerSupplierPay({
      type: "supplierPay", amount: 50, managerId: "m1", paidBy: MGR_FUNDED,
    }), true);
    const m = classifyManagerMove({
      id: "d", type: "supplierPay", amount: 50, managerId: "m1", paidBy: MGR_FUNDED,
      at: "2026-03-04T12:00:00.000Z",
    });
    assert.equal(m.dept, "suppliers");
    assert.equal(m.deltaC, 5000);
  });

  it("retained sale cash lowers owed", () => {
    assert.equal(isManagerRetainedSale({
      type: "payment", amount_cash: 30, amount: 30, managerId: "m2", retainedBy: MGR_RETAINED,
    }), true);
    const m = classifyManagerMove({
      id: "e", type: "payment", amount_cash: 30, amount: 30, managerId: "m2",
      retainedBy: MGR_RETAINED, at: "2026-03-05T12:00:00.000Z",
    });
    assert.equal(m.dept, "sales");
    assert.equal(m.deltaC, -3000);
  });
});

describe("manager accounts + statements", () => {
  it("builds per-person net balance across departments", () => {
    const entries = [
      { id: "1", type: OWNER_FUND_TYPE, amount: 200, managerId: "m1", at: "2026-01-01T10:00:00.000Z" },
      { id: "2", type: "expense", amount: 50, payStatus: "paid", managerId: "m1",
        fundedBy: MGR_FUNDED, origin: MGR_OOP_ORIGIN, at: "2026-01-05T10:00:00.000Z" },
      { id: "3", type: OWNER_FUND_WITHDRAW_TYPE, amount: 20, managerId: "m1", at: "2026-01-10T10:00:00.000Z" },
      { id: "4", type: "payment", amount_cash: 30, amount: 30, managerId: "m1",
        retainedBy: MGR_RETAINED, at: "2026-01-15T10:00:00.000Z" },
      { id: "5", type: "supplierPay", amount: 15, managerId: "m2", paidBy: MGR_FUNDED,
        at: "2026-01-08T10:00:00.000Z" },
    ];
    const { byId, totals } = buildManagerAccounts(entries, managers);
    assert.equal(byId.m1.injected, 200);
    assert.equal(byId.m1.oop, 50);
    assert.equal(byId.m1.withdrawn, 20);
    assert.equal(byId.m1.salesRetained, 30);
    assert.equal(byId.m1.balance, 200);
    assert.equal(byId.m2.balance, 15);
    assert.equal(totals.balance, 215);
  });

  it("statement opening/closing respect inclusive date bounds", () => {
    const entries = [
      { id: "1", type: OWNER_FUND_TYPE, amount: 100, managerId: "m1", at: "2026-01-01T10:00:00.000Z" },
      { id: "2", type: OWNER_FUND_TYPE, amount: 50, managerId: "m1", at: "2026-02-01T10:00:00.000Z" },
      { id: "3", type: OWNER_FUND_WITHDRAW_TYPE, amount: 10, managerId: "m1", at: "2026-02-15T10:00:00.000Z" },
      { id: "4", type: OWNER_FUND_TYPE, amount: 5, managerId: "m1", at: "2026-03-01T10:00:00.000Z" },
    ];
    const stmt = buildManagerStatement(entries, managers, "m1", { from: "2026-02-01", to: "2026-02-28" });
    assert.equal(stmt.opening, 100);
    assert.equal(stmt.injected, 50);
    assert.equal(stmt.withdrawn, 10);
    assert.equal(stmt.closing, 140);
    assert.equal(stmt.rows.length, 2);
  });

  it("period presets include financial year and last month", () => {
    const fy = managerPeriodBounds("fy", { fyStartMonth: 1 });
    assert.ok(fy.from.endsWith("-01-01"));
    const lm = managerPeriodBounds("lastMonth");
    assert.ok(lm.from && lm.to && lm.from <= lm.to);
  });

  it("migrates funders into managers and copies funderId", () => {
    const farm = migrateManagersFarm({
      funders: [{ id: "f1", name: "Ali" }],
      managers: [],
      entries: [{ id: "x", type: OWNER_FUND_TYPE, amount: 10, funderId: "f1", at: "2026-01-01T00:00:00.000Z" }],
    });
    assert.equal(farm.managers.length, 1);
    assert.equal(farm.managers[0].name, "Ali");
    assert.equal(farm.entries[0].managerId, "f1");
  });

  it("resolveManagerRef creates a manager on demand", () => {
    const ref = resolveManagerRef([], null, "Nour", () => "m-new");
    assert.equal(ref.changed, true);
    assert.equal(ref.managerId, "m-new");
    assert.equal(ref.managers[0].name, "Nour");
  });
});
