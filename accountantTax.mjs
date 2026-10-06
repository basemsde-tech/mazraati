/* Accountant-friendly tax / invoice fields on document templates. */

export const DEFAULT_TAX = {
  enabled: false,
  ratePct: 0,
  label: "VAT",
  labelAr: "ضريبة",
  taxNumber: "",
  companyReg: "",
  invoicePrefix: "INV-",
  showTaxOnDocs: true,
  pricesIncludeTax: false,
};

export function normalizeTax(settings) {
  const raw = (settings && settings.tax) || {};
  const rate = Math.max(0, Math.min(100, Number(raw.ratePct) || 0));
  return {
    ...DEFAULT_TAX,
    ...raw,
    ratePct: rate,
    enabled: !!raw.enabled && rate > 0,
  };
}

/** Split a gross/net amount into tax lines for invoices. */
export function taxBreakdown(amountUsd, tax) {
  const t = normalizeTax({ tax });
  const gross = Math.max(0, Number(amountUsd) || 0);
  if (!t.enabled) {
    return { net: gross, tax: 0, gross, ratePct: 0, label: t.label };
  }
  const r = t.ratePct / 100;
  if (t.pricesIncludeTax) {
    const net = +(gross / (1 + r)).toFixed(2);
    return { net, tax: +(gross - net).toFixed(2), gross, ratePct: t.ratePct, label: t.label };
  }
  const taxAmt = +(gross * r).toFixed(2);
  return { net: gross, tax: taxAmt, gross: +(gross + taxAmt).toFixed(2), ratePct: t.ratePct, label: t.label };
}

export function taxDocLines(tax, lang = "en") {
  const t = normalizeTax({ tax });
  const lines = [];
  if (t.taxNumber) {
    lines.push(lang === "ar" ? `الرقم الضريبي: ${t.taxNumber}` : `Tax No: ${t.taxNumber}`);
  }
  if (t.companyReg) {
    lines.push(lang === "ar" ? `السجل: ${t.companyReg}` : `Reg: ${t.companyReg}`);
  }
  if (t.enabled && t.showTaxOnDocs) {
    const label = lang === "ar" ? (t.labelAr || t.label) : t.label;
    lines.push(`${label} ${t.ratePct}%`);
  }
  return lines;
}
