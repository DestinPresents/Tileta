import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMaB2v9lbM9r2M4Nv31hRT6vImaenOQEc",
  authDomain: "tiles-96c54.firebaseapp.com",
  projectId: "tiles-96c54",
  storageBucket: "tiles-96c54.firebasestorage.app",
  messagingSenderId: "511133312503",
  appId: "1:511133312503:web:7c8735404949fef93f3af2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let readyResolve;
const authReady = new Promise(resolve => { readyResolve = resolve; });

function cleanName(name, email) {
  const n = String(name || "").trim();
  return n || String(email || "Player").split("@")[0] || "Player";
}

function cloudDataFromState() {
  const s = window.tileTrailsState;
  if (!s) return null;
  const redeemed = (() => {
    try { return JSON.parse(localStorage.getItem("tt_redeemed") || "{}"); }
    catch { return {}; }
  })();
  return {
    level: Number(s.level) || 1,
    coins: Number(s.coins) || 0,
    streak: Number(s.streak) || 0,
    lastDaily: s.lastDaily || "",
    powerups: {
      undo: Number(s.pu?.undo) || 0,
      shuffle: Number(s.pu?.shuffle) || 0,
      hint: Number(s.pu?.hint) || 0
    },
    sound: !!s.sound,
    music: !!s.music,
    redeemed,
    updatedAt: serverTimestamp()
  };
}

function applyCloudData(data) {
  const s = window.tileTrailsState;
  if (!s || !data) return false;
  if (Number.isFinite(Number(data.level))) s.level = Math.min(3000, Math.max(1, Number(data.level)));
  if (Number.isFinite(Number(data.coins))) s.coins = Math.max(0, Number(data.coins));
  if (Number.isFinite(Number(data.streak))) s.streak = Math.max(0, Number(data.streak));
  s.lastDaily = String(data.lastDaily || "");
  s.pu = {
    undo: Math.max(0, Number(data.powerups?.undo) || 0),
    shuffle: Math.max(0, Number(data.powerups?.shuffle) || 0),
    hint: Math.max(0, Number(data.powerups?.hint) || 0)
  };
  s.sound = data.sound !== false;
  s.music = data.music !== false;
  try { localStorage.setItem("tt_redeemed", JSON.stringify(data.redeemed || {})); } catch {}
  return true;
}

async function pushCloud(showErrors = false) {
  await authReady;
  if (!currentUser) return false;
  try {
    const payload = cloudDataFromState();
    if (!payload) return false;
    await setDoc(doc(db, "users", currentUser.uid), payload, { merge: true });
    window.tileTrailsCloudStatus?.("synced");
    return true;
  } catch (err) {
    console.error("Tile Trails cloud save failed:", err);
    window.tileTrailsCloudStatus?.("offline");
    if (showErrors) window.tileTrailsAuthError?.("Cloud save failed. Your local progress is still safe on this device.");
    return false;
  }
}

async function restoreOrCreateCloud() {
  await authReady;
  if (!currentUser) return false;
  try {
    const ref = doc(db, "users", currentUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      applyCloudData(snap.data());
      window.tileTrailsLocalRefresh?.();
      window.tileTrailsCloudStatus?.("synced");
    } else {
      await setDoc(ref, cloudDataFromState(), { merge: true });
      window.tileTrailsCloudStatus?.("synced");
    }
    return true;
  } catch (err) {
    console.error("Tile Trails cloud restore failed:", err);
    window.tileTrailsCloudStatus?.("offline");
    return false;
  }
}

async function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

async function signup(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const displayName = cleanName(name, email);
  try { await updateProfile(cred.user, { displayName }); } catch (e) { console.warn("Profile name update failed:", e); }
  return cred.user;
}

async function logout() {
  await signOut(auth);
}

function userSummary() {
  if (!currentUser) return { loggedIn: false };
  return {
    loggedIn: true,
    uid: currentUser.uid,
    name: currentUser.displayName || currentUser.email?.split("@")[0] || "Player",
    email: currentUser.email || ""
  };
}

window.TileTrailsFirebase = {
  app, auth, db, authReady,
  login, signup, logout, pushCloud, restoreOrCreateCloud, userSummary,
  get currentUser() { return currentUser; }
};

onAuthStateChanged(auth, async user => {
  currentUser = user;
  readyResolve();
  if (user) {
    window.tileTrailsCloudStatus?.("syncing");
    await restoreOrCreateCloud();
  } else {
    window.tileTrailsCloudStatus?.("local");
  }
  window.tileTrailsAuthChanged?.(userSummary());
});
