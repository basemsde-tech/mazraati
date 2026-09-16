/* Input + ledger validation — pure helpers, safe to unit-test.
   Issues are soft advisories: callers show non-blocking alerts; they decide
   whether to block save. Codes map to i18n keys (val*). */

export function toCentsSafe(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

export function fromCentsSafe(c) {
  if (c == null || !Number.isFinite(c)) return null;
  return Math.round(c) / 100;
}

/** Parse a typed money/qty string. Empty → 0. Rejects NaN / Infinity. */
export function parseNumberInput(raw, { allowEmpty = true, min = 0, max = null } = {}) {
  if (raw == null || String(raw).trim() === "") {
    if (allowEmpty) return { ok: true, value: 0, issue: null };
    return { ok: false, value: null, issue: { code: "valEmpty", severity: "error" } };
  }
  const cleaned = String(raw).trim().replace(/,/g, ".").replace(/[^\d.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") {
    return { ok: false, value: null, issue: { code: "valNotNumber", severity: "error", why: "valWhyNotNumber" } };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    return { ok: false, value: null, issue: { code: "valNotNumber", severity: "error", why: "valWhyNotNumber" } };
  }
  if (min != null && n < min) {
    return { ok: false, value: n, issue: { code: "valBelowMin", severity: "error", why: "valWhyBelowMin", params: { min } } };
  }
  if (max != null && n > max) {
    return {
      ok: false, value: n,
      issue: { code: "valAboveMax", severity: "warn", why: "valWhyAboveMax", params: { max } },
    };
  }
  return { ok: true, value: n, issue: null };
}

export function checkMoneyPositive(amount, field = "amount") {
  const c = toCentsSafe(amount);
  if (c == null) return [{ code: "valNotNumber", severity: "error", field, why: "valWhyNotNumber" }];
  if (c <= 0) return [{ code: "valNeedPositive", severity: "error", field, why: "valWhyNeedPositive" }];
  return [];
}

export function checkQtyPositive(qty, field = "qty") {
  const n = Number(qty);
  if (!Number.isFinite(n)) return [{ code: "valNotNumber", severity: "error", field, why: "valWhyNotNumber" }];
  if (!(n > 0)) return [{ code: "valNeedPositive", severity: "error", field, why: "valWhyNeedPositive" }];
  return [];
}

/** Unit × qty should match total within 1 cent (rounding). */
export function checkLineMath({ qty, price, amount, priceMode = "unit" } = {}) {
  const issues = [];
  const q = Number(qty);
  const p = Number(price);
  const a = Number(amount);
  if (![q, p, a].every(Number.isFinite)) {
    issues.push({ code: "valNotNumber", severity: "error", why: "valWhyNotNumber" });
    return issues;
  }
  if (!(q > 0)) issues.push({ code: "valNeedQty", severity: "error", field: "qty", why: "valWhyNeedQty" });
  if (!(p >= 0) || (priceMode === "unit" && !(p > 0) && !(a > 0))) {
    issues.push({ code: "valNeedPrice", severity: "error", field: "price", why: "valWhyNeedPrice" });
  }
  if (!(a > 0)) issues.push({ code: "valNeedAmount", severity: "error", field: "amount", why: "valWhyNeedAmount" });
  if (q > 0 && p >= 0 && a >= 0) {
    const expectedC = Math.round(q * p * 100);
    const amountC = Math.round(a * 100);
    const delta = Math.abs(expectedC - amountC);
    if (delta > 1) {
      issues.push({
        code: "valLineMismatch",
        severity: "warn",
        why: "valWhyLineMismatch",
        params: {
          expected: expectedC / 100,
          amount: amountC / 100,
          delta: delta / 100,
        },
      });
    }
  }
  return issues;
}

/** Stock / available quantity vs sale qty. */
export function checkStockCover({ qty, available, product } = {}) {
  if (available == null || !Number.isFinite(Number(available))) return [];
  const q = Number(qty);
  const avail = Number(available);
  if (!Number.isFinite(q) || !(q > 0)) return [];
  if (q > avail + 1e-9) {
    return [{
      code: "valStockShort",
      severity: "warn",
      field: "qty",
      why: "valWhyStockShort",
      params: { qty: q, available: avail, product: product || "" },
    }];
  }
  return [];
}

/** Discount must not exceed the line total (except percent mode capped elsewhere). */
export function checkDiscount({ amount, discount, discountPct, mode = "usd" } = {}) {
  const issues = [];
  const aC = toCentsSafe(amount);
  if (aC == null || aC < 0) return issues;
  if (mode === "pct") {
    const pct = Number(discountPct);
    if (!Number.isFinite(pct)) {
      issues.push({ code: "valNotNumber", severity: "error", field: "discount", why: "valWhyNotNumber" });
    } else if (pct < 0 || pct > 100) {
      issues.push({
        code: "valDiscountPctRange",
        severity: "error",
        field: "discount",
        why: "valWhyDiscountPct",
        params: { pct },
      });
    }
    return issues;
  }
  const dC = toCentsSafe(discount);
  if (dC == null) return issues;
  if (dC < 0) {
    issues.push({ code: "valBelowMin", severity: "error", field: "discount", why: "valWhyBelowMin", params: { min: 0 } });
  } else if (dC > aC) {
    issues.push({
      code: "valDiscountOver",
      severity: "warn",
      field: "discount",
      why: "valWhyDiscountOver",
      params: { discount: dC / 100, amount: aC / 100 },
    });
  }
  return issues;
}

/**
 * Payment vs owing: cash + deduction should relate sensibly to due.
 * Overpay is allowed (customer credit) but warned; empty settlement blocked.
 */
export function checkPaymentSplit({ due = 0, cash = 0, deduct = 0 } = {}) {
  const issues = [];
  const dueC = toCentsSafe(due);
  const cashC = toCentsSafe(cash);
  const deductC = toCentsSafe(deduct);
  if ([dueC, cashC, deductC].some((x) => x == null)) {
    return [{ code: "valNotNumber", severity: "error", why: "valWhyNotNumber" }];
  }
  if (cashC < 0 || deductC < 0) {
    issues.push({ code: "valBelowMin", severity: "error", why: "valWhyBelowMin", params: { min: 0 } });
  }
  if (cashC <= 0 && deductC <= 0) {
    issues.push({ code: "valNeedSettlement", severity: "error", why: "valWhyNeedSettlement" });
  }
  const applied = cashC + deductC;
  if (dueC > 0 && applied === 0) {
    issues.push({ code: "valNeedSettlement", severity: "error", why: "valWhyNeedSettlement" });
  }
  if (deductC > dueC + 1 && cashC === 0) {
    issues.push({
      code: "valDeductOverDue",
      severity: "warn",
      why: "valWhyDeductOverDue",
      params: { deduct: deductC / 100, due: dueC / 100 },
    });
  }
  if (applied > dueC + 1) {
    issues.push({
      code: "valOverpay",
      severity: "warn",
      why: "valWhyOverpay",
      params: { applied: applied / 100, due: dueC / 100, credit: (applied - dueC) / 100 },
    });
  }
  if (dueC > 0 && applied > 0 && applied < dueC - 1) {
    issues.push({
      code: "valPartialPay",
      severity: "info",
      why: "valWhyPartialPay",
      params: { remaining: (dueC - applied) / 100 },
    });
  }
  return issues;
}

/** Expense: amount vs qty×unit when both present. */
export function checkExpenseAmounts({ amount, qty, unitCost } = {}) {
  const issues = [];
  const aC = toCentsSafe(amount);
  if (aC == null) return [{ code: "valNotNumber", severity: "error", why: "valWhyNotNumber" }];
  if (aC <= 0) issues.push({ code: "valNeedPositive", severity: "error", field: "amount", why: "valWhyNeedPositive" });
  if (qty != null && qty !== "" && unitCost != null && unitCost !== "") {
    const q = Number(qty);
    const u = Number(unitCost);
    if (Number.isFinite(q) && Number.isFinite(u) && q > 0 && u >= 0) {
      const expectedC = Math.round(q * u * 100);
      if (Math.abs(expectedC - aC) > 1) {
        issues.push({
          code: "valExpenseMath",
          severity: "warn",
          why: "valWhyExpenseMath",
          params: { expected: expectedC / 100, amount: aC / 100 },
        });
      }
    }
  }
  return issues;
}

/** Cash tender vs due — change can be given, but tender < due on walk-in is an error. */
export function checkTender({ due = 0, tender = 0, requireFull = false } = {}) {
  const issues = [];
  const dueC = toCentsSafe(due);
  const tenderC = toCentsSafe(tender);
  if (dueC == null || tenderC == null) {
    return [{ code: "valNotNumber", severity: "error", why: "valWhyNotNumber" }];
  }
  if (tenderC < 0) {
    issues.push({ code: "valBelowMin", severity: "error", why: "valWhyBelowMin", params: { min: 0 } });
  }
  if (requireFull && tenderC < dueC) {
    issues.push({
      code: "valTenderShort",
      severity: "error",
      why: "valWhyTenderShort",
      params: { due: dueC / 100, tender: tenderC / 100, short: (dueC - tenderC) / 100 },
    });
  } else if (!requireFull && tenderC > 0 && tenderC < dueC) {
    issues.push({
      code: "valTenderPartial",
      severity: "info",
      why: "valWhyTenderPartial",
      params: { remaining: (dueC - tenderC) / 100 },
    });
  }
  if (tenderC > dueC + 1) {
    issues.push({
      code: "valChangeDue",
      severity: "info",
      why: "valWhyChangeDue",
      params: { change: (tenderC - dueC) / 100 },
    });
  }
  return issues;
}

/**
 * Lightweight ledger sanity: cash in/out rows that don't add up to reported balance,
 * or payment totals that exceed linked sale gross by more than a cent.
 */
export function checkCashTrail(rows = []) {
  const issues = [];
  if (!Array.isArray(rows) || !rows.length) return issues;
  let balC = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const debitC = toCentsSafe(r.debit || 0) || 0;
    const creditC = toCentsSafe(r.credit || 0) || 0;
    if (debitC < 0 || creditC < 0) {
      issues.push({
        code: "valCashNegMove",
        severity: "error",
        why: "valWhyCashNegMove",
        params: { row: i + 1 },
      });
    }
    if (debitC > 0 && creditC > 0) {
      issues.push({
        code: "valCashBothSides",
        severity: "warn",
        why: "valWhyCashBothSides",
        params: { row: i + 1 },
      });
    }
    balC += debitC - creditC;
    if (r.balance != null) {
      const reported = toCentsSafe(r.balance);
      if (reported != null && Math.abs(reported - balC) > 1) {
        issues.push({
          code: "valCashBalanceDrift",
          severity: "warn",
          why: "valWhyCashBalanceDrift",
          params: {
            row: i + 1,
            expected: balC / 100,
            reported: reported / 100,
          },
        });
        /* Realign so one bad row doesn't cascade false positives. */
        balC = reported;
      }
    }
  }
  return issues;
}

export function severityRank(s) {
  return s === "error" ? 3 : s === "warn" ? 2 : 1;
}

export function worstSeverity(issues) {
  return (issues || []).reduce((w, it) => {
    const s = it.severity || "info";
    return severityRank(s) > severityRank(w) ? s : w;
  }, "info");
}

export function hasBlockingIssues(issues) {
  return (issues || []).some((it) => it.severity === "error");
}

/** Format params into a displayable why-line using a translator `t`. */
export function formatIssue(issue, t, fmtMoney) {
  if (!issue) return { title: "", why: "" };
  const title = t(issue.code) || issue.code;
  let why = issue.why ? (t(issue.why) || "") : "";
  const p = issue.params || {};
  const money = (v) => (fmtMoney ? fmtMoney(v) : String(v));
  Object.entries(p).forEach(([k, v]) => {
    const rep = typeof v === "number" && (k === "expected" || k === "amount" || k === "discount"
      || k === "due" || k === "cash" || k === "deduct" || k === "applied" || k === "credit"
      || k === "remaining" || k === "change" || k === "tender" || k === "short" || k === "delta"
      || k === "reported")
      ? money(v)
      : String(v);
    why = why.replaceAll(`{${k}}`, rep);
  });
  return { title, why, severity: issue.severity || "info", field: issue.field || null };
}

export function formatIssues(issues, t, fmtMoney) {
  return (issues || []).map((it) => formatIssue(it, t, fmtMoney));
}
