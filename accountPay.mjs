/* Account-level payment application: one exact amount reduces account due.
   Does not allocate across individual line-item bills. */

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);

/**
 * Apply unlinked payment pool to an account balance object `{ due, paid, credit }`.
 * Mutates a shallow copy and returns it.
 */
export function applyAccountPayPool(account, poolCents) {
  const row = {
    due: account?.due || 0,
    paid: account?.paid || 0,
    credit: account?.credit || 0,
  };
  const pool = Math.max(0, Math.round(poolCents || 0));
  if (!(pool > 0)) return row;
  const dueC = toCents(row.due);
  const apply = Math.min(dueC, pool);
  row.due = fromCents(dueC - apply);
  row.paid = fromCents(toCents(row.paid) + apply);
  const leftover = pool - apply;
  if (leftover > 0) row.credit = fromCents(toCents(row.credit) + leftover);
  return row;
}

/** True when a payment should stay account-level (not tied to a bill/invoice). */
export function isAccountLevelPay(pay, { billKey = "expenseId" } = {}) {
  if (!pay) return true;
  const link = pay.saleId || pay[billKey];
  return !link;
}
