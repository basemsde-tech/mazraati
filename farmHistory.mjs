/* Archive volatile history instead of silently dropping it.
   Keeps protected money rows in `entries`; moves overflow into `archive`. */

export const ARCHIVE_SOFT_CAP = 5000;

/**
 * @param {any[]} list
 * @param {Set<string>} protectedTypes
 * @param {{ maxLive?: number, archive?: any[] }} opts
 */
export function retainEntries(list, protectedTypes, opts = {}) {
  const maxLive = opts.maxLive ?? 2000;
  const priorArchive = Array.isArray(opts.archive) ? opts.archive : [];
  const keep = [];
  const vol = [];
  (list || []).forEach((e) => {
    if (e && protectedTypes.has(e.type)) keep.push(e);
    else vol.push(e);
  });
  const liveVol = vol.slice(0, maxLive);
  const overflow = vol.slice(maxLive).map((e) => ({
    ...e,
    archivedAt: e.archivedAt || new Date().toISOString(),
  }));
  const archive = [...overflow, ...priorArchive].slice(0, ARCHIVE_SOFT_CAP);
  const entries = [...keep, ...liveVol];
  return { entries, archive, archivedCount: overflow.length };
}

/** Build a downloadable JSON backup of the farm document. */
export function buildFarmBackup(farm, meta = {}) {
  const body = {
    app: "mazraati",
    kind: "farm-backup",
    exportedAt: new Date().toISOString(),
    ...meta,
    farm: farm || {},
  };
  return JSON.stringify(body, null, 2);
}

export function parseFarmBackup(text) {
  const raw = JSON.parse(String(text || ""));
  if (raw && raw.kind === "farm-backup" && raw.farm) return raw.farm;
  if (raw && raw.entries && raw.settings) return raw;
  throw new Error("bad-backup");
}
