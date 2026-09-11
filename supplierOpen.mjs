/* Supplier opening balances: legacy debts the farm already owed before
   recording bills in-app. Cleared by normal supplier payments. */

const toCents = (n) => Math.round((+(n || 0)) * 100);
const fromCents = (c) => +((c || 0) / 100).toFixed(2);

export const OPENING_BILL_PREFIX = "opening-";

export function openingBillId(supplierId) {
  return `${OPENING_BILL_PREFIX}${supplierId}`;
}

export function isOpeningBillId(id) {
  return String(id || "").startsWith(OPENING_BILL_PREFIX);
}

export function supplierIdFromOpeningBill(id) {
  if (!isOpeningBillId(id)) return null;
  return String(id).slice(OPENING_BILL_PREFIX.length) || null;
}

export function openingBalanceCents(supplier) {
  if (!supplier) return 0;
  return Math.max(0, toCents(supplier.openingBalance));
}

/* Synthetic AP bill so opening debts allocate and clear like real bills. */
export function openingBillFor(supplier, t) {
  const amtC = openingBalanceCents(supplier);
  if (!(amtC > 0) || !supplier?.id) return null;
  const amount = fromCents(amtC);
  const at = supplier.openingAt || supplier.at || new Date(0).toISOString();
  return {
    id: openingBillId(supplier.id),
    type: "expense",
    supplierId: supplier.id,
    amount,
    paidAmount: 0,
    payStatus: "unpaid",
    category: "opening",
    vendor: supplier.name || "",
    note: (t && t("supplierOpeningNote")) || "Opening balance",
    at,
    dueDate: supplier.openingDue || (typeof at === "string" ? at.slice(0, 10) : ""),
    opening: true,
  };
}

export function openingBillsFor(suppliers, t) {
  return (suppliers || []).map((s) => openingBillFor(s, t)).filter(Boolean);
}
