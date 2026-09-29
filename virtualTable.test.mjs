import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  periodKeyOf, groupByPeriod, defaultOpenPeriodKeys,
  flattenPeriodRows, virtualWindow, shouldVirtualize,
} from "./virtualTable.mjs";

describe("period grouping", () => {
  it("extracts YYYY-MM keys", () => {
    assert.equal(periodKeyOf("2026-09-29T10:00:00"), "2026-09");
    assert.equal(periodKeyOf("2026-03-01"), "2026-03");
  });

  it("groups newest first and opens recent periods", () => {
    const items = [
      { id: "a", at: "2026-07-01" },
      { id: "b", at: "2026-09-10" },
      { id: "c", at: "2026-09-02" },
      { id: "d", at: "2026-08-15" },
    ];
    const groups = groupByPeriod(items, (x) => x.at);
    assert.deepEqual(groups.map((g) => g.key), ["2026-09", "2026-08", "2026-07"]);
    assert.equal(groups[0].count, 2);
    const open = defaultOpenPeriodKeys(groups, 2);
    assert.equal(open.has("2026-09"), true);
    assert.equal(open.has("2026-08"), true);
    assert.equal(open.has("2026-07"), false);
  });

  it("flattens closed groups to header-only", () => {
    const groups = groupByPeriod([
      { id: "1", at: "2026-09-01" },
      { id: "2", at: "2026-08-01" },
    ], (x) => x.at);
    const flat = flattenPeriodRows(groups, new Set(["2026-09"]));
    assert.equal(flat.filter((x) => x.type === "group").length, 2);
    assert.equal(flat.filter((x) => x.type === "row").length, 1);
    assert.equal(flat.find((x) => x.type === "row").item.id, "1");
  });
});

describe("virtual window", () => {
  it("pads top and bottom for the visible slice", () => {
    const w = virtualWindow({
      scrollTop: 520, viewportH: 400, rowCount: 200, rowHeight: 52, overscan: 2,
    });
    assert.equal(w.start, Math.max(0, Math.floor(520 / 52) - 2));
    assert.ok(w.end > w.start);
    assert.equal(w.padTop, w.start * 52);
    assert.equal(w.totalH, 200 * 52);
    assert.equal(w.padBottom, (200 - w.end) * 52);
  });

  it("thresholds small lists", () => {
    assert.equal(shouldVirtualize(10, 48), false);
    assert.equal(shouldVirtualize(48, 48), true);
  });
});
