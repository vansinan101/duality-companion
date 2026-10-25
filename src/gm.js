/* ================= GM table ================= */
// Fear, the party at a glance, adversaries in the scene, countdowns, the optional spotlight tracker,
// the Witherwild's Wither tokens (when the table turns that frame on), players and roles, and backups.
function GMView({ chars, all, updateChar, openChar, openBooks }) {
  const st = Store.state;
  const save = fn => Store.saveState(fn);
  const pcs = chars.filter(c => c.kind !== "companion");
  const [camp, setCamp] = useState(() => lsGet("dh-gm-camp", ""));
  useEffect(() => lsSet("dh-gm-camp", camp), [camp]);
  const party = pcs.filter(c => !camp || (c.campaign || "") === camp);
  const camps = [...new Set(pcs.map(c => c.campaign || "").filter(Boolean))];
  return html`<section class="gm">
    <div class="gmtop card">
      <div class="fear"><span class="tl"><${Icon} n="fear" />Fear</span><${Track} label="Fear" value=${num(st.fear)} max=${R.MAX.fear} kind="fear" verb=${["Gain", "Spend"]} onSet=${v => save(s => { s.fear = v; })} />
        <span class="row"><button class="btn tiny" onClick=${async () => { const r = await rollExpr("Short rest Fear", "1d4"); if (r != null) Store.addFear(r); }}>Short rest +1d4</button>
          <button class="btn tiny" onClick=${async () => { const r = await rollExpr("Long rest Fear", "1d4"); if (r != null) Store.addFear(r + party.length); }}>Long rest +1d4+${party.length}</button></span></div>
      <div class="row wrapr">
        ${camps.length > 0 && html`<${Select} label="Campaign" value=${camp} empty="All" options=${camps} onChange=${setCamp} />`}
        <label class="chk small"><input type="checkbox" checked=${!!(st.options || {}).massive} onChange=${e => save(s => { s.options = Object.assign({}, s.options, { massive: e.target.checked }); })} /> Optional rule: Massive Damage</label>
        <label class="chk small"><input type="checkbox" checked=${st.frame === "witherwild"} onChange=${e => save(s => { s.frame = e.target.checked ? "witherwild" : ""; })} /> Campaign frame: The Witherwild</label>
        <button class="btn small" onClick=${openBooks}><${Icon} n="book" />Rulebooks: Core${R.books().hf ? " + Hope & Fear" : " only"}</button>
        <button class="btn small" onClick=${() => endSession(party, updateChar)}>End session</button>
      </div>
    </div>
    <${Head} title="The party" topic="gmparty" icon="crown" />
    <div class="party">${party.map(c => html`<${PartyCard} c=${norm(c)} updateChar=${updateChar} openChar=${openChar} frame=${st.frame} spot=${st.spotlight} />`)}
      ${!party.length && html`<p class="muted">No characters here yet.</p>`}</div>
    <${Spotlight} party=${party} st=${st} save=${save} />
    <${Foes} st=${st} save=${save} />
    <${Countdowns} st=${st} save=${save} />
    ${Store.table && html`<${Players} chars=${chars} updateChar=${updateChar} />`}
    <${Backup} chars=${chars} />
  </section>`;
}
// End of session: Wither tokens become Fear (Witherwild), per-session uses refresh, spotlight tokens refill.
function endSession(party, updateChar) {
  if (!confirm("End the session? Per-session uses refresh" + (Store.state.frame === "witherwild" ? ", and Wither tokens on the PCs are cleared and become Fear." : "."))) return;
  let wither = 0;
  party.forEach(c => { wither += num(c.wither); updateChar(c.id, x => { R.refreshUses(x, "session"); if (Store.state.frame === "witherwild" && num(x.wither)) { addLog(x, `End of session: ${x.wither} Wither tokens cleared`); x.wither = 0; } }); });
  Store.saveState(s => { s.fear = R.clamp(num(s.fear) + (s.frame === "witherwild" ? wither : 0), 0, R.MAX.fear); s.spotlight = Object.assign({}, s.spotlight, { left: {} }); });
  toast(wither && Store.state.frame === "witherwild" ? `Session ended. The GM gains ${wither} Fear from Wither tokens.` : "Session ended.");
}
function PartyCard({ c, updateChar, openChar, frame }) {
  const d = derive(c); const u = fn => updateChar(c.id, fn);
  const [dmg, setDmg] = useState("");
  const sev = dmg === "" ? null : R.severity(dmg, d.major, d.severe, { massive: (Store.state.options || {}).massive });
  const witherHit = async () => {
    const f = await rollExpr(`${c.name}'s Fear Die`, "1d12"); if (f == null) return;
    const tokens = num(c.wither) + 1, scar = f <= tokens;
    u(x => { if (scar) { x.scars = num(x.scars) + 1; x.wither = 0; } else x.wither = tokens; addLog(x, `Severe damage from a Withered foe: Fear Die ${f}${scar ? " — gained a scar, tokens cleared" : ""}`); });
    toast(`${c.name}: Fear Die ${f} vs ${tokens} Wither token${tokens > 1 ? "s" : ""}${scar ? " → a scar. The Witherwild changes them." : "."}`);
  };
  return html`<div class=${"pcard card" + (d.down ? " down" : "") + (c.dead ? " dead" : "")}>
    <div class="pc-head"><${Thumb} c=${c} /><div><b>${c.name || "Unnamed"}</b><span class="small muted">${c.cls ? `${c.cls} ${c.level}` : "No class"} · Evasion ${d.evasion} · ${d.major}/${d.severe}</span></div>
      <button class="btn tiny" onClick=${() => openChar(c.id)}>Sheet</button></div>
    <div class="trackrow"><span class="tl">HP</span><${Track} label=${`${c.name} Hit Points`} value=${d.cur.hp} max=${d.hpMax} kind="hp" onSet=${v => u(x => { x.marks.hp = v; })} /></div>
    <div class="trackrow"><span class="tl">Stress</span><${Track} label=${`${c.name} Stress`} value=${d.cur.stress} max=${d.stressMax} kind="stress" onSet=${v => u(x => { x.marks.stress = v; })} /></div>
    <div class="trackrow"><span class="tl">Hope</span><${Track} label=${`${c.name} Hope`} value=${d.cur.hope} max=${d.hopeMax} lock=${Math.min(num(c.scars), 6)} kind="hope" verb=${["Gain", "Spend"]} onSet=${v => u(x => { x.marks.hope = v; })} /></div>
    ${d.armor && html`<div class="trackrow"><span class="tl">Armor</span><${Track} label=${`${c.name} Armor Slots`} value=${d.cur.armor} max=${d.armorScore} kind="armor" onSet=${v => u(x => { x.marks.armor[d.armor.id] = v; })} /></div>`}
    <div class="dmgcalc small"><input type="number" inputmode="numeric" placeholder="Damage" value=${dmg} onInput=${e => setDmg(e.target.value)} aria-label="Damage" />
      ${sev && html`<span class="sev">${sev.label} · ${sev.hp} HP</span>`}
      <button class="btn tiny" disabled=${!sev} onClick=${() => { u(x => { x.marks.hp = R.clamp(num(x.marks.hp) + sev.hp, 0, d.hpMax); addLog(x, `GM: ${sev.d} damage (${sev.label}) → ${sev.hp} HP`); }); setDmg(""); }}>Mark</button></div>
    ${(c.conditions.length > 0 || d.vulnerable) && html`<div class="chips">${c.conditions.map(n => html`<span class="chip on">${n}</span>`)}${d.vulnerable && html`<span class="chip auto">Vulnerable</span>`}</div>`}
    ${frame === "witherwild" && html`<div class="row small"><span>Wither tokens <b>${num(c.wither)}</b></span><button class="btn tiny" onClick=${witherHit}>Severe damage from a Withered foe</button>
      ${num(c.wither) > 0 && html`<button class="btn tiny" onClick=${() => u(x => { x.wither = Math.max(0, num(x.wither) - 1); })}>−1</button>`}</div>`}
  </div>`;
}
// Optional rule: spotlight tokens (SRD Turn Order & Action Economy).
function Spotlight({ party, st, save }) {
  const sp = Object.assign({ on: false, per: 3, left: {} }, st.spotlight);
  const left = c => (sp.left[c.id] == null ? sp.per : sp.left[c.id]);
  const allOut = party.length && party.every(c => left(c) <= 0);
  return html`<section class="card">
    <${Head} title="Spotlight tracker" topic="spotlight" icon="spotlight" tail=${html`<label class="chk small"><input type="checkbox" checked=${sp.on} onChange=${e => save(s => { s.spotlight = Object.assign({}, sp, { on: e.target.checked }); })} /> Use it</label>`} />
    ${sp.on ? html`<div class="spots">${party.map(c => html`<div class="spot"><span>${c.name || "Unnamed"}</span>
        <${Track} label=${`${c.name} spotlight tokens`} value=${left(c)} max=${sp.per} kind="spot" verb=${["Give back", "Spend"]} onSet=${v => save(s => { s.spotlight = Object.assign({}, sp, { left: Object.assign({}, sp.left, { [c.id]: v }) }); })} /></div>`)}</div>
      <div class="row">${allOut && html`<span class="warn">Everyone has used their tokens.</span>`}<button class="btn small" onClick=${() => save(s => { s.spotlight = Object.assign({}, sp, { left: {} }); })}>Refill all</button>
        <label class="field tiny"><span>Tokens each</span><input type="number" min="1" max="6" value=${sp.per} onInput=${e => save(s => { s.spotlight = Object.assign({}, sp, { per: R.clamp(num(e.target.value, 3), 1, 6) }); })} /></label></div>`
    : html`<p class="muted small">Optional: each player gets a few tokens (3 is recommended) and spends one each time they take an action. The spotlight skips players with none left; when everyone's out, refill.</p>`}
  </section>`;
}
// Adversaries in the scene: from the SRD stat blocks or made up on the spot.
function Foes({ st, save }) {
  const [q, setQ] = useState(""); const [tier, setTier] = useState(0); const [show, setShow] = useState(false);
  const foes = st.foes || [];
  const needle = q.trim().toLowerCase();
  const found = show ? R.list("adversaries").filter(a => (!tier || a.tier === tier) && (!needle || a.name.toLowerCase().includes(needle) || a.type.toLowerCase().includes(needle))) : [];
  const addFoe = (a, n = 1) => save(s => { s.foes = (s.foes || []).concat(Array.from({ length: n }, (_, i) => ({ id: rid("f"), src: a ? a.name : "", name: a ? a.name + (n > 1 ? ` ${i + 1}` : "") : "Adversary", hp: 0, stress: 0, hpMax: a ? a.hp : 6, stressMax: a ? num(a.stress) : 3, diff: a ? a.diff : 12, thr: a ? a.thresholds : "8/15", note: "" }))); });
  const setFoe = (id, fn) => save(s => { s.foes = s.foes.map(f => (f.id === id ? Object.assign({}, f, fn(f)) : f)); });
  const env = st.env ? R.byName("environments", st.env) : null;
  return html`<section class="card">
    <${Head} title="Adversaries" topic="adversaries" icon="foe" tail=${html`<span class="row"><button class="btn small" onClick=${() => setShow(!show)}>${show ? "Hide list" : "+ From the SRD"}</button><button class="btn small" onClick=${() => addFoe(null)}>+ Custom</button></span>`} />
    ${show && html`<${Catalog} title="Bestiary" icon="foe" items=${found} resetKey=${needle + tier}
      tools=${html`<input type="search" placeholder="Find an adversary or type" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Find an adversary" />
        <div class="seg small">${[0, 1, 2, 3, 4].map(t => html`<button aria-pressed=${tier === t} onClick=${() => setTier(t)}>${t ? "Tier " + t : "All"}</button>`)}</div>`}
      render=${a => html`<div class="item-card"><span class="in"><${Icon} n="foe" />${a.name}</span><span class="small muted">Tier ${a.tier} ${a.type}${a.horde ? ` (${a.horde}/HP)` : ""}</span>
        <div class="statcells"><div class="cell big"><small>Difficulty</small><b>${a.diff}</b></div><div class="cell"><small>Thresholds</small><b>${a.thresholds}</b></div><div class="cell big"><small>HP</small><b>${a.hp}</b></div><div class="cell"><small>Stress</small><b>${a.stress ?? "—"}</b></div></div>
        <span class="row"><button class="btn tiny primary" onClick=${() => addFoe(a)}>Add</button><button class="btn tiny" onClick=${() => addFoe(a, 3)}>Add 3</button>
          <button class="btn tiny" onClick=${() => openPanel({ title: a.name, sub: `Tier ${a.tier} ${a.type}`, body: html`<${StatBlock} a=${a} />` })}>Stat block</button></span></div>`} />`}
    <div class="foes">${foes.map(f => html`<${FoeCard} f=${f} setFoe=${setFoe} save=${save} />`)}</div>
    ${!foes.length && html`<p class="muted small">No adversaries in the scene.</p>`}
    ${foes.length > 0 && html`<div class="row"><button class="btn small danger" onClick=${() => confirm("Clear every adversary from the scene?") && save(s => { s.foes = []; })}>Clear the scene</button></div>`}
    <${Head} level=${3} title="Environment" />
    <div class="row wrapr"><${Select} label="Environment" value=${st.env} empty="None" options=${[1, 2, 3, 4].map(t => ({ group: "Tier " + t, items: R.list("environments").filter(e => e.tier === t).map(e => [e.name, `${e.name} (${e.type})`]) }))} onChange=${v => save(s => { s.env = v; })} /></div>
    ${env && html`<div class="statblock"><p><i>${env.desc}</i></p><p class="small"><b>Impulses:</b> ${env.impulses} · <b>Difficulty:</b> ${env.diff}${env.potential ? html` · <b>Potential adversaries:</b> ${env.potential}` : ""}</p>
      ${env.features.map(f => html`<div class="feat"><div class="fhead"><b>${f.n}</b></div><${Md} text=${f.x} /></div>`)}</div>`}
  </section>`;
}
function FoeCard({ f, setFoe, save }) {
  const [dmg, setDmg] = useState("");
  const a = f.src ? R.byName("adversaries", f.src) : null;
  const thr = String(f.thr || "").split("/").map(x => num(x));
  const sev = dmg === "" ? null : thr.length === 2 && thr[0] ? R.severity(dmg, thr[0], thr[1]) : { hp: 1, label: "Hit", d: num(dmg) };
  const block = () => openPanel({ title: a.name, sub: `Tier ${a.tier} ${a.type}`, body: html`<${StatBlock} a=${a} />` });
  return html`<div class=${"foe card" + (num(f.hp) >= num(f.hpMax) ? " down" : "")}>
    <div class="pc-head"><input class="fname" value=${f.name} aria-label="Name" onInput=${e => setFoe(f.id, () => ({ name: e.target.value }))} />
      <button class="iconbtn" aria-label="Remove" onClick=${() => save(s => { s.foes = s.foes.filter(x => x.id !== f.id); })}>×</button></div>
    <p class="small muted">Difficulty ${f.diff} · Thresholds ${f.thr || "none"} ${a && html`<button class="btn tiny" onClick=${block}>Stat block</button>`}</p>
    <div class="trackrow"><span class="tl">HP</span><${Track} label=${`${f.name} HP`} value=${num(f.hp)} max=${num(f.hpMax)} kind="hp" onSet=${v => setFoe(f.id, () => ({ hp: v }))} /></div>
    ${num(f.stressMax) > 0 && html`<div class="trackrow"><span class="tl">Stress</span><${Track} label=${`${f.name} Stress`} value=${num(f.stress)} max=${num(f.stressMax)} kind="stress" onSet=${v => setFoe(f.id, () => ({ stress: v }))} /></div>`}
    ${a && html`<p class="small">ATK ${a.atk} · ${a.attack}: ${a.range} · ${a.dmg}</p>`}
    <div class="dmgcalc small"><input type="number" inputmode="numeric" placeholder="Damage" value=${dmg} onInput=${e => setDmg(e.target.value)} aria-label="Damage" />
      ${sev && html`<span class="sev">${sev.label} · ${sev.hp} HP</span>`}
      <button class="btn tiny" disabled=${!sev} onClick=${() => { setFoe(f.id, x => ({ hp: Math.min(num(x.hpMax), num(x.hp) + sev.hp) })); setDmg(""); }}>Mark</button></div>
    ${!f.src && html`<div class="grid4"><${Field} label="HP" type="number" value=${f.hpMax} onInput=${v => setFoe(f.id, () => ({ hpMax: v }))} /><${Field} label="Stress" type="number" value=${f.stressMax} onInput=${v => setFoe(f.id, () => ({ stressMax: v }))} />
      <${Field} label="Difficulty" type="number" value=${f.diff} onInput=${v => setFoe(f.id, () => ({ diff: v }))} /><${Field} label="Thresholds" value=${f.thr} placeholder="8/15" onInput=${v => setFoe(f.id, () => ({ thr: v }))} /></div>`}
  </div>`;
}
function StatBlock({ a }) {
  return html`<div class="statblock"><p><i>${a.desc}</i></p>
    ${a.motives && html`<p class="small"><b>Motives & Tactics:</b> ${a.motives}</p>`}
    <p class="small"><b>Difficulty</b> ${a.diff} · <b>Thresholds</b> ${a.thresholds} · <b>HP</b> ${a.hp} · <b>Stress</b> ${a.stress ?? "—"}${a.horde ? ` · Horde (${a.horde}/HP)` : ""}</p>
    <p class="small"><b>ATK</b> ${a.atk} · <b>${a.attack}</b>: ${a.range} · ${a.dmg}</p>
    ${a.exp && html`<p class="small"><b>Experience:</b> ${a.exp}</p>`}
    ${a.features.map(f => html`<div class="feat"><div class="fhead"><b>${f.n}</b></div><${Md} text=${f.x} /></div>`)}</div>`;
}
function Countdowns({ st, save }) {
  const cds = st.countdowns || [];
  const setCd = (id, fn) => save(s => { s.countdowns = s.countdowns.map(x => (x.id === id ? Object.assign({}, x, fn(x)) : x)); });
  return html`<section class="card">
    <${Head} title="Countdowns" topic="countdowns" icon="countdown" tail=${html`<button class="btn small" onClick=${() => save(s => { s.countdowns = (s.countdowns || []).concat({ id: rid("k"), name: "Countdown", start: 4, value: 4, loop: false }); })}>+ Countdown</button>`} />
    <div class="cds">${cds.map(k => html`<div class=${"cd" + (num(k.value) <= 0 ? " fired" : "")}>
      <input value=${k.name} aria-label="Countdown name" onInput=${e => setCd(k.id, () => ({ name: e.target.value }))} />
      <b class="cdv">${k.value}</b>
      <button class="btn small" onClick=${() => setCd(k.id, x => { const v = num(x.value) - 1; if (v <= 0) toast(`${x.name} triggers!`); return { value: v <= 0 && x.loop ? num(x.start) : Math.max(0, v) }; })}>Tick</button>
      <button class="btn tiny" onClick=${() => setCd(k.id, x => ({ value: num(x.start) }))}>Reset</button>
      <label class="field tiny"><span>From</span><input type="number" min="1" value=${k.start} onInput=${e => setCd(k.id, () => ({ start: num(e.target.value, 1) }))} /></label>
      <label class="chk small"><input type="checkbox" checked=${!!k.loop} onChange=${e => setCd(k.id, () => ({ loop: e.target.checked }))} /> Loop</label>
      <button class="iconbtn" aria-label="Remove" onClick=${() => save(s => { s.countdowns = s.countdowns.filter(x => x.id !== k.id); })}>×</button></div>`)}</div>
    ${!cds.length && html`<p class="muted small">Track a looming danger or a goal: tick it down as the fiction or the dice say; at 0 it triggers.</p>`}
  </section>`;
}
function Players({ chars, updateChar }) {
  const ms = Store.members || [];
  const mine = uid => chars.filter(c => playersOf(c).includes(uid) && !c.companionOf);
  return html`<section class="card"><${Head} title="Players at the table" icon="community" />
    <div class="members">${ms.map(m => html`<div class="member"><b>${m.name}</b><span class="tag">${m.role === "gm" ? "GM" : "Player"}</span>
      <span class="small muted">${mine(m.uid).map(c => c.name).join(", ") || "No characters"}</span>
      ${m.uid !== Store.table.uid && html`<span class="row"><button class="btn tiny" onClick=${() => Store.table.setRole(m.uid, m.role === "gm" ? "player" : "gm")}>${m.role === "gm" ? "Make player" : "Make GM"}</button>
        <button class="btn tiny danger" onClick=${() => confirm(`Remove ${m.name} from the table?`) && Store.table.remove(m.uid)}>Remove</button></span>`}
      <${Select} label="Give a character" value="" empty="—" options=${chars.filter(c => !c.companionOf && !playersOf(c).includes(m.uid)).map(c => [c.id, c.name || "Unnamed"])}
        onChange=${id => id && updateChar(id, x => { x.players = playersOf(x).concat(m.uid); chars.filter(k => k.companionOf === id).forEach(k => updateChar(k.id, y => { y.players = playersOf(y).concat(m.uid); })); })} />
      ${mine(m.uid).map(c => html`<button class="chip on" title="Take this character back" onClick=${() => updateChar(c.id, x => { x.players = playersOf(x).filter(u => u !== m.uid); })}>${c.name} ×</button>`)}
    </div>`)}</div></section>`;
}
function Backup({ chars }) {
  const make = async () => {
    const portraits = {};
    chars.forEach(c => { if (c.portraitAsset && Store.assets && Store.assets.urlFor) portraits[c.portraitAsset] = Store.assets.urlFor(c.portraitAsset); });
    saveFile(`table-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ dhBackup: 1, t: Date.now(), characters: chars.map(c => clean(c)), state: Store.state, portraits }));
  };
  const restore = async f => {
    try {
      const b = JSON.parse(await f.text()); if (!b.dhBackup) throw 0;
      if (!confirm(`Restore ${b.characters.length} characters into this table? Characters with the same id are replaced.`)) return;
      for (const c of b.characters) { const p = b.portraits && b.portraits[c.portraitAsset]; if (p) { c.portraitData = p; c.portraitAsset = ""; } await Store.flush(c); }
      if (b.state) Store.saveState(s => Object.assign(s, b.state));
      toast("Backup restored.");
    } catch { toast("That isn't a table backup."); }
  };
  return html`<section class="card"><${Head} title="Table backup" icon="book" />
    <div class="row"><button class="btn" onClick=${make}>Download a backup</button>
      <label class="btn">Restore a backup<input type="file" accept=".json" hidden onChange=${e => e.target.files[0] && restore(e.target.files[0])} /></label></div>
    <p class="muted small">Every character, portrait and the table's Fear, countdowns and scene in one file.</p></section>`;
}

render(html`<${App} />`, document.getElementById("app"));
