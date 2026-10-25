/* ================= character creation ================= */
// The SRD's nine steps, one screen each. The draft is kept in this browser, so closing the guide loses nothing.
const G_STEPS = ["Name", "Class", "Heritage", "Traits", "Equipment", "Background", "Experiences", "Domain cards", "Connections"];
const EXAMPLE_EXP = {
  Backgrounds: "Assassin, Blacksmith, Bodyguard, Bounty Hunter, Chef to the Royal Family, Circus Performer, Con Artist, Fallen Monarch, Field Medic, High Priestess, Merchant, Noble, Pirate, Politician, Runaway, Scholar, Sellsword, Soldier, Storyteller, Thief, World Traveler",
  Characteristics: "Affable, Battle-Hardened, Bookworm, Charming, Cowardly, Friend to All, Helpful, Intimidating Presence, Leader, Lone Wolf, Loyal, Observant, Prankster, Silver Tongue, Sticky Fingers, Stubborn to a Fault, Survivor, Young and Naive",
  Specialties: "Acrobat, Gambler, Healer, Inventor, Magical Historian, Mapmaker, Master of Disguise, Navigator, Sharpshooter, Survivalist, Swashbuckler, Tactician",
  Skills: "Animal Whisperer, Barter, Deadly Aim, Fast Learner, Incredible Strength, Liar, Light Feet, Negotiator, Photographic Memory, Quick Hands, Repair, Scavenger, Tracker",
  Phrases: "Catch Me If You Can, Fake It Till You Make It, First Time's the Charm, Hold the Line, I Won't Let You Down, I'll Catch You, I've Got Your Back, Knowledge Is Power, Nature's Friend, Never Again, No One Left Behind, Pick on Someone Your Own Size, The Show Must Go On, This Is Not a Negotiation, Wolf in Sheep's Clothing",
};
const blankDraft = () => ({ step: 0, name: "", pronouns: "", campaign: "", emblem: { shape: "hope", hue: "#c9a227" }, portraitUrl: "", portraitData: "",
  cls: "", sub: "", ancestry: "", mixed: null, community: "", assign: {}, primary: "", secondary: "", armor: "", potion: "Minor Health Potion", classItem: "",
  answers: {}, description: "", exps: ["", ""], cards: [], connections: "" });
const HUES = ["#c9a227", "#b23a3a", "#2f7d6d", "#3b6fb6", "#7b4bb0", "#c46a2b", "#6f7f3a", "#8a8a8a"];

function Genesis({ onClose, onDone }) {
  const [g, setG] = useState(() => Object.assign(blankDraft(), lsGet("dh-genesis", {})));
  const set = patch => setG(x => { const n = Object.assign({}, x, typeof patch === "function" ? patch(x) : patch); lsSet("dh-genesis", n); return n; });
  const K = R.byName("classes", g.cls), sub = R.subcls(g.sub);
  const spellcaster = !!(sub && sub.spell);
  const [tapVal, setTapVal] = useState(null);
  const assigned = Object.values(g.assign);
  const pool = R.START_TRAITS.slice(); assigned.forEach(v => { const i = pool.indexOf(v); if (i >= 0) pool.splice(i, 1); });
  const P = R.weapon(g.primary);
  const okStep = i => [
    g.name.trim(), g.cls && g.sub, (g.ancestry || (g.mixed && g.mixed.a1 && g.mixed.a2)) && g.community, Object.keys(g.assign).length === 6,
    g.primary && g.armor, true, g.exps.filter(x => x.trim()).length >= 2, g.cards.length === 2, true][i];
  const firstGap = G_STEPS.findIndex((_, i) => !okStep(i));
  const finish = () => {
    onDone(c => {
      Object.assign(c, { name: g.name.trim(), pronouns: g.pronouns, campaign: g.campaign, emblem: g.emblem, portraitUrl: g.portraitUrl, portraitData: g.portraitData,
        cls: g.cls, sub: g.sub, ancestry: g.mixed ? "" : g.ancestry, mixed: g.mixed, community: g.community, answers: g.answers, description: g.description, connections: g.connections });
      R.TRAITS.forEach(t => (c.traits[t.k] = num(g.assign[t.k])));
      c.experiences = g.exps.filter(x => x.trim()).map((n, i) => ({ id: "e" + i, name: n.trim(), base: 2 }));
      c.cards = g.cards.map(n => ({ name: n, where: "loadout" }));
      if (g.primary) c.weapons.push({ id: rid("w"), name: g.primary, slot: "primary" });
      if (g.secondary) c.weapons.push({ id: rid("w"), name: g.secondary, slot: "secondary" });
      if (g.armor) c.armor.push({ id: rid("a"), name: g.armor, worn: true });
      const potion = SRD.consumables.find(x => x.name === g.potion);
      c.items = [{ id: rid("i"), name: "Torch", qty: 1, kind: "item" }, { id: rid("i"), name: "50 feet of rope", qty: 1, kind: "item" }, { id: rid("i"), name: "Basic supplies", qty: 1, kind: "item" },
        potion && { id: rid("i"), name: potion.name, qty: 1, kind: "consumable", text: potion.x }, g.classItem && { id: rid("i"), name: g.classItem, qty: 1, kind: "item" }].filter(Boolean);
      c.gold = { coins: 0, handfuls: 1, bags: 0, chests: 0 };
      c.marks.hope = 2;
      addLog(c, `Created: ${g.cls} (${g.sub}), ${g.mixed ? "mixed ancestry" : g.ancestry}, ${g.community}`);
    });
    lsSet("dh-genesis", null);
  };
  const Step = [StepName, StepClass, StepHeritage, StepTraits, StepEquip, StepBackground, StepExps, StepCards, StepConnect][g.step];
  return html`<div class="genesis" role="dialog" aria-label="Character creation">
    <div class="g-top"><b>Character creation</b><span class="muted small">Step ${g.step + 1} of 9 · ${G_STEPS[g.step]}</span><button class="iconbtn" aria-label="Close" onClick=${onClose}>×</button></div>
    <ol class="g-steps">${G_STEPS.map((n, i) => html`<li><button class=${(i === g.step ? "on " : "") + (okStep(i) ? "ok" : "")} onClick=${() => set({ step: i })}>${i + 1}<span>${n}</span></button></li>`)}</ol>
    <div class="g-body"><${Step} g=${g} set=${set} K=${K} sub=${sub} spellcaster=${spellcaster} pool=${pool} tapVal=${tapVal} setTapVal=${setTapVal} P=${P} /></div>
    <div class="g-foot">
      <button class="btn" disabled=${g.step === 0} onClick=${() => set({ step: g.step - 1 })}>Back</button>
      <button class="linkbtn small" onClick=${() => { if (confirm("Abandon this character and start over?")) { lsSet("dh-genesis", null); setG(blankDraft()); } }}>Start over</button>
      ${g.step < 8 ? html`<button class="btn primary" onClick=${() => set({ step: g.step + 1 })}>Next</button>`
        : html`<button class="btn primary" disabled=${firstGap >= 0} title=${firstGap >= 0 ? `Finish step ${firstGap + 1}: ${G_STEPS[firstGap]}` : ""} onClick=${finish}>Begin the adventure</button>`}
    </div></div>`;
}
function StepName({ g, set }) {
  const fileRef = useRef();
  return html`<div class="gs">
    <p class="lead">You can fill in your name, pronouns and description at any point. Start with a name and a face.</p>
    <div class="grid4"><${Field} label="Name" value=${g.name} onInput=${v => set({ name: v })} /><${Field} label="Pronouns" value=${g.pronouns} onInput=${v => set({ pronouns: v })} />
      <${Field} label="Campaign" value=${g.campaign} list="dh-camps" onInput=${v => set({ campaign: v })} /></div>
    <h4>Likeness</h4>
    <div class="likeness"><span class="thumb lg">${g.portraitData || g.portraitUrl ? html`<img src=${g.portraitData || g.portraitUrl} alt="" />` : html`<${Emblem} ...${g.emblem} />`}</span>
      <div><div class="chips">${EMBLEMS.map(s => html`<button class=${"chip emb" + (g.emblem.shape === s ? " on" : "")} aria-label=${s} onClick=${() => set({ emblem: Object.assign({}, g.emblem, { shape: s }), portraitData: "", portraitUrl: "" })}><${Emblem} shape=${s} /></button>`)}</div>
        <div class="chips">${HUES.map(hh => html`<button class=${"swatch" + (g.emblem.hue === hh ? " on" : "")} style=${`background:${hh}`} aria-label=${"Colour " + hh} onClick=${() => set({ emblem: Object.assign({}, g.emblem, { hue: hh }) })}></button>`)}
          <input type="color" value=${g.emblem.hue} aria-label="Any colour" onInput=${e => set({ emblem: Object.assign({}, g.emblem, { hue: e.target.value }) })} /></div>
        <div class="row"><${Field} label="Or an image link" value=${g.portraitUrl} placeholder="https://…" onInput=${v => set({ portraitUrl: v, portraitData: "" })} />
          <button class="btn small" onClick=${() => fileRef.current.click()}>Upload a picture</button>
          <input ref=${fileRef} type="file" accept="image/*" hidden onChange=${async e => { const f = e.target.files[0]; if (f) set({ portraitData: await shrinkImage(f), portraitUrl: "" }); }} /></div></div></div>
  </div>`;
}
function StepClass({ g, set, K, sub }) {
  return html`<div class="gs">
    <p class="lead">Your class sets your domains, starting Evasion and Hit Points, and your class features. Each class has two subclasses.</p>
    <div class="picks">${SRD.classes.map(k => html`<button class=${"pickcard" + (g.cls === k.name ? " on" : "")} onClick=${() => set({ cls: k.name, sub: g.cls === k.name ? g.sub : "", cards: g.cls === k.name ? g.cards : [], classItem: "" })}>
      <b>${k.name}</b><span class="small">${k.domains.join(" & ")} · Evasion ${k.evasion} · HP ${k.hp}</span><span class="small muted">${k.hope.n}</span></button>`)}</div>
    ${K && html`<div class="detail"><h3>${K.name}</h3><${Md} text=${K.desc} />
      <div class="feat"><div class="fhead"><b>${K.hope.n}</b><span class="tag">Hope feature</span></div><${Md} text=${K.hope.x} /></div>
      ${K.features.map(f => html`<div class="feat"><div class="fhead"><b>${f.n}</b></div><${Md} text=${f.x} /></div>`)}
      <h4>Choose a subclass</h4>
      <div class="picks two">${R.subclassesOf(K.name).map(s => html`<button class=${"pickcard" + (g.sub === s.name ? " on" : "")} onClick=${() => set({ sub: s.name })}>
        <b>${s.name}</b><span class="small">${s.spell ? `Spellcast trait: ${s.spell}` : "No Spellcast trait"}</span><span class="small muted">${s.desc}</span></button>`)}</div>
      ${sub && html`${sub.foundation.map(f => html`<div class="feat"><div class="fhead"><b>${f.n}</b><span class="tag">Foundation</span></div><${Md} text=${f.x} /></div>`)}`}
    </div>`}</div>`;
}
function StepHeritage({ g, set }) {
  const [mixed, setMixed] = useState(!!g.mixed);
  const anc = SRD.ancestries.filter(a => a.features.length);
  const A = R.byName("ancestries", g.ancestry), C = R.byName("communities", g.community);
  return html`<div class="gs">
    <p class="lead">Your heritage is your ancestry (lineage, two features) and your community (upbringing, one feature).</p>
    <div class="row"><div class="seg small"><button aria-pressed=${!mixed} onClick=${() => { setMixed(false); set({ mixed: null }); }}>One ancestry</button><button aria-pressed=${mixed} onClick=${() => { setMixed(true); set({ mixed: { a1: g.ancestry || "", a2: "" }, ancestry: "" }); }}>Mixed ancestry</button></div></div>
    ${!mixed ? html`<div class="picks">${anc.map(a => html`<button class=${"pickcard" + (g.ancestry === a.name ? " on" : "")} onClick=${() => set({ ancestry: a.name })}><b>${a.name}</b><span class="small muted">${a.features.map(f => f.n).join(" · ")}</span></button>`)}</div>
      ${A && html`<div class="detail"><${Md} text=${A.desc.split("\n")[0]} />${A.features.map(f => html`<div class="feat"><div class="fhead"><b>${f.n}</b></div><${Md} text=${f.x} /></div>`)}</div>`}`
    : html`<p class="muted small">Take the first-listed feature from one ancestry and the second-listed feature from another.</p>
      <div class="grid4"><${Select} label="First feature from" value=${(g.mixed || {}).a1} empty="—" options=${anc.map(a => [a.name, `${a.name}: ${a.features[0].n}`])} onChange=${v => set({ mixed: Object.assign({}, g.mixed, { a1: v }) })} />
        <${Select} label="Second feature from" value=${(g.mixed || {}).a2} empty="—" options=${anc.filter(a => a.name !== (g.mixed || {}).a1).map(a => [a.name, `${a.name}: ${a.features[1].n}`])} onChange=${v => set({ mixed: Object.assign({}, g.mixed, { a2: v }) })} /></div>
      ${g.mixed && [g.mixed.a1 && R.byName("ancestries", g.mixed.a1).features[0], g.mixed.a2 && R.byName("ancestries", g.mixed.a2).features[1]].filter(Boolean).map(f => html`<div class="feat"><div class="fhead"><b>${f.n}</b></div><${Md} text=${f.x} /></div>`)}`}
    <h4>Community</h4>
    <div class="picks">${SRD.communities.map(a => html`<button class=${"pickcard" + (g.community === a.name ? " on" : "")} onClick=${() => set({ community: a.name })}><b>${a.name}</b><span class="small muted">${a.features[0].n}</span></button>`)}</div>
    ${C && html`<div class="detail">${C.adjectives && html`<p class="muted"><i>${C.adjectives}</i></p>`}${C.features.map(f => html`<div class="feat"><div class="fhead"><b>${f.n}</b></div><${Md} text=${f.x} /></div>`)}</div>`}
  </div>`;
}
function StepTraits({ g, set, pool, tapVal, setTapVal, sub }) {
  const place = k => {
    if (g.assign[k] != null && tapVal == null) { const a = Object.assign({}, g.assign); delete a[k]; set({ assign: a }); return; }
    if (tapVal == null) { toast("Tap a value first, then a trait."); return; }
    const a = Object.assign({}, g.assign); a[k] = tapVal; set({ assign: a }); setTapVal(null);
  };
  const vals = [...pool].sort((a, b) => b - a);
  return html`<div class="gs">
    <p class="lead">Assign +2, +1, +1, +0, +0 and −1 to your six traits. Tap a value, then tap a trait. Tap a filled trait to take its value back.</p>
    ${sub && sub.spell && html`<p class="muted">Your Spellcast trait is <b>${sub.spell}</b>: spells use it.</p>`}
    <div class="vals">${vals.map((v, i) => html`<button class=${"val" + (tapVal === v ? " on" : "")} onClick=${() => setTapVal(tapVal === v ? null : v)}>${R.sign(v)}</button>`)}${!vals.length && html`<span class="muted">All values placed.</span>`}</div>
    <div class="traits">${R.TRAITS.map(t => html`<button class=${"trait pick" + (g.assign[t.k] != null ? " set" : "")} onClick=${() => place(t.k)}>
      <span class="tn">${t.n}</span><b class="tv">${g.assign[t.k] != null ? R.sign(g.assign[t.k]) : "?"}</b><span class="tverbs">${t.v}</span></button>`)}</div>
    <div class="row"><button class="btn small" onClick=${() => { set({ assign: {} }); setTapVal(null); }}>Clear all</button></div>
  </div>`;
}
function StepEquip({ g, set, K, spellcaster, P }) {
  const t1 = SRD.weapons.filter(w => w.tier === 1 && !w.wheelchair);
  const okType = w => spellcaster || w.dmgType === "phy";
  const prim = t1.filter(w => w.cat === "Primary"), sec = t1.filter(w => w.cat === "Secondary");
  const wheel = SRD.weapons.filter(w => w.wheelchair && w.tier === 1);
  const two = P && /two/i.test(P.burden);
  const items = K ? K.items.split(/\s+or\s+/i).map(s => s.trim().replace(/^an? /i, m => m)) : [];
  const WRow = (w, on, pick) => html`<button class=${"prow" + (on ? " on" : "") + (okType(w) ? "" : " off")} disabled=${!okType(w)} onClick=${pick}>
    <b>${w.name}</b><span>${w.trait} · ${w.range} · ${w.dmg} · ${w.burden}</span>${w.feat && html`<${Md} cls="small" text=${w.feat} />`}</button>`;
  return html`<div class="gs">
    <p class="lead">Choose either a two-handed primary weapon, or a one-handed primary and a one-handed secondary weapon, from Tier 1. Then one Tier 1 armor.</p>
    ${!spellcaster && html`<p class="muted small">Magic weapons need a Spellcast trait, which your subclass doesn't give, so they're greyed out.</p>`}
    <h4>Primary weapon</h4><div class="plist short">${prim.map(w => WRow(w, g.primary === w.name, () => set({ primary: w.name, secondary: /two/i.test(w.burden) ? "" : g.secondary })))}</div>
    <details><summary>Combat wheelchair (primary weapon)</summary><div class="plist short">${wheel.map(w => WRow(w, g.primary === w.name, () => set({ primary: w.name, secondary: /two/i.test(w.burden) ? "" : g.secondary })))}</div></details>
    <h4>Secondary weapon ${two ? html`<span class="muted small">(your primary is two-handed)</span>` : html`<span class="muted small">(optional)</span>`}</h4>
    ${!two && html`<div class="plist short"><button class=${"prow" + (!g.secondary ? " on" : "")} onClick=${() => set({ secondary: "" })}><b>None</b></button>${sec.map(w => WRow(w, g.secondary === w.name, () => set({ secondary: w.name })))}</div>`}
    <h4>Armor</h4><div class="plist short">${SRD.armor.filter(a => a.tier === 1).map(a => html`<button class=${"prow" + (g.armor === a.name ? " on" : "")} onClick=${() => set({ armor: a.name })}>
      <b>${a.name}</b><span>Thresholds ${a.major} / ${a.severe} (+1 at level 1) · Score ${a.score}</span>${a.feat && html`<${Md} cls="small" text=${a.feat} />`}</button>`)}</div>
    <h4>Inventory</h4><p>A torch, 50 feet of rope, basic supplies and a handful of gold, plus:</p>
    <div class="seg small">${["Minor Health Potion", "Minor Stamina Potion"].map(n => html`<button aria-pressed=${g.potion === n} onClick=${() => set({ potion: n })}>${n}</button>`)}</div>
    ${items.length > 0 && html`<div class="seg small">${items.map(n => html`<button aria-pressed=${g.classItem === n} onClick=${() => set({ classItem: n })}>${n}</button>`)}</div>`}
  </div>`;
}
function StepBackground({ g, set, K }) {
  return html`<div class="gs"><p class="lead">Answer any of these, change them, or leave your past open to discover in play.</p>
    ${(K ? K.background : []).map(q => html`<div class="qa"><p class="q">${q}</p><${AutoText} label=${q} value=${g.answers[q]} onInput=${v => set(x => ({ answers: Object.assign({}, x.answers, { [q]: v }) }))} /></div>`)}
    ${!K && html`<p class="muted">Choose a class first to see its questions.</p>`}
    <h4>Description</h4><${AutoText} label="Description" value=${g.description} placeholder="Clothes, eyes, body, skin, attitude…" onInput=${v => set({ description: v })} /></div>`;
}
function StepExps({ g, set }) {
  const setE = (i, v) => set(x => { const e = x.exps.slice(); e[i] = v; return { exps: e }; });
  const fill = v => { const i = g.exps.findIndex(x => !x.trim()); if (i >= 0) setE(i, v); else toast("Both Experiences are filled. Clear one to swap."); };
  return html`<div class="gs"><p class="lead">Two Experiences at +2: a word or phrase for a set of skills, a trait or an aptitude. Not too broad ("Lucky"), and no special powers ("Invulnerable").</p>
    <div class="grid4">${g.exps.map((e, i) => html`<${Field} label=${`Experience ${i + 1} (+2)`} value=${e} onInput=${v => setE(i, v)} />`)}</div>
    ${Object.entries(EXAMPLE_EXP).map(([k, v]) => html`<h5>${k}</h5><div class="chips">${v.split(", ").map(x => html`<button class="chip" onClick=${() => fill(x)}>${x}</button>`)}</div>`)}</div>`;
}
function StepCards({ g, set, K }) {
  const toggle = n => set(x => ({ cards: x.cards.includes(n) ? x.cards.filter(y => y !== n) : x.cards.length >= 2 ? [x.cards[1], n] : x.cards.concat(n) }));
  return html`<div class="gs"><p class="lead">Choose two level 1 cards from your class's domains: one from each, or both from one.</p>
    ${!K && html`<p class="muted">Choose a class first.</p>`}
    ${K && K.domains.map(dm => { const D = R.byName("domains", dm); return html`<h4>${dm}</h4>${D && html`<${Md} cls="small muted" text=${D.desc} />`}
      <div class="cards">${R.cardsIn(dm).filter(x => x.lvl === 1).map(x => html`<${DomainCard} name=${x.name} picked=${g.cards.includes(x.name)} onPick=${() => toggle(x.name)} />`)}</div>`; })}</div>`;
}
function StepConnect({ g, set, K }) {
  const anc = g.mixed ? "Mixed ancestry" : g.ancestry;
  return html`<div class="gs"><p class="lead">Describe your character to the table, then suggest at least one connection with each other character. Anyone can turn down a suggestion.</p>
    ${K && html`<ul class="plain">${K.connections.map(q => html`<li>${q}</li>`)}</ul>`}
    <${AutoText} label="Connections" value=${g.connections} placeholder="Connections you've agreed on" onInput=${v => set({ connections: v })} />
    <h4>Summary</h4>
    <p><b>${g.name || "Unnamed"}</b>${g.pronouns ? ` (${g.pronouns})` : ""}: ${[g.cls && `${g.cls} · ${g.sub || "no subclass"}`, anc, g.community].filter(Boolean).join(", ")}.</p>
    <p class="small">${R.TRAITS.map(t => `${t.n} ${g.assign[t.k] != null ? R.sign(g.assign[t.k]) : "?"}`).join(" · ")}</p>
    <p class="small">${[g.primary, g.secondary, g.armor].filter(Boolean).join(" · ")} · ${g.potion}${g.classItem ? " · " + g.classItem : ""}</p>
    <p class="small">Experiences: ${g.exps.filter(Boolean).join(", ") || "—"} · Cards: ${g.cards.join(", ") || "—"}</p>
    <p class="muted small">You start at level 1 with 2 Hope, 6 Stress slots and your class's Hit Points and Evasion.</p></div>`;
}
