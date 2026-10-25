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
  const okStep = i => !!([
    g.name.trim(), g.cls && g.sub, (g.ancestry || (g.mixed && g.mixed.a1 && g.mixed.a2)) && g.community, Object.keys(g.assign).length === 6,
    g.primary && g.armor, true, g.exps.filter(x => x.trim()).length >= 2, g.cards.length === 2, true][i]);
  const firstGap = G_STEPS.findIndex((_, i) => !okStep(i));
  const go = i => { set({ step: i }); const b = document.querySelector(".g-body"); if (b) b.scrollTop = 0; };
  useEffect(() => {
    const k = e => { if (e.target.closest && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" && g.step < 8) go(g.step + 1); if (e.key === "ArrowLeft" && g.step > 0) go(g.step - 1); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [g.step]);
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
  const last = g.step === 8;
  return html`<div class="genesis" role="dialog" aria-label="Character creation">
    <div class="g-top"><b>Character creation</b><span class="muted small">Step ${g.step + 1} of 9</span>
      <button class="linkbtn small" onClick=${() => { if (confirm("Abandon this character and start over?")) { lsSet("dh-genesis", null); setG(blankDraft()); } }}>Start over</button>
      <button class="iconbtn" aria-label="Close" onClick=${onClose}>×</button></div>
    <ol class="g-rail">${G_STEPS.map((n, i) => html`<li class=${okStep(i) ? "done" : ""}><button class=${(i === g.step ? "on " : "") + (okStep(i) ? "ok" : "")} onClick=${() => go(i)} aria-label=${`Step ${i + 1}: ${n}`}>
      <span class="gem"><span>${okStep(i) && i !== g.step ? "✓" : i + 1}</span></span><span class="lbl">${n}</span></button></li>`)}</ol>
    <div class="g-body"><${Step} g=${g} set=${set} K=${K} sub=${sub} spellcaster=${spellcaster} pool=${pool} tapVal=${tapVal} setTapVal=${setTapVal} P=${P} /></div>
    <button class="g-arrow prev" disabled=${g.step === 0} onClick=${() => go(g.step - 1)} aria-label="Previous step"><span class="orb">❮</span><span class="al">${g.step > 0 ? G_STEPS[g.step - 1] : "Back"}</span></button>
    ${last ? html`<button class="g-arrow next finish" disabled=${firstGap >= 0} title=${firstGap >= 0 ? `Finish step ${firstGap + 1}: ${G_STEPS[firstGap]}` : ""} onClick=${finish} aria-label="Begin the adventure"><span class="orb">✦</span><span class="al">${firstGap >= 0 ? `Finish ${G_STEPS[firstGap]}` : "Begin the adventure"}</span></button>`
      : html`<button class="g-arrow next" onClick=${() => go(g.step + 1)} aria-label="Next step"><span class="orb">❯</span><span class="al">${G_STEPS[g.step + 1]}</span></button>`}
  </div>`;
}
const GTitle = ({ t, lead }) => html`<h2 class="gs-title">${t}</h2>${lead && html`<p class="lead">${lead}</p>`}`;
function StepName({ g, set }) {
  const fileRef = useRef();
  return html`<div class="gs">
    <${GTitle} t="Who are you?" lead="A name and a face to begin with. Pronouns and description can be filled in at any point." />
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
    <${GTitle} t="Choose your class" lead="Your class gives you two domains, your starting Evasion and Hit Points, and the abilities that define you. Each class has two subclasses." />
    <div class="picks">${R.list("classes").map(k => html`<button class=${"pickcard" + (g.cls === k.name ? " on" : "")} onClick=${() => set({ cls: k.name, sub: g.cls === k.name ? g.sub : "", cards: g.cls === k.name ? g.cards : [], classItem: "" })}>
      <b><${Icon} n=${clsIcon(k.name)} />${k.name}</b><span class="small">${k.domains.join(" & ")} · Evasion ${k.evasion} · HP ${k.hp}</span><span class="small muted">${k.hope.n}</span></button>`)}</div>
    ${K && html`<div class="detail"><h3>${K.name}</h3><${Md} text=${K.desc} /></div>
      <div class="feats"><${FeatureCard} ...${NOOP} src=${K.name} f=${K.hope} kind=${`${K.name} · Hope feature`} icon="hope" tone="hopef" />
        ${K.features.map(f => html`<${FeatureCard} ...${NOOP} src=${K.name} f=${f} kind=${`${K.name} feature`} icon=${clsIcon(K.name)} />`)}</div>
      <h4>Choose a subclass</h4>
      <div class="picks two">${R.subclassesOf(K.name).map(s => html`<button class=${"pickcard" + (g.sub === s.name ? " on" : "")} onClick=${() => set({ sub: s.name })}>
        <b><${Icon} n="foundation" />${s.name}</b><span class="small">${s.spell ? `Spellcast trait: ${s.spell}` : "No Spellcast trait"}</span><span class="small muted">${s.desc}</span></button>`)}</div>
      ${sub && html`<div class="feats">${sub.foundation.map(f => html`<${FeatureCard} ...${NOOP} src=${sub.name} f=${f} kind=${`${sub.name} · Foundation`} icon="foundation" tone="found" />`)}</div>`}`}</div>`;
}
function StepHeritage({ g, set }) {
  const [mixed, setMixed] = useState(!!g.mixed);
  const anc = R.list("ancestries").filter(a => a.features.length);
  const A = R.byName("ancestries", g.ancestry), C = R.byName("communities", g.community);
  return html`<div class="gs">
    <${GTitle} t="Your heritage" lead="Your ancestry is your lineage and gives two features. Your community is where you were raised and gives one." />
    <div class="row center"><div class="seg"><button aria-pressed=${!mixed} onClick=${() => { setMixed(false); set({ mixed: null }); }}>One ancestry</button><button aria-pressed=${mixed} onClick=${() => { setMixed(true); set({ mixed: { a1: g.ancestry || "", a2: "" }, ancestry: "" }); }}>Mixed ancestry</button></div></div>
    ${!mixed ? html`<div class="picks">${anc.map(a => html`<button class=${"pickcard" + (g.ancestry === a.name ? " on" : "")} onClick=${() => set({ ancestry: a.name })}><b><${Icon} n="ancestry" />${a.name}</b><span class="small muted">${a.features.map(f => f.n).join(" · ")}</span></button>`)}</div>
      ${A && html`<div class="detail"><${Md} text=${A.desc.split("\n")[0]} /></div><div class="feats">${A.features.map(f => html`<${FeatureCard} ...${NOOP} src=${A.name} f=${f} kind=${`${A.name} · Ancestry`} icon="ancestry" tone="heritage" />`)}</div>`}`
    : html`<p class="lead">Take the first-listed feature from one ancestry and the second-listed feature from another.</p>
      <div class="grid4"><${Select} label="First feature from" value=${(g.mixed || {}).a1} empty="—" options=${anc.map(a => [a.name, `${a.name}: ${a.features[0].n}`])} onChange=${v => set({ mixed: Object.assign({}, g.mixed, { a1: v }) })} />
        <${Select} label="Second feature from" value=${(g.mixed || {}).a2} empty="—" options=${anc.filter(a => a.name !== (g.mixed || {}).a1).map(a => [a.name, `${a.name}: ${a.features[1].n}`])} onChange=${v => set({ mixed: Object.assign({}, g.mixed, { a2: v }) })} /></div>
      <div class="feats">${g.mixed && [g.mixed.a1 && [g.mixed.a1, R.byName("ancestries", g.mixed.a1).features[0]], g.mixed.a2 && [g.mixed.a2, R.byName("ancestries", g.mixed.a2).features[1]]].filter(Boolean).map(([a, f]) => html`<${FeatureCard} ...${NOOP} src=${a} f=${f} kind=${`${a} · Ancestry`} icon="ancestry" tone="heritage" />`)}</div>`}
    <h4>Community</h4>
    <div class="picks">${R.list("communities").map(a => html`<button class=${"pickcard" + (g.community === a.name ? " on" : "")} onClick=${() => set({ community: a.name })}><b><${Icon} n="community" />${a.name}</b><span class="small muted">${a.features[0].n}</span></button>`)}</div>
    ${C && html`<div class="feats">${C.features.map(f => html`<${FeatureCard} ...${NOOP} src=${C.name} f=${f} kind=${`${C.name} · Community`} icon="community" tone="community" />`)}</div>${C.adjectives && html`<p class="lead"><i>${C.adjectives}</i></p>`}`}
  </div>`;
}
// Fate: the six modifiers as gems. Tap a gem, then a shield (or a shield, then a gem). Tap a filled shield to take its value back.
function StepTraits({ g, set, pool, tapVal, setTapVal, sub }) {
  const [armedTrait, setArmedTrait] = useState(null);
  const place = (k, v) => { const a = Object.assign({}, g.assign); a[k] = v; set({ assign: a }); setTapVal(null); setArmedTrait(null); };
  const onShield = k => {
    if (g.assign[k] != null && tapVal == null) { const a = Object.assign({}, g.assign); delete a[k]; set({ assign: a }); return; }
    if (tapVal == null) { setArmedTrait(armedTrait === k ? null : k); return; }
    if (g.assign[k] != null) { toast("Take that shield's value back first."); return; }
    place(k, tapVal);
  };
  const onGem = v => { if (armedTrait && g.assign[armedTrait] == null) place(armedTrait, v); else setTapVal(tapVal === v ? null : v); };
  const vals = [...pool].sort((a, b) => b - a);
  const cls = v => (v >= 2 ? "" : v === 1 ? " v1" : v === 0 ? " v0" : " vn");
  return html`<div class="gs">
    <${GTitle} t="Fate: your six traits" lead="Set +2, +1, +1, +0, +0 and −1 into your traits. Choose a gem, then the trait it belongs to. Choose a filled trait to take its gem back." />
    ${sub && sub.spell && html`<p class="lead">Your Spellcast trait is <b>${sub.spell}</b>: your spells and Spellcast Rolls use it.</p>`}
    <div class="vals">${vals.map(v => html`<button class=${"val" + cls(v) + (tapVal === v ? " on" : "")} onClick=${() => onGem(v)} aria-label=${`Gem ${R.sign(v)}`}>${R.sign(v)}</button>`)}${!vals.length && html`<span class="none">Every gem is set. Your fate is written.</span>`}</div>
    <div class="traits">${R.TRAITS.map(t => html`<${TraitShield} t=${t} value=${g.assign[t.k]} pick armed=${armedTrait === t.k || (tapVal != null && g.assign[t.k] == null)}
      spell=${sub && sub.spell && R.TRAIT_KEY[sub.spell.toLowerCase()] === t.k} onClick=${() => onShield(t.k)} />`)}</div>
    <div class="row center" style="margin-top:16px"><button class="btn small" onClick=${() => { set({ assign: {} }); setTapVal(null); setArmedTrait(null); }}>Clear all</button></div>
  </div>`;
}
function StepEquip({ g, set, K, spellcaster, P }) {
  const t1 = R.list("weapons").filter(w => w.tier === 1);
  const okType = w => spellcaster || w.dmgType === "phy";
  const [wheel, setWheel] = useState(!!(P && P.wheelchair));
  const prim = t1.filter(w => w.cat === "Primary" && !!w.wheelchair === wheel), sec = t1.filter(w => w.cat === "Secondary" && !w.wheelchair);
  const two = P && /two/i.test(P.burden);
  const items = K ? K.items.split(/\s+or\s+/i).map(s => s.trim()) : [];
  const pickW = (w, slot) => () => set(slot === "primary" ? { primary: w.name, secondary: /two/i.test(w.burden) ? "" : g.secondary } : { secondary: g.secondary === w.name ? "" : w.name });
  const idx = (list, name) => list.findIndex(x => x.name === name);
  return html`<div class="gs">
    <${GTitle} t="Arm yourself" lead="A two-handed primary weapon, or a one-handed primary with a one-handed secondary, from Tier 1. Then one set of Tier 1 armor." />
    ${!spellcaster && html`<p class="lead small">Magic weapons need a Spellcast trait, which your subclass doesn't give, so they're dimmed.</p>`}
    <${Catalog} title="Primary weapon" icon="weapon" items=${prim} resetKey=${wheel} startAt=${idx(prim, g.primary)}
      tools=${html`<div class="seg small"><button aria-pressed=${!wheel} onClick=${() => setWheel(false)}>Weapons</button><button aria-pressed=${wheel} onClick=${() => setWheel(true)}>Combat wheelchair</button></div>`}
      render=${w => html`<${ItemCard} x=${w} kind="weapon" on=${g.primary === w.name} disabled=${!okType(w)} why=${okType(w) ? "" : "Needs a Spellcast trait"} onPick=${pickW(w, "primary")} />`} />
    ${two ? html`<p class="lead small">Your primary weapon is two-handed, so there's no hand free for a secondary weapon.</p>`
      : html`<${Catalog} title="Secondary weapon (optional)" icon="valor" items=${sec} startAt=${idx(sec, g.secondary)}
        render=${w => html`<${ItemCard} x=${w} kind="weapon" on=${g.secondary === w.name} disabled=${!okType(w)} why=${okType(w) ? "" : "Needs a Spellcast trait"} onPick=${pickW(w, "secondary")} />`} />`}
    <${Catalog} title="Armor" icon="helm" items=${R.list("armor").filter(a => a.tier === 1)} startAt=${idx(R.list("armor").filter(a => a.tier === 1), g.armor)}
      render=${a => html`<${ItemCard} x=${a} kind="armor" on=${g.armor === a.name} onPick=${() => set({ armor: a.name })} />`} />
    <h4>Your pack</h4><p class="lead" style="text-align:left;margin:0 0 8px">A torch, 50 feet of rope, basic supplies and a handful of gold, plus:</p>
    <div class="row"><div class="seg">${["Minor Health Potion", "Minor Stamina Potion"].map(n => html`<button aria-pressed=${g.potion === n} onClick=${() => set({ potion: n })}>${n}</button>`)}</div></div>
    ${items.length > 0 && html`<div class="row"><div class="seg">${items.map(n => html`<button aria-pressed=${g.classItem === n} onClick=${() => set({ classItem: n })}>${n}</button>`)}</div></div>`}
  </div>`;
}
function StepBackground({ g, set, K }) {
  return html`<div class="gs"><${GTitle} t="Your story so far" lead="Answer any of these, change them, or leave your past open to discover in play." />
    ${(K ? K.background : []).map(q => html`<div class="qa"><p class="q">${q}</p><${AutoText} label=${q} value=${g.answers[q]} onInput=${v => set(x => ({ answers: Object.assign({}, x.answers, { [q]: v }) }))} /></div>`)}
    ${!K && html`<p class="lead">Choose a class first to see its questions.</p>`}
    <h4>Description</h4><${AutoText} label="Description" value=${g.description} placeholder="Clothes, eyes, body, skin, attitude…" onInput=${v => set({ description: v })} /></div>`;
}
function StepExps({ g, set }) {
  const setE = (i, v) => set(x => { const e = x.exps.slice(); e[i] = v; return { exps: e }; });
  const fill = v => { const i = g.exps.findIndex(x => !x.trim()); if (i >= 0) setE(i, v); else toast("Both Experiences are filled. Clear one to swap."); };
  return html`<div class="gs"><${GTitle} t="Experiences" lead="Two Experiences at +2: a word or phrase for a set of skills, a trait or an aptitude. Not too broad (Lucky), and no special powers (Invulnerable)." />
    <div class="exps">${g.exps.map((e, i) => html`<div class="exp"><input value=${e} placeholder=${`Experience ${i + 1}`} aria-label=${`Experience ${i + 1}`} onInput=${ev => setE(i, ev.target.value)} /><span class="seal">+2</span></div>`)}</div>
    ${Object.entries(EXAMPLE_EXP).map(([k, v]) => html`<h5>${k}</h5><div class="chips">${v.split(", ").map(x => html`<button class="chip" onClick=${() => fill(x)}>${x}</button>`)}</div>`)}</div>`;
}
function StepCards({ g, set, K }) {
  const toggle = n => set(x => ({ cards: x.cards.includes(n) ? x.cards.filter(y => y !== n) : x.cards.length >= 2 ? [x.cards[1], n] : x.cards.concat(n) }));
  return html`<div class="gs"><${GTitle} t="Domain cards" lead=${`Choose two level 1 cards from your class's domains: one from each, or both from one. ${g.cards.length}/2 chosen.`} />
    ${!K && html`<p class="lead">Choose a class first.</p>`}
    ${K && K.domains.map(dm => { const D = R.byName("domains", dm); const [col, ic] = domLook(dm); return html`<h2 class="h" style=${`color:${col}`}><span class="hmedal" style=${`color:${col}`}><${Icon} n=${ic} /></span><span>${dm}</span><i class="rule"></i></h2>
      ${D && html`<${Md} cls="small muted" text=${D.desc} />`}
      <div class="cards">${R.cardsIn(dm).filter(x => x.lvl === 1).map(x => html`<${DomainCard} name=${x.name} picked=${g.cards.includes(x.name)} onPick=${() => toggle(x.name)} />`)}</div>`; })}</div>`;
}
function StepConnect({ g, set, K }) {
  const anc = g.mixed ? "Mixed ancestry" : g.ancestry;
  return html`<div class="gs"><${GTitle} t="Connections" lead="Describe your character to the table, then suggest at least one connection with each other character. Anyone can turn a suggestion down." />
    ${K && html`<ul class="plain">${K.connections.map(q => html`<li>${q}</li>`)}</ul>`}
    <${AutoText} label="Connections" value=${g.connections} placeholder="Connections you've agreed on" onInput=${v => set({ connections: v })} />
    <div class="detail" style="margin-top:20px"><h3>${g.name || "Unnamed"}${g.pronouns ? ` (${g.pronouns})` : ""}</h3>
      <p>${[g.cls && `${g.cls} · ${g.sub || "no subclass"}`, anc, g.community].filter(Boolean).join(" · ")}</p>
      <p class="small">${R.TRAITS.map(t => `${t.n} ${g.assign[t.k] != null ? R.sign(g.assign[t.k]) : "?"}`).join(" · ")}</p>
      <p class="small">${[g.primary, g.secondary, g.armor].filter(Boolean).join(" · ")} · ${g.potion}${g.classItem ? " · " + g.classItem : ""}</p>
      <p class="small">Experiences: ${g.exps.filter(Boolean).join(", ") || "—"} · Cards: ${g.cards.join(", ") || "—"}</p>
      <p class="small muted">You begin at level 1 with 2 Hope, 6 Stress slots, and your class's Hit Points and Evasion.</p></div></div>`;
}
const NOOP = { c: { uses: {}, tokens: {} }, update: () => {} };
