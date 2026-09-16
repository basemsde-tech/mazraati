/* Desk window manager — tabs + floating subwindows with z-order focus.
   Pure helpers stay free of React so geometry and stacking can be tested. */

export const WM_MIN_W = 320;
export const WM_MIN_H = 240;
export const WM_Z_BASE = 40;

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
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

export function upsertWindow(windows, win, viewport) {
  const list = windows || [];
  const geom = normalizeGeom(win.geom || win, viewport);
  const existing = list.find((w) => w.id === win.id);
  if (existing) {
    return focusWindow(
      list.map((w) => (w.id === win.id
        ? { ...w, ...win, geom: normalizeGeom({ ...w.geom, ...geom }, viewport), minimized: false }
        : w)),
      win.id,
    );
  }
  return [...list, {
    id: win.id,
    kind: win.kind || "panel",
    title: win.title || "",
    payload: win.payload || null,
    geom,
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
    return { ...w, geom: normalizeGeom({ ...w.geom, ...patch }, viewport) };
  });
}

export function resizeWindow(windows, id, patch, viewport) {
  return moveWindow(windows, id, patch, viewport);
}

export function toggleMinimize(windows, id) {
  return (windows || []).map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w));
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
