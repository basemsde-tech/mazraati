import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeGeom, nextZ, focusWindow, upsertWindow, closeWindow, moveWindow,
  toggleMinimize, activeWindowId, openTab, closeTab, selectTab, WM_MIN_W, WM_Z_BASE,
} from "./windowManager.mjs";

const vp = { width: 1400, height: 900 };

describe("window geometry", () => {
  it("clamps size and position into the viewport", () => {
    const g = normalizeGeom({ x: -40, y: 9999, width: 80, height: 40 }, vp);
    assert.equal(g.width, WM_MIN_W);
    assert.equal(g.height >= 240, true);
    assert.equal(g.x >= 0, true);
    assert.equal(g.y <= vp.height - 48, true);
  });
});

describe("z-order focus", () => {
  it("raises the focused window above peers", () => {
    let wins = [
      { id: "a", z: WM_Z_BASE, geom: normalizeGeom({}, vp) },
      { id: "b", z: WM_Z_BASE + 1, geom: normalizeGeom({}, vp) },
    ];
    wins = focusWindow(wins, "a");
    assert.equal(activeWindowId(wins), "a");
    assert.ok(wins.find((w) => w.id === "a").z > wins.find((w) => w.id === "b").z);
  });

  it("upserts then focuses, and close removes the window", () => {
    let wins = upsertWindow([], { id: "c1", kind: "customer", title: "A" }, vp);
    wins = upsertWindow(wins, { id: "c2", kind: "customer", title: "B" }, vp);
    assert.equal(wins.length, 2);
    assert.equal(activeWindowId(wins), "c2");
    wins = closeWindow(wins, "c2");
    assert.equal(wins.length, 1);
    assert.equal(activeWindowId(wins), "c1");
  });

  it("move updates geometry and minimize toggles", () => {
    let wins = upsertWindow([], { id: "x", title: "X" }, vp);
    wins = moveWindow(wins, "x", { x: 100, y: 80, width: 400, height: 300 }, vp);
    assert.equal(wins[0].geom.x, 100);
    assert.equal(wins[0].geom.width, 400);
    wins = toggleMinimize(wins, "x");
    assert.equal(wins[0].minimized, true);
    wins = focusWindow(wins, "x");
    assert.equal(wins[0].minimized, false);
  });
});

describe("tabs", () => {
  it("opens uniquely and closes with MRU selection fallback", () => {
    let ids = openTab([], "a");
    ids = openTab(ids, "b");
    ids = openTab(ids, "a");
    assert.deepEqual(ids, ["a", "b"]);
    const closed = closeTab(ids, "b", "b");
    assert.deepEqual(closed.ids, ["a"]);
    assert.equal(closed.selected, "a");
    const sel = selectTab(["a"], "c");
    assert.deepEqual(sel.ids, ["a", "c"]);
    assert.equal(sel.selected, "c");
  });

  it("nextZ advances from the highest existing layer", () => {
    assert.equal(nextZ([{ z: 41 }, { z: 45 }]), 46);
  });
});
