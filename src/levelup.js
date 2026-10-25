/* ================= level up ================= */
// SRD Leveling Up: (1) tier achievements, (2) two advancements, (3) thresholds +1, (4) a new domain card.
function LevelUp({ c, d, update, onClose }) {
  const L = c.level + 1, T = R.tierOf(L);
  const [picks, setPicks] = useState([]);       // [{ k, tier, traits?, exps?, card?, multi? }]
  const [exp, setExp] = useState("");
  const [newCard, setNewCard] = useState("");
  const [exchange, setExchange] = useState(null);   // { out, in }
  const [cardPick, setCardPick] = useState(null);   // "new" | "extra" | "exchange"
  const [editing, setEditing] = useState(null);     // index of the pick being set up
  const ach = [2, 5, 8].includes(L);
  const temp = Object.assign(clean(c), { level: L });
  const marked = R.markedTraits(temp);              // traits still marked after this level's tier achievement
  const used = picks.reduce((s, p) => s + (R.ADV_BY[p.k].double ? 2 : 1), 0);
  const opts = R.advancementOptions(c, L, picks);
  const add = o => {
    if (used + (o.double ? 2 : 1) > 2) { toast(o.double ? "This advancement uses both of this level's picks." : "You've chosen two advancements."); return; }
    const p = { k: o.k, tier: o.tier };
    if (o.k === "traits") p.traits = [];
    if (o.k === "exp") p.exps = [];
    if (o.k === "multi") p.multi = { cls: "", domain: "", sub: "" };
    setPicks(picks.concat(p)); if (["traits", "exp", "card", "multi"].includes(o.k)) setEditing(picks.length);
  };
  const setPick = (i, fn) => setPicks(picks.map((p, j) => (j === i ? fn(clean(p)) : p)));
  const pickedTraits = new Set(picks.flatMap(p => p.traits || []));
  const ready = used === 2 && newCard && picks.every(p =>
    (p.k !== "traits" || p.traits.length === 2) && (p.k !== "exp" || p.exps.length === 2) && (p.k !== "card" || p.card)
    && (p.k !== "multi" || (p.multi.cls && p.multi.domain && p.multi.sub))) && (!ach || exp.trim());
  const multiPick = picks.find(p => p.k === "multi");
  const cardsFor = which => {   // a character as it will be, so the picker offers the right cards
    const t = Object.assign(clean(c), { level: L, multi: multiPick ? multiPick.multi : c.multi });
    t.cards = t.cards.concat([newCard, ...picks.map(p => p.card)].filter(Boolean).map(n => ({ name: n })));
    return t;
  };
  const finish = () => {
    update(x => {
      R.levelUp(x, { picks, card: newCard, extraCard: (picks.find(p => p.k === "card") || {}).card, newExp: exp.trim(), exchange, multi: multiPick ? multiPick.multi : null });
      addLog(x, `Level ${L}: ${picks.map(p => R.ADV_BY[p.k].n + (p.traits ? ` (${p.traits.map(t => R.TRAIT_NAME[t]).join(", ")})` : "") + (p.card ? ` (${p.card})` : "")).join("; ")}; new card ${newCard}`);
    });
    toast(`Level ${L}! Thresholds rose by 1.`);
    onClose();
  };
  const K = d.cls;
  return html`<${Modal} title=${`Level up to ${L}`} onClose=${onClose} wide foot=${html`<span class="muted small">${used}/2 advancements · ${newCard ? "card chosen" : "no card yet"}</span><button class="btn primary" disabled=${!ready} onClick=${finish}>Level up</button>`}>
    <ol class="lvsteps">
      <li><b>Tier achievements</b>${ach ? html`
        <p>At level ${L} you gain a new Experience at +2 and your Proficiency rises by 1${L > 2 ? ", and marked traits are cleared" : ""}.</p>
        <${Field} label="New Experience" value=${exp} placeholder="e.g. Tracker" onInput=${setExp} />` : html`<p class="muted">None at level ${L}.</p>`}</li>
      <li><b>Choose two advancements</b> <span class="muted small">(from tier ${T} or below, while slots remain)</span>
        <div class="advs">${opts.map(o => html`<button class=${"adv" + (o.why ? " off" : "")} disabled=${!!o.why} onClick=${() => add(o)}
          onMouseEnter=${e => tip.show(e.currentTarget, { title: o.n, lines: [`Tier ${o.tier}: ${o.left} of ${o.slots} slot${o.slots > 1 ? "s" : ""} left`, o.double ? "Uses both picks" : "", o.why].filter(Boolean) })} onMouseLeave=${() => tip.hide()}>
          <b>${o.n}</b><span>T${o.tier} · ${"▢".repeat(Math.max(0, o.left))}${"▣".repeat(o.slots - Math.max(0, o.left))}</span></button>`)}</div>
        <div class="picked">${picks.map((p, i) => html`<div class="pk">
          <b>${R.ADV_BY[p.k].n}</b> <span class="muted small">tier ${p.tier}</span>
          <button class="iconbtn" aria-label="Remove" onClick=${() => { setPicks(picks.filter((_, j) => j !== i)); setEditing(null); }}>×</button>
          ${p.k === "traits" && html`<div class="chips">${R.TRAITS.map(t => { const on = p.traits.includes(t.k), off = !on && (marked.has(t.k) || pickedTraits.has(t.k) || p.traits.length >= 2);
            return html`<button class=${"chip" + (on ? " on" : "")} disabled=${off} title=${marked.has(t.k) ? "Marked this tier" : ""} onClick=${() => setPick(i, x => { x.traits = on ? x.traits.filter(y => y !== t.k) : x.traits.concat(t.k); return x; })}>${t.n} ${R.sign(d.traits[t.k])}${on ? " → " + R.sign(d.traits[t.k] + 1) : ""}</button>`; })}</div>`}
          ${p.k === "exp" && html`<div class="chips">${d.exps.map(e => { const on = p.exps.includes(e.id); return html`<button class=${"chip" + (on ? " on" : "")} disabled=${!on && p.exps.length >= 2} onClick=${() => setPick(i, x => { x.exps = on ? x.exps.filter(y => y !== e.id) : x.exps.concat(e.id); return x; })}>${e.name || "Experience"} ${R.sign(e.mod)}</button>`; })}</div>`}
          ${p.k === "card" && html`<div>${p.card ? html`<span class="chip on">${p.card}</span>` : ""} <button class="btn small" onClick=${() => { setEditing(i); setCardPick("extra"); }}>${p.card ? "Change" : "Choose a card"}</button></div>`}
          ${p.k === "subclass" && d.sub && html`<p class="small">You take the ${d.subTier === 1 ? "Specialization" : "Mastery"} card of ${d.sub.name}.</p>`}
          ${p.k === "hp" && html`<p class="small">Hit Point slots ${d.hpMax} → ${Math.min(12, d.hpMax + 1)}</p>`}
          ${p.k === "stress" && html`<p class="small">Stress slots ${d.stressMax} → ${Math.min(12, d.stressMax + 1)}</p>`}
          ${p.k === "evasion" && html`<p class="small">Evasion ${d.evasion} → ${d.evasion + 1}</p>`}
          ${p.k === "prof" && html`<p class="small">Proficiency rises by 1 (on top of any tier achievement).</p>`}
          ${p.k === "multi" && html`<div class="grid4">
            <${Select} label="Class" value=${p.multi.cls} empty="—" options=${R.list("classes").filter(k => k.name !== c.cls).map(k => k.name)} onChange=${v => setPick(i, x => { x.multi = { cls: v, domain: "", sub: "" }; return x; })} />
            <${Select} label="Domain" value=${p.multi.domain} empty="—" options=${(R.byName("classes", p.multi.cls) || { domains: [] }).domains} onChange=${v => setPick(i, x => { x.multi.domain = v; return x; })} />
            <${Select} label="Subclass (foundation)" value=${p.multi.sub} empty="—" options=${R.subclassesOf(p.multi.cls).map(s => s.name)} onChange=${v => setPick(i, x => { x.multi.sub = v; return x; })} /></div>
            <p class="muted small">You gain that class's features and the foundation card. Later cards from its domain can be at most half your level.</p>`}
        </div>`)}</div></li>
      <li><b>Damage thresholds</b> <span class="muted">rise by 1: Major ${d.major} → ${d.major + 1}, Severe ${d.severe} → ${d.severe + 1}.</span></li>
      <li><b>A new domain card</b> at level ${L} or lower from ${K ? K.domains.join(" or ") : "your class's domains"}.
        <div>${newCard ? html`<span class="chip on">${newCard}</span>` : ""} <button class="btn small" onClick=${() => setCardPick("new")}>${newCard ? "Change" : "Choose a card"}</button></div>
        <details><summary>Exchange a card you already have (optional)</summary>
          <p class="muted small">Swap one acquired card for a different card of the same level or lower.</p>
          <div class="chips">${c.cards.map(x => html`<button class=${"chip" + (exchange && exchange.out === x.name ? " on" : "")} onClick=${() => { setExchange({ out: x.name, in: "" }); setCardPick("exchange"); }}>${x.name}</button>`)}</div>
          ${exchange && exchange.in && html`<p>${exchange.out} → <b>${exchange.in}</b> <button class="linkbtn" onClick=${() => setExchange(null)}>Undo</button></p>`}
        </details></li>
    </ol>
    ${cardPick && html`<${CardPicker} c=${cardsFor(cardPick)} forLevel=${L} title=${cardPick === "exchange" ? `Exchange ${exchange.out} for…` : "Choose a domain card"}
      maxLevel=${cardPick === "exchange" ? (R.card(exchange.out) || { lvl: L }).lvl : null}
      onClose=${() => { if (cardPick === "exchange" && !exchange.in) setExchange(null); setCardPick(null); }}
      onPick=${n => { if (cardPick === "new") setNewCard(n); else if (cardPick === "extra") setPick(editing, x => { x.card = n; return x; }); else setExchange({ out: exchange.out, in: n }); setCardPick(null); }} />`}
  </${Modal}>`;
}
