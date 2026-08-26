/* Void / write-off sales as one farm-document rewrite.
   Milk stock is derived: removing a milk sale restores the tank.
   Write-off keeps stock down by posting a milkUse against the same litres. */

import { milkRecordLiters, milkQty2 } from "./milkUnits.mjs";

export const VOID_RESTORE = "restore";
export const VOID_WRITEOFF = "writeoff";
export const VOID_REASON_MIN = 3;

const dayKey = (v) => {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v || "").slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nid = (idFn, prefix) => {
  const raw = typeof idFn === "function" ? idFn() : Math.random().toString(36).slice(2, 9);
  return `${prefix}${raw}`;
};

export function saleIdsOf(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map((x) => (x && typeof x === "object" ? x.id : x)).filter(Boolean))];
}

/** Drop a sale and every ledger row that points at it (payments, reimbursements, offset expenses). */
export function purgeSaleClusters(list, saleIds) {
  const ids = new Set(saleIdsOf(saleIds));
  if (!ids.size) return list || [];
  const src = list || [];
  const drop = new Set();
  src.forEach((e) => {
    if (!e || !e.id) return;
    if (e.type === "sale" && ids.has(e.id)) drop.add(e.id);
    if (e.saleId && ids.has(e.saleId)) drop.add(e.id);
  });
  let grew = true;
  while (grew) {
    grew = false;
    src.forEach((e) => {
      if (!e || !e.id || drop.has(e.id)) return;
      if ((e.saleReimburseId && drop.has(e.saleReimburseId))
        || (e.paymentId && drop.has(e.paymentId))
        || (e.saleId && drop.has(e.saleId))) {
        drop.add(e.id);
        grew = true;
      }
    });
  }
  return src.filter((e) => !e.id || !drop.has(e.id));
}

export function milkOnHandLiters(list, asOf) {
  let produced = 0;
  let deduct = 0;
  const seen = {};
  (list || []).forEach((e) => {
    if (!e) return;
    if (asOf && dayKey(e.at) > asOf) return;
    if (e.id && seen[`${e.type}:${e.id}`]) return;
    if (e.id) seen[`${e.type}:${e.id}`] = 1;
    if (e.type === "milk" || e.type === "milkBulk") produced += milkRecordLiters(e);
    else if (e.type === "sale" && (e.product || "milk") === "milk") deduct += milkRecordLiters(e);
    else if (e.type === "milkUse") deduct += milkRecordLiters(e);
  });
  return milkQty2(Math.max(0, produced - deduct));
}

function animalIdsOnSale(sale) {
  const ids = [];
  if (sale && sale.animalId) ids.push(sale.animalId);
  if (sale && Array.isArray(sale.animalIds)) sale.animalIds.forEach((id) => { if (id) ids.push(id); });
  return [...new Set(ids)];
}

function snapshotSale(sale) {
  if (!sale) return null;
  return {
    id: sale.id,
    no: sale.no || "",
    product: sale.product || "milk",
    qty: sale.qty || 0,
    unit: sale.unit || "",
    amount: sale.amount || 0,
    customerId: sale.customerId || "",
    animalId: sale.animalId || "",
    at: sale.at || "",
  };
}

/**
 * @param {object} opts
 * @param {"restore"|"writeoff"} opts.mode
 * @returns {{ ok: boolean, error?: string, entries?: object[], animalUpdates?: object[], audit?: object, overflowLiters?: number }}
 */
export function voidSales({
  entries = [],
  animals = [],
  saleIds = [],
  mode,
  reason = "",
  at,
  byId = null,
  byName = "",
  idFn,
  tankMaxLiters = 0,
} = {}) {
  const why = String(reason || "").trim();
  if (why.length < VOID_REASON_MIN) return { ok: false, error: "voidReasonNeeded", entries: [] };
  if (mode !== VOID_RESTORE && mode !== VOID_WRITEOFF) return { ok: false, error: "voidModeNeeded", entries: [] };

  const ids = saleIdsOf(saleIds);
  if (!ids.length) return { ok: false, error: "voidNoSales", entries: [] };

  const src = entries || [];
  const sales = ids.map((id) => src.find((e) => e && e.id === id && e.type === "sale")).filter(Boolean);
  if (!sales.length) return { ok: false, error: "voidNoSales", entries: [] };

  const missing = ids.filter((id) => !sales.some((s) => s.id === id));
  if (missing.length) return { ok: false, error: "voidMissingSale", entries: [] };

  let next = purgeSaleClusters(src, ids);

  const extras = [];
  const when = at || new Date().toISOString();
  const stamp = { byId, byName: byName || "—", loggedAt: when };

  if (mode === VOID_WRITEOFF) {
    sales.forEach((sale) => {
      if ((sale.product || "milk") !== "milk") return;
      const liters = milkRecordLiters(sale);
      if (!(liters > 0)) return;
      extras.push({
        id: nid(idFn, "use-"),
        type: "milkUse",
        qty: liters,
        liters,
        kg: sale.kg != null ? sale.kg : undefined,
        unit: sale.unit || "L",
        reason: "void-writeoff",
        reasonLabel: why,
        note: why,
        voidOf: sale.id,
        at: sale.at || when,
        ...stamp,
      });
    });
  }

  const after = [...extras, ...next];
  const tank = +(tankMaxLiters || 0);
  if (mode === VOID_RESTORE && tank > 0) {
    const onHand = milkOnHandLiters(after, dayKey(when));
    if (onHand > tank + 0.001) {
      return { ok: false, error: "voidTankOverflow", overflowLiters: onHand, tankMaxLiters: tank, entries: [] };
    }
  }

  const animalUpdates = [];
  if (mode === VOID_RESTORE) {
    const byAnimal = Object.fromEntries((animals || []).map((a) => [a.id, a]));
    sales.forEach((sale) => {
      animalIdsOnSale(sale).forEach((aid) => {
        const a = byAnimal[aid];
        if (!a) return;
        const prev = sale.animalStatusBefore || a.prevStatus || "healthy";
        if (a.status === "sold" || sale.product === "animal") {
          animalUpdates.push({ ...a, status: prev === "sold" ? "healthy" : prev });
        }
      });
    });
  }

  const audit = {
    id: nid(idFn, "void-"),
    type: "saleVoid",
    mode,
    reason: why,
    saleIds: sales.map((s) => s.id),
    count: sales.length,
    snapshot: sales.map(snapshotSale),
    at: when,
    ...stamp,
  };

  return {
    ok: true,
    entries: [audit, ...after],
    animalUpdates,
    audit,
    sales,
  };
}
