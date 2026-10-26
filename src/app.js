const { h, render } = preact;
const { useState, useEffect, useMemo, useRef } = preactHooks;
const html = htm.bind(h);
const R = DH;
// game-icons.net icons (src/icons.js), by name.
const Icon = ({ n, cls = "" }) => (window.ICONS && ICONS[n] ? html`<svg class=${"ico " + cls} viewBox="0 0 512 512" aria-hidden="true"><path d=${ICONS[n]} fill="currentColor" /></svg>` : null);
const iconHtml = n => (window.ICONS && ICONS[n] ? `<svg class="ico" viewBox="0 0 512 512" aria-hidden="true"><path d="${ICONS[n]}" fill="currentColor"/></svg>` : "");
// Hope as a cut gem (drawn for this app), in place of the library's rougher diamond.
if (window.ICONS) ICONS.hope = "M256 24 448 192 256 488 64 192Z M256 24 192 192h128Z M64 192h384 M192 192l64 296 64-296".replace(/ M64 192h384 M192 192l64 296 64-296/, " M100 192h312l-12 18H112Z M192 192l64 260 64-260h-20l-44 200-44-200Z");
// The recall bolt (drawn for this app), used on cards, buttons and in the rules alike.
if (window.ICONS) ICONS.recall = "M288 0 64 288h160l-32 224 256-320H288z";
const BOLT = html`<${Icon} n="recall" />`;
const DOMAIN_LOOK = { Arcana: ["#8a62ff", "arcana"], Blade: ["#c8374a", "blade"], Bone: ["#a99f8a", "bone"], Codex: ["#3d82d1", "codex"], Grace: ["#d4569c", "grace"],
  Midnight: ["#4c4fa8", "midnight"], Sage: ["#3f9a5c", "sage"], Splendor: ["#d9a832", "splendor"], Valor: ["#d8742a", "valor"], Dread: ["#8d2fa6", "dread"] };
const domLook = d => DOMAIN_LOOK[d] || ["#7a4ad6", "spell"];
const clsIcon = n => String(n || "").toLowerCase();
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
  mode: "loading", stateLoaded: false, db: null, table: null, members: [], assets: null, readOnly: false,
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
      if ((s.t || 0) >= (this.state.t || 0)) { this.state = s; }
      this.stateLoaded = true; this.emit();
    }, () => {});
    this.emit();
    use("assets").then(a => { this.assets = a; this.emit(); });
    use("table").then(t => { if (!t) return; this.table = t; if (t.role === "gm") t.members(ms => { this.members = ms; this.emit(); }); this.emit(); });
  },
  goLocal() { this.mode = "local"; this.chars = lsGet(LS_KEY, {}); this.state = Object.assign(blankState(), lsGet("dh-state", {})); this.stateLoaded = true; this.emit(); },
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
// Hover cards wait a moment before opening, so they don't fly about as the mouse crosses the page;
// once one is open, moving to the next shows it at once.
const tip = {
  set: () => {}, open: false, el: null, timer: 0,
  show(el, body, now) {
    clearTimeout(this.timer); this.el = el;
    const go = () => { this.open = true; this.set({ el, body }); };
    if (now || this.open) go(); else this.timer = setTimeout(go, 420);
  },
  hide() { clearTimeout(this.timer); this.el = null; this.timer = setTimeout(() => { this.open = false; this.set(null); }, 160); },
};
// A rule token's card: GLOSSARY (rules-info.js) by key, e.g. "range:Close", "cond:Asleep", "trait:Agility".
function gloss(key) {
  if (!key || typeof GLOSSARY === "undefined") return null;
  let g = GLOSSARY[key], T = "";
  if (!g) { const i = key.indexOf(":"); g = GLOSSARY[key.slice(0, i)]; T = key.slice(i + 1); }
  if (!g) return null;
  const f = x => x.replace(/\{T\}/g, T);
  return { rule: 1, title: f(g.t), icon: g.i || R.TRAIT_KEY[T.toLowerCase()] || "spell", arcane: !!g.arcane, md: f(g.x) };
}
function HoverCard() {
  const [s, set] = useState(null); tip.set = set;
  if (!s || !s.el || !document.body.contains(s.el)) return null;
  const b = s.body, r = s.el.getBoundingClientRect(), W = Math.min(b.rule ? 310 : 260, window.innerWidth - 16);
  const above = r.top > (b.rule ? 200 : 120);
  const top = above ? r.top + window.scrollY - 8 : r.bottom + window.scrollY + 8;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2));
  return html`<div class=${"hovercard" + (above ? " above" : "") + (b.rule ? " rule" : "")} style=${`top:${top}px;left:${left}px;width:${W}px`} role="tooltip">
    ${b.rule ? html`<div class="hc-h"><span class=${"hc-medal" + (b.arcane ? " arcane" : "")}><${Icon} n=${b.icon} /></span><b>${b.title}</b></div><${Md} text=${b.md} />`
      : html`${b.title && html`<b>${b.title}</b>`}${(b.lines || []).map(l => html`<div>${l}</div>`)}`}</div>`;
}
// Rule tokens inside ability text are plain HTML, so one listener for the whole page opens their cards (hover, or tap on a phone).
function useTokenCards() {
  useEffect(() => {
    const at = e => (e.target && e.target.closest ? e.target.closest("[data-tip]") : null);
    const over = e => { const t = at(e); if (t && t !== tip.el) { const g = gloss(t.dataset.tip); if (g) tip.show(t, g); } };
    const out = e => { const t = at(e); if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) tip.hide(); };
    const tap = e => { const t = at(e); if (t) { const g = gloss(t.dataset.tip); if (g) tip.show(t, g, true); } };
    const off = () => { if (tip.open || tip.el) tip.hide(); };
    document.addEventListener("mouseover", over); document.addEventListener("mouseout", out); document.addEventListener("click", tap);
    window.addEventListener("scroll", off, true);
    return () => { document.removeEventListener("mouseover", over); document.removeEventListener("mouseout", out); document.removeEventListener("click", tap); window.removeEventListener("scroll", off, true); };
  }, []);
}
// Screen effects: a red flash and a shake when a character is hurt.
const FX = {
  hurt() {
    const b = document.body; b.classList.remove("hurt"); void b.offsetWidth; b.classList.add("hurt");
    clearTimeout(this.t); this.t = setTimeout(() => b.classList.remove("hurt"), 750);
  },
};
const MOUSE_L = "Left-click", MOUSE_R = "Right-click (long-press on a phone)";

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
// Rule words become tokens with an icon, so costs, dice, ranges and rolls stand out in ability text.
const TRAITS_RE = "Agility|Strength|Finesse|Instinct|Presence|Knowledge";
const CONDS = "Vulnerable|Hidden|Restrained|Asleep|Hexed|Distracted|Unstoppable|Poisoned|Stunned|Enraptured|Horrified|Frightened|Dazed|Cloaked";
const tok = (kind, icon, text, key) => `<span class="tok tok-${kind}"${key ? ` data-tip="${key}"` : ""}>${iconHtml(icon)}${text}</span>`;
function tokens(s) {
  const B = "\\*\\*";
  s = s.replace(new RegExp(B + "((?:spend|spending) (?:a|an|one|two|three|\\d+|any number of|all of your|your)? ?Hope)" + B, "gi"), (_, t) => tok("hope", "hope", t));
  s = s.replace(new RegExp(B + "((?:spend|spending) (?:a|an|one|two|\\d+|any number of)? ?Fear)" + B, "gi"), (_, t) => tok("fear", "fear", t, "fear"));
  s = s.replace(new RegExp(B + "((?:mark|marking) (?:a|an|one|two|three|\\d+|any number of|your last|their last)? ?Stress)" + B, "gi"), (_, t) => tok("stress", "stress", t));
  s = s.replace(new RegExp(B + "((?:mark|marking|clear|clears) (?:a|an|one|two|\\d+|any number of|your last|all)? ?Hit Points?)" + B, "gi"), (_, t) => tok("hp", "heart", t));
  s = s.replace(new RegExp(B + "((?:mark|marking|clear) (?:a|an|one|two|\\d+|any number of|your last)? ?Armor Slots?)" + B, "gi"), (_, t) => tok("armor", "armor", t, "armor"));
  s = s.replace(new RegExp("(?:" + B + ")?\\b(\\d*d\\d+(?:\\s?[+−-]\\s?\\d+)?)(s?)\\b(?:" + B + ")?", "g"), (_, d, pl) => tok("dice", "dice", d + pl));
  s = s.replace(new RegExp("(?:" + B + ")?(Spellcast Roll(?: \\(\\d+\\))?)(?:" + B + ")?", "g"), (_, t) => tok("spell", "spellcast", t, "spellcast"));
  s = s.replace(new RegExp("\\b(" + TRAITS_RE + ")( Reaction)? Roll( \\(\\d+\\))?", "g"), (m, t, rx) => tok("trait", R.TRAIT_KEY[t.toLowerCase()], m, rx ? "reaction" : "trait:" + t));
  s = s.replace(/\b(Very Close|Very Far|Melee|Close|Far)( range)?\b/g, (m, r) => tok("range", "range", m, "range:" + r));
  s = s.replace(new RegExp("\\*(" + CONDS + ")([.,]?)\\*", "g"), (_, t, p) => tok("cond", "wound", t, "cond:" + t) + p);
  return s;
}
const inline = s => tokens(esc(s)).replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/(^|\s)_(.+?)_/g, "$1<i>$2</i>");
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
function Head({ title, topic, tail, level = 2, icon }) {
  const T = level === 3 ? "h3" : "h2";
  return html`<${T} class="h">${icon && html`<span class="hmedal"><${Icon} n=${icon} /></span>`}<span>${topic ? html`<button type="button" class="hlink" onClick=${() => openPanel({ topic })} aria-label=${`${title}: show the rules`}>${title}${BOOK}</button>` : title}</span><i class="rule"></i>${tail || ""}</${T}>`;
}
function SidePanel() {
  const [p, set] = useState(null); panelFn = set;
  useEffect(() => { if (!p) return; const k = e => e.key === "Escape" && set(null); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [p]);
  if (!p) return null;
  const info = p.topic ? RULES_INFO[p.topic] : null;
  return html`<div class="spanel-back" onClick=${() => set(null)}></div><aside class="spanel" role="dialog" aria-label=${(info && info.title) || p.title}>
    <div class="sp-head">${info && info.icon && html`<span class="sp-medal"><${Icon} n=${info.icon} /></span>`}<div class="sp-tt"><b>${(info && info.title) || p.title}</b>${(p.sub || (info && info.sub)) && html`<span>${p.sub || info.sub}</span>`}</div>
      <button class="iconbtn" aria-label="Close" onClick=${() => set(null)}>×</button></div>
    <div class="sp-body">${info ? html`<${RuleTopic} info=${info} />` : p.body}</div></aside>`;
}
// A rules topic as a visual breakdown: flavour, headed sections, fact tiles, equations, scales, examples (see rules-info.js).
const GEM = { "+2": "", "+1": "v1", "+0": "v0" };
function RuleTopic({ info }) {
  const hf = R.books().hf;
  const chip = x => (typeof x === "string" ? html`<span class="eq-op">${x}</span>`
    : html`<span class=${"eq-c eq-" + x[0]}><b>${x[0] === "recall" ? BOLT : ""}${x[1]}</b>${x[2] && html`<small>${x[2]}</small>`}</span>`);
  return html`<div class="rtopic">
    ${info.flavor && html`<p class="rp-flavor">${info.flavor}</p>`}
    ${(info.parts || []).map(part => typeof part === "string" ? html`<${Md} cls="rp-p" text=${part} />`
      : part.h ? html`<div class="rp-h"><span class="hmedal"><${Icon} n=${part.i || "book"} /></span><span>${part.h}</span><i class="rule"></i></div>`
      : part.facts ? html`<div class="rp-facts">${part.facts.filter(f => !f[3] || hf).map(([i, l, x]) => html`<div class="rp-fact"><span class="rp-fi"><${Icon} n=${i} /></span><div><b>${l}</b><${Md} text=${x} /></div></div>`)}</div>`
      : part.items ? html`<ul class="rp-items">${part.items.filter(f => !f[3] || hf).map(([i, l, x]) => html`<li><${Icon} n=${i} /><div><b>${l}</b> <${Md} cls="inl" text=${x} /></div></li>`)}</ul>`
      : part.eq ? html`<div class="rp-eq">${part.eq.reduce((o, x, i, a) => (typeof a[i - 1] === "string" && i > 0 ? o : o.concat(typeof x === "string" && a[i + 1] ? html`<span class="eq-g">${chip(x)}${chip(a[i + 1])}</span>` : chip(x))), [])}</div>`
      : part.scale ? html`<div class="rp-scale">${part.scale.map(([l, sub, r], k) => html`<div class=${"rs rs" + (k + 1)}><b>${l}</b><small>${sub}</small><span>${r}</span></div>`)}</div>`
      : part.gems ? html`<div class="rp-gems">${part.gems.map(g => html`<span class=${"val mini " + (g in GEM ? GEM[g] : "vn")}>${g}</span>`)}</div>`
      : part.steps ? html`<ol class="rp-steps">${part.steps.map(x => html`<li><${Md} text=${x} /></li>`)}</ol>`
      : part.ex ? html`<div class="rp-ex"><span class="rp-ex-l"><${Icon} n="quill" />Example</span><${Md} text=${part.ex} /></div>`
      : part.note ? html`<div class="note"><b>App reading</b><${Md} text=${part.note} /></div>`
      : part.list ? html`<ul class="rp-list">${part.list.map(x => html`<li><${Md} text=${x} /></li>`)}</ul>` : null)}
    ${info.src && html`<p class="src"><${Icon} n="book" />SRD 2.0 · ${info.src}</p>`}</div>`;
}

/* ================= small parts ================= */
// A row of slot boxes. Left-click an empty box to mark up to it; right-click (long-press) a marked box to clear back below it.
function Track({ label, value, max, onSet, kind = "", lock = 0, verb = ["Mark", "Clear"], count }) {
  const prev = useRef(value), fx = useRef(null);
  if (prev.current !== value) { fx.current = value > prev.current ? { lo: prev.current + 1, hi: value, d: "in" } : { lo: value + 1, hi: prev.current, d: "out" }; prev.current = value; }
  const F = fx.current;
  const out = [];
  for (let i = 1; i <= max + lock; i++) {
    if (i > max) { out.push(html`<span class="slot locked" title="Scarred: this slot is gone"></span>`); continue; }
    const on = i <= value;
    const anim = F && i >= F.lo && i <= F.hi;
    out.push(html`<button type="button" class=${"slot " + kind + (on ? " on" : "") + (anim ? " fx-" + F.d : "")} style=${anim ? `--k:${F.d === "in" ? i - F.lo : F.hi - i}` : ""} aria-label=${`${label} ${i}: ${on ? verb[1].toLowerCase() : verb[0].toLowerCase()}`} aria-pressed=${on}
      ...${pressProps(() => { if (!on) onSet(i); else toast(`${MOUSE_R} to ${verb[1].toLowerCase()}.`); }, () => on && onSet(i - 1),
        () => ({ title: `${label} ${value}/${max}`, lines: [on ? `${MOUSE_R} to ${verb[1].toLowerCase()} to ${i - 1}` : `${MOUSE_L} to ${verb[0].toLowerCase()} up to ${i}`] }))}></button>`);
  }
  return html`<span class="track" role="group" aria-label=${label}>${out}</span>${count && html`<span class="count">${value}/${max}</span>`}`;
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
function Modal({ title, onClose, children, wide, foot, top }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return html`<div class=${"modal-back" + (top ? " top" : "")} onClick=${e => e.target === e.currentTarget && onClose()}><div class=${"modal" + (wide ? " wide" : "")} role="dialog" aria-label=${title}>
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
// The app's own "are you sure?" window, in place of the browser's pop-up. ask({ title, body, ok, danger, icon }) → true / false.
let confirmFn = () => Promise.resolve(false);
const ask = o => confirmFn(typeof o === "string" ? { body: o } : o);
function Confirmer() {
  const [q, setQ] = useState(null);
  confirmFn = o => new Promise(res => setQ(Object.assign({ res }, o)));
  useEffect(() => { if (!q) return; const k = e => { if (e.key === "Enter") { e.preventDefault(); done(true); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [q]);
  if (!q) return null;
  const done = v => { q.res(v); setQ(null); };
  return html`<${Modal} top title=${q.title || "Are you sure?"} onClose=${() => done(false)}
    foot=${html`<button class="btn" onClick=${() => done(false)}>${q.no || "Cancel"}</button><button class=${"btn " + (q.danger ? "danger solid" : "primary")} onClick=${() => done(true)}>${q.ok || "Yes"}</button>`}>
    <div class="confirm">${q.icon && html`<span class=${"sp-medal" + (q.danger ? " danger" : "")}><${Icon} n=${q.icon} /></span>`}<div class="confirm-b">${typeof q.body === "string" ? html`<p>${q.body}</p>` : q.body}</div></div></${Modal}>`;
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
  const [books, setBooks] = useState(false);
  R.setBooks(Store.state.books);   // which rulebooks this table uses: everything below filters by it
  const lastEdit = useRef({});
  useTokenCards();
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
  const askBooks = gm && Store.stateLoaded && !Store.state.books && !Store.readOnly;
  useEffect(() => { if (askBooks) setBooks("first"); }, [askBooks]);
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
      <div class="brand"><svg class="crest" viewBox="0 0 120 120" aria-hidden="true"><path d="M60 6 104 32v52L60 110 16 84V32Z" fill="none" stroke="#c9a24a" stroke-width="5"/><path d="M60 6v104M16 32l88 52M104 32 16 84" stroke="#c9a24a" stroke-width="1.5" opacity=".35"/><path d="m44 40 12 12-12 12-12-12z" fill="#e8c35a"/><path d="m76 56 12 12-12 12-12-12z" fill="#9a62f0"/></svg>${APP}</div>
      ${gm && html`<div class="seg viewseg" role="group" aria-label="View"><button aria-pressed=${view === "chars"} onClick=${() => setView("chars")}>Characters</button><button aria-pressed=${view === "gm"} onClick=${() => setView("gm")}>GM table</button></div>`}
      <${DiceSwitch} />
      <div class="status">${Store.mode === "live" && Store.table ? html`<i class="dot live"></i>${Store.table.name}${gm ? " · GM" : ""} <button class="linkbtn" onClick=${() => window.DH_WEB.leave()}>Sign out</button>`
        : Store.mode === "live" ? html`<i class="dot live"></i>Shared` : Store.mode === "local" ? html`<i class="dot local"></i>This browser only` : html`<i class="dot"></i>Connecting…`}</div>
    </header>
    ${Store.mode === "local" && html`<div class="banner">${window.DH_WEB && window.DH_WEB.reason === "offline" ? "Couldn't reach the shared save, so for now characters are kept in this browser only. Check your connection and reload."
      : "Shared saving isn't set up here, so characters are kept in this browser only. On the website with Firebase settings, your whole table shares them."}</div>`}
    ${Store.error && html`<div class="banner">Couldn't load the shared characters just now. Reload the page to try again.</div>`}
    ${view === "gm" && gm ? html`<${GMView} chars=${list} all=${all} updateChar=${updateChar} openChar=${openChar} openBooks=${() => setBooks(true)} />` : html`
      <${Roster} list=${list} all=${all} sel=${sel} setSel=${setSel} current=${current} create=${create} startNew=${() => setMaking("choose")} />
      ${current ? html`<${Character} key=${current.id} c=${current} all=${all} update=${update} tab=${tab} setTab=${setTab} onDelete=${remove} />`
        : Store.mode === "loading" ? html`<div class="empty"><p class="muted">Opening the table…</p></div>`
        : html`<div class="empty"><div class="ornate">${gm ? "No characters yet" : "Welcome to the table"}</div>
            <p>Each character's sheet lives here: traits, Hope, Stress, Hit Points, armor, domain cards and gear, with the rules math done for you.</p>
            <div class="row center"><button class="btn primary" onClick=${() => setMaking("choose")}>Create a character</button></div></div>`}`}
    ${making === "choose" && html`<${NewChoice} onClose=${() => setMaking(null)} onGuide=${() => setMaking("guide")} onBlank=${() => { setMaking(null); create(null); }} />`}
    ${making === "guide" && html`<${Genesis} onClose=${() => setMaking(null)} onDone=${fill => { setMaking(null); create(null, fill); window.scrollTo(0, 0); }} />`}
    <footer class="foot"><p>${window.APP_COMPAT || ""} · Unofficial fan work, not affiliated with or endorsed by Critical Role or Darrington Press. <button class="linkbtn" onClick=${() => setAbout(true)}>Credits and licence</button></p></footer>
    ${about && html`<${About} onClose=${() => setAbout(false)} />`}
    ${books && html`<${Books} first=${books === "first"} onClose=${() => setBooks(false)} />`}
    <${DiceDock} c=${view === "chars" ? current : null} update=${update} />
    <${Toaster} /><${HoverCard} /><${SidePanel} /><${Asker} /><${Confirmer} />
  </div>`;
}

function About({ onClose }) {
  return html`<${Modal} title="Credits and licence" onClose=${onClose} wide>
    <${Md} text=${ATTRIBUTION_TEXT} />
    <p class="small muted">Icons from game-icons.net by ${(window.ICON_AUTHORS || []).join(", ")}, licensed CC BY 3.0.</p></${Modal}>`;
}
// The rulebooks this table uses. Asked once when a GM first opens a table; changeable on the GM table.
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
const TABS = [["sheet", "Sheet", "quill"], ["cards", "Abilities", "spell"], ["gear", "Gear", "pack"], ["story", "Story", "book"], ["data", "Data", "scene"]];
function Character({ c, all, update, tab, setTab, onDelete }) {
  if (c.kind === "companion") return html`<${CompanionSheet} c=${c} master=${all[c.companionOf]} update=${update} onDelete=${onDelete} />`;
  const d = derive(c);
  const [edit, setEdit] = useState(false);
  const [lvl, setLvl] = useState(false);
  const free = edit && canFree(c);
  useEffect(() => { if (edit && !canFree(c)) setEdit(false); }, [c.freeEdit]);
  return html`<section class="character">
    <${Header} c=${c} d=${d} update=${update} edit=${free} setEdit=${setEdit} onLevel=${() => setLvl(true)} />
    <nav class="tabs" role="tablist">${TABS.map(([k, n, i]) => html`<button role="tab" class=${"tab t-" + k} aria-selected=${tab === k} aria-label=${n} onClick=${() => setTab(k)}><${Icon} n=${i} /><span class="tlabel">${n}</span></button>`)}</nav>
    <div class="tabbody" key=${tab}>
      ${tab === "sheet" && html`<${SheetTab} c=${c} d=${d} update=${update} edit=${free} />`}
      ${tab === "cards" && html`<${AbilitiesTab} c=${c} d=${d} update=${update} edit=${free} />`}
      ${tab === "gear" && html`<${GearTab} c=${c} d=${d} update=${update} edit=${free} />`}
      ${tab === "story" && html`<${StoryTab} c=${c} update=${update} />`}
      ${tab === "data" && html`<${DataTab} c=${c} update=${update} onDelete=${onDelete} />`}
    </div>
    ${lvl && html`<${LevelUp} c=${c} d=${d} update=${update} onClose=${() => setLvl(false)} />`}
  </section>`;
}
// The likeness window (as in character creation): an emblem and its colour, initials, an image link, or an uploaded picture.
const HUES = ["#c9a227", "#b23a3a", "#2f7d6d", "#3b6fb6", "#7b4bb0", "#c46a2b", "#6f7f3a", "#8a8a8a"];
function Likeness({ c, update, onClose }) {
  const fileRef = useRef();
  const em = Object.assign({ shape: "", hue: "#c9a227" }, c.emblem);
  const dropPicture = x => { if (x.portraitAsset && Store.assets && Store.assets.remove) Store.assets.remove(x.portraitAsset); x.portraitAsset = ""; x.portraitData = ""; x.portraitUrl = ""; };
  const setEmblem = e => update(x => { dropPicture(x); x.emblem = e; });
  const upload = async f => {
    if (!f) return;
    try {
      if (Store.assets && Store.assets.upload) { const r = await Store.assets.upload(f, c.portraitAsset); update(x => { x.portraitAsset = r.id; x.portraitData = ""; x.portraitUrl = ""; }); }
      else { const data = await shrinkImage(f); update(x => { x.portraitData = data; x.portraitAsset = ""; x.portraitUrl = ""; }); }
    } catch { toast("Couldn't use that picture. Try a smaller image."); }
  };
  const pic = !!portraitSrc(c);
  return html`<${Modal} title="Likeness" onClose=${onClose} wide foot=${html`<button class="btn primary" onClick=${onClose}>Done</button>`}>
    <div class="likeness big">
      <div class="lk-prev"><span class="portrait still"><${Face} c=${c} /></span><b>${c.name || "Unnamed"}</b></div>
      <div class="lk-opts">
        <div class="lk-sec"><h5>Emblem</h5>
          <div class="chips"><button class=${"chip emb init" + (!pic && !em.shape ? " on" : "")} aria-label="Initials" title="Initials" onClick=${() => setEmblem(null)}>${initials(c.name)}</button>
            ${EMBLEMS.map(s => html`<button class=${"chip emb" + (!pic && em.shape === s ? " on" : "")} aria-label=${s} onClick=${() => setEmblem({ shape: s, hue: em.hue })}><${Emblem} shape=${s} hue=${em.hue} /></button>`)}</div>
          <div class="chips">${HUES.map(hh => html`<button class=${"swatch" + (em.hue === hh ? " on" : "")} style=${`background:${hh}`} aria-label=${"Colour " + hh} onClick=${() => setEmblem({ shape: em.shape || "hope", hue: hh })}></button>`)}
            <input type="color" value=${em.hue} aria-label="Any colour" onInput=${e => setEmblem({ shape: em.shape || "hope", hue: e.target.value })} /></div></div>
        <div class="lk-sec"><h5>Picture</h5>
          <div class="row"><button class="btn" onClick=${() => fileRef.current.click()}><${Icon} n="pack" />Upload a file</button>
            ${pic && html`<button class="btn danger" onClick=${() => update(dropPicture)}>Remove picture</button>`}</div>
          <input ref=${fileRef} type="file" accept="image/*" hidden onChange=${e => upload(e.target.files[0])} />
          <${Field} label="Or an image link" value=${c.portraitUrl} placeholder="https://…" onInput=${v => update(x => { if (x.portraitAsset && Store.assets && Store.assets.remove) Store.assets.remove(x.portraitAsset); x.portraitAsset = ""; x.portraitData = ""; x.portraitUrl = v; })} /></div>
      </div></div></${Modal}>`;
}
function Header({ c, d, update, edit, setEdit, onLevel }) {
  const [like, setLike] = useState(false);
  const her = [c.ancestry || (c.mixed && "Mixed ancestry"), c.community].filter(Boolean).join(" · ");
  return html`<div class="head card">
    <button type="button" class="portrait" aria-label="Change portrait" onClick=${() => setLike(true)}><${Face} c=${c} /><span class="pedit"><${Icon} n="quill" /></span></button>
    ${like && html`<${Likeness} c=${c} update=${update} onClose=${() => setLike(false)} />`}
    <div class="hmain">
      <input class="cname" value=${c.name} aria-label="Character name" placeholder="Name" onInput=${e => update(x => { x.name = e.target.value; })} />
      <div class="hline">${c.cls ? html`<${Icon} n=${clsIcon(c.cls)} />${c.cls}${c.sub ? html` · ${c.sub}` : ""}` : "No class yet"}${her && html`<span class="muted">· ${her}</span>`}${c.pronouns && html`<span class="muted">· ${c.pronouns}</span>`}</div>
      <div class="hmeta">
        <span class="lvl" title="Level and tier"><b>${c.level}</b>Level · Tier ${d.tier}</span>
        ${c.level < 10 && html`<button class="btn small primary" onClick=${onLevel}><${Icon} n="crown" />Level up</button>`}
        ${c.levelups.length > 0 && html`<button class="btn small" onClick=${async () => { if (await ask({ title: `Undo level ${c.level}?`, icon: "crown", ok: `Undo level ${c.level}`, body: `Everything chosen at level ${c.level} is taken back and ${c.name || "this character"} returns to level ${c.level - 1}.` })) update(x => { R.undoLevelUp(x); addLog(x, `Undid level ${c.level}`); }); }}>Undo level ${c.level}</button>`}
        ${canFree(c) && html`<button class=${"btn small" + (edit ? " on" : "")} aria-pressed=${edit} onClick=${() => setEdit(!edit)}>${edit ? "Done editing" : "Free edit"}</button>`}
        ${isGM() && Store.table && html`<label class="chk small"><input type="checkbox" checked=${!!c.freeEdit} onChange=${e => update(x => { x.freeEdit = e.target.checked; })} /> Player may use Free edit</label>`}
      </div>
      ${edit && html`<div class="grid4 editbox">
        <${Field} label="Pronouns" value=${c.pronouns} onInput=${v => update(x => { x.pronouns = v; })} />
        <${Field} label="Player" value=${c.player} onInput=${v => update(x => { x.player = v; })} />
        <${Field} label="Campaign" value=${c.campaign} list="dh-camps" onInput=${v => update(x => { x.campaign = v; })} />
        <${Field} label="Portrait link" value=${c.portraitUrl} placeholder="https://…" onInput=${v => update(x => { x.portraitUrl = v; })} />
        <${Select} label="Class" value=${c.cls} empty="—" options=${R.list("classes").map(k => k.name)} onChange=${v => update(x => { x.cls = v; x.sub = ""; })} />
        <${Select} label="Subclass" value=${c.sub} empty="—" options=${R.subclassesOf(c.cls).map(s => s.name)} onChange=${v => update(x => { x.sub = v; })} />
        <${Select} label="Ancestry" value=${c.ancestry} empty="—" options=${R.list("ancestries").filter(a => a.features.length).map(a => a.name)} onChange=${v => update(x => { x.ancestry = v; x.mixed = null; })} />
        <${Select} label="Community" value=${c.community} empty="—" options=${R.list("communities").map(a => a.name)} onChange=${v => update(x => { x.community = v; })} />
        ${R.books().hf && html`<${Select} label="Transformation" value=${c.transformation} empty="None" options=${R.list("transformations").map(a => a.name)} onChange=${v => update(x => { x.transformation = v; })} />`}
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
  const [hit, setHit] = useState(null);
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
    if (marked > 0) { FX.hurt(); setHit({ band: Math.min(marked, 3), k: Date.now() }); }
    if (d.cur.hp + marked >= d.hpMax && marked > 0) setTimeout(() => setDeath(true), 50);
    else toast(marked ? `Marked ${marked} Hit Point${marked > 1 ? "s" : ""}.` : "No Hit Points marked.");
  };
  const setMark = (k, v) => update(x => { x.marks[k] = v; });
  // The shield already shows name, verbs and value, so the hover card only appears when there's more to say.
  const traitTip = t => { const lines = [d.spellTraits.includes(t.k) ? html`<span class="tip-spell"><span class="hc-medal arcane"><${Icon} n="spellcast" /></span>Your Spellcast trait: used for Spellcast Rolls</span>` : "", d.marked.has(t.k) ? "Marked this tier: can't be raised again until the next tier." : "", ...d.mods.filter(m => m.to === t.n.toLowerCase()).map(m => `${m.from}: ${R.sign(m.v)}`)].filter(Boolean);
    return lines.length ? { lines } : null; };
  return html`<div class="sheet">
    <section class="card span">
      <${Head} title="Traits" topic="traits" icon="dice" />
      <div class="traits">${R.TRAITS.map(t => html`<div onMouseEnter=${e => { const b = traitTip(t); if (b) tip.show(e.currentTarget, b); }} onMouseLeave=${() => tip.hide()}>
        <${TraitShield} t=${t} value=${d.traits[t.k]} marked=${d.marked.has(t.k)} spell=${d.spellTraits.includes(t.k)}>
          ${edit && html`<${Stepper} label=${t.n} value=${c.traits[t.k]} onSet=${v => update(x => { x.traits[t.k] = v; addLog(x, `Free edit: ${t.n} → ${R.sign(v)}`); })} />`}
        </${TraitShield}></div>`)}</div>
    </section>

    <section class="card">
      <${Head} title="Defense" topic="defense" icon="valor" />
      <div class="medals">
        <${Medal} kind="evasion" label="Evasion" value=${d.evasion}>${edit && html`<${Stepper} label="Evasion bonus" value=${c.bonus.evasion} onSet=${v => update(x => { x.bonus.evasion = v; })} />`}</${Medal}>
        <${Medal} kind="armorscore" label="Armor Score" value=${d.armorScore}>${edit && html`<${Stepper} label="Armor bonus" value=${c.bonus.armor} onSet=${v => update(x => { x.bonus.armor = v; })} />`}</${Medal}>
        <${Medal} kind="prof" label="Proficiency" value=${d.prof}>${edit && html`<${Stepper} label="Proficiency bonus" value=${c.bonus.prof} onSet=${v => update(x => { x.bonus.prof = v; })} />`}</${Medal}>
      </div>
      <div class="row" style="margin-top:14px"><${ThresholdRuler} major=${d.major} severe=${d.severe} massive=${opt.massive} hit=${hit} /></div>
      ${d.mods.length > 0 && html`<p class="mods">${d.mods.map(m => `${m.from}: ${R.sign(m.v)} ${m.to}`).join(" · ")}</p>`}
    </section>

    <section class="card">
      <${Head} title="Damage & health" topic="health" icon="heart" />
      <div class="trackrow"><span class="tl"><${Icon} n="heart" />Hit Points</span><${Track} label="Hit Points" value=${d.cur.hp} max=${d.hpMax} kind="hp" count onSet=${v => { if (v > d.cur.hp) FX.hurt(); setMark("hp", v); if (v >= d.hpMax) setTimeout(() => setDeath(true), 50); }} />
        ${edit && html`<${Stepper} label="HP slot bonus" value=${c.bonus.hp} onSet=${v => update(x => { x.bonus.hp = v; })} />`}</div>
      <div class="trackrow"><span class="tl"><${Icon} n="stress" />Stress</span><${Track} label="Stress" value=${d.cur.stress} max=${d.stressMax} kind="stress" count onSet=${v => setMark("stress", v)} />
        ${edit && html`<${Stepper} label="Stress slot bonus" value=${c.bonus.stress} onSet=${v => update(x => { x.bonus.stress = v; })} />`}</div>
      ${d.armor && html`<div class="trackrow"><span class="tl"><${Icon} n="armor" />Armor</span><${Track} label="Armor Slots" value=${d.cur.armor} max=${d.armorScore} kind="armor" count onSet=${v => update(x => { x.marks.armor[d.armor.id] = v; })} /></div>`}
      <div class="trackrow"><span class="tl"><${Icon} n="hope" />Hope</span><${Track} label="Hope" value=${d.cur.hope} max=${d.hopeMax} lock=${Math.min(num(c.scars), 6)} kind="hope" verb=${["Gain", "Spend"]} count onSet=${v => setMark("hope", v)} />
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
        <button class="btn" onClick=${() => setRest("short")}><${Icon} n="rest" />Short rest</button><button class="btn" onClick=${() => setRest("long")}><${Icon} n="longrest" />Long rest</button>
        ${d.down && html`<button class="btn danger" onClick=${() => setDeath(true)}>Death move</button>`}
      </div>
    </section>

    <section class="card">
      <${Head} title="Experiences" topic="experiences" icon="quill" tail=${html`<button class="btn small" onClick=${() => update(x => { x.experiences.push({ id: rid("e"), name: "", base: 2 }); })}>+ Add</button>`} />
      <div class="exps">${d.exps.map((e, i) => html`<div class="exp">
        <input value=${c.experiences[i].name} placeholder="An Experience" aria-label="Experience" onInput=${ev => update(x => { x.experiences[i].name = ev.target.value; })} />
        <span class="seal">${R.sign(e.mod)}</span>
        ${edit && html`<${Stepper} label="Base" value=${c.experiences[i].base} onSet=${v => update(x => { x.experiences[i].base = v; })} /><button class="iconbtn" aria-label="Remove" onClick=${() => update(x => { x.experiences.splice(i, 1); })}>×</button>`}
      </div>`)}${!d.exps.length && html`<p class="muted">No Experiences yet. You start with two at +2.</p>`}</div>
    </section>

    <section class="card">
      <${Head} title="Worn gear" topic="worn" icon="helm" />
      <${WornGear} c=${c} d=${d} />
    </section>

    <section class="card span">
      <${Head} title="Conditions" topic="conditions" icon="wound" />
      <${Conditions} c=${c} d=${d} update=${update} />
    </section>
    ${rest && html`<${RestDialog} c=${c} d=${d} kind=${rest} update=${update} onClose=${() => setRest(null)} />`}
    ${death && html`<${DeathDialog} c=${c} d=${d} update=${update} onClose=${() => setDeath(false)} />`}
  </div>`;
}
// Armor's numbers: thresholds and score, with how many slots are marked as a small banner under the score.
function ArmorStats({ A, marked }) {
  return html`<div class="statcells three"><div class="cell big"><small>Base Major</small><b>${A.major}</b></div><div class="cell big"><small>Base Severe</small><b>${A.severe}</b></div>
    <div class="cell big"><small>Score</small><b>${A.score}</b>${marked != null && html`<em class=${marked ? "hit" : ""}>${marked ? `${marked} of ${A.score} marked` : "none marked"}</em>`}</div></div>`;
}
// Everything the character has on: equipped weapons, worn armor, and worn items. Equip and wear things on the Gear tab.
function WornGear({ c, d }) {
  const a = d.armor, A = d.armorStats;
  return html`<div class="wlines">
    <${WeaponLines} c=${c} d=${d} />
    ${a && A ? html`<div class="wline armorline"><div class="wn"><${Icon} n="helm" /><span class="wnm"><b>${R.gearName(a, A)}</b>${R.gearName(a, A) !== A.name && html`<small>${A.name}</small>`}</span><span class="tag">Armor</span></div>
        <div class="statcells three"><div class="cell big"><small>Thresholds</small><b>${d.major} / ${d.severe}</b><em>with your level</em></div><div class="cell big"><small>Score</small><b>${d.armorScore}</b><em class=${d.cur.armor ? "hit" : ""}>${d.cur.armor ? `${d.cur.armor} of ${d.armorScore} marked` : "none marked"}</em></div></div>
        ${A.feat && html`<${Md} cls="small" text=${A.feat} />`}</div>`
      : html`<p class="muted small"><${Icon} n="helm" /> No armor: Armor Score 0, thresholds ${d.major} / ${d.severe}.</p>`}
    ${d.worn.map(it => html`<div class="wline itemline"><div class="wn"><${Icon} n="pack" /><span class="wnm"><b>${it.name || "Item"}</b></span><span class="tag">Worn</span></div>${it.text && html`<${Md} cls="small" text=${it.text} />`}</div>`)}
  </div>`;
}
// Weapon statistics as labelled cells (trait with your modifier, range, damage with Proficiency); burden as hands.
function WeaponLines({ c, d }) {
  const ws = R.equipped(c);
  if (!ws.length) return html`<p class="muted small"><${Icon} n="weapon" /> No weapon equipped. Unarmed attacks use Strength or Finesse and deal ${d.prof}d4 damage.</p>`;
  return html`${ws.map(w => { const W = R.weaponStats(w); if (!W) return null;
    const own = R.gearName(w, W) !== W.name;
    return html`<div class="wline"><div class="wn"><${Icon} n="weapon" /><span class="wnm"><b>${R.gearName(w, W)}</b>${own && html`<small>${W.name}</small>`}</span><span class="tag">${w.slot === "primary" ? "Primary" : "Secondary"}</span><${Burden} W=${W} /></div>
      <${WeaponStats} W=${W} d=${d} />${W.feat && html`<${Md} cls="small" text=${W.feat} />`}</div>`; })}`;
}
const COND = ["Hidden", "Restrained", "Vulnerable"];
function Conditions({ c, d, update }) {
  const [v, setV] = useState("");
  const add = n => { n = n.trim(); if (!n || c.conditions.includes(n)) return; update(x => { x.conditions.push(n); }); setV(""); };
  const auto = d.vulnerable && !c.conditions.includes("Vulnerable");
  const active = c.conditions.concat(auto ? ["Vulnerable"] : []);
  return html`<div class="conds">
    ${c.conditions.map((n, i) => html`<button class="chip cond on" title="Remove" onClick=${() => update(x => { x.conditions.splice(i, 1); })}><${Icon} n=${(gloss("cond:" + n) || {}).icon || "wound"} />${n} ×</button>`)}
    ${auto && html`<span class="chip cond auto"><${Icon} n="wound" />Vulnerable (all Stress marked)</span>`}
    ${COND.filter(n => !c.conditions.includes(n)).map(n => html`<button class="chip" onClick=${() => add(n)}>+ ${n}</button>`)}
    <form class="inline" onSubmit=${e => { e.preventDefault(); add(v); }}><input placeholder="Other condition" value=${v} onInput=${e => setV(e.target.value)} aria-label="Other condition" /></form>
  </div>
  ${active.length > 0 && html`<div class="cond-rules">${active.map(n => { const g = gloss("cond:" + n);
    return html`<div class="cond-rule"><span class="hc-medal"><${Icon} n=${g.icon} /></span><div><b>${n}${auto && n === "Vulnerable" ? html` <small>while all Stress is marked</small>` : ""}</b><${Md} text=${g.md} /></div></div>`; })}</div>`}
  ${!active.length && html`<p class="muted small">No conditions. Choose one above to see what it does.</p>`}`;
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
    const parts = [];   // what was added, so the result can show its working
    if (d && trait) parts.push([R.TRAIT_NAME[trait], tmod]);
    if (d) d.exps.filter(e => exps.includes(e.id)).forEach(e => parts.push([e.name || "Experience", e.mod]));
    if (num(mod)) parts.push(["modifier", num(mod)]);
    const r = R.duality({ mod: tmod + emod + num(mod), adv, difficulty: diff, hope: own ? num(hand.h) : undefined, fear: own ? num(hand.f) : undefined, advDie: own ? num(hand.a) : undefined });
    setRes(Object.assign(r, { k: Date.now(), parts }));
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
    ${res && html`<div key=${res.k} class=${"rollres " + (res.crit ? "crit" : res.withHope ? "hope" : "fear")}>
      <div class="dice"><span class="die h">${res.h}</span><span class="die f">${res.f}</span>${res.adv ? html`<span class="die a" title=${res.adv > 0 ? "Advantage die (d6), added" : "Disadvantage die (d6), subtracted"}>${res.adv > 0 ? "+" : "−"}${res.a}</span>` : ""}</div>
      <b class="tot">${res.total}</b>
      <span>${res.crit ? "Critical success!" : res.withHope ? "with Hope" : "with Fear"}${res.success === true && !res.crit ? " · success" : res.success === false ? " · failure" : ""}</span>
      <div class="working">${res.h} <i>Hope</i> + ${res.f} <i>Fear</i>${res.adv ? html` ${res.adv > 0 ? "+" : "−"} ${res.a} <i>${res.adv > 0 ? "advantage" : "disadvantage"} d6</i>` : ""}${(res.parts || []).map(([n, v]) => html` ${v < 0 ? "−" : "+"} ${Math.abs(v)} <i>${n}</i>`)} = <b>${res.total}</b>${res.success != null ? ` vs ${diff}` : ""}</div>
      <small>${reaction ? "Reaction rolls don't give Hope or Fear." : res.crit ? "You gain a Hope and clear a Stress." : res.withHope ? "You gain a Hope." : "The GM gains a Fear."}</small></div>`}
  </div>`;
}

/* ================= abilities tab: features and domain cards ================= */
function FeatureCard({ c, update, src, f, kind, icon, tone }) {
  if (!f) return null;
  const u = R.usage(f.x); const key = `${src}:${f.n}|${u.per || ""}`; const tkey = `${src}:${f.n}`;
  const used = num(c.uses[key]); const costs = featureCosts(f.x);
  return html`<article class=${"ab " + (tone || "")}>
    <header class="ab-h"><span class="ab-medal"><${Icon} n=${icon || "spell"} /></span>
      <div class="ab-t"><b>${f.n}</b><span class="ab-k">${kind || src}</span></div></header>
    ${(costs.length > 0 || u.times > 0 || u.tokens) && html`<div class="ab-meta">
      ${costs.map(([k, i, t]) => html`<span class=${"tok tok-" + k}><${Icon} n=${i} />${t}</span>`)}
      ${u.times > 0 && html`<span class="freq"><${Icon} n=${PER[u.per][0]} />${u.times > 1 ? `${u.times}× ` : ""}${PER[u.per][1]}
        <span class="uses">${Array.from({ length: u.times }, (_, i) => html`<button class=${"use" + (i < used ? " on" : "")} aria-label=${`Use ${i + 1}${i < used ? " (used)" : ""}`}
          ...${pressProps(() => i >= used && update(x => { x.uses[key] = i + 1; }), () => i < used && update(x => { x.uses[key] = i; }), { title: f.n, lines: [`${MOUSE_L}: mark as used`, `${MOUSE_R}: not used`] })}></button>`)}</span></span>`}
      ${u.tokens && html`<span class="tokens" title="Tokens on this card"><${Icon} n="tokens" />Tokens <${Stepper} label="Tokens" value=${num(c.tokens[tkey])} min=${0} onSet=${v => update(x => { x.tokens[tkey] = v; })} /></span>`}
    </div>`}
    <${Md} cls="ab-x" text=${f.x} /></article>`;
}
function AbilitiesTab({ c, d, update, edit }) {
  const K = d.cls, sub = d.sub;
  const [pick, setPick] = useState(false);
  const [filter, setFilter] = useState("all");
  const com = R.byName("communities", c.community), tr = R.byName("transformations", c.transformation);
  const her = R.heritageFeatures(c);
  const subFeats = sub ? [["Foundation", sub.foundation, "foundation", "found"], ["Specialization", sub.specialization, "specialization", "spec"], ["Mastery", sub.mastery, "mastery", "mast"]].slice(0, d.subTier) : [];
  const recall = async (i, cardObj) => {
    const isVault = c.cards[i].where === "vault";
    if (isVault && d.loadout.length >= R.MAX.loadout) { toast("Your loadout is full (5). Move a card to the vault first."); return; }
    if (isVault && cardObj && cardObj.recall > 0) {
      const after = Math.min(d.stressMax, d.cur.stress + cardObj.recall), [col] = domLook(cardObj.dom);
      const ok = await ask({ title: `Recall ${cardObj.name}`, icon: "recall", ok: `Mark ${cardObj.recall} Stress and recall`, body: html`
        <p>Bringing a card back from the vault outside a rest costs its Recall Cost in Stress.</p>
        <div class="rp-eq"><span class="eq-c eq-recall" style=${`border-color:${col}`}><b>${BOLT}${cardObj.recall}</b><small>${cardObj.dom} · Recall Cost</small></span><span class="eq-g"><span class="eq-op">=</span>
          <span class="eq-c eq-stress"><b>${d.cur.stress} → ${after}</b><small>Stress of ${d.stressMax}</small></span></span></div>
        ${after >= d.stressMax && html`<p class="warn">That marks your last Stress: you'll be Vulnerable until you clear one.</p>`}
        <p class="muted small">Resting? Recall for free from the rest window instead.</p>` });
      if (!ok) return;
    }
    update(x => {
      x.cards[i].where = isVault ? "loadout" : "vault";
      if (isVault && cardObj && cardObj.recall > 0) x.marks.stress = Math.min(d.stressMax, num(x.marks.stress) + cardObj.recall);
    });
  };
  const show = k => filter === "all" || filter === k;
  return html`<div class="abilities">
    <div class="row"><div class="seg small" role="group" aria-label="Show">${[["all", "All"], ["cards", "Domain cards"], ["class", "Class"], ["heritage", "Heritage"]].map(([k, n]) => html`<button aria-pressed=${filter === k} onClick=${() => setFilter(k)}>${n}</button>`)}</div></div>
    ${show("cards") && html`<section class="card">
      <${Head} title=${`Loadout · ${d.loadout.length} of 5`} topic="loadout" icon="spell" tail=${html`<button class="btn small" onClick=${() => setPick(true)}>+ Add card</button>`} />
      ${d.cardCount !== d.cardsExpected && html`<p class="muted small">At level ${c.level} you'd normally have ${d.cardsExpected} domain cards; this sheet has ${d.cardCount}.</p>`}
      <div class="cards">${c.cards.map((x, i) => x.where !== "vault" && html`<${DomainCard} name=${x.name} onMove=${() => recall(i, R.card(x.name))} moveLabel="To vault" onRemove=${edit ? () => update(y => { y.cards.splice(i, 1); }) : null} />`)}</div>
      ${!d.loadout.length && html`<p class="muted">No domain cards yet.</p>`}
      ${d.vault.length > 0 && html`<${Head} level=${3} title=${`Vault · ${d.vault.length}`} />
        <div class="cards">${c.cards.map((x, i) => x.where === "vault" && html`<${DomainCard} vaulted name=${x.name} onMove=${() => recall(i, R.card(x.name))} moveLabel=${html`${BOLT}Recall${R.card(x.name) && R.card(x.name).recall ? ` · ${R.card(x.name).recall} Stress` : ""}`} onRemove=${edit ? () => update(y => { y.cards.splice(i, 1); }) : null} />`)}</div>`}
    </section>`}
    ${show("class") && html`<section class="card">
      <${Head} title=${K ? `${K.name} abilities` : "Class abilities"} topic="classes" icon=${K ? clsIcon(K.name) : "spell"} />
      ${!K && html`<p class="muted">Choose a class (Free edit, or the creation guide) to see its abilities.</p>`}
      ${K && html`<div class="feats">
        <${FeatureCard} c=${c} update=${update} src=${K.name} f=${K.hope} kind=${`${K.name} · Hope feature`} icon="hope" tone="hopef" />
        ${K.features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${K.name} f=${f} kind=${`${K.name} feature`} icon=${clsIcon(K.name)} />`)}
        ${subFeats.map(([lbl, fs, ic, tone]) => fs.map(f => html`<${FeatureCard} c=${c} update=${update} src=${sub.name} f=${f} kind=${`${sub.name} · ${lbl}`} icon=${ic} tone=${tone} />`))}
        ${c.multi && c.multi.cls && html`${(R.byName("classes", c.multi.cls) || { features: [] }).features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${c.multi.cls} f=${f} kind=${`${c.multi.cls} · Multiclass`} icon=${clsIcon(c.multi.cls)} tone="multi" />`)}
          ${d.msub && d.msub.foundation.map(f => html`<${FeatureCard} c=${c} update=${update} src=${d.msub.name} f=${f} kind=${`${d.msub.name} · Multiclass foundation`} icon="foundation" tone="multi" />`)}`}
      </div>
      ${K.extra.length > 0 && html`<div class="row"><button class="btn small" onClick=${() => openPanel({ title: K.name, sub: "More class rules", body: html`${K.extra.map(e => html`<h4>${e.h}</h4><${Md} text=${e.x} />`)}` })}>${K.extra[0].h} and more</button></div>`}`}
    </section>`}
    ${show("heritage") && html`<section class="card">
      <${Head} title="Heritage" topic="heritage" icon="ancestry" />
      <div class="feats">
        ${her.map(h => html`<${FeatureCard} c=${c} update=${update} src=${h.a} f=${h.f} kind=${`${h.a} · Ancestry`} icon="ancestry" tone="heritage" />`)}
        ${com && com.features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${com.name} f=${f} kind=${`${com.name} · Community`} icon="community" tone="community" />`)}
        ${tr && tr.features.map(f => html`<${FeatureCard} c=${c} update=${update} src=${tr.name} f=${f} kind=${`${tr.name} · Transformation`} icon="transformation" tone="transf" />`)}
      </div>${!her.length && !com && html`<p class="muted">Choose an ancestry and community to see their features.</p>`}
    </section>`}
    ${pick && html`<${CardPicker} c=${c} onClose=${() => setPick(false)} onPick=${n => { update(x => { x.cards.push({ name: n, where: d.loadout.length < 5 ? "loadout" : "vault" }); addLog(x, `Added domain card ${n}`); }); setPick(false); }} />`}
  </div>`;
}
// A domain card: the domain's colour and emblem, level gem, recall cost, type, and its text with rule tokens.
function DomainCard({ name, onMove, moveLabel, onRemove, picked, onPick, vaulted }) {
  const x = R.card(name);
  if (!x) return html`<article class="dc" style="--dc:#555"><div class="dc-body"><b class="dc-name">${name}</b><p class="muted">Not found in the game data.</p></div></article>`;
  const [col, ic] = domLook(x.dom);
  return html`<article class=${"dc" + (picked ? " picked" : "") + (vaulted ? " vaulted" : "") + (x.hf ? " hf" : "")} style=${`--dc:${col}`}>
    <div class="dc-band"><span class="dc-lvl" title=${`Level ${x.lvl}`}>${x.lvl}</span><span class="dc-dom">${x.dom}</span>
      <span class="dc-rec" title=${`Recall cost: mark ${x.recall} Stress to bring this card back from the vault outside a rest`}>${BOLT}${x.recall}</span></div>
    <span class="dc-medal" title=${`${x.dom} domain`}><${Icon} n=${ic} /></span>
    <div class="dc-body"><span class="dc-type"><${Icon} n=${x.type.toLowerCase()} />${x.type}</span>
      <h4 class="dc-name">${x.name}</h4>${x.type === "Grimoire" ? html`<${Tome} text=${x.x} />` : html`<${Md} cls="dc-x" text=${x.x} />`}
      ${(onMove || onRemove || onPick) && html`<div class="dc-foot">${onPick && html`<button class=${"btn small" + (picked ? " gold" : " primary")} onClick=${onPick}>${picked ? "✓ Chosen" : "Choose"}</button>`}
        ${onMove && html`<button class="btn small" onClick=${onMove}>${moveLabel}</button>`}${onRemove && html`<button class="btn small danger" onClick=${onRemove}>Remove</button>`}</div>`}
    </div><i class="dc-wm"><${Icon} n=${ic} /></i></article>`;
}
// A grimoire holds several spells: shown as a small tome, one spell per page, with ribbon bookmarks and page turns.
function Tome({ text }) {
  const pages = String(text || "").split(/\n\s*\n/).map(p => { const m = /^\*{2,3}_?([^*_:]+):_?\*{2,3}\s*/.exec(p.trim()); return m ? { n: m[1].trim(), x: p.trim().slice(m[0].length) } : { n: "", x: p.trim() }; }).filter(p => p.x);
  const [i, setI] = useState(0);
  if (pages.length < 2) return html`<${Md} cls="dc-x" text=${text} />`;
  const p = pages[Math.min(i, pages.length - 1)];
  return html`<div class="tome">
    <div class="tome-tabs" role="tablist">${pages.map((q, k) => html`<button role="tab" aria-selected=${k === i} class=${"tome-tab" + (k === i ? " on" : "")} onClick=${() => setI(k)}>${q.n || `Page ${k + 1}`}</button>`)}</div>
    <div class="tome-page" key=${i}><h5 class="tome-spell">${p.n}</h5><${Md} cls="dc-x" text=${p.x} /></div>
    <div class="tome-nav"><button class="tome-turn" aria-label="Previous spell" disabled=${i === 0} onClick=${() => setI(i - 1)}>◀</button>
      <span>${i + 1} of ${pages.length}</span><button class="tome-turn" aria-label="Next spell" disabled=${i >= pages.length - 1} onClick=${() => setI(i + 1)}>▶</button></div>
  </div>`;
}
function CardPicker({ c, onClose, onPick, forLevel, maxLevel, title = "Add a domain card", exclude = [] }) {
  const [dom, setDom] = useState("");
  const [any, setAny] = useState(false);
  let pool = any ? R.list("cards").filter(x => !c.cards.some(y => y.name === x.name)) : R.availableCards(c, forLevel);
  if (maxLevel) pool = pool.filter(x => x.lvl <= maxLevel);
  pool = pool.filter(x => !exclude.includes(x.name));
  const doms = [...new Set(pool.map(x => x.dom))];
  const shown = pool.filter(x => !dom || x.dom === dom);
  return html`<${Modal} title=${title} onClose=${onClose} wide>
    <${Catalog} title="Domain cards" icon="spell" items=${shown} per=${6} grid="cards" resetKey=${dom + any}
      tools=${html`<div class="seg small">${["", ...doms].map(k => html`<button aria-pressed=${dom === k} onClick=${() => setDom(k)}>${k || "All"}</button>`)}</div>
        ${canFree(c) && html`<label class="chk small"><input type="checkbox" checked=${any} onChange=${e => setAny(e.target.checked)} /> Any domain and level (GM)</label>`}`}
      render=${x => html`<${DomainCard} name=${x.name} onPick=${() => onPick(x.name)} />`} empty="No cards to choose here." />
  </${Modal}>`;
}
// A framed list that shows one page at a time, with clear ◀ ▶ buttons and page gems, instead of a scrolling box.
/* ================= gear tab ================= */
// A name you give a weapon or armor; the item's own name stays beneath it as its type.
function GearTitle({ g, S, icon, tags, onRename }) {
  const [on, setOn] = useState(false);
  const ref = useRef();
  (preactHooks.useLayoutEffect || useEffect)(() => { if (on && ref.current) { ref.current.focus(); ref.current.select(); } }, [on]);
  const base = S ? S.name : g.name, own = R.gearName(g, S) !== base;
  return html`<div class=${"whead" + (own ? " named" : "")}><span class="wmedal"><${Icon} n=${icon} /></span>
    <div class="wtitle">${on ? html`<input ref=${ref} class="rename" value=${g.label || ""} placeholder=${base} aria-label="Name"
        onInput=${e => onRename(e.target.value)} onBlur=${() => setOn(false)} onKeyDown=${e => { if (e.key === "Enter" || e.key === "Escape") setOn(false); }} />`
      : html`<span class="wname"><b>${R.gearName(g, S)}</b><button class="iconbtn rn" aria-label=${`Rename ${base}`} title="Give it a name" onClick=${() => setOn(true)}><${Icon} n="quill" /></button></span>`}
      ${own && !on && html`<span class="wsub">${base}</span>`}</div>
    <span class="wtags">${tags}</span></div>`;
}
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
    <section class="card purse">
      <${Head} title="Gold" topic="gold" icon="coins" tail=${html`<span class="purse-sum">${[["chests", "chest"], ["bags", "bag"], ["handfuls", "handful"], ...(c.useCoins ? [["coins", "coin"]] : [])].filter(([k]) => num(g[k])).map(([k, n]) => `${num(g[k])} ${n}${num(g[k]) > 1 ? "s" : ""}`).join(" · ") || "Empty purse"}</span>`} />
      <div class="gold">${[["handfuls", "Handfuls", 9], ["bags", "Bags", 9], ["chests", "Chest", 1]].map(([k, n, m]) => html`<div class="gk"><span>${n}</span>
        <${Track} label=${n} value=${num(g[k])} max=${m} kind="gold" verb=${["Gain", "Spend"]} onSet=${v => update(x => { x.gold[k] = v; })} />
        <span class="row"><button class="btn tiny" onClick=${() => addGold(k, -1)}>−1</button><button class="btn tiny" onClick=${() => addGold(k, 1)}>+1</button></span></div>`)}
        ${c.useCoins && html`<div class="gk"><span>Coins</span><${Stepper} label="Coins" value=${num(g.coins)} min=${0} max=${9} onSet=${v => update(x => { x.gold.coins = v; })} /></div>`}
      </div>
      <label class="chk small"><input type="checkbox" checked=${!!c.useCoins} onChange=${e => update(x => { x.useCoins = e.target.checked; })} /> Track coins too (optional rule: 10 coins = 1 handful)</label>
    </section>
    <section class="card">
      <${Head} title="Weapons" topic="weapons" icon="weapon" tail=${html`<button class="btn small" onClick=${() => setWpick("pack")}>+ Weapon</button>`} />
      ${burdenWarn && html`<p class="warn">${burdenWarn}</p>`}
      ${tierWarn && html`<p class="warn">You can't equip weapons or armor of a higher tier than yours (tier ${d.tier}).</p>`}
      <div class="wcards">${c.weapons.map((w, i) => { const W = R.weaponStats(w); return html`<div class=${"wcard" + (w.slot !== "pack" ? " eq" : "")}>
        <${GearTitle} g=${w} S=${W} icon="weapon" onRename=${v => update(x => { x.weapons[i].label = v; })}
          tags=${html`${W && W.tier && html`<span class="tag">Tier ${W.tier}</span>`}${W && W.cat && html`<span class="tag">${W.cat}</span>`}<${Burden} W=${W} />`} />
        ${w.custom && edit ? html`<div class="grid4"><${Field} label="Name" value=${w.name} onInput=${v => update(x => { x.weapons[i].name = v; })} />
            <${Select} label="Trait" value=${w.trait} options=${R.TRAITS.map(t => t.n)} onChange=${v => update(x => { x.weapons[i].trait = v; })} />
            <${Select} label="Range" value=${w.range} options=${R.RANGES} onChange=${v => update(x => { x.weapons[i].range = v; })} />
            <${Field} label="Damage" value=${w.dmg} placeholder="d8+1 phy" onInput=${v => update(x => { x.weapons[i].dmg = v; })} />
            <${Select} label="Burden" value=${w.burden} options=${["One-Handed", "Two-Handed"]} onChange=${v => update(x => { x.weapons[i].burden = v; })} />
            <${Field} label="Feature" value=${w.feat} onInput=${v => update(x => { x.weapons[i].feat = v; })} /></div>`
          : W && html`<${WeaponStats} W=${W} d=${d} />${W.feat && html`<${Md} cls="small" text=${W.feat} />`}`}
        <div class="row"><div class="seg small">${[["primary", "Primary"], ["secondary", "Secondary"], ["pack", "Inventory"]].map(([k, n]) => html`<button aria-pressed=${w.slot === k} onClick=${() => setSlot(i, k)}>${n}</button>`)}</div>
          <button class="btn small danger" onClick=${() => update(x => { x.weapons.splice(i, 1); })}>Remove</button></div>
      </div>`; })}</div>
      ${c.weapons.filter(w => w.slot === "pack").length > 2 && html`<p class="warn">You can carry up to two weapons in your inventory.</p>`}
      <p class="muted small">Swapping an inventory weapon with an active one is free during a rest or a moment of calm; otherwise mark a Stress.</p>
    </section>

    <section class="card">
      <${Head} title="Armor" topic="armor" icon="helm" tail=${html`<button class="btn small" onClick=${() => setApick(true)}>+ Armor</button>`} />
      <div class="wcards">${c.armor.map((a, i) => { const A = R.armorStats(a); return html`<div class=${"wcard" + (a.worn ? " eq" : "")}>
        <${GearTitle} g=${a} S=${A} icon="helm" onRename=${v => update(x => { x.armor[i].label = v; })}
          tags=${html`${A && A.tier && html`<span class="tag">Tier ${A.tier}</span>`}${a.worn && html`<span class="tag">Worn</span>`}`} />
        ${a.custom && edit ? html`<div class="grid4"><${Field} label="Name" value=${a.name} onInput=${v => update(x => { x.armor[i].name = v; })} />
            <${Field} label="Major" type="number" value=${a.major} onInput=${v => update(x => { x.armor[i].major = v; })} />
            <${Field} label="Severe" type="number" value=${a.severe} onInput=${v => update(x => { x.armor[i].severe = v; })} />
            <${Field} label="Score" type="number" value=${a.score} onInput=${v => update(x => { x.armor[i].score = v; })} />
            <${Field} label="Feature" value=${a.feat} onInput=${v => update(x => { x.armor[i].feat = v; })} /></div>`
          : A && html`<${ArmorStats} A=${A} marked=${num(c.marks.armor[a.id])} />${A.feat && html`<${Md} cls="small" text=${A.feat} />`}`}
        <div class="row"><button class=${"btn small" + (a.worn ? " on" : "")} onClick=${() => update(x => { x.armor.forEach((y, j) => { y.worn = j === i ? !y.worn : false; }); })}>${a.worn ? "Worn" : "Wear"}</button>
          <button class="btn small danger" onClick=${() => update(x => { x.armor.splice(i, 1); })}>Remove</button></div></div>`; })}</div>
      ${!c.armor.length && html`<p class="muted">Unarmored: Armor Score 0, Major threshold = level, Severe = twice your level.</p>`}
    </section>

    <section class="card">
      <${Head} title="Inventory" topic="inventory" icon="pack" tail=${html`<span class="row"><button class="btn small" onClick=${() => setIpick("item")}>+ Item</button><button class="btn small" onClick=${() => setIpick("consumable")}>+ Consumable</button></span>`} />
      <div class="items">${c.items.map((it, i) => html`<div class=${"item" + (it.worn ? " worn" : "")}>
        <${Icon} n=${it.kind === "consumable" ? "potion" : "pack"} cls="muted" />
        <input value=${it.name} aria-label="Item" onInput=${e => update(x => { x.items[i].name = e.target.value; })} />
        ${it.kind === "consumable" && html`<${Stepper} label="Quantity" value=${num(it.qty, 1)} min=${0} max=${R.MAX.consumable} onSet=${v => update(x => { x.items[i].qty = v; })} />`}
        ${it.text && html`<button class="iconbtn" aria-label="What it does" onClick=${() => openPanel({ title: it.name, sub: it.kind === "consumable" ? "Consumable" : "Item", body: html`<${Md} text=${it.text} />` })}>?</button>`}
        ${it.kind !== "consumable" && html`<button class=${"btn tiny" + (it.worn ? " on" : "")} aria-pressed=${!!it.worn} title=${it.worn ? "Take it off" : "Wear or carry it ready: it shows under Worn gear on the sheet"} onClick=${() => update(x => { x.items[i].worn = !x.items[i].worn; })}>${it.worn ? "Worn" : "Equip"}</button>`}
        <button class="iconbtn" aria-label="Remove" onClick=${() => update(x => { x.items.splice(i, 1); })}>×</button></div>`)}</div>
      <p class="muted small">You can hold up to five of each consumable.</p>
    </section>

    
    ${wpick && html`<${GearPicker} kind="weapon" c=${c} d=${d} onClose=${() => setWpick(null)} onPick=${(name, custom) => { update(x => { x.weapons.push(custom ? { id: rid("w"), custom: true, name: "Custom weapon", trait: "Strength", range: "Melee", dmg: "d8 phy", burden: "One-Handed", feat: "", slot: "pack" } : { id: rid("w"), name, slot: "pack" }); }); setWpick(null); }} />`}
    ${apick && html`<${GearPicker} kind="armor" c=${c} d=${d} onClose=${() => setApick(false)} onPick=${(name, custom) => { update(x => { x.armor.push(custom ? { id: rid("a"), custom: true, name: "Custom armor", major: 5, severe: 11, score: 3, feat: "", worn: !x.armor.length } : { id: rid("a"), name, worn: !x.armor.length }); }); setApick(false); }} />`}
    ${ipick && html`<${GearPicker} kind=${ipick} c=${c} d=${d} onClose=${() => setIpick(null)} onPick=${(name, custom, text) => { update(x => { x.items.push({ id: rid("i"), name: custom ? "" : name, qty: 1, kind: ipick, text: text || "" }); }); setIpick(null); }} />`}
  </div>`;
}
function GearPicker({ kind, c, d, onClose, onPick }) {
  const [q, setQ] = useState(""); const [tier, setTier] = useState(d.tier); const [cat, setCat] = useState("");
  const list = R.list(kind === "weapon" ? "weapons" : kind === "armor" ? "armor" : kind === "item" ? "items" : "consumables");
  const needle = q.trim().toLowerCase();
  const rows = list.filter(x => (!needle || x.name.toLowerCase().includes(needle) || (x.feat || x.x || "").toLowerCase().includes(needle))
    && (kind !== "weapon" && kind !== "armor" || !tier || x.tier === +tier) && (kind !== "weapon" || !cat || (cat === "wheel" ? x.wheelchair : x.cat === cat && !x.wheelchair)));
  const title = { weapon: "Armory", armor: "Armory", item: "Items", consumable: "Consumables" }[kind];
  return html`<${Modal} title=${{ weapon: "Add a weapon", armor: "Add armor", item: "Add an item", consumable: "Add a consumable" }[kind]} onClose=${onClose} wide>
    <${Catalog} title=${title} icon=${kind === "weapon" ? "weapon" : kind === "armor" ? "helm" : kind === "consumable" ? "potion" : "pack"} items=${rows} resetKey=${needle + tier + cat}
      tools=${html`<input type="search" placeholder="Search" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Search" />
        ${(kind === "weapon" || kind === "armor") && html`<div class="seg small">${[0, 1, 2, 3, 4].map(t => html`<button aria-pressed=${+tier === t} onClick=${() => setTier(t)}>${t ? "Tier " + t : "All"}</button>`)}</div>`}
        ${kind === "weapon" && html`<div class="seg small">${[["", "All"], ["Primary", "Primary"], ["Secondary", "Secondary"], ["wheel", "Wheelchair"]].map(([k, n]) => html`<button aria-pressed=${cat === k} onClick=${() => setCat(k)}>${n}</button>`)}</div>`}
        <button class="btn small" onClick=${() => onPick("", true)}>Custom…</button>`}
      render=${x => html`<${ItemCard} x=${x} kind=${kind} onPick=${() => onPick(x.name, false, x.x)} />`} />
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
  const apply = async () => {
    let v; try { v = JSON.parse(paste); if (!v || !v.dh) throw 0; } catch { toast("That doesn't look like a saved character."); return; }
    if (!(await ask({ title: "Replace this character?", icon: "book", danger: true, ok: "Replace", body: `${c.name || "This character"} will be replaced by ${v.name || "the pasted character"}. This can't be undone.` }))) return;
    try {
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
      <button class="btn danger" onClick=${async () => { if (await ask({ title: "Delete this character?", icon: "wound", danger: true, ok: "Delete for good", body: `${c.name || "This character"} will be deleted for everyone at the table. This can't be undone.` })) onDelete(c.id); }}>Delete this character</button></section>
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
        <div class="row"><button class="btn danger small" onClick=${async () => (await ask({ title: "Delete this companion?", icon: "wound", danger: true, ok: "Delete", body: `${c.name || "This companion"} will be deleted for good.` })) && onDelete(c.id)}>Delete companion</button></div></section>
    </div></section>`;
}

function Books({ onClose, first }) {
  const [hf, setHf] = useState(!!(Store.state.books && Store.state.books.hf));
  const save = () => { Store.saveState(s => { s.books = { core: true, hf }; }); onClose(); };
  return html`<${Modal} title=${first ? "Which rulebooks does your table use?" : "Rulebooks"} onClose=${save} wide
    foot=${html`<button class="btn primary" onClick=${save}>${first ? "Open the table" : "Save"}</button>`}>
    <p class="lead" style="text-align:left;margin:0 0 14px">Only content from the books you choose appears in creation, pickers, level-ups and the GM table. You can change this later on the GM table.</p>
    <div class="books">
      <div class="book on locked"><${Icon} n="book" /><div><b>Core Set</b><span>9 classes, 18 ancestries, 9 communities, 9 domains, Core equipment, loot and adversaries. Always included.</span></div></div>
      <button class=${"book" + (hf ? " on" : "")} aria-pressed=${hf} onClick=${() => setHf(!hf)}><${Icon} n="dread" /><div><b>Hope & Fear expansion · ${hf ? "included" : "not included"}</b><span>Assassin, Brawler, Warlock and Witch, the Dread domain, 7 ancestries, 6 communities, transformations, and more equipment, loot and adversaries.</span></div></button>
    </div></${Modal}>`;
}

function TraitShield({ t, value, marked, spell, onClick, armed, pick, children }) {
  const T = onClick ? "button" : "div";
  // Name and verbs sit in the shield's broad top; the value sits in its point, like a heraldic charge.
  return html`<div class="trait-col"><div class=${"trait-wrap" + (marked ? " marked" : "") + (pick ? " pick" : "") + (armed ? " armed" : "") + (spell ? " spell" : "")}>
    <${T} class="trait" type=${onClick ? "button" : undefined} onClick=${onClick}>
      ${marked && html`<span class="tmark" title="Marked this tier">◆</span>`}${spell && html`<span class="tspell" aria-label="Spellcast trait"><${Icon} n="spellcast" /></span>`}
      <span class="ti"><${Icon} n=${t.k} /></span><span class="tn">${t.n}</span><span class="tverbs">${t.v}</span>
      <span class=${"tvb" + (spell ? " spell" : "") + (value != null && value < 0 ? " neg" : "")}>
        <svg class="tbadge" viewBox="0 0 64 74" aria-hidden="true"><path class="o" d="M3 3H61V33C61 52 47 64 32 71C17 64 3 52 3 33Z" /><path class="i" d="M9 9H55V33C55 48 44 58 32 64C20 58 9 48 9 33Z" /></svg>
        <b class="tv">${value == null ? "?" : R.sign(value)}</b></span>
    </${T}></div>${children && html`<div class="trait-under">${children}</div>`}</div>`;
}

function Medal({ kind, label, value, children }) {
  return html`<div class=${"medal " + kind}><div class="m">${value}</div><span>${label}</span>${children}</div>`;
}
// Damage thresholds as a ruler: Minor | Major | Severe, with the numbers on the cuts and HP marked below.

function ThresholdRuler({ major, severe, massive, hit }) {
  return html`<div class="ruler"><div class="rl-title">Damage thresholds</div>
    <div class=${"rl-bar" + (hit ? " hit-" + hit.band : "")} key=${hit ? hit.k : 0}><div class="seg3 s1"><b>Minor</b><small>below ${major}</small></div><div class="cut" title="Major threshold">${major}</div>
      <div class="seg3 s2"><b>Major</b><small>${major}–${severe - 1}</small></div><div class="cut" title="Severe threshold">${severe}</div><div class="seg3 s3"><b>Severe</b><small>${severe}+</small></div></div>
    <div class="rl-hp"><span>mark 1 HP</span><span></span><span>mark 2 HP</span><span></span><span>mark 3 HP${massive ? ` · ${severe * 2}+: 4` : ""}</span></div></div>`;
}

// Trait, range and damage as cells; the damage type sits under the damage. Burden is shown as hands (Burden).
function WeaponStats({ W, d }) {
  const t = R.TRAIT_KEY[(W.trait || "").toLowerCase()];
  const type = (/(phy\/mag|phy or mag|phy|mag)\s*$/.exec(W.dmg || "") || [])[1] || "";
  return html`<div class="statcells three">
    <div class="cell"><small>Trait</small><b>${W.trait}${d && t != null ? ` ${R.sign(d.traits[t])}` : ""}</b></div>
    <div class="cell"><small>Range</small><b>${W.range}</b></div>
    <div class=${"cell big dmg " + (type === "mag" ? "mag" : type === "phy" ? "phy" : "")}><small>Damage</small><b>${d ? R.damageExpr(W.dmg, d.prof) : W.dmg.replace(/\s*(phy\/mag|phy or mag|phy|mag)\s*$/, "")}</b>
      <em>${type === "mag" ? "Magic" : type === "phy" ? "Physical" : type ? "Physical or magic" : ""}</em></div></div>`;
}
// One or two hands in the corner: faint until hovered, then they light and explain.
function Burden({ W }) {
  if (!W || !W.burden) return null;
  const two = /two/i.test(W.burden);
  return html`<span class=${"burden" + (two ? " two" : "")} aria-label=${two ? "Two-handed" : "One-handed"}
    onMouseEnter=${e => tip.show(e.currentTarget, { title: two ? "Two-handed" : "One-handed", lines: [two ? "This weapon is a two-hander: it takes both hands, leaving none for a secondary weapon." : "This weapon takes one hand, leaving the other free for a secondary weapon or shield."] })}
    onMouseLeave=${() => tip.hide()}><${Icon} n="hand" />${two && html`<${Icon} n="hand" cls="flip" />`}</span>`;
}

function featureCosts(text) {
  const t = String(text || "").replace(/\*/g, ""), out = [];
  const n = w => (/^\d+$/.test(w) ? +w : { a: 1, an: 1, one: 1, two: 2, three: 3 }[w] || w);
  let m;
  if ((m = /spend (a|an|one|two|three|\d+|any number of) Hope/i.exec(t))) out.push(["hope", "hope", m[1] === "any number of" ? "Hope" : `${n(m[1].toLowerCase())} Hope`]);
  if ((m = /mark (a|an|one|two|three|\d+) Stress/i.exec(t))) out.push(["stress", "stress", `${n(m[1].toLowerCase())} Stress`]);
  if ((m = /mark (a|an|one|\d+) Armor Slot/i.exec(t))) out.push(["armor", "armor", "Armor Slot"]);
  if (/Spellcast Roll/.test(t)) out.push(["spell", "spellcast", "Spellcast Roll"]);
  return out;
}

const PER = { rest: ["rest", "per rest"], long: ["longrest", "per long rest"], session: ["session", "per session"], scene: ["scene", "per scene"] };

function Catalog({ title, icon, items, render, per = 6, tools, empty = "Nothing here.", grid = "cat-grid", resetKey, startAt }) {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const [page, setPage] = useState(() => (startAt != null && startAt >= 0 ? Math.floor(startAt / per) : 0));
  useEffect(() => { setPage(0); }, [resetKey]);
  const p = Math.min(page, pages - 1);
  const shown = items.slice(p * per, p * per + per);
  return html`<div class="catalog">
    <div class="cat-h"><span class="cat-title"><${Icon} n=${icon} />${title}</span>${tools}</div>
    <div class=${grid === "cards" ? "cards cat-cards" : "cat-grid"} style=${grid === "cards" ? "padding:14px" : ""}>${shown.map(render)}</div>
    ${!items.length && html`<p class="muted" style="padding:0 14px 12px">${empty}</p>`}
    <div class="cat-f"><button class="pager" aria-label="Previous page" disabled=${p === 0} onClick=${() => setPage(p - 1)}>◀</button>
      <div class="pages">${pages <= 12 ? Array.from({ length: pages }, (_, i) => html`<button class=${"pdot" + (i === p ? " on" : "")} aria-label=${`Page ${i + 1}`} onClick=${() => setPage(i)}></button>`) : ""}
        <span>${items.length ? `${p * per + 1}–${Math.min(items.length, p * per + per)} of ${items.length}` : "0"}</span></div>
      <button class="pager" aria-label="Next page" disabled=${p >= pages - 1} onClick=${() => setPage(p + 1)}>▶</button></div>
  </div>`;
}
// One weapon, armor or loot entry as a card in a catalog.

function ItemCard({ x, kind, on, onPick, disabled, why }) {
  const T = onPick ? "button" : "div";
  return html`<${T} class=${"item-card" + (on ? " on" : "")} disabled=${disabled} title=${why || ""} onClick=${onPick}>
    <span class="in"><${Icon} n=${kind === "weapon" ? "weapon" : kind === "armor" ? "helm" : kind === "consumable" ? "potion" : "pack"} />${x.name}${kind === "weapon" && html`<${Burden} W=${x} />`}</span>
    ${kind === "weapon" && html`<span class="small muted">${x.wheelchair ? "Combat wheelchair · " : ""}${x.cat} · Tier ${x.tier}</span><${WeaponStats} W=${x} />`}
    ${kind === "armor" && html`<span class="small muted">Tier ${x.tier}</span><${ArmorStats} A=${x} />`}
    ${(x.feat || x.x) && html`<${Md} cls="small" text=${x.feat || x.x} />`}
    ${why && html`<span class="small warn">${why}</span>`}</${T}>`;
}
