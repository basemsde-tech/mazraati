/* Manager Ledger & Funds Tracker
   Per-person capital: positive balance = business owes them.
   Movements may touch Cashbox, Expenses, Suppliers, or Sales. */

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);

export const MGR_FUNDED = "manager";
export const MGR_OOP_ORIGIN = "manager_oop";
export const MGR_RETAINED = "manager";

export const OWNER_FUND_TYPE = "ownerFund";
export const OWNER_FUND_WITHDRAW_TYPE = "ownerFundWithdraw";

const dayOf = (v) => {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function managerIdOf(e) {
  if (!e) return null;
  return e.managerId || e.funderId || e.takenBy || null;
}

export function matchManagerId(managers, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  const hit = (managers || []).find((m) => !m.archived && String(m.name || "").trim().toLowerCase() === n);
  return hit ? hit.id : null;
}

export function managerNameOf(managers, id, fallback = "") {
  if (!id) return fallback || "";
  const hit = (managers || []).find((m) => m && m.id === id);
  return hit ? String(hit.name || "").trim() : (fallback || "");
}

export function resolveManagerRef(managers, managerId, name, makeId) {
  const label = String(name || "").trim();
  let id = managerId || null;
  let list = Array.isArray(managers) ? managers.slice() : [];
  let changed = false;
  if (!id && label) id = matchManagerId(list, label);
  if (!id && label) {
    id = typeof makeId === "function" ? makeId() : `mgr-${Date.now()}`;
    list = [...list, { id, name: label, phone: "", note: "", at: new Date().toISOString() }];
    changed = true;
  }
  const hit = list.find((m) => m.id === id);
  return {
    managerId: id || null,
    name: (hit && hit.name) || label,
    managers: list,
    changed,
  };
}

/** Migrate legacy funders[] → managers[] and funderId → managerId. */
export function migrateManagersFarm(farm, makeId) {
  if (!farm) return farm;
  const f = { ...farm };
  const fromFunders = Array.isArray(f.funders) ? f.funders : [];
  let managers = Array.isArray(f.managers) ? f.managers.map((m) => ({ ...m })) : [];
  if (!managers.length && fromFunders.length) {
    managers = fromFunders.map((row) => ({ ...row }));
  }
  const byName = new Map();
  managers.forEach((m) => {
    const key = String(m.name || "").trim().toLowerCase();
    if (key) byName.set(key, m);
  });
  const idOf = typeof makeId === "function" ? makeId : () => `mgr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  f.entries = (f.entries || []).map((e) => {
    let row = e;
    if (e.funderId && !e.managerId) row = { ...row, managerId: e.funderId };
    if (e.takenBy && !row.managerId) row = { ...row, managerId: e.takenBy };
    const label = String(row.contributorLabel || row.recipientLabel || "").trim();
    if (!row.managerId && label && (row.type === OWNER_FUND_TYPE || row.type === OWNER_FUND_WITHDRAW_TYPE
      || row.origin === "cash_take" || row.origin === MGR_OOP_ORIGIN || row.fundedBy === MGR_FUNDED
      || row.paidBy === MGR_FUNDED || row.retainedBy === MGR_RETAINED)) {
      let id = matchManagerId(managers, label);
      if (!id) {
        id = idOf();
        const neu = { id, name: label, phone: "", note: "", at: row.at || new Date().toISOString() };
        managers.push(neu);
        byName.set(label.toLowerCase(), neu);
      }
      row = { ...row, managerId: id };
    }
    return row;
  });
  f.managers = managers;
  /* Keep funders mirrored for older UI helpers until fully retired. */
  f.funders = managers.map((m) => ({ ...m }));
  return f;
}

export function isOwnerInjection(e) {
  return !!(e && e.type === OWNER_FUND_TYPE && toCents(e.amount) > 0);
}

export function isOwnerWithdraw(e) {
  return !!(e && e.type === OWNER_FUND_WITHDRAW_TYPE && toCents(e.amount) > 0);
}

/** Out-of-pocket farm expense paid by a manager — no cashbox move. */
export function isManagerOop(e) {
  if (!e || e.type !== "expense") return false;
  if (e.fundedBy === MGR_FUNDED || e.origin === MGR_OOP_ORIGIN) return !!managerIdOf(e);
  return false;
}

/** Supplier settlement paid from a manager's pocket — no cashbox move. */
export function isManagerSupplierPay(e) {
  if (!e || e.type !== "supplierPay") return false;
  return e.paidBy === MGR_FUNDED && !!managerIdOf(e) && toCents(e.amount) > 0;
}

/** Customer payment cash retained by a manager — revenue credited, cashbox untouched. */
export function isManagerRetainedSale(e) {
  if (!e || e.type !== "payment") return false;
  return e.retainedBy === MGR_RETAINED && !!managerIdOf(e) && toCents(e.amount_cash != null ? e.amount_cash : e.amount) > 0;
}

function sortRows(a, b) {
  const ta = Date.parse(a.at) || 0;
  const tb = Date.parse(b.at) || 0;
  if (ta !== tb) return ta - tb;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

/**
 * Classify a farm entry into a manager ledger row.
 * deltaC > 0 ⇒ business owes them more; < 0 ⇒ owed less (or they owe).
 */
export function classifyManagerMove(e) {
  if (!e) return null;
  const mid = managerIdOf(e);
  if (!mid) return null;

  if (isOwnerInjection(e)) {
    const amtC = toCents(e.amount);
    return {
      id: e.id, at: e.at, managerId: mid, dept: "cashbox", kind: "inject",
      dir: "in", amount: fromCents(amtC), deltaC: amtC,
      purpose: e.purpose || "", note: e.note || "", source: e,
    };
  }
  if (isOwnerWithdraw(e)) {
    const amtC = toCents(e.amount);
    return {
      id: e.id, at: e.at, managerId: mid, dept: "cashbox", kind: "withdraw",
      dir: "out", amount: fromCents(amtC), deltaC: -amtC,
      purpose: e.purpose || "", note: e.note || "", source: e,
    };
  }
  if (isManagerOop(e)) {
    const st = e.payStatus || "paid";
    if (st === "unpaid") return null;
    const billC = Math.max(0, toCents(e.amount));
    const amtC = st === "partial" ? Math.min(billC, Math.max(0, toCents(e.paidAmount))) : billC;
    if (!(amtC > 0)) return null;
    return {
      id: e.id, at: e.at, managerId: mid, dept: "expenses", kind: "oop",
      dir: "in", amount: fromCents(amtC), deltaC: amtC,
      purpose: e.purpose || e.spendPurpose || e.category || "", note: e.note || e.vendor || "", source: e,
    };
  }
  if (isManagerSupplierPay(e)) {
    const amtC = toCents(e.amount);
    return {
      id: e.id, at: e.at, managerId: mid, dept: "suppliers", kind: "supplier",
      dir: "in", amount: fromCents(amtC), deltaC: amtC,
      purpose: e.note || "", note: e.vendor || "", source: e,
    };
  }
  if (isManagerRetainedSale(e)) {
    const amtC = toCents(e.amount_cash != null ? e.amount_cash : e.amount);
    return {
      id: e.id, at: e.at, managerId: mid, dept: "sales", kind: "retained",
      dir: "out", amount: fromCents(amtC), deltaC: -amtC,
      purpose: e.note || "", note: "", source: e,
    };
  }
  /* Legacy cash_take from drawer: treated as cashbox withdraw reducing owed. */
  if (e.type === "expense" && (e.origin === "cash_take" || e.takenBy) && mid) {
    if (e.supplierId) return null;
    const st = e.payStatus || "paid";
    if (st === "unpaid") return null;
    const billC = Math.max(0, toCents(e.amount));
    const amtC = st === "partial" ? Math.min(billC, Math.max(0, toCents(e.paidAmount))) : billC;
    if (!(amtC > 0)) return null;
    return {
      id: e.id, at: e.at, managerId: mid, dept: "cashbox", kind: "withdraw",
      dir: "out", amount: fromCents(amtC), deltaC: -amtC,
      purpose: e.purpose || e.spendPurpose || e.category || "", note: e.note || "", source: e,
    };
  }
  return null;
}

function blankAccount(m) {
  return {
    id: m?.id || null,
    name: m?.name || "—",
    phone: m?.phone || "",
    note: m?.note || "",
    balance: 0,
    injected: 0,
    withdrawn: 0,
    oop: 0,
    supplierPays: 0,
    salesRetained: 0,
    byDept: { cashbox: 0, expenses: 0, suppliers: 0, sales: 0 },
    rows: [],
  };
}

function applyMove(acc, move) {
  const amt = move.amount;
  if (move.kind === "inject") acc.injected = fromCents(toCents(acc.injected) + toCents(amt));
  else if (move.kind === "withdraw") acc.withdrawn = fromCents(toCents(acc.withdrawn) + toCents(amt));
  else if (move.kind === "oop") acc.oop = fromCents(toCents(acc.oop) + toCents(amt));
  else if (move.kind === "supplier") acc.supplierPays = fromCents(toCents(acc.supplierPays) + toCents(amt));
  else if (move.kind === "retained") acc.salesRetained = fromCents(toCents(acc.salesRetained) + toCents(amt));
  acc.byDept[move.dept] = fromCents(toCents(acc.byDept[move.dept] || 0) + move.deltaC);
  const balC = toCents(acc.balance) + move.deltaC;
  acc.balance = fromCents(balC);
  acc.rows.push({
    id: move.id, at: move.at, day: dayOf(move.at),
    dept: move.dept, kind: move.kind, dir: move.dir,
    amount: move.amount, delta: fromCents(move.deltaC),
    balance: acc.balance, purpose: move.purpose, note: move.note, source: move.source,
  });
}

export function buildManagerAccounts(entries = [], managers = []) {
  const active = (managers || []).filter((m) => m && m.id && !m.archived);
  const byId = Object.fromEntries(active.map((m) => [m.id, blankAccount(m)]));
  const ensure = (id, name) => {
    if (!id) return null;
    if (!byId[id]) byId[id] = blankAccount({ id, name: name || "—" });
    return byId[id];
  };

  const moves = (entries || [])
    .map(classifyManagerMove)
    .filter(Boolean)
    .sort(sortRows);

  moves.forEach((move) => {
    const acc = ensure(move.managerId, managerNameOf(managers, move.managerId));
    if (!acc) return;
    applyMove(acc, move);
  });

  active.forEach((m) => ensure(m.id, m.name));

  const list = Object.values(byId)
    .filter((a) => a.id)
    .sort((a, b) => {
      const bd = toCents(b.balance) - toCents(a.balance);
      if (bd) return bd;
      return String(a.name).localeCompare(String(b.name));
    });

  const totals = list.reduce((t, a) => ({
    balance: fromCents(toCents(t.balance) + toCents(a.balance)),
    injected: fromCents(toCents(t.injected) + toCents(a.injected)),
    withdrawn: fromCents(toCents(t.withdrawn) + toCents(a.withdrawn)),
    oop: fromCents(toCents(t.oop) + toCents(a.oop)),
    supplierPays: fromCents(toCents(t.supplierPays) + toCents(a.supplierPays)),
    salesRetained: fromCents(toCents(t.salesRetained) + toCents(a.salesRetained)),
  }), { balance: 0, injected: 0, withdrawn: 0, oop: 0, supplierPays: 0, salesRetained: 0 });

  return { list, byId, totals, moves };
}

/**
 * Statement for one manager over [from, to] (inclusive day keys YYYY-MM-DD).
 * Opening = net balance of all moves strictly before `from`.
 */
export function buildManagerStatement(entries = [], managers = [], managerId, { from = "", to = "" } = {}) {
  const name = managerNameOf(managers, managerId, "—");
  const moves = (entries || [])
    .map(classifyManagerMove)
    .filter((m) => m && m.managerId === managerId)
    .sort(sortRows);

  let openingC = 0;
  const inRange = [];
  moves.forEach((m) => {
    const d = dayOf(m.at);
    if (from && d < from) { openingC += m.deltaC; return; }
    if (to && d > to) return;
    if (from && d < from) return;
    inRange.push(m);
  });

  let balC = openingC;
  let injectedC = 0, withdrawnC = 0, oopC = 0, supplierC = 0, retainedC = 0;
  const rows = inRange.map((m) => {
    balC += m.deltaC;
    if (m.kind === "inject") injectedC += toCents(m.amount);
    else if (m.kind === "withdraw") withdrawnC += toCents(m.amount);
    else if (m.kind === "oop") oopC += toCents(m.amount);
    else if (m.kind === "supplier") supplierC += toCents(m.amount);
    else if (m.kind === "retained") retainedC += toCents(m.amount);
    return {
      id: m.id, at: m.at, day: dayOf(m.at),
      dept: m.dept, kind: m.kind, dir: m.dir,
      amount: m.amount, delta: fromCents(m.deltaC),
      balance: fromCents(balC), purpose: m.purpose, note: m.note, source: m.source,
    };
  });

  return {
    managerId,
    name,
    from: from || "",
    to: to || "",
    opening: fromCents(openingC),
    closing: fromCents(balC),
    injected: fromCents(injectedC),
    withdrawn: fromCents(withdrawnC),
    oop: fromCents(oopC),
    supplierPays: fromCents(supplierC),
    salesRetained: fromCents(retainedC),
    rows,
  };
}

/** Fiscal year start month: 1 = Jan (calendar). Lebanon-style optional later. */
export function managerPeriodBounds(kind, { from = "", to = "", fyStartMonth = 1 } = {}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dayKey = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  if (kind === "today") {
    const dk = dayKey(now);
    return { from: dk, to: dk };
  }
  if (kind === "week") {
    const c = new Date(); c.setHours(0, 0, 0, 0); c.setDate(c.getDate() - 6);
    return { from: dayKey(c), to: dayKey(now) };
  }
  if (kind === "month") {
    return { from: dayKey(new Date(y, m, 1)), to: dayKey(now) };
  }
  if (kind === "lastMonth") {
    const fromD = new Date(y, m - 1, 1);
    const toD = new Date(y, m, 0);
    return { from: dayKey(fromD), to: dayKey(toD) };
  }
  if (kind === "fy") {
    const startM = Math.max(0, Math.min(11, (fyStartMonth || 1) - 1));
    let fyY = y;
    if (m < startM) fyY = y - 1;
    return { from: dayKey(new Date(fyY, startM, 1)), to: dayKey(now) };
  }
  if (kind === "custom") return { from: from || "", to: to || "" };
  return { from: "", to: "" };
}

export function managerCsvRows(statement, moneyFmt) {
  const fmt = typeof moneyFmt === "function" ? moneyFmt : (n) => String(n);
  return (statement.rows || []).map((r) => ([
    r.day,
    r.dept,
    r.kind,
    r.purpose || r.note || "",
    r.dir === "in" ? fmt(r.amount) : "",
    r.dir === "out" ? fmt(r.amount) : "",
    fmt(r.balance),
  ]));
}
