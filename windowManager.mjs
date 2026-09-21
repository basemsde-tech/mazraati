/* Desk window manager — tabs + floating subwindows with z-order focus.
   Pure helpers stay free of React so geometry and stacking can be tested. */

export const WM_MIN_W = 320;
export const WM_MIN_H = 240;
export const WM_Z_BASE = 40;
export const WM_SPLIT_GAP = 10;
export const WM_SPLIT_PAD = 12;
/** Reserved bottom height for the Win11-style taskbar (snap/maximize clear this). */
export const WM_DOCK_H = 64;
/** How close the pointer must be to a screen edge to preview/commit a Win11-style snap. */
export const WM_SNAP_EDGE = 28;
export const WM_SNAP_TOP = 18;

/** Core desk modules that can stay open as workspace tabs / floating windows. */
export const MODULE_ROUTES = Object.freeze([
  "dashboard", "managers", "animals", "entry", "sales", "suppliers", "expenses", "reports", "settings",
]);

/** Distinct accents so concurrent windows stay visually separable. */
export const WIN_ACCENTS = Object.freeze({
  teal: { key: "teal", color: "#0F766E", soft: "rgba(15,118,110,.16)" },
  amber: { key: "amber", color: "#B45309", soft: "rgba(180,83,9,.16)" },
  rose: { key: "rose", color: "#BE123C", soft: "rgba(190,18,60,.14)" },
  sky: { key: "sky", color: "#0369A1", soft: "rgba(3,105,161,.14)" },
  violet: { key: "violet", color: "#6D28D9", soft: "rgba(109,40,217,.14)" },
  olive: { key: "olive", color: "#4D7C0F", soft: "rgba(77,124,15,.16)" },
  coral: { key: "coral", color: "#C2410C", soft: "rgba(194,65,12,.15)" },
  slate: { key: "slate", color: "#475569", soft: "rgba(71,85,105,.16)" },
});

export const WIN_ACCENT_KEYS = Object.freeze(Object.keys(WIN_ACCENTS));
export const SPLIT_ZONES = Object.freeze(["left", "right", "top", "bottom"]);

export function isModuleRoute(route) {
  return MODULE_ROUTES.includes(route);
}

export function moduleWinId(route) {
  return `mod:${route}`;
}

export function routeOfModuleWin(id) {
  if (typeof id !== "string" || !id.startsWith("mod:")) return null;
  const route = id.slice(4);
  return isModuleRoute(route) ? route : null;
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function accentOf(key) {
  return WIN_ACCENTS[key] || WIN_ACCENTS.teal;
}

export function nextAccentKey(used = []) {
  const taken = new Set((used || []).filter(Boolean));
  const free = WIN_ACCENT_KEYS.find((k) => !taken.has(k));
  if (free) return free;
  return WIN_ACCENT_KEYS[taken.size % WIN_ACCENT_KEYS.length];
}

export function normalizeGeom(geom = {}, viewport = {}) {
  const vw = Math.max(WM_MIN_W, +(viewport.width || 1280));
  const vh = Math.max(WM_MIN_H, +(viewport.height || 800));
  const width = clamp(Math.round(+(geom.width || Math.min(520, vw * 0.42))), WM_MIN_W, vw);
  const height = clamp(Math.round(+(geom.height || Math.min(560, vh * 0.72))), WM_MIN_H, vh);
  const x = clamp(Math.round(+(geom.x ?? Math.max(24, (vw - width) / 2))), 0, Math.max(0, vw - WM_MIN_W));
  const y = clamp(Math.round(+(geom.y ?? Math.max(24, (vh - height) / 5))), 0, Math.max(0, vh - 48));
  return { x, y, width, height };
}

/** Full workspace bounds (leaves room for the bottom tray). */
export function maximizeGeom(viewport = {}, opts = {}) {
  const vw = Math.max(WM_MIN_W, +(viewport.width || 1280));
  const vh = Math.max(WM_MIN_H, +(viewport.height || 800));
  const pad = opts.pad != null ? +opts.pad : WM_SPLIT_PAD;
  const dockH = opts.dockH != null ? +opts.dockH : WM_DOCK_H;
  return normalizeGeom({
    x: pad,
    y: pad,
    width: vw - pad * 2,
    height: Math.max(WM_MIN_H, vh - pad * 2 - dockH),
  }, viewport);
}

/**
 * Win11-style edge hit-test while dragging a window.
 * Top → maximize; left/right → half snap. Returns null when away from edges.
 */
export function detectSnapZone(x, y, viewport = {}, opts = {}) {
  const vw = Math.max(WM_MIN_W, +(viewport.width || 1280));
  const edge = opts.edge != null ? +opts.edge : WM_SNAP_EDGE;
  const topEdge = opts.top != null ? +opts.top : WM_SNAP_TOP;
  const cx = +x;
  const cy = +y;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  if (cy <= topEdge) return "maximize";
  if (cx <= edge) return "left";
  if (cx >= vw - edge) return "right";
  return null;
}

/** Geometry used for the live snap preview overlay (and commit targets). */
export function snapPreviewGeom(zone, viewport = {}, opts = {}) {
  if (zone === "maximize") return maximizeGeom(viewport, opts);
  if (SPLIT_ZONES.includes(zone)) return splitGeom(zone, viewport, opts);
  return null;
}

/**
 * Floating size/position when the user starts dragging a maximized or snapped
 * window — title bar stays under the pointer (Win11 “pull off” behavior).
 */
export function dragFloatGeom(win = {}, pointer = {}, viewport = {}) {
  const vw = Math.max(WM_MIN_W, +(viewport.width || 1280));
  const vh = Math.max(WM_MIN_H, +(viewport.height || 800));
  const base = normalizeGeom(
    (win.maximized && win.restoreGeom) ? win.restoreGeom : (win.geom || {}),
    viewport,
  );
  let width = base.width;
  let height = base.height;
  if (win.maximized || win.split) {
    if (width > vw * 0.7) width = Math.min(520, Math.round(vw * 0.42));
    if (height > vh * 0.85) height = Math.min(560, Math.round(vh * 0.72));
  }
  width = clamp(Math.round(width), WM_MIN_W, vw);
  height = clamp(Math.round(height), WM_MIN_H, vh);
  const px = Number.isFinite(+pointer.x) ? +pointer.x : base.x + width / 2;
  const py = Number.isFinite(+pointer.y) ? +pointer.y : base.y + 16;
  const grabX = clamp(
    Number.isFinite(+pointer.offsetX) ? +pointer.offsetX : width / 2,
    24,
    Math.max(24, width - 24),
  );
  const grabY = clamp(
    Number.isFinite(+pointer.offsetY) ? +pointer.offsetY : 18,
    8,
    40,
  );
  return normalizeGeom({
    x: px - grabX,
    y: py - grabY,
    width,
    height,
  }, viewport);
}

/** Geometry for a docked half of the viewport (side-by-side / stacked). */
export function splitGeom(zone, viewport = {}, opts = {}) {
  const vw = Math.max(WM_MIN_W, +(viewport.width || 1280));
  const vh = Math.max(WM_MIN_H, +(viewport.height || 800));
  const pad = opts.pad != null ? +opts.pad : WM_SPLIT_PAD;
  const gap = opts.gap != null ? +opts.gap : WM_SPLIT_GAP;
  const dockH = opts.dockH != null ? +opts.dockH : WM_DOCK_H;
  const top = pad;
  const bottom = Math.max(pad + WM_MIN_H, vh - pad - dockH);
  const left = pad;
  const right = vw - pad;
  const midX = Math.round((left + right - gap) / 2);
  const midY = Math.round((top + bottom - gap) / 2);
  const halfW = Math.max(WM_MIN_W, midX - left);
  const halfH = Math.max(WM_MIN_H, midY - top);
  const fullW = Math.max(WM_MIN_W, right - left);
  const fullH = Math.max(WM_MIN_H, bottom - top);
  switch (zone) {
    case "left":
      return normalizeGeom({ x: left, y: top, width: halfW, height: fullH }, viewport);
    case "right":
      return normalizeGeom({ x: midX + gap, y: top, width: halfW, height: fullH }, viewport);
    case "top":
      return normalizeGeom({ x: left, y: top, width: fullW, height: halfH }, viewport);
    case "bottom":
      return normalizeGeom({ x: left, y: midY + gap, width: fullW, height: halfH }, viewport);
    default:
      return normalizeGeom({}, viewport);
  }
}

export function nextZ(windows) {
  const max = (windows || []).reduce((m, w) => Math.max(m, +(w.z || 0)), WM_Z_BASE - 1);
  return max + 1;
}

export function focusWindow(windows, id) {
  const list = windows || [];
  if (!list.some((w) => w.id === id)) return list;
  const z = nextZ(list);
  return list.map((w) => (w.id === id ? { ...w, z, minimized: false } : w));
}

function pickAccent(win, existing, list) {
  if (WIN_ACCENTS[win.accent]) return win.accent;
  if (existing && WIN_ACCENTS[existing.accent]) return existing.accent;
  return nextAccentKey(list.map((w) => w.accent));
}

export function upsertWindow(windows, win, viewport) {
  const list = windows || [];
  const geom = normalizeGeom(win.geom || win, viewport);
  const existing = list.find((w) => w.id === win.id);
  const accent = pickAccent(win, existing, list);
  const split = SPLIT_ZONES.includes(win.split) ? win.split
    : (existing && SPLIT_ZONES.includes(existing.split) ? existing.split : null);
  const maximized = win.maximized != null ? !!win.maximized
    : (existing ? !!existing.maximized : false);
  if (existing) {
    const mergedGeom = maximized
      ? maximizeGeom(viewport)
      : (split ? splitGeom(split, viewport) : normalizeGeom({ ...existing.geom, ...geom }, viewport));
    return focusWindow(
      list.map((w) => (w.id === win.id
        ? {
          ...w, ...win, accent, split: maximized ? null : split,
          maximized,
          restoreGeom: maximized
            ? (win.restoreGeom || existing.restoreGeom || existing.geom || geom)
            : (win.restoreGeom || existing.restoreGeom || null),
          geom: mergedGeom,
          minimized: false,
        }
        : w)),
      win.id,
    );
  }
  return [...list, {
    id: win.id,
    kind: win.kind || "panel",
    title: win.title || "",
    payload: win.payload || null,
    accent,
    split: maximized ? null : (split || null),
    maximized,
    restoreGeom: maximized ? (win.restoreGeom || geom) : null,
    geom: maximized ? maximizeGeom(viewport) : (split ? splitGeom(split, viewport) : geom),
    z: nextZ(list),
    minimized: false,
  }];
}

export function closeWindow(windows, id) {
  return (windows || []).filter((w) => w.id !== id);
}

export function moveWindow(windows, id, patch, viewport) {
  return (windows || []).map((w) => {
    if (w.id !== id) return w;
    /* Manual drag exits maximize + snap so the window is free-floating again. */
    return {
      ...w,
      split: null,
      maximized: false,
      restoreGeom: null,
      geom: normalizeGeom({ ...w.geom, ...patch }, viewport),
    };
  });
}

export function resizeWindow(windows, id, patch, viewport) {
  return (windows || []).map((w) => {
    if (w.id !== id) return w;
    if (w.maximized) return w;
    return {
      ...w,
      geom: normalizeGeom({ ...w.geom, ...patch }, viewport),
    };
  });
}

export function toggleMinimize(windows, id) {
  return (windows || []).map((w) => {
    if (w.id !== id) return w;
    return { ...w, minimized: !w.minimized };
  });
}

/** Expand to fill the workspace, remembering the prior geom for restore. */
export function maximizeWindow(windows, id, viewport, opts = {}) {
  return (windows || []).map((w) => {
    if (w.id !== id) return w;
    if (w.maximized) return w;
    const restoreGeom = normalizeGeom(w.geom || {}, viewport);
    return {
      ...w,
      maximized: true,
      minimized: false,
      split: null,
      restoreGeom,
      geom: maximizeGeom(viewport, opts),
      z: nextZ(windows),
    };
  });
}

/** Return from maximized (or maximized+toggle) to the remembered size/position. */
export function restoreWindow(windows, id, viewport) {
  return (windows || []).map((w) => {
    if (w.id !== id) return w;
    if (!w.maximized) return { ...w, minimized: false };
    const geom = normalizeGeom(w.restoreGeom || w.geom || {}, viewport);
    return {
      ...w,
      maximized: false,
      minimized: false,
      restoreGeom: null,
      geom,
      z: nextZ(windows),
    };
  });
}

export function toggleMaximize(windows, id, viewport, opts = {}) {
  const cur = (windows || []).find((w) => w.id === id);
  if (!cur) return windows || [];
  if (cur.maximized) return restoreWindow(windows, id, viewport);
  return maximizeWindow(windows, id, viewport, opts);
}

export function setWindowAccent(windows, id, accent) {
  const key = WIN_ACCENTS[accent] ? accent : "teal";
  return (windows || []).map((w) => (w.id === id ? { ...w, accent: key } : w));
}

/**
 * Dock a window into a split zone. Clears maximize. Optionally auto-pairs
 * another free window into the opposite half for true side-by-side.
 */
export function snapWindow(windows, id, zone, viewport, opts = {}) {
  const list = windows || [];
  if (!list.some((w) => w.id === id)) return list;
  if (!SPLIT_ZONES.includes(zone)) {
    return list.map((w) => (w.id === id
      ? { ...w, split: null, maximized: false, minimized: false }
      : w));
  }
  const opposite = { left: "right", right: "left", top: "bottom", bottom: "top" }[zone];
  let next = list.map((w) => {
    if (w.id === id) {
      return {
        ...w,
        split: zone,
        maximized: false,
        restoreGeom: null,
        minimized: false,
        geom: splitGeom(zone, viewport, opts),
      };
    }
    if (w.split === zone) return { ...w, split: null };
    return w;
  });
  if (opts.autoPair !== false) {
    const peer = sortByZ(next)
      .filter((w) => w.id !== id && !w.minimized && !w.split && !w.maximized)
      .pop();
    const hasOpposite = next.some((w) => w.split === opposite && !w.minimized);
    if (peer && !hasOpposite) {
      next = next.map((w) => (w.id === peer.id
        ? {
          ...w,
          split: opposite,
          maximized: false,
          restoreGeom: null,
          geom: splitGeom(opposite, viewport, opts),
          minimized: false,
        }
        : w));
    }
  }
  return focusWindow(next, id);
}

export function clearWindowSnap(windows, id, viewport) {
  return (windows || []).map((w) => {
    if (w.id !== id) return w;
    return {
      ...w,
      split: null,
      maximized: false,
      restoreGeom: null,
      geom: normalizeGeom(w.restoreGeom || w.geom || {}, viewport),
      minimized: false,
    };
  });
}

/** Re-apply snap / maximize geometry after a viewport resize. */
export function reflowSnapped(windows, viewport, opts = {}) {
  return (windows || []).map((w) => {
    if (w.minimized) return w;
    if (w.maximized) return { ...w, geom: maximizeGeom(viewport, opts) };
    if (SPLIT_ZONES.includes(w.split)) return { ...w, geom: splitGeom(w.split, viewport, opts) };
    return w;
  });
}

/** Tile the two highest visible windows left/right. */
export function tileSideBySide(windows, viewport, opts = {}) {
  const visible = sortByZ(windows || []).filter((w) => !w.minimized);
  if (visible.length < 2) return windows || [];
  const a = visible[visible.length - 1];
  const b = visible[visible.length - 2];
  let next = snapWindow(windows, a.id, "left", viewport, { ...opts, autoPair: false });
  next = snapWindow(next, b.id, "right", viewport, { ...opts, autoPair: false });
  return focusWindow(next, a.id);
}

export function sortByZ(windows) {
  return (windows || []).slice().sort((a, b) => (+a.z || 0) - (+b.z || 0));
}

export function activeWindowId(windows) {
  const list = windows || [];
  if (!list.length) return null;
  return sortByZ(list).filter((w) => !w.minimized).pop()?.id
    || sortByZ(list).pop()?.id
    || null;
}

export function openTab(ids, id) {
  const list = ids || [];
  if (list.includes(id)) return list;
  return [...list, id];
}

export function closeTab(ids, id, selected) {
  const next = (ids || []).filter((x) => x !== id);
  let sel = selected;
  if (selected === id) sel = next.length ? next[next.length - 1] : null;
  return { ids: next, selected: sel };
}

export function selectTab(ids, id) {
  if (!(ids || []).includes(id)) return { ids: openTab(ids, id), selected: id };
  return { ids, selected: id };
}

export function openModule(ids, route) {
  if (!isModuleRoute(route)) return ids || [];
  return openTab(ids, route);
}

export function closeModule(ids, route, selected, fallback = "dashboard") {
  if (!isModuleRoute(route)) return { ids: ids || [], selected };
  const closed = closeTab(ids, route, selected);
  if (closed.ids.length) return closed;
  const keep = isModuleRoute(fallback) ? fallback : "dashboard";
  return { ids: [keep], selected: keep };
}

export function floatingModuleRoutes(windows) {
  return new Set(
    (windows || [])
      .filter((w) => w.kind === "module" && !w.minimized)
      .map((w) => w.payload?.route || routeOfModuleWin(w.id))
      .filter(isModuleRoute),
  );
}

/** Device-local layout prefs: accents + last snap/geometry per window id. */
export function sanitizeDeskLayoutPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const accents = {};
  Object.entries(src.accents || {}).forEach(([id, key]) => {
    if (typeof id === "string" && WIN_ACCENTS[key]) accents[id] = key;
  });
  const snaps = {};
  Object.entries(src.snaps || {}).forEach(([id, zone]) => {
    if (typeof id === "string" && SPLIT_ZONES.includes(zone)) snaps[id] = zone;
  });
  const geoms = {};
  Object.entries(src.geoms || {}).forEach(([id, g]) => {
    if (typeof id !== "string" || !g || typeof g !== "object") return;
    geoms[id] = normalizeGeom(g, { width: 1920, height: 1080 });
  });
  const maximized = {};
  Object.entries(src.maximized || {}).forEach(([id, on]) => {
    if (typeof id === "string" && on) maximized[id] = true;
  });
  return { accents, snaps, geoms, maximized };
}

export function deskLayoutFromWindows(windows) {
  const accents = {};
  const snaps = {};
  const geoms = {};
  const maximized = {};
  (windows || []).forEach((w) => {
    if (!w || !w.id) return;
    if (WIN_ACCENTS[w.accent]) accents[w.id] = w.accent;
    if (SPLIT_ZONES.includes(w.split)) snaps[w.id] = w.split;
    const g = w.maximized && w.restoreGeom ? w.restoreGeom : w.geom;
    if (g) geoms[w.id] = normalizeGeom(g, { width: 1920, height: 1080 });
    if (w.maximized) maximized[w.id] = true;
  });
  return { accents, snaps, geoms, maximized };
}

/** Apply saved accents/snaps onto a window about to open (does not invent windows). */
export function applySavedLayout(win, layout, viewport) {
  const prefs = sanitizeDeskLayoutPrefs(layout);
  const accent = prefs.accents[win.id] || win.accent || nextAccentKey([]);
  const split = prefs.snaps[win.id] || win.split || null;
  const savedGeom = prefs.geoms[win.id];
  const maximized = !!(prefs.maximized[win.id] || win.maximized);
  const baseGeom = normalizeGeom(win.geom || savedGeom || {}, viewport);
  return {
    ...win,
    accent: WIN_ACCENTS[accent] ? accent : "teal",
    split: maximized ? null : (SPLIT_ZONES.includes(split) ? split : null),
    maximized,
    restoreGeom: maximized ? baseGeom : null,
    geom: maximized
      ? maximizeGeom(viewport)
      : (SPLIT_ZONES.includes(split) ? splitGeom(split, viewport) : baseGeom),
  };
}
