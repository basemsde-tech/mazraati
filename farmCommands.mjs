/* One shared path for money / ledger mutations.
   Callers pass a command; applyFarmCommand stamps, merges, and returns next farm. */

const MONEY_TYPES = new Set([
  "sale", "payment", "expense", "feed", "pay_supplier", "pay_worker",
  "manager_in", "manager_out", "fund_in", "fund_out", "owner_draw",
  "void", "adjust", "transfer", "opening",
]);

export function isMoneyType(type) {
  return MONEY_TYPES.has(String(type || ""));
}

/**
 * @param {object} farm
 * @param {{ op: string, entries?: any[], patch?: object, profile?: object, now?: string }} cmd
 * @param {{ trim?: Function, mergeById?: Function, emptyFarm?: Function }} helpers
 */
export function applyFarmCommand(farm, cmd, helpers = {}) {
  const { trim, mergeById, emptyFarm } = helpers;
  const base = farm || (emptyFarm ? emptyFarm() : {});
  const author = cmd.profile || null;
  const now = cmd.now || new Date().toISOString();
  const op = String(cmd.op || "commit");

  if (op === "replaceFarm" && cmd.farm) {
    return { farm: cmd.farm, stamped: [], op };
  }

  if (op === "rewriteEntries" && typeof cmd.map === "function") {
    const next = cmd.map(base.entries || []);
    const entries = trim ? trim(next) : next;
    return { farm: { ...base, ...(cmd.patch || {}), entries }, stamped: [], op };
  }

  const newEntries = Array.isArray(cmd.entries) ? cmd.entries : [];
  const stamped = newEntries.map((e, i) => ({
    id: e.id || `${Date.now().toString(36)}-${i}-${author?.id || "x"}`,
    at: now,
    ...e,
    loggedAt: e.loggedAt || now,
    byId: author?.id || null,
    byName: author ? author.name : "—",
    cmdOp: op,
  }));

  const { replace, ...patchRest } = cmd.patch || {};
  const merge = (key, list) => {
    if (replace?.[key]) return list || [];
    if (!list) return base[key];
    return mergeById ? mergeById(base[key], list) : list;
  };

  const merged = {
    ...base,
    ...patchRest,
    profiles: merge("profiles", patchRest.profiles),
    animals: merge("animals", patchRest.animals),
    workers: merge("workers", patchRest.workers),
    customers: merge("customers", patchRest.customers),
    suppliers: merge("suppliers", patchRest.suppliers),
    managers: merge("managers", patchRest.managers),
    funders: merge("funders", patchRest.funders != null ? patchRest.funders
      : (patchRest.managers != null ? patchRest.managers : undefined)),
    obligations: merge("obligations", patchRest.obligations),
    entries: trim
      ? trim([...stamped, ...(base.entries || [])])
      : [...stamped, ...(base.entries || [])],
  };

  return { farm: merged, stamped, op };
}

/** Snapshot for undo of delete / void. */
export function undoSnapshot(entries, ids) {
  const idSet = new Set((ids || []).map(String));
  const removed = (entries || []).filter((e) => e && idSet.has(String(e.id)));
  return { ids: [...idSet], removed };
}

export function restoreRemoved(entries, snap) {
  if (!snap?.removed?.length) return entries || [];
  const have = new Set((entries || []).map((e) => String(e.id)));
  const add = snap.removed.filter((e) => e && !have.has(String(e.id)));
  return [...add, ...(entries || [])];
}
