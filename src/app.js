const { h, render } = preact;
const { useState, useEffect, useMemo, useRef } = preactHooks;
const html = htm.bind(h);
const R = DH;
const num = R.num;
const APP = window.APP_NAME || "Duality Companion";
const normCache = new WeakMap(), derivedCache = new WeakMap();
const norm = c => { let n = normCache.get(c); if (!n) { n = R.normalize(c); normCache.set(c, n); normCache.set(n, n); } return n; };
const derive = c => { const n = norm(c); let d = derivedCache.get(n); if (!d) { d = R.derived(n); derivedCache.set(n, d); } return d; };
const addLog = (x, m) => { x.log = [{ t: Date.now(), m }, ...(x.log || [])].slice(0, 60); };
const CAMPAIGNS = ["Witherwild", "One-shot"];

/* ================= storage ================= */
// On the website, characters and the table's shared state live in Firebase (web-backend.js); without it, in this browser.
const use = name => (window.claude && window.claude.use ? window.claude.use(name) : Promise.resolve(null));
const LS_KEY = "dh-companion-chars";
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const rid = (p = "c") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clean = o => JSON.parse(JSON.stringify(o));
const blankState = () => ({ fear: 0, countdowns: [], foes: [], env: "", spotlight: { on: false, per: 3, left: {} }, frame: "", options: { massive: false }, t: 0 });

const Store = {
  mode: "loading", db: null, table: null, members: [], assets: null, readOnly: false,
  listeners: new Set(), chars: {}, state: blankState(),
  emit() { this.listeners.forEach(f => f(this)); },
  async init() {
    const fallback = window.DH_WEB && window.DH_WEB.configured ? null : setTimeout(() => { if (this.mode === "loading") this.goLocal(); }, 4000);
    window.addEventListener("dh-portraits", () => this.emit());
    const db = await use("db");
    clearTimeout(fallback);
    if (!db) { this.goLocal(); return; }
    this.db = db; this.mode = "live";
    db.collection("characters").onSnapshot(snap => {
      const next = {}; snap.docs.forEach(d => { next[d.id] = Object.assign({}, d.data(), { id: d.id }); });
      this.chars = next; this.emit();
    }, err => { this.error = err && err.code; this.emit(); });
    db.doc("state/table").onSnapshot(snap => {
      const s = snap.exists ? Object.assign(blankState(), snap.data()) : blankState();
      if ((s.t || 0) >= (this.state.t || 0)) { this.state = s; this.emit(); }
    }, () => {});
    this.emit();
    use("assets").then(a => { this.assets = a; this.emit(); });
    use("table").then(t => { if (!t) return; this.table = t; if (t.role === "gm") t.members(ms => { this.members = ms; this.emit(); }); this.emit(); });
  },
  goLocal() { this.mode = "local"; this.chars = lsGet(LS_KEY, {}); this.state = Object.assign(blankState(), lsGet("dh-state", {})); this.emit(); },
  stQueue: Promise.resolve(),
  saveState(fn) {
    const s = clean(this.state); fn(s); s.t = Date.now(); this.state = s; this.emit();
    if (this.mode !== "live") { lsSet("dh-state", s); return; }
    this.stQueue = this.stQueue.then(() => this.db.doc("state/table").set(s)).catch(() => toast("Couldn't save the table just now. Try that again."));
  },
  addFear(n) { this.saveState(s => { s.fear = R.clamp(num(s.fear) + n, 0, R.MAX.fear); }); },
  timers: {}, queues: {},
  save(c, delay = 600) { clearTimeout(this.timers[c.id]); this.timers[c.id] = setTimeout(() => this.flush(c), delay); },
  flush(c) {
    const body = clean(c); delete body.id;
    if (this.mode !== "live") { this.chars = Object.assign({}, this.chars, { [c.id]: Object.assign(body, { id: c.id }) }); lsSet(LS_KEY, this.chars); this.emit(); return Promise.resolve(); }
    const p = (this.queues[c.id] || Promise.resolve()).then(() => this.db.doc("characters/" + c.id).set(body)).catch(() => { toast("Couldn't save just now. Your change will retry on the next edit."); });
    this.queues[c.id] = p; return p;
  },
  async remove(id) {
    if (this.mode !== "live") { const n = Object.assign({}, this.chars); delete n[id]; this.chars = n; lsSet(LS_KEY, n); this.emit(); return; }
    await this.db.doc("characters/" + id).delete();
  },
};
const isGM = () => !Store.table || Store.table.role === "gm";
const playersOf = c => (Array.isArray(c.players) ? c.players : []);
// May this person edit freely (fix numbers by hand)? GMs always; players when the GM allows it on that sheet.
const canFree = c => isGM() || !!(c && c.freeEdit);
function rosterOrder(chars) {
  const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
  const ids = new Set(chars.map(c => c.id));
  const tops = chars.filter(c => !c.companionOf || !ids.has(c.companionOf)).sort(byName);
  return tops.flatMap(t => [t, ...chars.filter(c => c.companionOf === t.id).sort(byName)]);
}

/* ================= toast & hover card ================= */
let toastFn = () => {};
const toast = msg => toastFn(msg);
function Toaster() {
  const [msg, setMsg] = useState(""); const t = useRef();
  toastFn = m => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(""), 3600); };
  return msg ? html`<div class="toast" role="status">${msg}</div>` : null;
}
const tip = { set: () => {}, show(el, body) { this.set({ el, body }); }, hide() { this.set(null); } };
function HoverCard() {
  const [s, set] = useState(null); tip.set = set;
  if (!s || !s.el || !document.body.contains(s.el)) return null;
  const r = s.el.getBoundingClientRect();
  const top = r.top > 120 ? r.top + window.scrollY - 8 : r.bottom + window.scrollY + 8;
  const left = Math.max(8, Math.min(window.innerWidth - 248, r.left + r.width / 2 - 120));
  return html`<div class=${"hovercard" + (r.top > 120 ? " above" : "")} style=${`top:${top}px;left:${left}px`} role="tooltip">
    ${s.body.title && html`<b>${s.body.title}</b>`}${(s.body.lines || []).map(l => html`<div>${l}</div>`)}</div>`;
}
const MOUSE_L = "🖱 Left-click", MOUSE_R = "Right-click (long-press on a phone)";

// Left-click / right-click / long-press on one element.
function pressProps(onLeft, onRight, tipBody) {
  let timer = null, long = false;
  return {
    onClick: e => { if (long) { long = false; return; } onLeft && onLeft(e); },
    onContextMenu: e => { e.preventDefault(); if (!long) onRight && onRight(e); },
    onPointerDown: e => { if (e.pointerType !== "mouse") { long = false; timer = setTimeout(() => { long = true; onRight && onRight(e); if (navigator.vibrate) navigator.vibrate(15); }, 480); } },
    onPointerUp: () => clearTimeout(timer), onPointerLeave: e => { clearTimeout(timer); tip.hide(); },
    onMouseEnter: e => tipBody && tip.show(e.currentTarget, typeof tipBody === "function" ? tipBody() : tipBody),
  };
}

/* ================= light markdown for SRD text ================= */
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = s => esc(s).replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/_(.+?)_/g, "<i>$1</i>");
function mdHtml(src) {
  const lines = String(src || "").split("\n"); let out = "", list = false, table = null;
  const endList = () => { if (list) { out += "</ul>"; list = false; } };
  const endTable = () => { if (table) { out += "<table class=\"mdt\">" + table.map((r, i) => "<tr>" + r.map(c => (i ? "<td>" : "<th>") + inline(c) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</table>"; table = null; } };
  for (const raw of lines) {
    const l = raw.trim();
    if (/^\|.*\|$/.test(l)) { endList(); if (/^\|[\s:|-]+\|$/.test(l)) continue; (table = table || []).push(l.slice(1, -1).split("|").map(x => x.trim())); continue; }
    endTable();
    if (/^[-*]\s+/.test(l)) { if (!list) { out += "<ul>"; list = true; } out += "<li>" + inline(l.replace(/^[-*]\s+/, "")) + "</li>"; continue; }
    if (!l) { endList(); continue; }
    endList();
    if (/^#{1,6}\s/.test(l)) { out += "<h5>" + inline(l.replace(/^#+\s*/, "")) + "</h5>"; continue; }
    out += "<p>" + inline(l.replace(/^>\s?/, "")) + "</p>";
  }
  endList(); endTable();
  return out;
}
const Md = ({ text, cls = "" }) => html`<div class=${"md " + cls} dangerouslySetInnerHTML=${{ __html: mdHtml(text) }}></div>`;

/* ================= side panel (rules and details) ================= */
let panelFn = () => {};
const openPanel = p => panelFn(p);   // { title, sub, body: vnode } | { topic }
const BOOK = html`<svg class="hbook" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.2C4 2.4 6 2.5 8 3.6c2-1.1 4-1.2 6-.4v9.6c-2-.8-4-.7-6 .4-2-1.1-4-1.2-6-.4z M8 3.6v9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
function Head({ title, topic, tail, level = 2 }) {
  const T = level === 3 ? "h3" : "h2";
  return html`<${T} class="h"><span>${topic ? html`<button type="button" class="hlink" onClick=${() => openPanel({ topic })} aria-label=${`${title}: show the rules`}>${title}${BOOK}</button>` : title}</span><i class="rule"></i>${tail || ""}</${T}>`;
}
function SidePanel() {
  const [p, set] = useState(null); panelFn = set;
  useEffect(() => { if (!p) return; const k = e => e.key === "Escape" && set(null); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [p]);
  if (!p) return null;
  const info = p.topic ? RULES_INFO[p.topic] : null;
  return html`<div class="spanel-back" onClick=${() => set(null)}></div><aside class="spanel" role="dialog" aria-label=${(info && info.title) || p.title}>
    <div class="sp-head"><div><b>${(info && info.title) || p.title}</b>${(p.sub || (info && info.sub)) && html`<span>${p.sub || info.sub}</span>`}</div>
      <button class="iconbtn" aria-label="Close" onClick=${() => set(null)}>×</button></div>
    <div class="sp-body">${info ? html`<${RuleTopic} info=${info} />` : p.body}</div></aside>`;
}
function RuleTopic({ info }) {
  return html`<div>${(info.parts || []).map(part => typeof part === "string" ? html`<${Md} text=${part} />`
    : part.note ? html`<div class="note"><b>App reading</b><${Md} text=${part.note} /></div>`
    : part.list ? html`<ul class="plain">${part.list.map(x => html`<li><${Md} text=${x} /></li>`)}</ul>` : null)}
    ${info.src && html`<p class="src">SRD 2.0 · ${info.src}</p>`}</div>`;
}

/* ================= small parts ================= */
// A row of slot boxes. Left-click an empty box to mark up to it; right-click (long-press) a marked box to clear back below it.
function Track({ label, value, max, onSet, kind = "", lock = 0, verb = ["Mark", "Clear"] }) {
  const out = [];
  for (let i = 1; i <= max + lock; i++) {
    if (i > max) { out.push(html`<span class="slot locked" title="Crossed out"></span>`); continue; }
    const on = i <= value;
    out.push(html`<button type="button" class=${"slot " + kind + (on ? " on" : "")} aria-label=${`${label} ${i}: ${on ? verb[1].toLowerCase() : verb[0].toLowerCase()}`} aria-pressed=${on}
      ...${pressProps(() => { if (!on) onSet(i); else toast(`${MOUSE_R} to ${verb[1].toLowerCase()}.`); }, () => on && onSet(i - 1),
        () => ({ title: `${label} ${value}/${max}`, lines: [on ? `${MOUSE_R} to ${verb[1].toLowerCase()} to ${i - 1}` : `${MOUSE_L} to ${verb[0].toLowerCase()} up to ${i}`] }))}></button>`);
  }
  return html`<span class="track" role="group" aria-label=${label}>${out}</span>`;
}
function AutoText({ value, onInput, placeholder, label, cls = "" }) {
  const ref = useRef();
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; };
  useEffect(fit, [value]);
  return html`<textarea ref=${ref} rows="1" class=${"autotext " + cls} aria-label=${label} placeholder=${placeholder} value=${value ?? ""} onInput=${e => { onInput(e.target.value); fit(); }}></textarea>`;
}
function Field({ label, value, onInput, type = "text", list, placeholder, width }) {
  return html`<label class="field" style=${width ? `max-width:${width}` : ""}><span>${label}</span>
    <input type=${type} value=${value ?? ""} list=${list} placeholder=${placeholder} onInput=${e => onInput(type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value)} /></label>`;
}
function Select({ label, value, onChange, options, empty }) {
  return html`<label class="field"><span>${label}</span><select value=${value ?? ""} onChange=${e => onChange(e.target.value)}>
    ${empty != null && html`<option value="">${empty}</option>`}
    ${options.map(o => Array.isArray(o) ? html`<option value=${o[0]}>${o[1]}</option>` : o && o.group ? html`<optgroup label=${o.group}>${o.items.map(x => html`<option value=${x[0]}>${x[1]}</option>`)}</optgroup>` : html`<option value=${o}>${o}</option>`)}</select></label>`;
}
function Stepper({ value, onSet, min = -99, max = 99, label }) {
  return html`<span class="stepper" role="group" aria-label=${label}><button type="button" aria-label=${`Lower ${label}`} onClick=${() => onSet(Math.max(min, num(value) - 1))}>−</button><b>${value}</b><button type="button" aria-label=${`Raise ${label}`} onClick=${() => onSet(Math.min(max, num(value) + 1))}>+</button></span>`;
}
function Modal({ title, onClose, children, wide, foot }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return html`<div class="modal-back" onClick=${e => e.target === e.currentTarget && onClose()}><div class=${"modal" + (wide ? " wide" : "")} role="dialog" aria-label=${title}>
    <div class="m-head"><b>${title}</b><button class="iconbtn" aria-label="Close" onClick=${onClose}>×</button></div>
    <div class="m-body">${children}</div>${foot && html`<div class="m-foot">${foot}</div>`}</div></div>`;
}
const initials = n => (n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const portraitSrc = c => (!c ? "" : c.portraitAsset ? (Store.assets && Store.assets.urlFor ? Store.assets.urlFor(c.portraitAsset) : c.portraitData || "") : c.portraitData || (/^https?:\/\//.test(c.portraitUrl || "") ? c.portraitUrl : ""));
const EMBLEMS = ["hope", "fear", "blade", "leaf", "star", "moon", "flame", "eye"];
function Emblem({ shape, hue }) {
  const P = {
    hope: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z", fear: "M12 2a7 7 0 0 0-7 7c0 3 2 4.6 2 7v2h10v-2c0-2.4 2-4 2-7a7 7 0 0 0-7-7zM9 10a1.5 1.5 0 1 1 0 .1zM15 10a1.5 1.5 0 1 1 0 .1zM9 20h6v2H9z",
    blade: "M19 2l3 3-11 11-3-3zM6 14l4 4-2 2-1.5-1.5L4 21l-1-1 2.5-2.5L4 16z", leaf: "M20 3C9 3 4 9 4 16c0 2 .5 3.6 1.4 5 1-4 4-8 9-10-4 3-6.6 6.5-7.6 10.4C17 21 21 13 20 3z",
    star: "M12 2l2.2 7.8H22l-6.4 4.6 2.5 7.6L12 17.3 5.9 22l2.5-7.6L2 9.8h7.8z", moon: "M15 2a10 10 0 1 0 7 15A8 8 0 0 1 15 2z",
    flame: "M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 0-5 1-8z", eye: "M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z",
  };
  return html`<svg class="emblem" viewBox="0 0 24 24" aria-hidden="true"><path d=${P[shape] || P.hope} fill=${hue || "currentColor"} /></svg>`;
}
const Face = ({ c }) => portraitSrc(c) ? html`<img src=${portraitSrc(c)} alt="" />` : c && c.emblem && c.emblem.shape ? html`<${Emblem} ...${c.emblem} />` : initials(c && c.name);
const Thumb = ({ c, lg }) => html`<span class=${"thumb" + (lg ? " lg" : "")}><${Face} c=${c} /></span>`;
async function shrinkImage(blob, max = 360) {
  const img = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.82);
}
function saveFile(filename, data) {
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const subtitle = c => {
  if (c.kind === "companion") return "Animal companion";
  const parts = [c.cls && `${c.cls}${c.sub ? " · " + c.sub : ""}`, [c.ancestry || (c.mixed && "Mixed ancestry"), c.community].filter(Boolean).join(" "), c.campaign].filter(Boolean);
  return parts.join(" · ") || "No class yet";
};

/* ================= dice ================= */
// "App rolls" or "My own rolls" (per browser): with own rolls, the app asks for each number rolled at the table.
let askFn = () => Promise.resolve(null);
const ownRolls = () => lsGet("dh-dice", "app") === "own";
async function rollExpr(label, expr) {
  if (!ownRolls()) { const r = R.roll(expr); return r ? r.total : 0; }
  const v = await askFn({ label, expr }); return v == null ? null : num(v);
}
function Asker() {
  const [q, setQ] = useState(null); const [v, setV] = useState("");
  askFn = x => new Promise(res => { setV(""); setQ(Object.assign({ res }, x)); });
  if (!q) return null;
  const done = val => { q.res(val); setQ(null); };
  return html`<${Modal} title="Your roll" onClose=${() => done(null)}>
    <p>${q.label}: roll <b>${q.expr}</b> at the table and type the total.</p>
    <form class="row" onSubmit=${e => { e.preventDefault(); if (v !== "") done(v); }}>
      <input class="bignum" type="number" inputmode="numeric" autofocus value=${v} onInput=${e => setV(e.target.value)} aria-label="Total rolled" />
      <button class="btn primary" type="submit">Use it</button><button class="btn" type="button" onClick=${() => { const r = R.roll(q.expr); done(r ? r.total : 0); }}>Let the app roll</button></form></${Modal}>`;
}
function DiceSwitch() {
  const [m, setM] = useState(lsGet("dh-dice", "app"));
  return html`<div class="seg small" role="group" aria-label="Dice">${[["app", "App rolls"], ["own", "My own rolls"]].map(([k, n]) => html`<button aria-pressed=${m === k} onClick=${() => { setM(k); lsSet("dh-dice", k); }}>${n}</button>`)}</div>`;
}

/* ================= app ================= */
function App() {
  const [, force] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [sel, setSel] = useState(() => lsGet("dh-sel", null));
  const [tab, setTab] = useState(() => lsGet("dh-tab", "sheet"));
  const [view, setView] = useState(() => lsGet("dh-view", "chars"));
  const [making, setMaking] = useState(null);
  const [about, setAbout] = useState(false);
  const lastEdit = useRef({});
  useEffect(() => lsSet("dh-view", view), [view]);
  useEffect(() => { const f = () => force(x => x + 1); Store.listeners.add(f); Store.init(); return () => Store.listeners.delete(f); }, []);
  useEffect(() => {
    let changed = false; const next = Object.assign({}, drafts);
    Object.keys(next).forEach(id => { const s = Store.chars[id]; if (!s) return; if (s._rev === next[id]._rev || Date.now() - (lastEdit.current[id] || 0) > 4000) { delete next[id]; changed = true; } });
    if (changed) setDrafts(next);
  });
  const all = Object.assign({}, Store.chars, drafts);
  const list = rosterOrder(Object.values(all));
  const gm = isGM();
  if (!gm && view === "gm") setView("chars");
  const current = sel && all[sel] ? norm(all[sel]) : null;
  useEffect(() => { if (!current && list.length) setSel(list[0].id); }, [list.length, !!current]);
  useEffect(() => lsSet("dh-sel", sel), [sel]);
  useEffect(() => lsSet("dh-tab", tab), [tab]);

  const updateChar = (id, fn) => {
    const src = all[id]; if (!src) return;
    if (Store.readOnly) { toast("You can view this character but not change it."); return; }
    const next = clean(norm(src)); next.id = id; fn(next); next._rev = rid("r"); next.updatedAt = Date.now();
    lastEdit.current[id] = Date.now();
    setDrafts(d => Object.assign({}, d, { [id]: next }));
    Store.save(next);
  };
  const update = fn => current && updateChar(current.id, fn);
  const openChar = id => { setSel(id); setView("chars"); window.scrollTo(0, 0); };
  const create = (master, fill) => {
    const c = R.blankCharacter(); c.id = rid(); c.name = master ? "New companion" : "New character"; c.createdAt = Date.now();
    if (Store.table) c.players = gm ? (master ? playersOf(master).slice() : []) : [Store.table.uid];
    if (master) { c.companionOf = master.id; c.campaign = master.campaign || ""; c.kind = "companion"; c.companion = { evasion: 10, die: "d6", range: "Melee", type: "phy", stressMax: 3, attack: "", options: [] }; c.experiences = [{ id: "e0", name: "", base: 2 }, { id: "e1", name: "", base: 2 }]; c.marks.hope = 0; }
    if (fill) fill(c);
    c._rev = rid("r"); lastEdit.current[c.id] = Date.now();
    setDrafts(d => Object.assign({}, d, { [c.id]: c })); setSel(c.id); setTab("sheet");
    Store.flush(c);
    toast(fill ? `Welcome to the table, ${c.name}.` : master ? `Companion added for ${master.name || "this character"}.` : "Character created.");
  };
  const remove = async id => { const gone = all[id]; await Store.remove(id); if (gone && gone.portraitAsset && Store.assets && Store.assets.remove) Store.assets.remove(gone.portraitAsset); setDrafts(d => { const n = Object.assign({}, d); delete n[id]; return n; }); setSel(null); toast("Character deleted."); };

  return html`<div class="wrap">
    <header class="top">
      <div class="brand">${APP}</div>
      ${gm && html`<div class="seg viewseg" role="group" aria-label="View"><button aria-pressed=${view === "chars"} onClick=${() => setView("chars")}>Characters</button><button aria-pressed=${view === "gm"} onClick=${() => setView("gm")}>GM table</button></div>`}
      <${DiceSwitch} />
      <div class="status">${Store.mode === "live" && Store.table ? html`<i class="dot live"></i>${Store.table.name}${gm ? " · GM" : ""} <button class="linkbtn" onClick=${() => window.DH_WEB.leave()}>Sign out</button>`
        : Store.mode === "live" ? html`<i class="dot live"></i>Shared` : Store.mode === "local" ? html`<i class="dot local"></i>This browser only` : html`<i class="dot"></i>Connecting…`}</div>
    </header>
    ${Store.mode === "local" && html`<div class="banner">${window.DH_WEB && window.DH_WEB.reason === "offline" ? "Couldn't reach the shared save, so for now characters are kept in this browser only. Check your connection and reload."
      : "Shared saving isn't set up here, so characters are kept in this browser only. On the website with Firebase settings, your whole table shares them."}</div>`}
    ${Store.error && html`<div class="banner">Couldn't load the shared characters just now. Reload the page to try again.</div>`}
    ${view === "gm" && gm ? html`<${GMView} chars=${list} all=${all} updateChar=${updateChar} openChar=${openChar} />` : html`
      <${Roster} list=${list} all=${all} sel=${sel} setSel=${setSel} current=${current} create=${create} startNew=${() => setMaking("choose")} />
      ${current ? html`<${Character} c=${current} all=${all} update=${update} tab=${tab} setTab=${setTab} onDelete=${remove} />`
        : Store.mode === "loading" ? html`<div class="empty"><p class="muted">Opening the table…</p></div>`
        : html`<div class="empty"><div class="ornate">${gm ? "No characters yet" : "Welcome to the table"}</div>
            <p>Each character's sheet lives here: traits, Hope, Stress, Hit Points, armor, domain cards and gear, with the rules math done for you.</p>
            <div class="row center"><button class="btn primary" onClick=${() => setMaking("choose")}>Create a character</button></div></div>`}`}
    ${making === "choose" && html`<${NewChoice} onClose=${() => setMaking(null)} onGuide=${() => setMaking("guide")} onBlank=${() => { setMaking(null); create(null); }} />`}
    ${making === "guide" && html`<${Genesis} onClose=${() => setMaking(null)} onDone=${fill => { setMaking(null); create(null, fill); window.scrollTo(0, 0); }} />`}
    <footer class="foot"><p>${window.APP_COMPAT || ""} · Unofficial fan work, not affiliated with or endorsed by Critical Role or Darrington Press. <button class="linkbtn" onClick=${() => setAbout(true)}>Credits and licence</button></p></footer>
    ${about && html`<${About} onClose=${() => setAbout(false)} />`}
    <${DiceDock} c=${view === "chars" ? current : null} update=${update} />
    <${Toaster} /><${HoverCard} /><${SidePanel} /><${Asker} />
  </div>`;
}

function About({ onClose }) {
  return html`<${Modal} title="Credits and licence" onClose=${onClose} wide>
    <${Md} text=${ATTRIBUTION_TEXT} /></${Modal}>`;
}

function NewChoice({ onClose, onGuide, onBlank }) {
  return html`<${Modal} title="New character" onClose=${onClose}>
    <div class="choices">
      <button class="choice" onClick=${onGuide}><b>Character creation</b><span>Walk through the nine steps: class, heritage, traits, equipment, Experiences, domain cards and connections.</span></button>
      <button class="choice" onClick=${onBlank}><b>Blank character sheet</b><span>An empty level 1 sheet you fill in yourself.</span></button>
    </div></${Modal}>`;
}

/* ================= character switcher ================= */
function Roster({ list, all, sel, setSel, current, create, startNew }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState("");
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const key = e => e.key === "Escape" && setOpen(false);
    const out = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("keydown", key); document.addEventListener("pointerdown", out);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("pointerdown", out); };
  }, [open]);
  const pick = id => { setSel(id); setOpen(false); setQ(""); };
  const master = c => (c && c.companionOf && all[c.companionOf]) || null;
  const comps = id => list.filter(c => c.companionOf === id);
  const needle = q.trim().toLowerCase();
  const hit = c => !needle || [c.name, c.cls, c.player, c.campaign, c.ancestry].some(v => (v || "").toLowerCase().includes(needle));
  const tops = list.filter(c => !master(c) && (hit(c) || comps(c.id).some(hit)));
  const order = [...CAMPAIGNS, ...new Set(tops.map(c => c.campaign || "").filter(x => x && !CAMPAIGNS.includes(x))), ""];
  const groups = order.map(k => ({ k, rows: tops.filter(c => (c.campaign || "") === k) })).filter(g => g.rows.length);
  const hpLeft = c => { if (c.kind === "companion") return 100; const d = derive(c); return d.hpMax ? 100 - (d.cur.hp / d.hpMax) * 100 : 0; };
  const m = master(current);
  return html`<div class="roster" ref=${ref}>
    <div class="rbar">
      ${current ? html`<button type="button" class="rnow" aria-expanded=${open} onClick=${() => setOpen(!open)}>
          <${Thumb} c=${current} lg /><span class="who"><b>${current.name || "Unnamed"}</b><span>${m ? `Companion of ${m.name || "Unnamed"}` : subtitle(current)}</span></span>
          <span class="rswitch">${list.length > 1 ? `Switch · ${list.length}` : "Characters"} ▾</span></button>` : html`<span class="muted">No character selected</span>`}
      <span class="radd"><button class="btn small" onClick=${startNew}>+ New character</button>
        ${current && !m && html`<button class="btn small" onClick=${() => create(current)}>+ Companion</button>`}</span>
    </div>
    ${open && html`<div class="rpanel" role="dialog" aria-label="Choose a character">
      <div class="rhead"><b>Characters</b><button class="iconbtn" aria-label="Close" onClick=${() => setOpen(false)}>×</button></div>
      ${list.length > 6 && html`<input class="rsearch" type="search" placeholder="Find a character, class or player…" value=${q} onInput=${e => setQ(e.target.value)} />`}
      ${groups.map(g => html`<div class="rgroup"><h4>${g.k || "No campaign"}</h4><div class="rgrid">
        ${g.rows.map(c => html`<div class=${"rcard" + (c.id === sel ? " on" : "")}>
          <button type="button" class="rmain" onClick=${() => pick(c.id)}><${Thumb} c=${c} />
            <span class="who"><b>${c.name || "Unnamed"}</b><span>${[c.cls && `${c.cls} ${c.level || 1}`, c.player].filter(Boolean).join(" · ") || "No class yet"}</span>
              <span class="bar"><i style=${`width:${hpLeft(c)}%`}></i></span></span></button>
          ${comps(c.id).length > 0 && html`<div class="rcomps">${comps(c.id).map(k => html`<button type="button" class=${"rcomp" + (k.id === sel ? " on" : "")} onClick=${() => pick(k.id)}><${Thumb} c=${k} />${k.name || "Unnamed"}</button>`)}</div>`}
        </div>`)}</div></div>`)}
    </div>`}
  </div>`;
}

/* ================= character ================= */
const TABS = [["sheet", "Sheet"], ["cards", "Abilities"], ["gear", "Gear"], ["story", "Story"], ["data", "Data"]];
function Character({ c, all, update, tab, setTab, onDelete }) {
  if (c.kind === "companion") return html`<${CompanionSheet} c=${c} master=${all[c.companionOf]} update=${update} onDelete=${onDelete} />`;
  const d = derive(c);
  const [edit, setEdit] = useState(false);
  const [lvl, setLvl] = useState(false);
  const free = edit && canFree(c);
  useEffect(() => { if (edit && !canFree(c)) setEdit(false); }, [c.freeEdit]);
  return html`<section class="character">
    <${Header} c=${c} d=${d} update=${update} edit=${free} setEdit=${setEdit} onLevel=${() => setLvl(true)} />
    <nav class="tabs" role="tablist">${TABS.map(([k, n]) => html`<button role="tab" class=${"tab t-" + k} aria-selected=${tab === k} onClick=${() => setTab(k)}>${n}</button>`)}</nav>
    <div class="tabbody">
      ${tab === "sheet" && html`<${SheetTab} c=${c} d=${d} update=${update} edit=${free} />`}
      ${tab === "cards" && html`<${AbilitiesTab} c=${c} d=${d} update=${update} edit=${free} />`}
      ${tab === "gear" && html`<${GearTab} c=${c} d=${d} update=${update} edit=${free} />`}
      ${tab === "story" && html`<${StoryTab} c=${c} update=${update} />`}
      ${tab === "data" && html`<${DataTab} c=${c} update=${update} onDelete=${onDelete} />`}
    </div>
    ${lvl && html`<${LevelUp} c=${c} d=${d} update=${update} onClose=${() => setLvl(false)} />`}
  </section>`;
}

function Header({ c, d, update, edit, setEdit, onLevel }) {
  const fileRef = useRef();
  const upload = async f => {
    if (!f) return;
    try {
      if (Store.assets && Store.assets.upload) { const r = await Store.assets.upload(f, c.portraitAsset); update(x => { x.portraitAsset = r.id; x.portraitData = ""; }); }
      else { const data = await shrinkImage(f); update(x => { x.portraitData = data; x.portraitAsset = ""; }); }
    } catch { toast("Couldn't use that picture. Try a smaller image."); }
  };
  const K = d.cls;
  return html`<div class="head card">
    <button type="button" class="portrait" aria-label="Change portrait" onClick=${() => fileRef.current.click()}><${Face} c=${c} /></button>
    <input ref=${fileRef} type="file" accept="image/*" hidden onChange=${e => upload(e.target.files[0])} />
    <div class="hmain">
      <input class="cname" value=${c.name} aria-label="Character name" placeholder="Name" onInput=${e => update(x => { x.name = e.target.value; })} />
      <div class="hline">${subtitle(c)}</div>
      <div class="hmeta">
        <span class="lvl" title="Level and tier"><b>Level ${c.level}</b> · Tier ${d.tier}</span>
        ${c.level < 10 && html`<button class="btn small primary" onClick=${onLevel}>Level up</button>`}
        ${c.levelups.length > 0 && html`<button class="btn small" onClick=${() => { if (confirm(`Undo the level ${c.level} level-up?`)) update(x => { R.undoLevelUp(x); addLog(x, `Undid level ${c.level}`); }); }}>Undo level ${c.level}</button>`}
        ${canFree(c) && html`<button class=${"btn small" + (edit ? " on" : "")} aria-pressed=${edit} onClick=${() => setEdit(!edit)}>${edit ? "Done editing" : "Free edit"}</button>`}
        ${isGM() && Store.table && html`<label class="chk small"><input type="checkbox" checked=${!!c.freeEdit} onChange=${e => update(x => { x.freeEdit = e.target.checked; })} /> Player may use Free edit</label>`}
      </div>
      ${edit && html`<div class="grid4 editbox">
        <${Field} label="Pronouns" value=${c.pronouns} onInput=${v => update(x => { x.pronouns = v; })} />
        <${Field} label="Player" value=${c.player} onInput=${v => update(x => { x.player = v; })} />
        <${Field} label="Campaign" value=${c.campaign} list="dh-camps" onInput=${v => update(x => { x.campaign = v; })} />
        <${Field} label="Portrait link" value=${c.portraitUrl} placeholder="https://…" onInput=${v => update(x => { x.portraitUrl = v; })} />
        <${Select} label="Class" value=${c.cls} empty="—" options=${SRD.classes.map(k => k.name)} onChange=${v => update(x => { x.cls = v; x.sub = ""; })} />
        <${Select} label="Subclass" value=${c.sub} empty="—" options=${R.subclassesOf(c.cls).map(s => s.name)} onChange=${v => update(x => { x.sub = v; })} />
        <${Select} label="Ancestry" value=${c.ancestry} empty="—" options=${SRD.ancestries.filter(a => a.features.length).map(a => a.name)} onChange=${v => update(x => { x.ancestry = v; x.mixed = null; })} />
        <${Select} label="Community" value=${c.community} empty="—" options=${SRD.communities.map(a => a.name)} onChange=${v => update(x => { x.community = v; })} />
        <${Select} label="Transformation" value=${c.transformation} empty="None" options=${SRD.transformations.map(a => a.name)} onChange=${v => update(x => { x.transformation = v; })} />
        <${Field} label="Level" type="number" value=${c.level} onInput=${v => update(x => { x.level = R.clamp(num(v, 1), 1, 10); })} />
      </div>`}
      <datalist id="dh-camps">${CAMPAIGNS.map(k => html`<option value=${k} />`)}</datalist>
    </div>
  </div>`;
}

/* ================= sheet tab ================= */
function SheetTab({ c, d, update, edit }) {
  const [dmg, setDmg] = useState("");
  const [useArmor, setUseArmor] = useState(false);
  const [rest, setRest] = useState(null);
  const [death, setDeath] = useState(false);
  const opt = Store.state.options || {};
  const sev = dmg === "" ? null : R.severity(dmg, d.major, d.severe, { massive: opt.massive });
  const canArmor = d.armor && d.armorScore > 0 && d.cur.armor < d.armorScore;
  const marked = sev ? Math.max(0, sev.hp - (useArmor && canArmor ? 1 : 0)) : 0;
  const take = () => {
    if (!sev) return;
    update(x => {
      if (useArmor && canArmor) x.marks.armor[d.armor.id] = num(x.marks.armor[d.armor.id]) + 1;
      x.marks.hp = R.clamp(num(x.marks.hp) + marked, 0, d.hpMax);
      addLog(x, `Took ${sev.d} damage: ${sev.label}${useArmor && canArmor ? ", marked an Armor Slot" : ""} → ${marked} HP`);
    });
    setDmg(""); setUseArmor(false);
    if (d.cur.hp + marked >= d.hpMax && marked > 0) setTimeout(() => setDeath(true), 50);
    else toast(marked ? `Marked ${marked} Hit Point${marked > 1 ? "s" : ""}.` : "No Hit Points marked.");
  };
  const setMark = (k, v) => update(x => { x.marks[k] = v; });
  const traitTip = t => () => ({ title: `${t.n} ${R.sign(d.traits[t.k])}`, lines: [t.v, d.marked.has(t.k) ? "Marked this tier: can't be raised again until the next tier." : "", ...d.mods.filter(m => m.to === t.n.toLowerCase()).map(m => `${m.from}: ${R.sign(m.v)}`)].filter(Boolean) });
  return html`<div class="sheet">
    <section class="card">
      <${Head} title="Traits" topic="traits" />
      <div class="traits">${R.TRAITS.map(t => html`<div class=${"trait" + (d.marked.has(t.k) ? " marked" : "") + (d.spellTraits.includes(t.k) ? " spell" : "")} onMouseEnter=${e => tip.show(e.currentTarget, traitTip(t)())} onMouseLeave=${() => tip.hide()}>
        <span class="tn">${t.n}</span><b class="tv">${R.sign(d.traits[t.k])}</b><span class="tverbs">${t.v}</span>
        ${d.spellTraits.includes(t.k) && html`<span class="tag">Spellcast</span>`}
        ${edit && html`<${Stepper} label=${t.n} value=${c.traits[t.k]} onSet=${v => update(x => { x.traits[t.k] = v; addLog(x, `Free edit: ${t.n} → ${R.sign(v)}`); })} />`}
      </div>`)}</div>
    </section>

    <section class="card defense">
      <${Head} title="Defense" topic="defense" />
      <div class="stats">
        <div class="stat"><span>Evasion</span><b>${d.evasion}</b>${edit && html`<${Stepper} label="Evasion bonus" value=${c.bonus.evasion} onSet=${v => update(x => { x.bonus.evasion = v; })} />`}</div>
        <div class="stat"><span>Armor Score</span><b>${d.armorScore}</b>${edit && html`<${Stepper} label="Armor bonus" value=${c.bonus.armor} onSet=${v => update(x => { x.bonus.armor = v; })} />`}</div>
        <div class="stat"><span>Proficiency</span><b>${d.prof}</b>${edit && html`<${Stepper} label="Proficiency bonus" value=${c.bonus.prof} onSet=${v => update(x => { x.bonus.prof = v; })} />`}</div>
        <div class="stat thr"><span>Damage thresholds</span><b><small>Minor</small> 1–${d.major - 1} <small>Major</small> ${d.major}–${d.severe - 1} <small>Severe</small> ${d.severe}+</b></div>
      </div>
      ${d.mods.length > 0 && html`<p class="muted small">${d.mods.map(m => `${m.from}: ${R.sign(m.v)} ${m.to}`).join(" · ")}</p>`}
    </section>

    <section class="card health">
      <${Head} title="Damage & health" topic="health" />
      <div class="trackrow"><span class="tl">Hit Points</span><${Track} label="Hit Points" value=${d.cur.hp} max=${d.hpMax} kind="hp" onSet=${v => { setMark("hp", v); if (v >= d.hpMax) setTimeout(() => setDeath(true), 50); }} />
        ${edit && html`<${Stepper} label="HP slot bonus" value=${c.bonus.hp} onSet=${v => update(x => { x.bonus.hp = v; })} />`}</div>
      <div class="trackrow"><span class="tl">Stress</span><${Track} label="Stress" value=${d.cur.stress} max=${d.stressMax} kind="stress" onSet=${v => setMark("stress", v)} />
        ${edit && html`<${Stepper} label="Stress slot bonus" value=${c.bonus.stress} onSet=${v => update(x => { x.bonus.stress = v; })} />`}</div>
      ${d.armor && html`<div class="trackrow"><span class="tl">Armor Slots</span><${Track} label="Armor Slots" value=${d.cur.armor} max=${d.armorScore} kind="armor" onSet=${v => update(x => { x.marks.armor[d.armor.id] = v; })} /></div>`}
      <div class="trackrow"><span class="tl">Hope</span><${Track} label="Hope" value=${d.cur.hope} max=${d.hopeMax} lock=${Math.min(num(c.scars), 6)} kind="hope" verb=${["Gain", "Spend"]} onSet=${v => setMark("hope", v)} />
        ${edit && html`<span class="muted small">Scars <${Stepper} label="Scars" value=${c.scars} min=${0} max=${6} onSet=${v => update(x => { x.scars = v; })} /></span>`}</div>
      ${d.vulnerable && html`<p class="warn">All Stress is marked: <b>Vulnerable</b> until you clear a Stress.</p>`}
      ${num(c.wither) > 0 && html`<p class="warn">Wither tokens: <b>${c.wither}</b></p>`}
      <div class="dmgcalc">
        <label class="field"><span>Take damage</span><input type="number" inputmode="numeric" min="0" value=${dmg} placeholder="Amount" onInput=${e => setDmg(e.target.value)} /></label>
        ${d.armor && d.armorScore > 0 && html`<label class="chk"><input type="checkbox" checked=${useArmor} disabled=${!canArmor} onChange=${e => setUseArmor(e.target.checked)} /> Mark an Armor Slot</label>`}
        ${sev && html`<span class="sev">${sev.label} → <b>${marked} HP</b></span>`}
        <button class="btn primary" disabled=${!sev} onClick=${take}>Apply</button>
      </div>
      <div class="row">
        <button class="btn" onClick=${() => setRest("short")}>Short rest</button><button class="btn" onClick=${() => setRest("long")}>Long rest</button>
        ${d.down && html`<button class="btn danger" onClick=${() => setDeath(true)}>Death move</button>`}
      </div>
    </section>

    <section class="card">
      <${Head} title="Experiences" topic="experiences" tail=${html`<button class="btn small" onClick=${() => update(x => { x.experiences.push({ id: rid("e"), name: "", base: 2 }); })}>+ Add</button>`} />
      <div class="exps">${d.exps.map((e, i) => html`<div class="exp">
        <input value=${c.experiences[i].name} placeholder="An Experience" aria-label="Experience" onInput=${ev => update(x => { x.experiences[i].name = ev.target.value; })} />
        <b>${R.sign(e.mod)}</b>
        ${edit && html`<${Stepper} label="Base" value=${c.experiences[i].base} onSet=${v => update(x => { x.experiences[i].base = v; })} /><button class="iconbtn" aria-label="Remove" onClick=${() => update(x => { x.experiences.splice(i, 1); })}>×</button>`}
      </div>`)}${!d.exps.length && html`<p class="muted">No Experiences yet. You start with two at +2.</p>`}</div>
    </section>

    <section class="card">
      <${Head} title="Active weapons" topic="weapons" />
      <${WeaponLines} c=${c} d=${d} />
    </section>

    <section class="card">
      <${Head} title="Conditions" topic="conditions" />
      <${Conditions} c=${c} d=${d} update=${update} />
    </section>
    ${rest && html`<${RestDialog} c=${c} d=${d} kind=${rest} update=${update} onClose=${() => setRest(null)} />`}
    ${death && html`<${DeathDialog} c=${c} d=${d} update=${update} onClose=${() => setDeath(false)} />`}
  </div>`;
}

function WeaponLines({ c, d }) {
  const ws = R.equipped(c);
  if (!ws.length) return html`<p class="muted">No weapon equipped. Unarmed attacks use Strength or Finesse and deal ${d.prof}d4 damage. Equip weapons on the Gear tab.</p>`;
  return html`<div class="wlines">${ws.map(w => { const W = R.weaponStats(w); if (!W) return null; const t = R.TRAIT_KEY[(W.trait || "").toLowerCase()];
    return html`<div class="wline"><b>${W.name}</b><span class="tag">${w.slot === "primary" ? "Primary" : "Secondary"}</span>
      <span>${W.trait} ${t != null ? R.sign(d.traits[t]) : ""} · ${W.range} · <b>${R.damageExpr(W.dmg, d.prof)}</b> ${/mag|phy/.exec(W.dmg) ? W.dmg.replace(/^.*?(phy\/mag|phy or mag|phy|mag).*$/, "$1") : ""} · ${W.burden}</span>
      ${W.feat && html`<${Md} cls="small" text=${W.feat} />`}</div>`; })}</div>`;
}

const COND = ["Hidden", "Restrained", "Vulnerable"];
function Conditions({ c, d, update }) {
  const [v, setV] = useState("");
  const add = n => { n = n.trim(); if (!n || c.conditions.includes(n)) return; update(x => { x.conditions.push(n); }); setV(""); };
  return html`<div class="conds">
    ${c.conditions.map((n, i) => html`<button class="chip on" title="Remove" onClick=${() => update(x => { x.conditions.splice(i, 1); })}>${n} ×</button>`)}
    ${d.vulnerable && !c.conditions.includes("Vulnerable") && html`<span class="chip auto">Vulnerable (all Stress marked)</span>`}
    ${COND.filter(n => !c.conditions.includes(n)).map(n => html`<button class="chip" onClick=${() => add(n)}>+ ${n}</button>`)}
    <form class="inline" onSubmit=${e => { e.preventDefault(); add(v); }}><input placeholder="Other condition" value=${v} onInput=${e => setV(e.target.value)} aria-label="Other condition" /></form>
  </div>`;
}

/* ================= rests ================= */
function RestDialog({ c, d, kind, update, onClose }) {
  const moves = kind === "short" ? R.SHORT_MOVES : R.LONG_MOVES;
  const [pick, setPick] = useState([]);
  const [party, setParty] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = k => setPick(p => (p.length >= 2 ? [p[1], k] : p.concat(k)));
  const go = async () => {
    setBusy(true);
    const lines = []; const rolls = {};
    for (const k of pick) if (kind === "short" && ["wounds", "stress", "armor"].includes(k)) {
      const r = await rollExpr(moves.find(m => m.k === k).n, "1d4"); if (r == null) { setBusy(false); return; }
      rolls[k] = (rolls[k] || 0) + r + d.tier;
    }
    update(x => {
      [...new Set(pick)].forEach(k => {
        const times = pick.filter(y => y === k).length;
        if (k === "wounds") { const n = kind === "long" ? num(x.marks.hp) : Math.min(num(x.marks.hp), rolls.wounds); x.marks.hp = num(x.marks.hp) - n; lines.push(`cleared ${n} HP`); }
        if (k === "stress") { const n = kind === "long" ? num(x.marks.stress) : Math.min(num(x.marks.stress), rolls.stress); x.marks.stress = num(x.marks.stress) - n; lines.push(`cleared ${n} Stress`); }
        if (k === "armor" && d.armor) { const m = num(x.marks.armor[d.armor.id]); const n = kind === "long" ? m : Math.min(m, rolls.armor); x.marks.armor[d.armor.id] = m - n; lines.push(`repaired ${n} Armor Slot${n === 1 ? "" : "s"}`); }
        if (k === "prepare") { const g = (party ? 2 : 1) * times; x.marks.hope = Math.min(d.hopeMax, num(x.marks.hope) + g); lines.push(`gained ${g} Hope`); }
        if (k === "project") lines.push("worked on a project");
      });
      R.refreshUses(x, kind);
      x.restsInARow = kind === "short" ? num(x.restsInARow) + 1 : 0;
      addLog(x, `${kind === "short" ? "Short" : "Long"} rest: ${lines.join(", ") || "rested"}`);
    });
    toast(`${kind === "short" ? "Short" : "Long"} rest taken. Uses refreshed.`);
    onClose();
  };
  const three = kind === "short" && num(c.restsInARow) >= 3;
  return html`<${Modal} title=${kind === "short" ? "Short rest" : "Long rest"} onClose=${onClose} foot=${html`<span class="muted small">${pick.length}/2 chosen</span><button class="btn primary" disabled=${busy || !pick.length} onClick=${go}>Rest</button>`}>
    ${three && html`<p class="warn">The party has taken three short rests in a row: this one should be a long rest.</p>`}
    <p class="muted">You can swap domain cards between loadout and vault for free now. Choose two downtime moves (the same one twice is fine).</p>
    <div class="moves">${moves.map(m => { const n = pick.filter(x => x === m.k).length; return html`<button class=${"move" + (n ? " on" : "")} onClick=${() => toggle(m.k)}><b>${m.n}${n > 1 ? " ×2" : ""}</b><span>${m.d}</span></button>`; })}</div>
    ${pick.includes("prepare") && html`<label class="chk"><input type="checkbox" checked=${party} onChange=${e => setParty(e.target.checked)} /> Preparing with party members (2 Hope each)</label>`}
    <p class="muted small">Moves on yourself only: to tend an ally, apply it on their sheet. The GM gains ${kind === "short" ? "1d4" : "1d4 + the number of PCs"} Fear.</p>
  </${Modal}>`;
}

/* ================= death moves ================= */
function DeathDialog({ c, d, update, onClose }) {
  const [res, setRes] = useState("");
  const avoid = async () => {
    const h = await rollExpr("Hope Die", "1d12"); if (h == null) return;
    const scar = h <= c.level;
    update(x => { if (scar) x.scars = num(x.scars) + 1; if (!x.conditions.includes("Unconscious")) x.conditions.push("Unconscious"); addLog(x, `Avoid Death: Hope Die ${h}${scar ? " — gained a scar" : ""}`); });
    setRes(`Hope Die: ${h}. ${scar ? `That's at or below your level (${c.level}): you gain a scar and lose a Hope slot for good. ${d.hopeMax - 1 <= 0 ? "That was your last Hope slot: your journey ends." : ""}` : "Above your level: no scar."} You're unconscious until an ally clears a Hit Point or the party finishes a long rest.`);
  };
  const risk = async () => {
    let r; if (ownRolls()) { const h = await rollExpr("Hope Die", "1d12"); if (h == null) return; const f = await rollExpr("Fear Die", "1d12"); if (f == null) return; r = R.duality({ hope: h, fear: f }); } else r = R.duality();
    if (r.crit) { update(x => { x.marks.hp = 0; x.marks.stress = 0; addLog(x, `Risk It All: ${r.h}/${r.f} matching — cleared all HP and Stress`); }); setRes(`Hope ${r.h}, Fear ${r.f}: matching! You stay up and clear all Hit Points and Stress.`); }
    else if (r.h > r.f) { update(x => { const n = Math.min(r.h, num(x.marks.hp)); x.marks.hp = num(x.marks.hp) - n; x.marks.stress = Math.max(0, num(x.marks.stress) - (r.h - n)); addLog(x, `Risk It All: Hope ${r.h} beats Fear ${r.f}`); }); setRes(`Hope ${r.h} beats Fear ${r.f}: you stay on your feet and clear ${r.h} Hit Points or Stress (the app cleared Hit Points first; adjust if you'd rather split it).`); }
    else { update(x => { x.dead = true; addLog(x, `Risk It All: Fear ${r.f} beats Hope ${r.h} — crossed through the veil`); }); setRes(`Fear ${r.f} beats Hope ${r.h}: your character crosses through the veil of death.`); }
  };
  return html`<${Modal} title="Death move" onClose=${onClose}>
    ${res ? html`<p class="result">${res}</p><div class="row"><button class="btn primary" onClick=${onClose}>Close</button></div>` : html`
    <p>You marked your last Hit Point. Choose a death move:</p>
    <div class="moves">
      <button class="move" onClick=${() => { update(x => { x.dead = true; addLog(x, "Blaze of Glory"); }); setRes("Take one final action: it critically succeeds (with GM approval), then you cross through the veil of death."); }}><b>Blaze of Glory</b><span>One final action that automatically critically succeeds, then you die.</span></button>
      <button class="move" onClick=${avoid}><b>Avoid Death</b><span>Drop unconscious and the situation worsens. Roll your Hope Die: at or below your level, you gain a scar.</span></button>
      <button class="move" onClick=${risk}><b>Risk It All</b><span>Roll the Duality Dice: Hope higher, you clear that many HP or Stress; Fear higher, you die; matching, you clear everything.</span></button>
    </div>`}</${Modal}>`;
}

/* ================= the duality dice dock ================= */
function DiceDock({ c, update }) {
  const [open, setOpen] = useState(false);
  const [trait, setTrait] = useState(""); const [exps, setExps] = useState([]); const [adv, setAdv] = useState(0);
  const [mod, setMod] = useState(0); const [diff, setDiff] = useState(""); const [reaction, setReaction] = useState(false);
  const [res, setRes] = useState(null); const [hand, setHand] = useState({ h: "", f: "", a: "" });
  const d = c && c.kind !== "companion" ? derive(c) : null;
  const tmod = d && trait ? d.traits[trait] : 0;
  const emod = d ? d.exps.filter(e => exps.includes(e.id)).reduce((s, e) => s + e.mod, 0) : 0;
  const go = () => {
    if (d && exps.length > d.cur.hope) { toast(`Using ${exps.length} Experience${exps.length > 1 ? "s" : ""} costs ${exps.length} Hope; you have ${d.cur.hope}.`); return; }
    const own = ownRolls();
    if (own && (hand.h === "" || hand.f === "" || (adv && hand.a === ""))) { toast("Type what you rolled on each die."); return; }
    const r = R.duality({ mod: tmod + emod + num(mod), adv, difficulty: diff, hope: own ? num(hand.h) : undefined, fear: own ? num(hand.f) : undefined, advDie: own ? num(hand.a) : undefined });
    setRes(r);
    if (c && d) update(x => {
      let hope = num(x.marks.hope) - exps.length;
      if (!reaction && r.withHope) hope += 1;
      if (!reaction && r.crit) x.marks.stress = Math.max(0, num(x.marks.stress) - 1);
      x.marks.hope = R.clamp(hope, 0, d.hopeMax);
      addLog(x, `${reaction ? "Reaction" : "Action"} roll: ${r.total} ${r.crit ? "critical success" : r.withHope ? "with Hope" : "with Fear"}${trait ? " (" + R.TRAIT_NAME[trait] + ")" : ""}`);
    });
    if (!reaction && !r.withHope && Store.mode !== "loading") Store.addFear(1);
  };
  if (!open) return html`<button class="dock-btn" onClick=${() => setOpen(true)} aria-label="Roll the Duality Dice"><span class="dd h"></span><span class="dd f"></span>Roll</button>`;
  return html`<div class="dock" role="dialog" aria-label="Duality Dice">
    <div class="m-head"><b>Duality Dice${c && c.kind !== "companion" ? ` · ${c.name || "Unnamed"}` : ""}</b><button class="iconbtn" aria-label="Close" onClick=${() => { setOpen(false); setRes(null); }}>×</button></div>
    ${d && html`<div class="chips">${R.TRAITS.map(t => html`<button class=${"chip" + (trait === t.k ? " on" : "")} onClick=${() => setTrait(trait === t.k ? "" : t.k)}>${t.n} ${R.sign(d.traits[t.k])}</button>`)}</div>
      ${d.exps.length > 0 && html`<div class="chips">${d.exps.map(e => html`<button class=${"chip exp" + (exps.includes(e.id) ? " on" : "")} title="Costs 1 Hope" onClick=${() => setExps(x => x.includes(e.id) ? x.filter(y => y !== e.id) : x.concat(e.id))}>${e.name || "Experience"} ${R.sign(e.mod)}</button>`)}</div>`}`}
    <div class="row wrapr">
      <div class="seg small">${[[-1, "Disadvantage"], [0, "Normal"], [1, "Advantage"]].map(([k, n]) => html`<button aria-pressed=${adv === k} onClick=${() => setAdv(k)}>${n}</button>`)}</div>
      <label class="field tiny"><span>Modifier</span><input type="number" value=${mod} onInput=${e => setMod(e.target.value)} /></label>
      <label class="field tiny"><span>Difficulty</span><input type="number" value=${diff} placeholder="?" onInput=${e => setDiff(e.target.value)} /></label>
      <label class="chk small"><input type="checkbox" checked=${reaction} onChange=${e => setReaction(e.target.checked)} /> Reaction roll</label>
    </div>
    ${ownRolls() && html`<div class="row wrapr"><label class="field tiny"><span>Hope die</span><input type="number" min="1" max="12" value=${hand.h} onInput=${e => setHand(Object.assign({}, hand, { h: e.target.value }))} /></label>
      <label class="field tiny"><span>Fear die</span><input type="number" min="1" max="12" value=${hand.f} onInput=${e => setHand(Object.assign({}, hand, { f: e.target.value }))} /></label>
      ${adv !== 0 && html`<label class="field tiny"><span>d6</span><input type="number" min="1" max="6" value=${hand.a} onInput=${e => setHand(Object.assign({}, hand, { a: e.target.value }))} /></label>`}</div>`}
    <button class="btn primary wide" onClick=${go}>Roll${exps.length ? ` (spend ${exps.length} Hope)` : ""} · ${R.sign(tmod + emod + num(mod))}</button>
    ${res && html`<div class=${"rollres " + (res.crit ? "crit" : res.withHope ? "hope" : "fear")}>
      <div class="dice"><span class="die h">${res.h}</span><span class="die f">${res.f}</span>${res.adv ? html`<span class="die a">${res.adv > 0 ? "+" : "−"}${res.a}</span>` : ""}</div>
      <b class="tot">${res.total}</b>
      <span>${res.crit ? "Critical success!" : res.withHope ? "with Hope" : "with Fear"}${res.success === true && !res.crit ? " · success" : res.success === false ? " · failure" : ""}</span>
      <small>${reaction ? "Reaction rolls don't give Hope or Fear." : res.crit ? "You gain a Hope and clear a Stress." : res.withHope ? "You gain a Hope." : "The GM gains a Fear."}</small></div>`}
  </div>`;
}

/* ================= abilities tab: features and domain cards ================= */
function FeatureCard({ c, update, src, f, kind }) {
  const u = R.usage(f.x); const key = `${src}:${f.n}|${u.per || ""}`; const tkey = `${src}:${f.n}`;
  const used = num(c.uses[key]);
  return html`<div class=${"feat" + (kind ? " " + kind : "")}>
    <div class="fhead"><b>${f.n}</b>${kind && html`<span class="tag">${kind}</span>`}
      ${u.times > 0 && html`<span class="uses" title=${`${u.times} per ${u.per === "long" ? "long rest" : u.per}`}>${Array.from({ length: u.times }, (_, i) => html`<button class=${"use" + (i < used ? " on" : "")} aria-label=${`Use ${i + 1}`} ...${pressProps(() => i >= used && update(x => { x.uses[key] = i + 1; }), () => i < used && update(x => { x.uses[key] = i; }), { title: `Once per ${u.per === "long" ? "long rest" : u.per}`, lines: ["Left-click: used", "Right-click: not used"] })}></button>`)}<small>per ${u.per === "long" ? "long rest" : u.per}</small></span>`}
      ${u.tokens && html`<span class="tokens" title="Tokens on this card">◆ <${Stepper} label="Tokens" value=${num(c.tokens[tkey])} min=${0} onSet=${v => update(x => { x.tokens[tkey] = v; })} /></span>`}
    </div><${Md} text=${f.x} /></div>`;
}
function AbilitiesTab({ c, d, update, edit }) {
  const K = d.cls, sub = d.sub;
  const [pick, setPick] = useState(false);
  const [filter, setFilter] = useState("all");
  const anc = R.byName("ancestries", c.ancestry), com = R.byName("communities", c.community), tr = R.byName("transformations", c.transformation);
  const mixed = c.mixed ? [R.byName("ancestries", c.mixed.a1), R.byName("ancestries", c.mixed.a2)] : null;
  const subFeats = sub ? [["Foundation", sub.foundation], ["Specialization", sub.specialization], ["Mastery", sub.mastery]].slice(0, d.subTier) : [];
  const recall = (i, cardObj) => {
    const isVault = c.cards[i].where === "vault";
    if (isVault && d.loadout.length >= R.MAX.loadout) { toast("Your loadout is full (5). Move a card to the vault first."); return; }
    if (isVault && cardObj && cardObj.recall > 0 && !confirm(`Recalling ${cardObj.name} now costs ${cardObj.recall} Stress (free during a rest). Mark ${cardObj.recall} Stress?`)) return;
    update(x => {
      x.cards[i].where = isVault ? "loadout" : "vault";
      if (isVault && cardObj && cardObj.recall > 0) x.marks.stress = Math.min(d.stressMax, num(x.marks.stress) + cardObj.recall);
    });
  };
  const show = k => filter === "all" || filter === k;
  return html`<div class="abilities">
    <div class="seg small" role="group" aria-label="Show">${[["all", "All"], ["cards", "Domain cards"], ["class", "Class"], ["heritage", "Heritage"]].map(([k, n]) => html`<button aria-pressed=${filter === k} onClick=${() => setFilter(k)}>${n}</button>`)}</div>
    ${show("cards") && html`<section class="card">
      <${Head} title=${`Loadout · ${d.loadout.length}/5`} topic="loadout" tail=${html`<button class="btn small" onClick=${() => setPick(true)}>+ Add card</button>`} />
      ${d.cardCount !== d.cardsExpected && html`<p class="muted small">At level ${c.level} you'd normally have ${d.cardsExpected} domain cards; this sheet has ${d.cardCount}.</p>`}
      <div class="cards">${c.cards.map((x, i) => x.where !== "vault" && html`<${DomainCard} name=${x.name} onMove=${() => recall(i, R.card(x.name))} moveLabel="To vault" onRemove=${edit ? () => update(y => { y.cards.splice(i, 1); }) : null} />`)}</div>
      ${!d.loadout.length && html`<p class="muted">No domain cards yet.</p>`}
      ${d.vault.length > 0 && html`<${Head} level=${3} title=${`Vault · ${d.vault.length}`} />
        <div class="cards vault">${c.cards.map((x, i) => x.where === "vault" && html`<${DomainCard} name=${x.name} onMove=${() => recall(i, R.card(x.name))} moveLabel=${`Recall${R.card(x.name) && R.card(x.name).recall ? ` (${R.card(x.name).recall} Stress)` : ""}`} onRemove=${edit ? () => update(y => { y.cards.splice(i, 1); }) : null} />`)}</div>`}
    </section>`}
    ${show("class") && html`<section class="card">
      <${Head} title=${K ? `${K.name} features` : "Class features"} topic="classes" />
      ${!K && html`<p class="muted">Choose a class (Free edit, or the creation guide) to see its features.</p>`}
      ${K && html`<div class="feats">
        <${FeatureCard} c=${c} update=${update} src=${K.name} f=${K.hope} kind="Hope feature" />
        ${K.features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${K.name} f=${f} />`)}
        ${subFeats.map(([lbl, fs]) => fs.map(f => html`<${FeatureCard} c=${c} update=${update} src=${sub.name} f=${f} kind=${lbl} />`))}
        ${c.multi && c.multi.cls && html`${(R.byName("classes", c.multi.cls) || { features: [] }).features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${c.multi.cls} f=${f} kind="Multiclass" />`)}
          ${d.msub && d.msub.foundation.map(f => html`<${FeatureCard} c=${c} update=${update} src=${d.msub.name} f=${f} kind="Multiclass foundation" />`)}`}
      </div>
      ${K.extra.length > 0 && html`<div class="row"><button class="btn small" onClick=${() => openPanel({ title: K.name, sub: "More class rules", body: html`${K.extra.map(e => html`<h4>${e.h}</h4><${Md} text=${e.x} />`)}` })}>${K.extra[0].h} and more</button></div>`}`}
    </section>`}
    ${show("heritage") && html`<section class="card">
      <${Head} title="Heritage" topic="heritage" />
      <div class="feats">
        ${mixed ? html`${mixed[0] && html`<${FeatureCard} c=${c} update=${update} src=${mixed[0].name} f=${mixed[0].features[0]} kind=${mixed[0].name} />`}${mixed[1] && html`<${FeatureCard} c=${c} update=${update} src=${mixed[1].name} f=${mixed[1].features[1]} kind=${mixed[1].name} />`}`
          : anc && anc.features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${anc.name} f=${f} kind=${anc.name} />`)}
        ${com && com.features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${com.name} f=${f} kind=${com.name} />`)}
        ${tr && tr.features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${tr.name} f=${f} kind=${tr.name} />`)}
      </div>${!anc && !com && !mixed && html`<p class="muted">Choose an ancestry and community to see their features.</p>`}
    </section>`}
    ${pick && html`<${CardPicker} c=${c} onClose=${() => setPick(false)} onPick=${n => { update(x => { x.cards.push({ name: n, where: d.loadout.length < 5 ? "loadout" : "vault" }); addLog(x, `Added domain card ${n}`); }); setPick(false); }} />`}
  </div>`;
}
function DomainCard({ name, onMove, moveLabel, onRemove, picked, onPick }) {
  const x = R.card(name);
  if (!x) return html`<div class="dcard"><b>${name}</b><p class="muted">Not found in the SRD data.</p></div>`;
  return html`<div class=${"dcard dom-" + x.dom.toLowerCase() + (picked ? " picked" : "")}>
    <div class="dtop"><span class="dlvl">${x.lvl}</span><span class="ddom">${x.dom} · ${x.type}</span><span class="drec" title="Recall cost">⚡${x.recall}</span></div>
    <b class="dname">${x.name}</b><${Md} text=${x.x} />
    ${(onMove || onRemove || onPick) && html`<div class="dfoot">${onPick && html`<button class=${"btn small" + (picked ? " on" : "")} onClick=${onPick}>${picked ? "Chosen" : "Choose"}</button>`}
      ${onMove && html`<button class="btn small" onClick=${onMove}>${moveLabel}</button>`}${onRemove && html`<button class="btn small danger" onClick=${onRemove}>Remove</button>`}</div>`}
  </div>`;
}
function CardPicker({ c, onClose, onPick, forLevel, maxLevel, title = "Add a domain card", exclude = [] }) {
  const [dom, setDom] = useState("");
  const [any, setAny] = useState(false);
  let pool = any ? SRD.cards.filter(x => !c.cards.some(y => y.name === x.name)) : R.availableCards(c, forLevel);
  if (maxLevel) pool = pool.filter(x => x.lvl <= maxLevel);
  pool = pool.filter(x => !exclude.includes(x.name));
  const doms = [...new Set(pool.map(x => x.dom))];
  const shown = pool.filter(x => !dom || x.dom === dom);
  return html`<${Modal} title=${title} onClose=${onClose} wide>
    <div class="row wrapr"><div class="seg small">${["", ...doms].map(k => html`<button aria-pressed=${dom === k} onClick=${() => setDom(k)}>${k || "All"}</button>`)}</div>
      ${canFree(c) && html`<label class="chk small"><input type="checkbox" checked=${any} onChange=${e => setAny(e.target.checked)} /> Any domain and level (GM)</label>`}</div>
    <div class="cards">${shown.map(x => html`<${DomainCard} name=${x.name} onPick=${() => onPick(x.name)} />`)}</div>
    ${!shown.length && html`<p class="muted">No cards to choose here.</p>`}
  </${Modal}>`;
}

/* ================= gear tab ================= */
function GearTab({ c, d, update, edit }) {
  const [wpick, setWpick] = useState(null); const [apick, setApick] = useState(false); const [ipick, setIpick] = useState(null);
  const slots = { primary: c.weapons.find(w => w.slot === "primary"), secondary: c.weapons.find(w => w.slot === "secondary") };
  const burdenWarn = (() => { const p = R.weaponStats(slots.primary), s = R.weaponStats(slots.secondary); return p && s && /two/i.test(p.burden) && !(c.cls === "Warrior") ? "A two-handed primary weapon leaves no hand for a secondary weapon." : ""; })();
  const tierWarn = c.weapons.concat(c.armor).some(w => { const S = w.slot ? R.weaponStats(w) : R.armorStats(w); return S && S.tier && S.tier > d.tier && (w.slot === "primary" || w.slot === "secondary" || w.worn); });
  const setSlot = (i, slot) => update(x => {
    if (slot === "primary" || slot === "secondary") x.weapons.forEach(w => { if (w.slot === slot) w.slot = "pack"; });
    x.weapons[i].slot = slot;
  });
  const g = c.gold;
  const addGold = (k, n) => update(x => { const unit = { coins: 1, handfuls: 10, bags: 100, chests: 1000 }[k]; const t = R.goldTotal(x.gold) + n * unit; if (t > 1999 && n > 0 && k !== "coins") toast("You can't hold more than one chest. Spend some, or store it somewhere."); x.gold = R.goldFrom(R.clamp(t, 0, 1999), x.useCoins); });
  return html`<div class="gear">
    <section class="card">
      <${Head} title="Weapons" topic="weapons" tail=${html`<button class="btn small" onClick=${() => setWpick("pack")}>+ Weapon</button>`} />
      ${burdenWarn && html`<p class="warn">${burdenWarn}</p>`}
      ${tierWarn && html`<p class="warn">You can't equip weapons or armor of a higher tier than yours (tier ${d.tier}).</p>`}
      <div class="wcards">${c.weapons.map((w, i) => { const W = R.weaponStats(w); return html`<div class=${"wcard" + (w.slot !== "pack" ? " eq" : "")}>
        <div class="whead"><b>${W ? W.name : w.name}</b>${W && W.tier && html`<span class="tag">Tier ${W.tier}</span>`}${W && html`<span class="tag">${W.cat}</span>`}</div>
        ${w.custom && edit ? html`<div class="grid4"><${Field} label="Name" value=${w.name} onInput=${v => update(x => { x.weapons[i].name = v; })} />
            <${Select} label="Trait" value=${w.trait} options=${R.TRAITS.map(t => t.n)} onChange=${v => update(x => { x.weapons[i].trait = v; })} />
            <${Select} label="Range" value=${w.range} options=${R.RANGES} onChange=${v => update(x => { x.weapons[i].range = v; })} />
            <${Field} label="Damage" value=${w.dmg} placeholder="d8+1 phy" onInput=${v => update(x => { x.weapons[i].dmg = v; })} />
            <${Select} label="Burden" value=${w.burden} options=${["One-Handed", "Two-Handed"]} onChange=${v => update(x => { x.weapons[i].burden = v; })} />
            <${Field} label="Feature" value=${w.feat} onInput=${v => update(x => { x.weapons[i].feat = v; })} /></div>`
          : W && html`<p>${W.trait} · ${W.range} · <b>${R.damageExpr(W.dmg, d.prof)}</b> (${W.dmg}) · ${W.burden}</p>${W.feat && html`<${Md} cls="small" text=${W.feat} />`}`}
        <div class="row"><div class="seg small">${[["primary", "Primary"], ["secondary", "Secondary"], ["pack", "Inventory"]].map(([k, n]) => html`<button aria-pressed=${w.slot === k} onClick=${() => setSlot(i, k)}>${n}</button>`)}</div>
          <button class="btn small danger" onClick=${() => update(x => { x.weapons.splice(i, 1); })}>Remove</button></div>
      </div>`; })}</div>
      ${c.weapons.filter(w => w.slot === "pack").length > 2 && html`<p class="warn">You can carry up to two weapons in your inventory.</p>`}
      <p class="muted small">Swapping an inventory weapon with an active one is free during a rest or a moment of calm; otherwise mark a Stress.</p>
    </section>

    <section class="card">
      <${Head} title="Armor" topic="armor" tail=${html`<button class="btn small" onClick=${() => setApick(true)}>+ Armor</button>`} />
      <div class="wcards">${c.armor.map((a, i) => { const A = R.armorStats(a); return html`<div class=${"wcard" + (a.worn ? " eq" : "")}>
        <div class="whead"><b>${A ? A.name : a.name}</b>${A && A.tier && html`<span class="tag">Tier ${A.tier}</span>`}</div>
        ${a.custom && edit ? html`<div class="grid4"><${Field} label="Name" value=${a.name} onInput=${v => update(x => { x.armor[i].name = v; })} />
            <${Field} label="Major" type="number" value=${a.major} onInput=${v => update(x => { x.armor[i].major = v; })} />
            <${Field} label="Severe" type="number" value=${a.severe} onInput=${v => update(x => { x.armor[i].severe = v; })} />
            <${Field} label="Score" type="number" value=${a.score} onInput=${v => update(x => { x.armor[i].score = v; })} />
            <${Field} label="Feature" value=${a.feat} onInput=${v => update(x => { x.armor[i].feat = v; })} /></div>`
          : A && html`<p>Base thresholds <b>${A.major} / ${A.severe}</b> · Base score <b>${A.score}</b> · Slots marked ${num(c.marks.armor[a.id])}</p>${A.feat && html`<${Md} cls="small" text=${A.feat} />`}`}
        <div class="row"><button class=${"btn small" + (a.worn ? " on" : "")} onClick=${() => update(x => { x.armor.forEach((y, j) => { y.worn = j === i ? !y.worn : false; }); })}>${a.worn ? "Worn" : "Wear"}</button>
          <button class="btn small danger" onClick=${() => update(x => { x.armor.splice(i, 1); })}>Remove</button></div></div>`; })}</div>
      ${!c.armor.length && html`<p class="muted">Unarmored: Armor Score 0, Major threshold = level, Severe = twice your level.</p>`}
    </section>

    <section class="card">
      <${Head} title="Inventory" topic="inventory" tail=${html`<span class="row"><button class="btn small" onClick=${() => setIpick("item")}>+ Item</button><button class="btn small" onClick=${() => setIpick("consumable")}>+ Consumable</button></span>`} />
      <div class="items">${c.items.map((it, i) => html`<div class="item">
        <input value=${it.name} aria-label="Item" onInput=${e => update(x => { x.items[i].name = e.target.value; })} />
        ${it.kind === "consumable" && html`<span class="tag">Consumable</span><${Stepper} label="Quantity" value=${num(it.qty, 1)} min=${0} max=${R.MAX.consumable} onSet=${v => update(x => { x.items[i].qty = v; })} />`}
        ${it.text && html`<button class="iconbtn" aria-label="What it does" onClick=${() => openPanel({ title: it.name, sub: it.kind === "consumable" ? "Consumable" : "Item", body: html`<${Md} text=${it.text} />` })}>?</button>`}
        <button class="iconbtn" aria-label="Remove" onClick=${() => update(x => { x.items.splice(i, 1); })}>×</button></div>`)}</div>
      <p class="muted small">You can hold up to five of each consumable.</p>
    </section>

    <section class="card">
      <${Head} title="Gold" topic="gold" />
      <div class="gold">${[["handfuls", "Handfuls", 9], ["bags", "Bags", 9], ["chests", "Chest", 1]].map(([k, n, m]) => html`<div class="gk"><span>${n}</span>
        <${Track} label=${n} value=${num(g[k])} max=${m} kind="gold" verb=${["Gain", "Spend"]} onSet=${v => update(x => { x.gold[k] = v; })} />
        <span class="row"><button class="btn tiny" onClick=${() => addGold(k, -1)}>−1</button><button class="btn tiny" onClick=${() => addGold(k, 1)}>+1</button></span></div>`)}
        ${c.useCoins && html`<div class="gk"><span>Coins</span><${Stepper} label="Coins" value=${num(g.coins)} min=${0} max=${9} onSet=${v => update(x => { x.gold.coins = v; })} /></div>`}
      </div>
      <label class="chk small"><input type="checkbox" checked=${!!c.useCoins} onChange=${e => update(x => { x.useCoins = e.target.checked; })} /> Track coins too (optional rule: 10 coins = 1 handful)</label>
    </section>
    ${wpick && html`<${GearPicker} kind="weapon" c=${c} d=${d} onClose=${() => setWpick(null)} onPick=${(name, custom) => { update(x => { x.weapons.push(custom ? { id: rid("w"), custom: true, name: "Custom weapon", trait: "Strength", range: "Melee", dmg: "d8 phy", burden: "One-Handed", feat: "", slot: "pack" } : { id: rid("w"), name, slot: "pack" }); }); setWpick(null); }} />`}
    ${apick && html`<${GearPicker} kind="armor" c=${c} d=${d} onClose=${() => setApick(false)} onPick=${(name, custom) => { update(x => { x.armor.push(custom ? { id: rid("a"), custom: true, name: "Custom armor", major: 5, severe: 11, score: 3, feat: "", worn: !x.armor.length } : { id: rid("a"), name, worn: !x.armor.length }); }); setApick(false); }} />`}
    ${ipick && html`<${GearPicker} kind=${ipick} c=${c} d=${d} onClose=${() => setIpick(null)} onPick=${(name, custom, text) => { update(x => { x.items.push({ id: rid("i"), name: custom ? "" : name, qty: 1, kind: ipick, text: text || "" }); }); setIpick(null); }} />`}
  </div>`;
}
function GearPicker({ kind, c, d, onClose, onPick }) {
  const [q, setQ] = useState(""); const [tier, setTier] = useState(d.tier); const [cat, setCat] = useState("");
  const list = kind === "weapon" ? SRD.weapons : kind === "armor" ? SRD.armor : kind === "item" ? SRD.items : SRD.consumables;
  const needle = q.trim().toLowerCase();
  const rows = list.filter(x => (!needle || x.name.toLowerCase().includes(needle) || (x.feat || x.x || "").toLowerCase().includes(needle))
    && (kind !== "weapon" && kind !== "armor" || !tier || x.tier === +tier) && (kind !== "weapon" || !cat || (cat === "wheel" ? x.wheelchair : x.cat === cat && !x.wheelchair)));
  return html`<${Modal} title=${{ weapon: "Add a weapon", armor: "Add armor", item: "Add an item", consumable: "Add a consumable" }[kind]} onClose=${onClose} wide>
    <div class="row wrapr"><input type="search" placeholder="Search" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Search" />
      ${(kind === "weapon" || kind === "armor") && html`<div class="seg small">${[0, 1, 2, 3, 4].map(t => html`<button aria-pressed=${+tier === t} onClick=${() => setTier(t)}>${t ? "Tier " + t : "All"}</button>`)}</div>`}
      ${kind === "weapon" && html`<div class="seg small">${[["", "All"], ["Primary", "Primary"], ["Secondary", "Secondary"], ["wheel", "Combat wheelchair"]].map(([k, n]) => html`<button aria-pressed=${cat === k} onClick=${() => setCat(k)}>${n}</button>`)}</div>`}
      <button class="btn small" onClick=${() => onPick("", true)}>Custom…</button></div>
    <div class="plist">${rows.slice(0, 120).map(x => html`<button class="prow" onClick=${() => onPick(x.name, false, x.x)}>
      <b>${x.name}</b>
      <span>${kind === "weapon" ? `${x.cat}${x.wheelchair ? " wheelchair" : ""} · ${x.trait} · ${x.range} · ${x.dmg} · ${x.burden}` : kind === "armor" ? `Thresholds ${x.major} / ${x.severe} · Score ${x.score}` : ""}</span>
      ${(x.feat || x.x) && html`<${Md} cls="small" text=${x.feat || x.x} />`}</button>`)}</div>
    ${rows.length > 120 && html`<p class="muted small">Showing 120 of ${rows.length}. Search to narrow it down.</p>`}
    ${kind === "weapon" && html`<p class="muted small">Magic weapons can only be wielded by characters with a Spellcast trait.</p>`}
  </${Modal}>`;
}

/* ================= story tab ================= */
function StoryTab({ c, update }) {
  const K = R.cls(c);
  const qs = K ? K.background : [];
  return html`<div class="story">
    <section class="card"><${Head} title="Description" />
      <${AutoText} label="Description" value=${c.description} placeholder="Clothes, eyes, body, skin, attitude…" onInput=${v => update(x => { x.description = v; })} /></section>
    <section class="card"><${Head} title="Background" topic="background" />
      ${qs.map(q => html`<div class="qa"><p class="q">${q}</p><${AutoText} label=${q} value=${c.answers[q]} placeholder="Your answer" onInput=${v => update(x => { x.answers[q] = v; })} /></div>`)}
      ${!qs.length && html`<p class="muted">Choose a class to see its background questions.</p>`}</section>
    <section class="card"><${Head} title="Connections" />
      ${K && html`<ul class="plain small">${K.connections.map(q => html`<li>${q}</li>`)}</ul>`}
      <${AutoText} label="Connections" value=${c.connections} placeholder="Who you're connected to, and how" onInput=${v => update(x => { x.connections = v; })} /></section>
    <section class="card"><${Head} title="Notes" /><${AutoText} label="Notes" value=${c.notes} placeholder="Anything else" onInput=${v => update(x => { x.notes = v; })} /></section>
  </div>`;
}

/* ================= data tab ================= */
function DataTab({ c, update, onDelete }) {
  const [paste, setPaste] = useState("");
  const fileName = (c.name || "character").replace(/[^\w-]+/g, "_") + ".json";
  const exportBody = () => { const b = clean(c); ["id", "players", "_rev", "companionOf", "freeEdit"].forEach(k => delete b[k]); b.dh = 1; return JSON.stringify(b, null, 1); };
  const apply = () => {
    try {
      const v = JSON.parse(paste); if (!v || !v.dh) throw 0;
      if (!confirm(`Replace ${c.name || "this character"} with ${v.name || "the pasted character"}?`)) return;
      update(x => { const keep = { id: x.id, players: x.players, companionOf: x.companionOf, freeEdit: x.freeEdit }; Object.keys(x).forEach(k => delete x[k]); Object.assign(x, R.normalize(v), keep); addLog(x, "Loaded from a saved file"); });
      setPaste(""); toast("Character loaded.");
    } catch { toast("That doesn't look like a saved character."); }
  };
  return html`<div class="data">
    <section class="card"><${Head} title="Save and load" />
      <div class="row"><button class="btn" onClick=${() => saveFile(fileName, exportBody())}>Save as file</button>
        <label class="btn">Open a file<input type="file" accept=".json,application/json" hidden onChange=${async e => { const f = e.target.files[0]; if (f) setPaste(await f.text()); }} /></label></div>
      <${AutoText} label="Paste a saved character" value=${paste} placeholder="…or paste a saved character here" onInput=${setPaste} />
      ${paste && html`<div class="row"><button class="btn primary" onClick=${apply}>Load into this sheet</button></div>`}
    </section>
    <section class="card"><${Head} title="Log" /><ul class="log">${c.log.map(l => html`<li><time>${new Date(l.t).toLocaleString()}</time> ${l.m}</li>`)}</ul>
      ${!c.log.length && html`<p class="muted">Changes show up here.</p>`}</section>
    <section class="card"><${Head} title="Delete" />
      <button class="btn danger" onClick=${() => { if (confirm(`Delete ${c.name || "this character"} for good?`)) onDelete(c.id); }}>Delete this character</button></section>
  </div>`;
}

/* ================= companion (Beastbound Ranger) ================= */
const COMPANION_OPTS = ["Intelligent", "Light in the Dark", "Creature Comfort", "Armored", "Vicious", "Resilient", "Bonded", "Aware"];
function CompanionSheet({ c, master, update, onDelete }) {
  const k = Object.assign({ evasion: 10, die: "d6", range: "Melee", type: "phy", stressMax: 3, attack: "", options: [] }, c.companion);
  const set = (f, v) => update(x => { x.companion = Object.assign({}, k, { [f]: v }); });
  const md = master ? derive(master) : null;
  const ranger = SRD.classes.find(x => x.name === "Ranger");
  const lvl = ranger && ranger.extra.find(e => /leveling up your companion/i.test(e.h));
  const count = o => k.options.filter(x => x === o).length;
  const evasion = num(k.evasion) + 2 * count("Aware"), stressMax = num(k.stressMax) + count("Resilient");
  return html`<section class="character companion">
    <div class="head card"><span class="portrait"><${Face} c=${c} /></span><div class="hmain">
      <input class="cname" value=${c.name} aria-label="Companion name" onInput=${e => update(x => { x.name = e.target.value; })} />
      <div class="hline">Animal companion${master ? ` of ${master.name || "Unnamed"}` : ""}</div></div></div>
    <div class="sheet">
      <section class="card"><${Head} title="Companion" topic="companion" />
        <div class="stats"><div class="stat"><span>Evasion</span><b>${evasion}</b></div>
          <div class="stat"><span>Attack</span><b>${md ? md.prof : 1}${k.die} ${k.type}</b><small>${k.range}</small></div></div>
        <div class="grid4"><${Field} label="Base Evasion" type="number" value=${k.evasion} onInput=${v => set("evasion", v)} />
          <${Field} label="Standard attack" value=${k.attack} placeholder="Bite, claws…" onInput=${v => set("attack", v)} />
          <${Select} label="Damage die" value=${k.die} options=${["d6", "d8", "d10", "d12"]} onChange=${v => set("die", v)} />
          <${Select} label="Range" value=${k.range} options=${R.RANGES} onChange=${v => set("range", v)} />
          <${Select} label="Damage type" value=${k.type} options=${[["phy", "Physical"], ["mag", "Magic"]]} onChange=${v => set("type", v)} />
          <${Field} label="Base Stress slots" type="number" value=${k.stressMax} onInput=${v => set("stressMax", v)} /></div>
        <div class="trackrow"><span class="tl">Stress</span><${Track} label="Stress" value=${num(c.marks.stress)} max=${stressMax} kind="stress" onSet=${v => update(x => { x.marks.stress = v; })} /></div>
        <p class="muted small">Damage to a companion marks a Stress. At their last Stress they drop out of the scene until your next long rest.</p>
      </section>
      <section class="card"><${Head} title="Companion Experiences" tail=${html`<button class="btn small" onClick=${() => update(x => { x.experiences.push({ id: rid("e"), name: "", base: 2 }); })}>+ Add</button>`} />
        <div class="exps">${c.experiences.map((e, i) => html`<div class="exp"><input value=${e.name} placeholder="Companion Experience" aria-label="Experience" onInput=${ev => update(x => { x.experiences[i].name = ev.target.value; })} />
          <${Stepper} label="Modifier" value=${num(e.base, 2)} onSet=${v => update(x => { x.experiences[i].base = v; })} /><button class="iconbtn" aria-label="Remove" onClick=${() => update(x => { x.experiences.splice(i, 1); })}>×</button></div>`)}</div></section>
      <section class="card"><${Head} title="Level-up options" />
        <div class="chips">${COMPANION_OPTS.map(o => html`<button class=${"chip" + (count(o) ? " on" : "")} ...${pressProps(() => set("options", k.options.concat(o)), () => { const i = k.options.indexOf(o); if (i >= 0) { const n = k.options.slice(); n.splice(i, 1); set("options", n); } }, { title: o, lines: ["Left-click: take it", "Right-click: remove one"] })}>${o}${count(o) > 1 ? ` ×${count(o)}` : ""}</button>`)}</div>
        ${lvl && html`<details><summary>What each option does</summary><${Md} text=${lvl.x} /></details>`}</section>
      <section class="card"><${Head} title="Notes" /><${AutoText} label="Notes" value=${c.notes} onInput=${v => update(x => { x.notes = v; })} />
        <div class="row"><button class="btn danger small" onClick=${() => confirm(`Delete ${c.name}?`) && onDelete(c.id)}>Delete companion</button></div></section>
    </div></section>`;
}
