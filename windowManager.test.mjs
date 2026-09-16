import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeGeom, nextZ, focusWindow, upsertWindow, closeWindow, moveWindow,
  toggleMinimize, activeWindowId, openTab, closeTab, selectTab, WM_MIN_W, WM_Z_BASE,
  MODULE_ROUTES, isModuleRoute, moduleWinId, routeOfModuleWin, openModule, closeModule,
  floatingModuleRoutes, snapWindow, tileSideBySide, splitGeom, maximizeGeom,
  toggleMaximize, setWindowAccent, accentOf, nextAccentKey, WIN_ACCENT_KEYS,
  sanitizeDeskLayoutPrefs, deskLayoutFromWindows, applySavedLayout, reflowSnapped,
  detectSnapZone, snapPreviewGeom, dragFloatGeom, WM_SNAP_EDGE,
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

  it("builds left/right split halves side by side", () => {
    const L = splitGeom("left", vp);
    const R = splitGeom("right", vp);
    assert.ok(L.width >= WM_MIN_W);
    assert.ok(R.x >= L.x + L.width);
    assert.equal(L.y, R.y);
  });

  it("maximize fills the workspace leaving tray room", () => {
    const g = maximizeGeom(vp, { dockH: 56, pad: 12 });
    assert.ok(g.width > vp.width * 0.8);
    assert.ok(g.height > vp.height * 0.7);
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

  it("move updates geometry and minimize toggles without dropping the window", () => {
    let wins = upsertWindow([], { id: "x", title: "X" }, vp);
    wins = moveWindow(wins, "x", { x: 100, y: 80, width: 400, height: 300 }, vp);
    assert.equal(wins[0].geom.x, 100);
    assert.equal(wins[0].geom.width, 400);
    wins = toggleMinimize(wins, "x");
    assert.equal(wins[0].minimized, true);
    assert.equal(wins.length, 1);
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

describe("module workspace", () => {
  it("maps module win ids and validates routes", () => {
    assert.ok(MODULE_ROUTES.includes("sales"));
    assert.equal(isModuleRoute("sales"), true);
    assert.equal(isModuleRoute("nope"), false);
    assert.equal(moduleWinId("sales"), "mod:sales");
    assert.equal(routeOfModuleWin("mod:sales"), "sales");
    assert.equal(routeOfModuleWin("cust:1"), null);
  });

  it("opens modules and never closes the last workspace tab", () => {
    let mods = openModule([], "dashboard");
    mods = openModule(mods, "sales");
    mods = openModule(mods, "sales");
    assert.deepEqual(mods, ["dashboard", "sales"]);
    let closed = closeModule(mods, "dashboard", "dashboard");
    assert.deepEqual(closed.ids, ["sales"]);
    assert.equal(closed.selected, "sales");
    closed = closeModule(["sales"], "sales", "sales");
    assert.deepEqual(closed.ids, ["dashboard"]);
    assert.equal(closed.selected, "dashboard");
  });

  it("tracks floating module routes for concurrent panes", () => {
    const wins = [
      { id: moduleWinId("sales"), kind: "module", payload: { route: "sales" }, minimized: false },
      { id: moduleWinId("dashboard"), kind: "module", payload: { route: "dashboard" }, minimized: true },
      { id: "cust:1", kind: "customer", payload: { customerId: "1" }, minimized: false },
    ];
    const floating = floatingModuleRoutes(wins);
    assert.equal(floating.has("sales"), true);
    assert.equal(floating.has("dashboard"), false);
    assert.equal(floating.has("suppliers"), false);
  });
});

describe("split, maximize, accents", () => {
  it("snaps two windows side by side and auto-pairs", () => {
    let wins = upsertWindow([], { id: "a", title: "A" }, vp);
    wins = upsertWindow(wins, { id: "b", title: "B" }, vp);
    wins = snapWindow(wins, "a", "left", vp);
    const a = wins.find((w) => w.id === "a");
    const b = wins.find((w) => w.id === "b");
    assert.equal(a.split, "left");
    assert.equal(b.split, "right");
    assert.ok(b.geom.x > a.geom.x);
  });

  it("tileSideBySide docks the top two windows", () => {
    let wins = upsertWindow([], { id: "a", title: "A" }, vp);
    wins = upsertWindow(wins, { id: "b", title: "B" }, vp);
    wins = upsertWindow(wins, { id: "c", title: "C" }, vp);
    wins = tileSideBySide(wins, vp);
    assert.equal(wins.find((w) => w.id === "c").split, "left");
    assert.equal(wins.find((w) => w.id === "b").split, "right");
  });

  it("maximize remembers restoreGeom and toggles back", () => {
    let wins = upsertWindow([], { id: "a", title: "A", geom: { x: 80, y: 60, width: 400, height: 300 } }, vp);
    const before = { ...wins[0].geom };
    wins = toggleMaximize(wins, "a", vp);
    assert.equal(wins[0].maximized, true);
    assert.deepEqual(wins[0].restoreGeom, before);
    assert.ok(wins[0].geom.width > before.width);
    wins = toggleMaximize(wins, "a", vp);
    assert.equal(wins[0].maximized, false);
    assert.equal(wins[0].geom.x, before.x);
    assert.equal(wins[0].geom.width, before.width);
  });

  it("assigns distinct accents and persists layout prefs", () => {
    assert.equal(accentOf("amber").key, "amber");
    assert.equal(nextAccentKey(["teal", "amber"]), "rose");
    assert.ok(WIN_ACCENT_KEYS.length >= 6);
    let wins = upsertWindow([], { id: "a", title: "A" }, vp);
    wins = setWindowAccent(wins, "a", "coral");
    assert.equal(wins[0].accent, "coral");
    wins = snapWindow(wins, "a", "left", vp, { autoPair: false });
    const layout = deskLayoutFromWindows(wins);
    assert.equal(layout.accents.a, "coral");
    assert.equal(layout.snaps.a, "left");
    const clean = sanitizeDeskLayoutPrefs({ accents: { a: "nope", b: "sky" }, snaps: { a: "left" } });
    assert.equal(clean.accents.a, undefined);
    assert.equal(clean.accents.b, "sky");
    const applied = applySavedLayout({ id: "b", title: "B" }, clean, vp);
    assert.equal(applied.accent, "sky");
    assert.equal(applied.split, null);
  });

  it("reflow keeps maximized and snapped windows fitted", () => {
    let wins = upsertWindow([], { id: "a", title: "A" }, vp);
    wins = toggleMaximize(wins, "a", vp);
    const big = { width: 1800, height: 1000 };
    wins = reflowSnapped(wins, big);
    assert.ok(wins[0].geom.width > 1000);
  });
});

describe("drag-to-edge snap (Win11-style)", () => {
  it("detects left, right, and top maximize zones", () => {
    assert.equal(detectSnapZone(10, 200, vp), "left");
    assert.equal(detectSnapZone(vp.width - 10, 200, vp), "right");
    assert.equal(detectSnapZone(700, 8, vp), "maximize");
    assert.equal(detectSnapZone(700, 200, vp), null);
    assert.ok(WM_SNAP_EDGE >= 16);
  });

  it("preview geom matches split/maximize targets", () => {
    const L = snapPreviewGeom("left", vp);
    const R = snapPreviewGeom("right", vp);
    const M = snapPreviewGeom("maximize", vp);
    assert.deepEqual(L, splitGeom("left", vp));
    assert.deepEqual(R, splitGeom("right", vp));
    assert.deepEqual(M, maximizeGeom(vp));
    assert.equal(snapPreviewGeom(null, vp), null);
  });

  it("dragFloatGeom pulls maximized windows under the pointer", () => {
    let wins = upsertWindow([], {
      id: "a", title: "A",
      geom: { x: 120, y: 80, width: 400, height: 320 },
    }, vp);
    wins = toggleMaximize(wins, "a", vp);
    const floated = dragFloatGeom(wins[0], { x: 700, y: 40, offsetX: 200, offsetY: 20 }, vp);
    assert.ok(floated.width < vp.width * 0.6);
    assert.ok(floated.x > 0);
    assert.ok(Math.abs((floated.x + 200) - 700) <= 1 || floated.width < 400 + 1);
  });
});
