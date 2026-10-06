import { test } from "node:test";
import assert from "node:assert/strict";
import { retainEntries, buildFarmBackup, parseFarmBackup } from "./farmHistory.mjs";

const PROT = new Set(["sale", "payment"]);

test("retainEntries archives overflow instead of dropping", () => {
  const list = [
    { id: "s1", type: "sale" },
    ...Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, type: "note" })),
  ];
  const { entries, archive, archivedCount } = retainEntries(list, PROT, {
    maxLive: 2,
    archive: [{ id: "old", type: "note", archivedAt: "x" }],
  });
  assert.equal(entries.filter((e) => e.type === "sale").length, 1);
  assert.equal(entries.filter((e) => e.type === "note").length, 2);
  assert.equal(archivedCount, 3);
  assert.ok(archive.some((e) => e.id === "v2"));
  assert.ok(archive.some((e) => e.id === "old"));
});

test("backup round-trip", () => {
  const farm = { entries: [{ id: "1", type: "sale" }], settings: {} };
  const text = buildFarmBackup(farm, { version: "test" });
  const back = parseFarmBackup(text);
  assert.equal(back.entries[0].id, "1");
  const legacy = parseFarmBackup(JSON.stringify(farm));
  assert.equal(legacy.entries[0].id, "1");
});
