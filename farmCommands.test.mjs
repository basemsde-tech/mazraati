import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFarmCommand, undoSnapshot, restoreRemoved, isMoneyType } from "./farmCommands.mjs";

test("isMoneyType", () => {
  assert.equal(isMoneyType("sale"), true);
  assert.equal(isMoneyType("note"), false);
});

test("applyFarmCommand stamps entries", () => {
  const { farm, stamped } = applyFarmCommand(
    { entries: [], profiles: [] },
    { op: "commit", entries: [{ type: "sale", amount: 10 }], profile: { id: "p1", name: "A" }, now: "2026-01-01T00:00:00.000Z" },
    { trim: (x) => x },
  );
  assert.equal(stamped.length, 1);
  assert.equal(stamped[0].byId, "p1");
  assert.equal(farm.entries[0].type, "sale");
});

test("undo restore", () => {
  const rows = [{ id: "a", type: "sale" }, { id: "b", type: "note" }];
  const snap = undoSnapshot(rows, ["b"]);
  const after = rows.filter((e) => e.id !== "b");
  const back = restoreRemoved(after, snap);
  assert.equal(back.length, 2);
  assert.ok(back.some((e) => e.id === "b"));
});
