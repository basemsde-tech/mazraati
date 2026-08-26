import assert from "node:assert/strict";
import test from "node:test";
import { statusToneOf, statusRowClass, payStatusKind, STATUS_PILL_TOKENS } from "./statusTone.mjs";

test("statusToneOf maps operational statuses to semantic tones", () => {
  assert.equal(statusToneOf("paid"), "success");
  assert.equal(statusToneOf("Active"), "success");
  assert.equal(statusToneOf("completed"), "success");
  assert.equal(statusToneOf("healthy"), "success");
  assert.equal(statusToneOf("clear"), "success");
  assert.equal(statusToneOf("pending"), "warning");
  assert.equal(statusToneOf("due"), "warning");
  assert.equal(statusToneOf("partial"), "warning");
  assert.equal(statusToneOf("owing"), "warning");
  assert.equal(statusToneOf("offset"), "offset");
  assert.equal(statusToneOf("reimbursement"), "offset");
  assert.equal(statusToneOf("overdue"), "danger");
  assert.equal(statusToneOf("unpaid"), "danger");
  assert.equal(statusToneOf("sick"), "danger");
  assert.equal(statusToneOf("in progress"), "info");
  assert.equal(statusToneOf("served"), "info");
  assert.equal(statusToneOf("draft"), "neutral");
  assert.equal(statusToneOf("inactive"), "neutral");
  assert.equal(statusToneOf("unknown-xyz"), "neutral");
});

test("statusRowClass uses logical left-border tone classes", () => {
  assert.equal(statusRowClass("paid"), "status-row border-l-4 status-row--success");
  assert.equal(statusRowClass("unpaid"), "status-row border-l-4 status-row--danger");
});

test("payStatusKind elevates late and overdue rows", () => {
  assert.equal(payStatusKind({ status: "paid" }), "paid");
  assert.equal(payStatusKind({ status: "unpaid", overdue: true }), "overdue");
  assert.equal(payStatusKind({ status: "partial", due: 12, lateDays: 45 }), "overdue");
  assert.equal(payStatusKind({ status: "partial", due: 12, lateDays: 3 }), "partial");
});

test("pill tokens stay on soft fills with AA-friendly ink", () => {
  assert.equal(STATUS_PILL_TOKENS.success.pill, "bg-emerald-50 text-emerald-700 border-emerald-200");
  assert.equal(STATUS_PILL_TOKENS.warning.dot, "bg-amber-500");
  assert.equal(STATUS_PILL_TOKENS.danger.pill.includes("rose"), true);
  assert.equal(STATUS_PILL_TOKENS.info.dot, "bg-sky-500");
  assert.equal(STATUS_PILL_TOKENS.neutral.pill, "bg-slate-100 text-slate-600 border-slate-200");
  assert.equal(STATUS_PILL_TOKENS.offset.pill, "bg-purple-50 text-purple-700 border-purple-200");
});

function relativeLuminance(hex) {
  const n = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg), b = relativeLuminance(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

test("status pill text meets WCAG AA contrast on soft fills", () => {
  const pairs = [
    ["#047857", "#ECFDF5"],
    ["#B45309", "#FFFBEB"],
    ["#BE123C", "#FFF1F2"],
    ["#0369A1", "#F0F9FF"],
    ["#475569", "#F1F5F9"],
    ["#6D28D9", "#F5F3FF"],
  ];
  for (const [fg, bg] of pairs) {
    assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg} is ${contrastRatio(fg, bg).toFixed(2)}`);
  }
});
