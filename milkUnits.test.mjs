import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MILK_DENSITY, parseMilkQty, milkQty2, litersToKg, kgToLiters,
  milkToLiters, milkFromLiters, milkConvertQty, milkPair, milkPack,
  milkRecordLiters, milkEqAmount, milkOtherUnit,
} from "./milkUnits.mjs";

describe("milk unit conversion", () => {
  it("uses 1.03 kg per litre", () => {
    assert.equal(MILK_DENSITY, 1.03);
  });

  it("converts 100 kg to litres (2 d.p.) and 100 L to kg", () => {
    assert.equal(kgToLiters(100), 97.09);
    assert.equal(litersToKg(100), 103);
    assert.equal(milkToLiters(100, "kg"), 97.09);
    assert.equal(milkToLiters(100, "L"), 100);
    assert.equal(milkFromLiters(100, "kg"), 103);
  });

  it("shows the live equivalent used in the addition UI", () => {
    assert.equal(milkEqAmount(100, "kg"), 97.09);
    assert.equal(milkEqAmount(100, "L"), 103);
    assert.equal(milkOtherUnit("kg"), "L");
    assert.equal(milkOtherUnit("L"), "kg");
  });

  it("treats empty, zero, negative, and junk as 0", () => {
    assert.equal(parseMilkQty(""), 0);
    assert.equal(parseMilkQty(null), 0);
    assert.equal(parseMilkQty("-4"), 0);
    assert.equal(parseMilkQty("abc"), 0);
    assert.equal(milkQty2("12.345"), 12.35);
    assert.equal(milkToLiters(0, "kg"), 0);
  });

  it("toggles units without drifting the underlying quantity", () => {
    const asKg = milkConvertQty(100, "L", "kg");
    assert.equal(asKg, 103);
    assert.equal(milkConvertQty(asKg, "kg", "L"), 100);
    const asL = milkConvertQty(100, "kg", "L");
    assert.equal(asL, 97.09);
    assert.equal(milkConvertQty(asL, "L", "kg"), 100);
  });

  it("stores both canonical litres and kg, rounded to 2 d.p.", () => {
    assert.deepEqual(milkPair(100, "kg"), { liters: 97.09, kg: 100, unit: "kg", entered: 100 });
    assert.deepEqual(milkPack(100, "L"), { liters: 100, kg: 103, unit: "L" });
  });

  it("reads legacy kg rows and new canonical rows", () => {
    assert.equal(milkRecordLiters({ liters: 100, unit: "kg" }), 97.09);
    assert.equal(milkRecordLiters({ liters: 97.09, kg: 100, unit: "kg" }), 97.09);
    assert.equal(milkRecordLiters({ liters: 100, unit: "L" }), 100);
    assert.equal(milkRecordLiters({ qty: 10, liters: 9.71, kg: 10, unit: "kg" }), 9.71);
  });
});
