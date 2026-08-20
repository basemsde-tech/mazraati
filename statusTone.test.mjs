import assert from "node:assert/strict";
import test from "node:test";
import { statusToneOf, statusRowClass, payStatusKind, STATUS_PILL_TOKENS } from "./statusTone.js";

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
});
