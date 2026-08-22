/* Company cloud sync — Firebase Auth (email/password) + Realtime Database. */
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  off,
} from "firebase/database";
import { FIREBASE_CONFIG, firebaseConfigured } from "./firebase-config.js";

let app = null;
let auth = null;
let db = null;
let unsubAuth = null;
let unsubFarm = null;

const companyCloud = {
  ready: false,
  bound: false,
  user: null,
  profile: null,
  companyId: null,
  company: null,
  error: null,
};

const listeners = new Set();
const emit = () => { listeners.forEach((fn) => { try { fn({ ...companyCloud }); } catch (e) { /* */ } }); };
export const subscribeCompanyCloud = (fn) => { listeners.add(fn); fn({ ...companyCloud }); return () => listeners.delete(fn); };
export const getCompanyCloud = () => ({ ...companyCloud });
export const isFirebaseReady = () => firebaseConfigured();

function ensureInit() {
  if (!firebaseConfigured()) throw new Error("firebase-not-configured");
  if (app) return;
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getDatabase(app);
  companyCloud.ready = true;
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function companyIdFrom() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadProfile(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

async function loadCompany(cid) {
  const snap = await get(ref(db, `companies/${cid}/meta`));
  return snap.exists() ? { id: cid, ...snap.val() } : null;
}

function stopFarmListen() {
  if (unsubFarm && db && companyCloud.companyId) {
    off(ref(db, `companies/${companyCloud.companyId}/farmJson`));
    unsubFarm = null;
  }
}

function startFarmListen(cid, onFarm) {
  stopFarmListen();
  if (!cid || !onFarm) return;
  const r = ref(db, `companies/${cid}/farmJson`);
  unsubFarm = onValue(r, (snap) => {
    if (!snap.exists()) return;
    const v = snap.val();
    if (typeof v === "string" && v) onFarm(v);
  }, () => { /* keep local on listen errors */ });
}

async function bindUser(user, onFarm) {
  stopFarmListen();
  companyCloud.user = user ? { uid: user.uid, email: user.email || "", name: user.displayName || "" } : null;
  companyCloud.profile = null;
  companyCloud.companyId = null;
  companyCloud.company = null;
  companyCloud.error = null;
  companyCloud.bound = false;
  if (!user) { companyCloud.bound = true; emit(); return; }
  try {
    const profile = await loadProfile(user.uid);
    companyCloud.profile = profile;
    if (profile && profile.companyId) {
      companyCloud.companyId = profile.companyId;
      companyCloud.company = await loadCompany(profile.companyId);
      startFarmListen(profile.companyId, onFarm);
    }
  } catch (e) {
    companyCloud.error = e.message || String(e);
  }
  companyCloud.bound = true;
  emit();
}

/** Wait until auth+profile have been read after sign-in or sign-up. Pass uid to ignore a stale bound state. */
export function companyWaitBound(ms = 10000, uid = null) {
  return new Promise((resolve) => {
    let done = false;
    const ok = (s) => s.bound && (!uid || (s.user && s.user.uid === uid));
    const finish = (s) => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(tm);
      resolve({ ...s });
    };
    const unsub = subscribeCompanyCloud((s) => { if (ok(s)) finish(s); });
    const tm = setTimeout(() => finish(getCompanyCloud()), ms);
  });
}

/** Call once from the app. onFarm(jsonString) when remote farm changes. */
export function startCompanyCloud(onFarm) {
  if (!firebaseConfigured()) {
    companyCloud.ready = false;
    emit();
    return () => {};
  }
  ensureInit();
  if (unsubAuth) unsubAuth();
  unsubAuth = onAuthStateChanged(auth, (user) => { bindUser(user, onFarm); });
  return () => {
    if (unsubAuth) unsubAuth();
    unsubAuth = null;
    stopFarmListen();
  };
}

export async function companySignUp(email, password, displayName) {
  ensureInit();
  companyCloud.bound = false;
  emit();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName) {
    try { await updateProfile(cred.user, { displayName: displayName.trim() }); } catch (e) { /* optional */ }
  }
  await set(ref(db, `users/${cred.user.uid}`), {
    email: email.trim().toLowerCase(),
    name: (displayName || "").trim(),
    companyId: null,
    createdAt: Date.now(),
  });
  return cred.user;
}

export async function companySignIn(email, password) {
  ensureInit();
  companyCloud.bound = false;
  emit();
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function companySignOut() {
  ensureInit();
  stopFarmListen();
  await signOut(auth);
  companyCloud.user = null;
  companyCloud.profile = null;
  companyCloud.companyId = null;
  companyCloud.company = null;
  emit();
}

export async function createCompany(name, farmJson, onFarm) {
  ensureInit();
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");
  const cid = companyIdFrom();
  const code = inviteCode();
  const meta = {
    name: (name || "Farm").trim(),
    ownerUid: user.uid,
    inviteCode: code,
    createdAt: Date.now(),
  };
  await set(ref(db, `companies/${cid}/meta`), meta);
  await set(ref(db, `companies/${cid}/members/${user.uid}`), {
    email: (user.email || "").toLowerCase(),
    role: "owner",
    joinedAt: Date.now(),
  });
  await set(ref(db, `invites/${code}`), { companyId: cid, createdAt: Date.now() });
  await set(ref(db, `companies/${cid}/farmJson`), farmJson || "{}");
  await update(ref(db, `users/${user.uid}`), { companyId: cid, name: user.displayName || "" });
  companyCloud.companyId = cid;
  companyCloud.company = { id: cid, ...meta };
  companyCloud.profile = { ...(companyCloud.profile || {}), companyId: cid };
  startFarmListen(cid, onFarm);
  emit();
  return { companyId: cid, inviteCode: code };
}

export async function joinCompany(code, onFarm) {
  ensureInit();
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) throw new Error("missing-code");
  const inv = await get(ref(db, `invites/${clean}`));
  if (!inv.exists()) throw new Error("bad-invite");
  const cid = inv.val().companyId;
  if (!cid) throw new Error("bad-invite");
  const meta = await loadCompany(cid);
  if (!meta) throw new Error("missing-company");
  await set(ref(db, `companies/${cid}/members/${user.uid}`), {
    email: (user.email || "").toLowerCase(),
    role: "member",
    joinedAt: Date.now(),
  });
  await update(ref(db, `users/${user.uid}`), { companyId: cid });
  companyCloud.companyId = cid;
  companyCloud.company = meta;
  companyCloud.profile = { ...(companyCloud.profile || {}), companyId: cid };
  startFarmListen(cid, onFarm);
  emit();
  return meta;
}

export async function companyPullFarm() {
  ensureInit();
  const cid = companyCloud.companyId;
  if (!cid) throw new Error("no-company");
  const snap = await get(ref(db, `companies/${cid}/farmJson`));
  if (!snap.exists()) throw new Error("empty");
  const v = snap.val();
  if (typeof v !== "string" || !v) throw new Error("empty");
  return v;
}

export async function companyPushFarm(farmJson) {
  ensureInit();
  const cid = companyCloud.companyId;
  if (!cid) throw new Error("no-company");
  await set(ref(db, `companies/${cid}/farmJson`), farmJson);
  await update(ref(db, `companies/${cid}/meta`), { updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || null });
  return true;
}

export function companySyncActive() {
  return !!(companyCloud.user && companyCloud.companyId);
}
