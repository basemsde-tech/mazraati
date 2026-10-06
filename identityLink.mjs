/* One linked identity: local profile id ↔ cloud uid. */

export function linkProfileCloud(profile, cloudUid, cloudEmail) {
  if (!profile) return profile;
  return {
    ...profile,
    cloudUid: cloudUid || profile.cloudUid || null,
    cloudEmail: cloudEmail || profile.cloudEmail || null,
    linkedAt: cloudUid ? (profile.linkedAt || new Date().toISOString()) : profile.linkedAt || null,
  };
}

export function findProfileByCloudUid(profiles, cloudUid) {
  if (!cloudUid) return null;
  return (profiles || []).find((p) => p && p.cloudUid === cloudUid) || null;
}

export function ensureLinkedIdentity(farm, me, authUser) {
  if (!farm || !me || !authUser?.uid) return { farm, me, changed: false };
  if (me.cloudUid === authUser.uid && me.cloudEmail === (authUser.email || me.cloudEmail)) {
    return { farm, me, changed: false };
  }
  const linked = linkProfileCloud(me, authUser.uid, authUser.email || "");
  const profiles = (farm.profiles || []).map((p) =>
    p && p.id === me.id ? linked : p
  );
  // If me not in profiles list, append
  if (!profiles.some((p) => p && p.id === me.id)) profiles.push(linked);
  return {
    farm: { ...farm, profiles },
    me: linked,
    changed: true,
  };
}

/** Migrate funders → managers (single idea). Safe / idempotent. */
export function unifyManagersFunders(farm) {
  if (!farm) return farm;
  const managers = Array.isArray(farm.managers) ? [...farm.managers] : [];
  const funders = Array.isArray(farm.funders) ? farm.funders : [];
  const byId = new Map(managers.filter(Boolean).map((m) => [String(m.id), m]));
  funders.forEach((f) => {
    if (!f || !f.id) return;
    const id = String(f.id);
    if (!byId.has(id)) {
      byId.set(id, { ...f, role: f.role || "manager", fromFunder: true });
    }
  });
  const nextManagers = [...byId.values()];
  // Keep funders mirror for old code paths
  return { ...farm, managers: nextManagers, funders: nextManagers };
}
