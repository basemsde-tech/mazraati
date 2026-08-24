/* Milk density: 1 L ≈ 1.03 kg, so 1 kg ≈ 0.971 L.
   Stock maths stay in litres. kg is a display / entry unit. */
export const MILK_DENSITY = 1.03;

export function milkUnitOf(u) {
  return u === "kg" ? "kg" : "L";
}

export function milkOtherUnit(u) {
  return milkUnitOf(u) === "kg" ? "L" : "kg";
}

export function parseMilkQty(raw) {
  if (raw === "" || raw == null) return 0;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function milkQty2(n) {
  return Math.round(parseMilkQty(n) * 100) / 100;
}

export function litersToKg(liters) {
  return milkQty2(parseMilkQty(liters) * MILK_DENSITY);
}

export function kgToLiters(kg) {
  return milkQty2(parseMilkQty(kg) / MILK_DENSITY);
}

export function milkToLiters(qty, unit) {
  const n = milkQty2(qty);
  return milkUnitOf(unit) === "kg" ? kgToLiters(n) : n;
}

export function milkFromLiters(liters, unit) {
  const n = milkQty2(liters);
  return milkUnitOf(unit) === "kg" ? litersToKg(n) : n;
}

export function milkConvertQty(qty, fromUnit, toUnit) {
  const from = milkUnitOf(fromUnit);
  const to = milkUnitOf(toUnit);
  if (from === to) return milkQty2(qty);
  return milkFromLiters(milkToLiters(qty, from), to);
}

export function milkPair(qty, unit) {
  const u = milkUnitOf(unit);
  const liters = milkToLiters(qty, u);
  return { liters, kg: litersToKg(liters), unit: u, entered: milkQty2(qty) };
}

export function milkPack(qty, unit) {
  const pair = milkPair(qty, unit);
  return { liters: pair.liters, kg: pair.kg, unit: pair.unit };
}

/* Lots with a stored `kg` were saved after conversion: `liters` is canonical.
   Older kg rows stored the typed kg amount in `liters` — convert those. */
export function milkRecordLiters(e) {
  if (!e) return 0;
  const raw = e.liters ?? e.qty ?? 0;
  if (e.kg != null && e.kg !== "" && Number.isFinite(+e.kg)) return milkQty2(raw);
  return milkToLiters(raw, e.unit);
}

export function milkEqAmount(qty, unit) {
  const n = parseMilkQty(qty);
  if (!(n > 0)) return 0;
  return milkFromLiters(milkToLiters(n, unit), milkOtherUnit(unit));
}
