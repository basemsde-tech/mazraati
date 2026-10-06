import { test } from "node:test";
import assert from "node:assert/strict";
import { withFarmRev, mergeFarmsByRev, nextFarmRev } from "./farmSync.mjs";

test("withFarmRev bumps", () => {
  const a = withFarmRev({ farmRev: 2, entries: [] });
  assert.equal(a.farmRev, 3);
  assert.ok(a.farmRevAt);
});

test("merge keeps local-only entries when remote ahead", () => {
  const local = { farmRev: 1, entries: [{ id: "L", type: "sale" }], customers: [] };
  const remote = { farmRev: 3, entries: [{ id: "R", type: "sale" }], customers: [{ id: "c1" }] };
  const m = mergeFarmsByRev(local, remote);
  assert.equal(m.farmRev, 3);
  assert.ok(m.entries.some((e) => e.id === "L"));
  assert.ok(m.entries.some((e) => e.id === "R"));
});

test("local wins when rev not behind", () => {
  const local = { farmRev: 5, entries: [{ id: "L" }] };
  const remote = { farmRev: 4, entries: [{ id: "R" }] };
  assert.equal(mergeFarmsByRev(local, remote), local);
  assert.equal(nextFarmRev({}), 1);
});
