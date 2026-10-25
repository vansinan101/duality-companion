/* Duality Companion — website backend (same design as the Clockwork Companion's).
   On its own website the app saves to Firebase: this file provides window.claude with the same db / assets
   interface the claude.ai artifact runtime offers, plus a "table" service (who is signed in, their role, the members).

   Players make a username and password in the app, then type the table password once.
   Everything for one group lives under tables/<key>/…, where <key> is a hash of the table password.
   The person who creates a table is its GM; the GM can make other members GMs.
   GMs see every character; players see only the characters assigned to them. firestore.rules enforces this. */
(() => {
  const cfg = window.DUALITY_FIREBASE;
  const configured = !!(cfg && cfg.apiKey && cfg.projectId && window.firebase);
  const KEY = "dh-table-key";
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

  async function tableKey(password) {
    const bytes = new TextEncoder().encode("duality-table:" + password.trim().toLowerCase());
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  let fs = null, auth = null, root = "", me = null;   // me: { uid, role, name }
  const portraits = {};

  const db = {
    collection: name => {
      const ref = fs.collection(`${root}/${name}`);
      return name === "characters" && me.role !== "gm" ? ref.where("players", "array-contains", me.uid) : ref;
    },
    doc: path => fs.doc(`${root}/${path}`),
  };
  const assets = {
    async upload(file, previousId) {
      if (file.size > 20 * 1024 * 1024) throw { code: "too_large" };
      const data = await shrinkImage(file);   // defined in app.js
      const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await fs.doc(`${root}/portraits/${id}`).set({ data, t: Date.now() });
      portraits[id] = data;
      if (previousId && previousId !== id) fs.doc(`${root}/portraits/${previousId}`).delete().catch(() => {});
      return { id };
    },
    urlFor: id => portraits[id] || "",
    remove: id => fs.doc(`${root}/portraits/${id}`).delete().catch(() => {}),
  };
  const table = {
    get uid() { return me.uid; }, get role() { return me.role; }, get name() { return me.name; },
    members: (cb, err) => fs.collection(`${root}/members`).onSnapshot(s => cb(s.docs.map(d => Object.assign({ uid: d.id }, d.data()))), err || (() => {})),
    setRole: (uid, role) => fs.doc(`${root}/members/${uid}`).update({ role }),
    remove: uid => fs.doc(`${root}/members/${uid}`).delete(),
  };

  let opened;
  const ready = new Promise(res => (opened = res));
  const profile = u => ({ name: (u.email || "player").split("@")[0] });

  async function join(key, user) {
    const metaRef = fs.doc(`tables/${key}/meta/table`), meRef = fs.doc(`tables/${key}/members/${user.uid}`);
    const meta = await metaRef.get();
    if (!meta.exists) return { error: "missing" };
    const owner = meta.data().owner;
    const mine = await meRef.get();
    let role;
    if (mine.exists) { role = mine.data().role; await meRef.update(profile(user)).catch(() => {}); }
    else { role = owner === user.uid ? "gm" : "player"; await meRef.set(Object.assign({ role, joined: Date.now() }, profile(user))); }
    root = `tables/${key}`; lsSet(KEY, key);
    fs.doc(`users/${user.uid}`).set({ table: key }).catch(() => {});
    me = { uid: user.uid, role, name: profile(user).name };
    meRef.onSnapshot(s => {
      if (!s.exists) { lsSet(KEY, null); alertLeft(); return; }
      if (s.data().role !== me.role) location.reload();
    }, () => {});
    fs.collection(`${root}/portraits`).onSnapshot(snap => {
      snap.docs.forEach(d => { portraits[d.id] = d.data().data; });
      window.dispatchEvent(new Event("dh-portraits"));
    }, () => {});
    started = true; opened(db);
    return { ok: true };
  }
  function alertLeft() {
    fs.doc(`users/${auth.currentUser.uid}`).delete().catch(() => {});
    root = ""; gate(auth.currentUser, "The GM has removed you from this table. Ask them for the table password to join again.");
  }

  // Usernames become made-up addresses behind the scenes (Firebase's password sign-in needs one).
  const cleanName = u => u.trim().toLowerCase();
  const validName = u => /^[a-z0-9][a-z0-9_.-]{1,23}$/.test(u);
  const emailFor = u => `${u}@${cfg.projectId}.firebaseapp.com`;
  const authError = code => ({
    "auth/invalid-credential": "That username and password don't match.", "auth/wrong-password": "That username and password don't match.",
    "auth/user-not-found": "That username and password don't match.", "auth/email-already-in-use": "That username is taken. Pick another.",
    "auth/weak-password": "Use at least 6 characters for the password.", "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
    "auth/operation-not-allowed": "Username sign-in isn't switched on in Firebase yet (Authentication → Sign-in method → Email/Password).",
    "auth/network-request-failed": "Couldn't reach the server. Check your connection.",
  }[code] || "That didn't work. Try again.");

  // ---- the gate: a plain sign-in scene for now (themes come later) ----
  const SCENE = `<main class="gate-wrap">
      <header class="gate-crest">
        <svg class="crest" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M60 6 L104 32 L104 84 L60 110 L16 84 L16 32 Z" fill="none" stroke="currentColor" stroke-width="3"/>
          <path d="M60 6 L60 110 M16 32 L104 84 M104 32 L16 84" stroke="currentColor" stroke-width="1" opacity=".35"/>
          <circle cx="44" cy="52" r="6" fill="var(--hope)"/><circle cx="76" cy="68" r="6" fill="var(--fear)"/>
        </svg>
        <h1>${window.APP_NAME || "Duality Companion"}</h1>
        <p class="gate-tag">${window.APP_TAG || "A character sheet and GM table for your group"}</p>
      </header>
      <div class="gate-plate"><form class="gate-panel" novalidate></form></div>
      <p class="gate-foot">${window.APP_COMPAT || ""}</p>
    </main>`;
  let box = null;
  function gate(user, note, key) {
    if (box) box.remove();
    box = document.createElement("div");
    box.className = "gate";
    box.innerHTML = SCENE;
    document.body.appendChild(box);
    if (user) return tableStep(user, note, key);
    let mode = "in";
    const draw = msg => {
      box.querySelector(".gate-panel").innerHTML = `
        <div class="gate-tabs" role="group" aria-label="Account"><button type="button" data-m="in" aria-pressed="${mode === "in"}">Sign in</button><button type="button" data-m="up" aria-pressed="${mode === "up"}">New player</button></div>
        <div class="gate-field"><label for="gate-user">Username</label><input id="gate-user" autocomplete="username" autocapitalize="none" spellcheck="false" /></div>
        <div class="gate-field"><label for="gate-pass">Password</label><input id="gate-pass" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" /></div>
        ${mode === "up" ? `<div class="gate-field"><label for="gate-table">Table password</label><input id="gate-table" type="password" autocomplete="off" /><small>Your GM gives you this. You only need it once.</small></div>` : ""}
        <p class="gate-msg" role="status"></p>
        <button class="gate-btn" type="submit">${mode === "in" ? "Enter" : "Create my account"}</button>`;
      const q = s => box.querySelector(s), say = t => { q(".gate-msg").textContent = t || ""; };
      say(msg);
      box.querySelectorAll("[data-m]").forEach(b => (b.onclick = () => { mode = b.dataset.m; draw(); }));
      q("form").onsubmit = async e => {
        e.preventDefault();
        const name = cleanName(q("#gate-user").value), pass = q("#gate-pass").value;
        if (!validName(name)) { say("Usernames are 2–24 letters or numbers (dots, dashes and underscores are fine too)."); return; }
        if (mode === "in") {
          say("Signing in…");
          try { await auth.signInWithEmailAndPassword(emailFor(name), pass); } catch (err) { say(authError(err && err.code)); }
          return;
        }
        const tpw = q("#gate-table").value;
        if (pass.length < 6) { say("Use at least 6 characters for the password."); return; }
        if (!tpw.trim()) { say("Type the table password your GM gave you."); return; }
        say("Checking the table…");
        try {
          const key = await tableKey(tpw);
          pendingSignup = { key, name };
          await auth.createUserWithEmailAndPassword(emailFor(name), pass);
        } catch (err) { pendingSignup = null; say(authError(err && err.code)); }
      };
      setTimeout(() => q("#gate-user").focus(), 50);
    };
    draw(note);
  }

  function tableStep(user, note, key) {
    box.querySelector(".gate-panel").innerHTML = `
        <p class="gate-who">Signed in as <b></b> · <button type="button" class="gate-link gate-out">Sign out</button></p>
        <div class="gate-field"><label for="gate-table">Table password</label><input id="gate-table" type="password" autocomplete="off" /></div>
        <p class="gate-msg" role="status"></p>
        <button class="gate-btn" type="submit">Open table</button>
        <button class="gate-btn alt gate-new" type="button" hidden>Create a new table with this password</button>`;
    const q = s => box.querySelector(s), say = t => { q(".gate-msg").textContent = t || ""; };
    q("b").textContent = shortName(user);
    q(".gate-out").onclick = () => auth.signOut();
    let pending = key || null;
    const tryJoin = async k => {
      const r = await join(k, user);
      if (r.ok) { box.remove(); box = null; return; }
      pending = k;
      if (r.error === "missing") { q(".gate-new").hidden = false; say("No table uses that password yet. Check it with your GM, or create a new table if you're the GM."); }
    };
    q("form").onsubmit = async e => {
      e.preventDefault(); const v = q("#gate-table").value; if (!v.trim()) { say("Type the table password first."); return; }
      q(".gate-new").hidden = true; say("Checking…");
      try { await tryJoin(await tableKey(v)); } catch { say("Couldn't reach the table just now. Check your connection and try again."); }
    };
    q(".gate-new").onclick = async () => {
      try { await fs.doc(`tables/${pending}/meta/table`).set({ created: Date.now(), owner: user.uid }); await tryJoin(pending); }
      catch { say("Couldn't create the table. Check the database rules in Firebase."); }
    };
    say(note);
    if (pending) tryJoin(pending).catch(() => say("Couldn't reach the table just now."));
    setTimeout(() => q("#gate-table").focus(), 50);
  }
  const shortName = u => (u.email || "").split("@")[0] || "player";
  let pendingSignup = null;

  window.DH_WEB = {
    configured,
    reason: configured ? "" : cfg && cfg.apiKey ? "offline" : "noconfig",
    leave() { lsSet(KEY, null); (auth ? auth.signOut() : Promise.resolve()).then(() => location.reload()); },
  };
  if (!configured) return;   // no Firebase settings: the app runs in this-browser-only mode

  firebase.initializeApp(cfg);
  fs = firebase.firestore();
  auth = firebase.auth();
  window.claude = {
    use(name) {
      if (name === "db") return ready;
      if (name === "assets") return ready.then(() => assets);
      if (name === "table") return ready.then(() => table);
      return Promise.resolve(null);
    },
  };
  let started = false;
  const start = () => auth.onAuthStateChanged(async user => {
    if (!user) { if (started) location.reload(); else gate(null); return; }
    if (started) return;
    const signup = pendingSignup; pendingSignup = null;
    let key = signup ? signup.key : lsGet(KEY);
    if (!key) { try { const u = await fs.doc(`users/${user.uid}`).get(); if (u.exists) key = u.data().table; } catch {} }
    if (key) {
      try { const r = await join(key, user); if (r.ok) { if (box) { box.remove(); box = null; } return; } } catch {}
      lsSet(KEY, null);
    }
    gate(user, "", key);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
