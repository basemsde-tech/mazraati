/* Owner capital in the cash box: injections raise an independent fund balance;
   disbursements tagged fundedBy:"owner" spend that balance and post as farm expenses.
   Withdrawals return capital to a named person without posting a farm expense.
   Funders are person-level capital accounts integrated with the cash drawer. */

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);

export const OWNER_FUND_TYPE = "ownerFund";
export const OWNER_FUND_WITHDRAW_TYPE = "ownerFundWithdraw";
export const OWNER_FUNDED_BY = "owner";

export function isOwnerInjection(e) {
  return !!(e && e.type === OWNER_FUND_TYPE && toCents(e.amount) > 0);
}

export function isOwnerWithdraw(e) {
  return !!(e && e.type === OWNER_FUND_WITHDRAW_TYPE && toCents(e.amount) > 0);
}

export function isOwnerFundedExpense(e) {
  if (!e || e.type !== "expense") return false;
  return e.fundedBy === OWNER_FUNDED_BY || e.origin === "owner_fund";
}

/* Cash that left the drawer from an owner-funded expense (paid portion only). */
export function ownerSpendCents(e) {
  if (!isOwnerFundedExpense(e)) return 0;
  if (e.supplierId) return 0;
  const st = e.payStatus || "paid";
  if (st === "unpaid") return 0;
  const billC = Math.max(0, toCents(e.amount));
  if (st === "partial") return Math.min(billC, Math.max(0, toCents(e.paidAmount)));
  return billC;
}

export function ownerWithdrawCents(e) {
  if (!isOwnerWithdraw(e)) return 0;
  return Math.max(0, toCents(e.amount));
}

/** Paid cash taken from the drawer by a named person (e.g. manager → diesel). */
export function cashTakeCents(e) {
  if (!e || e.type !== "expense") return 0;
  if (!(e.funderId || e.takenBy || e.contributorLabel || e.recipientLabel)) return 0;
  /* Owner-funded spends are already counted via ownerSpendCents — avoid double count. */
  if (isOwnerFundedExpense(e)) return 0;
  if (e.supplierId) return 0;
  const st = e.payStatus || "paid";
  if (st === "unpaid") return 0;
  const billC = Math.max(0, toCents(e.amount));
  if (st === "partial") return Math.min(billC, Math.max(0, toCents(e.paidAmount)));
  return billC;
}

/** Sanitize allocation lines; amounts clamped to ≥0 and rounded to cents. */
export function normalizeAllocations(list = [], maxAmount = Infinity) {
  const maxC = Number.isFinite(+maxAmount) ? Math.max(0, toCents(maxAmount)) : Infinity;
  let usedC = 0;
  const out = [];
  (Array.isArray(list) ? list : []).forEach((row) => {
    const label = String(row?.label || row?.purpose || "").trim();
    let amtC = Math.max(0, toCents(row?.amount));
    if (!label || !(amtC > 0)) return;
    if (Number.isFinite(maxC)) {
      const room = Math.max(0, maxC - usedC);
      amtC = Math.min(amtC, room);
    }
    if (!(amtC > 0)) return;
    usedC += amtC;
    out.push({ label, amount: fromCents(amtC) });
  });
  return out;
}

export function allocationTotal(list) {
  return fromCents((normalizeAllocations(list)).reduce((s, a) => s + toCents(a.amount), 0));
}

/** Short human summary: "cows $6,000 · feed $4,000". */
export function formatAllocations(list, moneyFmt) {
  const rows = normalizeAllocations(list);
  if (!rows.length) return "";
  const fmt = typeof moneyFmt === "function" ? moneyFmt : (n) => String(n);
  return rows.map((a) => `${a.label} ${fmt(a.amount)}`).join(" · ");
}

export function contributorOf(e, funders = []) {
  if (!e) return "";
  if (e.funderId && Array.isArray(funders)) {
    const hit = funders.find((f) => f && f.id === e.funderId && !f.archived);
    if (hit && hit.name) return String(hit.name).trim();
  }
  return String(e.contributorLabel || e.recipientLabel || "").trim();
}

export function funderNameOf(funders, id, fallback = "") {
  if (!id) return fallback || "";
  const hit = (funders || []).find((f) => f && f.id === id);
  return hit ? String(hit.name || "").trim() : (fallback || "");
}

/** Find or invent a funder id from a free-text name (case-insensitive). */
export function matchFunderId(funders, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  const hit = (funders || []).find((f) => !f.archived && String(f.name || "").trim().toLowerCase() === n);
  return hit ? hit.id : null;
}

/**
 * Ensure every named contributor on capital entries has a funder account.
 * Returns { funders, changed }. Does not mutate inputs.
 */
export function syncFundersFromEntries(funders = [], entries = [], makeId) {
  const list = Array.isArray(funders) ? funders.map((f) => ({ ...f })) : [];
  const byName = new Map();
  list.forEach((f) => {
    const key = String(f.name || "").trim().toLowerCase();
    if (key) byName.set(key, f);
  });
  let changed = false;
  const idOf = typeof makeId === "function" ? makeId : () => `fnd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  (entries || []).forEach((e) => {
    if (!(isOwnerInjection(e) || isOwnerWithdraw(e) || ownerSpendCents(e) > 0)) return;
    const label = String(e.contributorLabel || e.recipientLabel || "").trim();
    if (e.funderId) {
      const exists = list.some((f) => f.id === e.funderId);
      if (exists || !label) return;
    }
    if (!label) return;
    const key = label.toLowerCase();
    if (byName.has(key)) return;
    const row = { id: idOf(), name: label, phone: "", note: "", at: e.at || new Date().toISOString() };
    list.push(row);
    byName.set(key, row);
    changed = true;
  });
  return { funders: list, changed };
}

function sortFundRows(a, b) {
  const ta = Date.parse(a.at) || 0;
  const tb = Date.parse(b.at) || 0;
  if (ta !== tb) return ta - tb;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function mapFundRow(e, balC, funders) {
  if (isOwnerInjection(e)) {
    const amtC = toCents(e.amount);
    return {
      id: e.id, at: e.at, dir: "in", kind: "deposit", amount: fromCents(amtC),
      balance: fromCents(balC + amtC),
      note: e.note || "",
      contributor: contributorOf(e, funders),
      funderId: e.funderId || null,
      purpose: e.purpose || "",
      subAccount: e.subAccount || "",
      allocations: normalizeAllocations(e.allocations, e.amount),
      source: e,
      _deltaC: amtC,
    };
  }
  if (isOwnerWithdraw(e)) {
    const amtC = ownerWithdrawCents(e);
    return {
      id: e.id, at: e.at, dir: "out", kind: "withdraw", amount: fromCents(amtC),
      balance: fromCents(balC - amtC),
      note: e.note || "",
      contributor: contributorOf(e, funders),
      funderId: e.funderId || null,
      purpose: e.purpose || "",
      subAccount: e.subAccount || "",
      allocations: [],
      source: e,
      _deltaC: -amtC,
    };
  }
  const takeC = cashTakeCents(e);
  if (takeC > 0) {
    return {
      id: e.id, at: e.at, dir: "out", kind: "take", amount: fromCents(takeC),
      balance: fromCents(balC - takeC),
      note: e.note || e.vendor || "",
      contributor: contributorOf(e, funders),
      funderId: e.funderId || e.takenBy || null,
      purpose: e.purpose || e.spendPurpose || e.category || "",
      subAccount: e.subAccount || "",
      allocations: [],
      source: e,
      _deltaC: -takeC,
    };
  }
  const amtC = ownerSpendCents(e);
  return {
    id: e.id, at: e.at, dir: "out", kind: "spend", amount: fromCents(amtC),
    balance: fromCents(balC - amtC),
    note: e.note || e.vendor || "",
    contributor: contributorOf(e, funders),
    funderId: e.funderId || null,
    purpose: e.purpose || e.spendPurpose || "",
    subAccount: e.ownerFundSubAccount || e.subAccount || "",
    allocations: [],
    source: e,
    _deltaC: -amtC,
  };
}

export function buildOwnerFund(entries, funders = []) {
  const rows = (entries || [])
    .filter((e) => isOwnerInjection(e) || ownerSpendCents(e) > 0 || ownerWithdrawCents(e) > 0)
    .slice()
    .sort(sortFundRows);
  let balC = 0;
  let injectedC = 0;
  let spentC = 0;
  let withdrawnC = 0;
  const ledger = rows.map((e) => {
    const row = mapFundRow(e, balC, funders);
    balC += row._deltaC;
    if (row.dir === "in") injectedC += toCents(row.amount);
    else {
      spentC += toCents(row.amount);
      if (row.kind === "withdraw") withdrawnC += toCents(row.amount);
    }
    const { _deltaC, ...clean } = row;
    return { ...clean, balance: fromCents(balC) };
  });
  return {
    injected: fromCents(injectedC),
    spent: fromCents(spentC),
    withdrawn: fromCents(withdrawnC),
    balance: fromCents(balC),
    rows: ledger,
  };
}

/**
 * Per-person capital accounts. Unassigned movements (no funderId / name) go under
 * the synthetic bucket id "" so totals still reconcile with buildOwnerFund.
 */
export function buildFunderAccounts(entries = [], funders = []) {
  const active = (funders || []).filter((f) => f && f.id && !f.archived);
  const byId = Object.fromEntries(active.map((f) => [f.id, {
    id: f.id,
    name: f.name || "—",
    phone: f.phone || "",
    note: f.note || "",
    injected: 0,
    withdrawn: 0,
    spent: 0,
    balance: 0,
    rows: [],
  }]));

  const orphanKey = "";
  const ensure = (id, name) => {
    const key = id || orphanKey;
    if (!byId[key]) {
      byId[key] = {
        id: key || null,
        name: name || "—",
        phone: "",
        note: "",
        injected: 0,
        withdrawn: 0,
        spent: 0,
        balance: 0,
        rows: [],
      };
    }
    return byId[key];
  };

  const moves = (entries || [])
    .filter((e) => isOwnerInjection(e) || ownerSpendCents(e) > 0 || ownerWithdrawCents(e) > 0 || cashTakeCents(e) > 0)
    .slice()
    .sort(sortFundRows);

  moves.forEach((e) => {
    let fid = e.funderId || e.takenBy || null;
    const label = contributorOf(e, funders);
    if (!fid && label) fid = matchFunderId(funders, label);
    const acc = ensure(fid, label);
    let balC = toCents(acc.balance);
    const row = mapFundRow(e, balC, funders);
    balC += row._deltaC;
    if (row.dir === "in") acc.injected = fromCents(toCents(acc.injected) + toCents(row.amount));
    else {
      acc.spent = fromCents(toCents(acc.spent) + toCents(row.amount));
      if (row.kind === "withdraw" || row.kind === "take") {
        acc.withdrawn = fromCents(toCents(acc.withdrawn || 0) + toCents(row.amount));
      }
    }
    acc.balance = fromCents(balC);
    const { _deltaC, ...clean } = row;
    acc.rows.push({ ...clean, balance: acc.balance, funderId: fid || null });
  });

  /* Include empty registered funders so new accounts appear before first deposit. */
  active.forEach((f) => ensure(f.id, f.name));

  const list = Object.values(byId)
    .filter((a) => a.id || a.rows.length)
    .sort((a, b) => {
      if (!a.id && b.id) return 1;
      if (a.id && !b.id) return -1;
      const bd = toCents(b.balance) - toCents(a.balance);
      if (bd) return bd;
      return String(a.name).localeCompare(String(b.name));
    });

  const totals = buildOwnerFund(entries, funders);
  return { list, byId, totals };
}
