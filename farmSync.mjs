/* Safer sync: revision bump + optional entry patch (farmJson remains fallback). */

export function nextFarmRev(farm) {
  const n = Number(farm?.farmRev) || 0;
  return n + 1;
}

export function withFarmRev(farm) {
  const next = nextFarmRev(farm);
  return { ...farm, farmRev: next, farmRevAt: new Date().toISOString() };
}

/**
 * Merge remote farm with local pending when revisions allow.
 * If remote.farmRev > local.farmRev and local has no pendingWrites, take remote.
 * If local has pending and remote is ahead, keep local entries by id merge (additive).
 */
export function mergeFarmsByRev(local, remote, { mergeById } = {}) {
  if (!remote) return local;
  if (!local) return remote;
  const lr = Number(local.farmRev) || 0;
  const rr = Number(remote.farmRev) || 0;
  if (rr <= lr) {
    return local;
  }
  // Remote ahead: prefer remote lists, but never drop local entries missing remotely.
  const remIds = new Set((remote.entries || []).map((e) => String(e.id)));
  const localOnly = (local.entries || []).filter((e) => e && !remIds.has(String(e.id)));
  const entries = [...localOnly, ...(remote.entries || [])];
  const archive = [
    ...(remote.archive || []),
    ...((local.archive || []).filter((e) => e && !remIds.has(String(e.id)))),
  ].slice(0, 5000);
  const merge = (a, b) => (mergeById ? mergeById(a || [], b || []) : (b || a || []));
  return {
    ...remote,
    profiles: merge(local.profiles, remote.profiles),
    animals: merge(local.animals, remote.animals),
    workers: merge(local.workers, remote.workers),
    customers: merge(local.customers, remote.customers),
    suppliers: merge(local.suppliers, remote.suppliers),
    managers: merge(local.managers, remote.managers),
    funders: merge(local.funders || local.managers, remote.funders || remote.managers),
    obligations: merge(local.obligations, remote.obligations),
    entries,
    archive,
    farmRev: Math.max(lr, rr),
  };
}

/** Build a small patch payload for one entry change (for future RTDB /entries path). */
export function entryPatchPayload(entry, farmRev) {
  return {
    id: entry?.id,
    entry,
    farmRev: farmRev || 0,
    at: new Date().toISOString(),
  };
}
