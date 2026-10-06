import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureLinkedIdentity, unifyManagersFunders, findProfileByCloudUid } from "./identityLink.mjs";

test("link identity", () => {
  const farm = { profiles: [{ id: "p1", name: "A" }] };
  const me = farm.profiles[0];
  const { farm: next, me: linked, changed } = ensureLinkedIdentity(farm, me, { uid: "u1", email: "a@b.c" });
  assert.equal(changed, true);
  assert.equal(linked.cloudUid, "u1");
  assert.equal(findProfileByCloudUid(next.profiles, "u1").id, "p1");
});

test("unify funders into managers", () => {
  const farm = {
    managers: [{ id: "m1", name: "M" }],
    funders: [{ id: "f1", name: "F" }],
  };
  const u = unifyManagersFunders(farm);
  assert.equal(u.managers.length, 2);
  assert.equal(u.funders.length, 2);
  assert.ok(u.managers.some((m) => m.id === "f1"));
});
