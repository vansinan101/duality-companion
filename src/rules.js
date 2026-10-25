/* Duality Companion — rules engine (DH). Pure functions, no UI. Also loads in Node for tests.
   Every rule here follows the Daggerheart SRD 2.0. Where the SRD leaves something to the printed character sheet
   (the advancement slot counts), the app's reading is marked APP READING and listed in rules-info.js. */
(function (root) {
  const S = () => root.SRD;

  const TRAITS = [
    { k: "agi", n: "Agility", v: "Sprint, Leap, Maneuver" },
    { k: "str", n: "Strength", v: "Lift, Smash, Grapple" },
    { k: "fin", n: "Finesse", v: "Control, Hide, Tinker" },
    { k: "ins", n: "Instinct", v: "Perceive, Sense, Navigate" },
    { k: "pre", n: "Presence", v: "Charm, Perform, Deceive" },
    { k: "kno", n: "Knowledge", v: "Recall, Analyze, Comprehend" },
  ];
  const TRAIT_KEY = Object.fromEntries(TRAITS.map(t => [t.n.toLowerCase(), t.k]));
  const TRAIT_NAME = Object.fromEntries(TRAITS.map(t => [t.k, t.n]));
  const START_TRAITS = [2, 1, 1, 0, 0, -1];   // SRD: assign +2, +1, +1, +0, +0, −1
  const MAX = { hope: 6, hp: 12, stress: 12, armor: 12, fear: 12, loadout: 5, consumable: 5, handfuls: 9, bags: 9, chests: 1 };
  const RANGES = ["Melee", "Very Close", "Close", "Far", "Very Far"];
  const tierOf = lvl => (lvl <= 1 ? 1 : lvl <= 4 ? 2 : lvl <= 7 ? 3 : 4);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d = 0) => (v === "" || v == null || isNaN(+v) ? d : +v);
  const sign = n => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "+0");

  // ---- advancements (Leveling Up, step two) ----
  // APP READING: the SRD text says "choose two advancements with at least one unmarked slot from your tier or below",
  // but the number of slots per option is printed on the character sheet, not in the SRD. These counts follow the sheet.
  // "double" options use both of a level's picks.
  const ADV = [
    { k: "traits", n: "+1 to two unmarked traits", slots: 3, from: 2 },
    { k: "hp", n: "+1 Hit Point slot", slots: 2, from: 2 },
    { k: "stress", n: "+1 Stress slot", slots: 2, from: 2 },
    { k: "exp", n: "+1 to two Experiences", slots: 1, from: 2 },
    { k: "card", n: "An extra domain card", slots: 1, from: 2 },
    { k: "evasion", n: "+1 Evasion", slots: 1, from: 2 },
    { k: "subclass", n: "Upgraded subclass card", slots: 1, from: 3 },
    { k: "prof", n: "+1 Proficiency", slots: 1, from: 3, double: true },
    { k: "multi", n: "Multiclass", slots: 1, from: 3, double: true },
  ];
  const ADV_BY = Object.fromEntries(ADV.map(a => [a.k, a]));

  // ---- data lookups ----
  const byName = (list, n) => (S()[list] || []).find(x => x.name === n) || null;
  const cls = c => byName("classes", c.cls);
  const subcls = (name) => byName("subclasses", name);
  const subclassesOf = clsName => (S().subclasses || []).filter(s => s.cls === clsName);
  const cardsIn = dom => (S().cards || []).filter(x => x.dom === dom).sort((a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name));
  const card = n => byName("cards", n);
  const weapon = n => byName("weapons", n);
  const armorItem = n => byName("armor", n);

  // ---- a new character ----
  function blankCharacter() {
    return {
      name: "", pronouns: "", player: "", campaign: "", description: "", notes: "",
      portraitAsset: "", portraitUrl: "", emblem: null,
      level: 1, cls: "", sub: "", ancestry: "", mixed: null, community: "", transformation: "",
      multi: null,                       // { cls, domain, sub }
      traits: { agi: 0, str: 0, fin: 0, ins: 0, pre: 0, kno: 0 },   // starting modifiers (+2, +1, +1, 0, 0, −1)
      experiences: [],                   // [{ id, name, base: 2 }]
      levelups: [],                      // [{ lvl, picks: [{ k, traits?, exps?, card? }], card, exchange? , prev }]
      bonus: { evasion: 0, hp: 0, stress: 0, armor: 0, major: 0, severe: 0, prof: 0, hope: 0 },   // feature/GM adjustments
      traitBonus: { agi: 0, str: 0, fin: 0, ins: 0, pre: 0, kno: 0 },
      marks: { hp: 0, stress: 0, hope: 2, armor: {} },   // armor: { armorId: slots marked }
      scars: 0,
      cards: [],                         // [{ name, where: "loadout" | "vault" }]
      weapons: [],                       // [{ id, name, custom?, slot: "primary" | "secondary" | "pack" }]
      armor: [],                         // [{ id, name, custom?, worn }]
      items: [],                         // [{ id, name, qty, kind: "item" | "consumable", text }]
      gold: { coins: 0, handfuls: 1, bags: 0, chests: 0 },
      conditions: [],
      uses: {},                          // { featureKey: timesUsed }
      tokens: {},                        // { featureKey: count }
      answers: {},                       // background question -> answer
      connections: "",
      restsInARow: 0,
      wither: 0,
      dead: false,
      freeEdit: false,
      log: [],
    };
  }

  // Bring any stored character up to the current shape. Never drop unknown fields.
  function normalize(src) {
    const c = Object.assign(blankCharacter(), src || {});
    const b = blankCharacter();
    c.traits = Object.assign({}, b.traits, c.traits);
    c.traitBonus = Object.assign({}, b.traitBonus, c.traitBonus);
    c.bonus = Object.assign({}, b.bonus, c.bonus);
    c.marks = Object.assign({}, b.marks, c.marks); c.marks.armor = Object.assign({}, c.marks.armor);
    c.gold = Object.assign({}, b.gold, c.gold);
    ["experiences", "levelups", "cards", "weapons", "armor", "items", "conditions", "log"].forEach(k => { if (!Array.isArray(c[k])) c[k] = []; });
    ["uses", "tokens", "answers"].forEach(k => { if (!c[k] || typeof c[k] !== "object") c[k] = {}; });
    c.level = clamp(num(c.level, 1), 1, 10);
    c.experiences = c.experiences.map((e, i) => Object.assign({ id: "e" + i, name: "", base: 2 }, e));
    return c;
  }

  // ---- what level-ups have given ----
  function advCounts(c, beforeLevel = 99) {
    const n = {}; const byTier = { 2: {}, 3: {}, 4: {} };
    (c.levelups || []).filter(l => l.lvl < beforeLevel).forEach(l => (l.picks || []).forEach(p => {
      n[p.k] = (n[p.k] || 0) + 1;
      const t = p.tier || tierOf(l.lvl); byTier[t][p.k] = (byTier[t][p.k] || 0) + 1;
    }));
    return { n, byTier };
  }
  // Traits marked in the current tier (cleared at levels 5 and 8).
  function markedTraits(c) {
    const from = c.level >= 8 ? 8 : c.level >= 5 ? 5 : 0; const out = new Set();
    (c.levelups || []).filter(l => l.lvl >= from).forEach(l => (l.picks || []).forEach(p => p.k === "traits" && (p.traits || []).forEach(x => out.add(x))));
    return out;
  }
  function expBonus(c) {
    const b = {};
    (c.levelups || []).forEach(l => (l.picks || []).forEach(p => p.k === "exp" && (p.exps || []).forEach(id => { b[id] = (b[id] || 0) + 1; })));
    return b;
  }
  function subclassTier(c) {   // 1 foundation, 2 specialization, 3 mastery
    const { n } = advCounts(c); return clamp(1 + (n.subclass || 0), 1, 3);
  }
  function proficiency(c) {
    const ach = (c.level >= 2) + (c.level >= 5) + (c.level >= 8);
    const { n } = advCounts(c);
    return 1 + ach + (n.prof || 0) + num(c.bonus.prof);
  }

  // Numbers written in equipment features: "+1 to Evasion", "−2 to Evasion; −1 to Agility", "+3 to Armor Score".
  function featureMods(text) {
    const out = [];
    const re = /([+−-]\s?\d+) to (?:your )?(Evasion|Armor Score|Agility|Strength|Finesse|Instinct|Presence|Knowledge|all character traits|damage thresholds|Severe damage threshold|Major damage threshold)/gi;
    let m; const t = String(text || "").replace(/\*/g, "");
    while ((m = re.exec(t))) out.push({ v: +m[1].replace("−", "-").replace(/\s/g, ""), to: m[2].toLowerCase() });
    return out;
  }
  // Heritage features that change numbers on the sheet (by feature name, as the SRD prints them).
  const HERITAGE_MODS = {
    "High Stamina": [{ v: 1, to: "stress slots" }], "Endurance": [{ v: 1, to: "hp slots" }], "Nimble": [{ v: 1, to: "evasion" }],
    "Stoneskin": [{ v: 1, to: "armor score" }, { v: 1, to: "damage thresholds" }], "Shell": [{ v: "prof", to: "damage thresholds" }],
  };
  function heritageFeatures(c) {
    if (c.mixed && (c.mixed.a1 || c.mixed.a2)) {
      const a1 = byName("ancestries", c.mixed.a1), a2 = byName("ancestries", c.mixed.a2);
      return [a1 && { a: a1.name, f: a1.features[0] }, a2 && { a: a2.name, f: a2.features[1] }].filter(x => x && x.f);
    }
    const a = byName("ancestries", c.ancestry);
    return a ? a.features.map(f => ({ a: a.name, f })) : [];
  }
  const worn = c => (c.armor || []).find(a => a.worn) || null;
  const armorStats = a => (!a ? null : a.custom ? { name: a.name || "Armor", major: num(a.major), severe: num(a.severe), score: num(a.score), feat: a.feat || "" } : armorItem(a.name));
  const weaponStats = w => (!w ? null : w.custom ? { name: w.name || "Weapon", trait: w.trait || "Strength", range: w.range || "Melee", dmg: w.dmg || "d6 phy", burden: w.burden || "One-Handed", cat: w.slot === "secondary" ? "Secondary" : "Primary", feat: w.feat || "", tier: num(w.tier, 1) } : weapon(w.name));
  const equipped = c => (c.weapons || []).filter(w => w.slot === "primary" || w.slot === "secondary");

  // ---- the derived sheet ----
  function derived(cIn) {
    const c = normalize(cIn);
    const K = cls(c), tier = tierOf(c.level), { n, byTier } = advCounts(c);
    const mods = [];   // { v, to, from }
    const a = worn(c), A = armorStats(a);
    if (A) featureMods(A.feat).forEach(m => mods.push(Object.assign(m, { from: A.name })));
    equipped(c).forEach(w => { const W = weaponStats(w); if (W) featureMods(W.feat).forEach(m => mods.push(Object.assign(m, { from: W.name }))); });
    const profNow = proficiency(c);
    heritageFeatures(c).forEach(h => (HERITAGE_MODS[h.f.n] || []).forEach(m => mods.push({ v: m.v === "prof" ? profNow : m.v, to: m.to, from: `${h.f.n} (${h.a})` })));
    const modSum = to => mods.filter(m => m.to === to).reduce((s, m) => s + m.v, 0);
    // traits
    const traitAdv = {}; TRAITS.forEach(t => (traitAdv[t.k] = 0));
    (c.levelups || []).forEach(l => (l.picks || []).forEach(p => p.k === "traits" && (p.traits || []).forEach(x => (traitAdv[x] = (traitAdv[x] || 0) + 1))));
    const traits = {};
    TRAITS.forEach(t => (traits[t.k] = num(c.traits[t.k]) + traitAdv[t.k] + num(c.traitBonus[t.k]) + modSum(t.n.toLowerCase()) + modSum("all character traits")));
    // slots
    const hpMax = clamp((K ? K.hp : 6) + (n.hp || 0) + num(c.bonus.hp) + modSum("hp slots"), 1, MAX.hp);
    const stressMax = clamp(6 + (n.stress || 0) + num(c.bonus.stress) + modSum("stress slots"), 1, MAX.stress);
    const hopeMax = clamp(MAX.hope - num(c.scars) + num(c.bonus.hope), 0, 8);
    const evasion = (K ? K.evasion : 10) + (n.evasion || 0) + num(c.bonus.evasion) + modSum("evasion");
    const armorScore = clamp((A ? A.score : 0) + num(c.bonus.armor) + modSum("armor score"), 0, MAX.armor);
    const thrB = modSum("damage thresholds");
    const major = (A ? A.major + c.level : c.level) + num(c.bonus.major) + thrB + modSum("major damage threshold");
    const severe = (A ? A.severe + c.level : c.level * 2) + num(c.bonus.severe) + thrB + modSum("severe damage threshold");
    const prof = proficiency(c);
    // experiences
    const eb = expBonus(c);
    const exps = c.experiences.map(e => ({ id: e.id, name: e.name, mod: num(e.base, 2) + (eb[e.id] || 0) }));
    // spellcasting
    const sub = subcls(c.sub), msub = c.multi && c.multi.sub ? subcls(c.multi.sub) : null;
    const spellTraits = [sub && sub.spell, msub && msub.spell].filter(Boolean).map(x => TRAIT_KEY[x.toLowerCase()]).filter(Boolean);
    const domains = K ? K.domains.slice() : [];
    if (c.multi && c.multi.domain && !domains.includes(c.multi.domain)) domains.push(c.multi.domain);
    const loadout = c.cards.filter(x => x.where !== "vault"), vault = c.cards.filter(x => x.where === "vault");
    const cur = {
      hp: clamp(num(c.marks.hp), 0, hpMax), stress: clamp(num(c.marks.stress), 0, stressMax), hope: clamp(num(c.marks.hope), 0, hopeMax),
      armor: a ? clamp(num(c.marks.armor[a.id]), 0, armorScore) : 0,
    };
    return {
      tier, prof, traits, traitAdv, mods, evasion, armorScore, major, severe, hpMax, stressMax, hopeMax, exps, cur,
      cls: K, sub, msub, subTier: subclassTier(c), spellTraits, domains, loadout, vault, armor: a, armorStats: A,
      vulnerable: cur.stress >= stressMax, down: cur.hp >= hpMax, adv: { n, byTier }, marked: markedTraits(c),
      cardCount: c.cards.length, cardsExpected: 2 + (c.level - 1) + (n.card || 0),
    };
  }

  // ---- damage (SRD: Hit Points & Damage Thresholds; Armor: reducing incoming damage) ----
  // Returns how many HP an amount of damage marks, before and after an optional Armor Slot.
  function severity(dmg, major, severe, opts = {}) {
    let d = num(dmg); if (opts.resist) d = Math.ceil(d / 2);
    if (d <= 0) return { hp: 0, label: "None", d };
    let hp = d >= severe ? 3 : d >= major ? 2 : 1;
    if (opts.massive && d >= severe * 2) hp = 4;
    return { hp, label: ["None", "Minor", "Major", "Severe", "Massive"][hp], d };
  }

  // ---- dice ----
  const die = sides => 1 + Math.floor(Math.random() * sides);
  // Duality Dice: two d12s. Matching = critical success (counts as Hope).
  function duality({ mod = 0, adv = 0, hope, fear, advDie, difficulty } = {}) {
    const h = hope != null ? hope : die(12), f = fear != null ? fear : die(12);
    const a = adv ? (advDie != null ? advDie : die(6)) : 0;
    const total = h + f + num(mod) + (adv > 0 ? a : adv < 0 ? -a : 0);
    const crit = h === f;
    const withHope = crit || h > f;
    const success = crit ? true : difficulty == null || difficulty === "" ? null : total >= +difficulty;
    return { h, f, a, adv, mod: num(mod), total, crit, withHope, success };
  }
  // "2d8+3" -> rolled total and parts. Used for damage and downtime rolls.
  function roll(expr) {
    const m = String(expr || "").replace(/\s/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return null;
    const count = +(m[1] || 1), sides = +m[2], add = +(m[3] || 0);
    const dice = Array.from({ length: count }, () => die(sides));
    return { dice, add, total: dice.reduce((s, x) => s + x, 0) + add, max: count * sides + add, expr };
  }
  // A weapon's damage roll with Proficiency: "d8+2 phy" -> "2d8+2"
  function damageExpr(dmg, prof) {
    const m = String(dmg || "").match(/d(\d+)\s*([+−-]\s*\d+)?/);
    if (!m) return dmg || "";
    const add = m[2] ? m[2].replace(/\s/g, "").replace("−", "-") : "";
    return `${prof}d${m[1]}${add ? (add.startsWith("-") ? add : "+" + add.replace("+", "")) : ""}`;
  }

  // ---- uses per rest, tokens: read from a feature's own words ----
  function usage(text) {
    const t = String(text || "").replace(/\*/g, "").toLowerCase();
    const times = /\btwice per\b/.test(t) ? 2 : /\bthree times per\b/.test(t) ? 3 : /\bonce per\b/.test(t) ? 1 : 0;
    const per = /per long rest/.test(t) ? "long" : /per (short )?rest/.test(t) ? "rest" : /per session/.test(t) ? "session" : /per scene/.test(t) ? "scene" : null;
    const tokens = /tokens? on this card|place a number of tokens|place a token/.test(t);
    return { times: per ? times || 1 : 0, per, tokens };
  }

  // ---- rests (SRD: Downtime) ----
  const SHORT_MOVES = [
    { k: "wounds", n: "Tend to Wounds", d: "Clear 1d4 + tier Hit Points for yourself or an ally." },
    { k: "stress", n: "Clear Stress", d: "Clear 1d4 + tier Stress." },
    { k: "armor", n: "Repair Armor", d: "Clear 1d4 + tier Armor Slots from your or an ally's armor." },
    { k: "prepare", n: "Prepare", d: "Gain a Hope (2 Hope each if you prepare with party members)." },
  ];
  const LONG_MOVES = [
    { k: "wounds", n: "Tend to All Wounds", d: "Clear all Hit Points for yourself or an ally." },
    { k: "stress", n: "Clear All Stress", d: "Clear all Stress." },
    { k: "armor", n: "Repair All Armor", d: "Clear all Armor Slots from your or an ally's armor." },
    { k: "prepare", n: "Prepare", d: "Gain a Hope (2 Hope each if you prepare with party members)." },
    { k: "project", n: "Work on a Project", d: "With GM approval, advance a long-term project's countdown." },
  ];
  // Refresh feature uses. Short rest: "per rest" uses. Long rest: "per rest" and "per long rest".
  function refreshUses(c, kind) {
    const keep = {};
    Object.entries(c.uses || {}).forEach(([k, v]) => {
      const per = (k.split("|")[1] || "");
      if (per === "rest" || (kind === "long" && per === "long") || (kind === "session" && per === "session") || (kind !== "none" && per === "scene")) return;
      keep[k] = v;
    });
    c.uses = keep;
  }

  // ---- gold: 10 handfuls = 1 bag, 10 bags = 1 chest; at most 1 chest ----
  function goldTotal(g) { return num(g.coins) + 10 * (num(g.handfuls) + 10 * (num(g.bags) + 10 * num(g.chests))); }   // in coins
  function goldFrom(total, coins) {
    total = Math.max(0, Math.min(total, 1000 + 999)); const out = { coins: 0, handfuls: 0, bags: 0, chests: 0 };
    out.chests = Math.min(1, Math.floor(total / 1000)); total -= out.chests * 1000;
    out.bags = Math.min(9, Math.floor(total / 100)); total -= out.bags * 100;
    out.handfuls = Math.min(9, Math.floor(total / 10)); total -= out.handfuls * 10;
    out.coins = coins ? Math.min(9, total) : 0;
    return out;
  }

  // ---- domain cards available to a character ----
  function availableCards(c, forLevel) {
    const L = forLevel || c.level, K = cls(c); const out = [];
    if (K) K.domains.forEach(d => cardsIn(d).filter(x => x.lvl <= L).forEach(x => out.push(x)));
    if (c.multi && c.multi.domain) cardsIn(c.multi.domain).filter(x => x.lvl <= Math.ceil(L / 2)).forEach(x => out.push(x));
    const have = new Set(c.cards.map(x => x.name));
    return out.filter(x => !have.has(x.name));
  }

  // ---- level up: which advancements can be picked now ----
  function advancementOptions(c, newLevel, picksSoFar = []) {
    const tier = tierOf(newLevel); const { byTier } = advCounts(c);
    const used = t => k => (byTier[t][k] || 0) + picksSoFar.filter(p => p.k === k && p.tier === t).length;
    const multiTaken = (advCounts(c).n.multi || 0) + picksSoFar.filter(p => p.k === "multi").length > 0;
    const out = [];
    for (let t = 2; t <= tier; t++) ADV.filter(a => a.from <= t).forEach(a => {
      const left = a.slots - used(t)(a.k);
      let why = "";
      if (left <= 0) why = "All slots used";
      if (a.k === "multi" && (newLevel < 5 || multiTaken)) why = multiTaken ? "You've already multiclassed" : "From level 5";
      if (a.k === "multi" && used(t)("subclass") > 0) why = "Crossed out: you upgraded your subclass this tier";
      if (a.k === "subclass" && used(t)("multi") > 0) why = "Crossed out: you multiclassed this tier";
      if (a.k === "subclass" && subclassTier(c) + picksSoFar.filter(p => p.k === "subclass").length >= 3) why = "You have the mastery card";
      if (a.double && picksSoFar.length > 0) why = why || "Uses both picks";
      out.push(Object.assign({}, a, { tier: t, left, why }));
    });
    return out;
  }

  // Apply a level-up. picks: [{ k, tier, traits?, exps?, card?, multi? }], card: new domain card name, exchange: { out, in }
  function levelUp(c, { picks = [], card: newCard, extraCard, newExp, exchange, multi } = {}) {
    const prev = JSON.parse(JSON.stringify({ level: c.level, experiences: c.experiences, cards: c.cards, multi: c.multi }));
    c.level = clamp(c.level + 1, 1, 10);
    if ([2, 5, 8].includes(c.level)) c.experiences.push({ id: "e" + Date.now().toString(36), name: newExp || "New Experience", base: 2 });
    if (multi) c.multi = multi;
    const cardsNow = c.cards.slice();
    const add = n => { if (n && !cardsNow.some(x => x.name === n)) cardsNow.push({ name: n, where: cardsNow.filter(x => x.where !== "vault").length < MAX.loadout ? "loadout" : "vault" }); };
    if (exchange && exchange.out && exchange.in) { const i = cardsNow.findIndex(x => x.name === exchange.out); if (i >= 0) cardsNow[i] = { name: exchange.in, where: cardsNow[i].where }; }
    add(newCard); add(extraCard);
    c.cards = cardsNow;
    c.levelups = (c.levelups || []).concat([{ lvl: c.level, picks, card: newCard || null, extraCard: extraCard || null, exchange: exchange || null, prev }]);
    return c;
  }
  function undoLevelUp(c) {
    const last = (c.levelups || []).slice(-1)[0];
    if (!last) return false;
    Object.assign(c, last.prev);
    c.levelups = c.levelups.slice(0, -1);
    return true;
  }

  const api = {
    TRAITS, TRAIT_KEY, TRAIT_NAME, START_TRAITS, MAX, RANGES, ADV, ADV_BY, SHORT_MOVES, LONG_MOVES,
    tierOf, clamp, num, sign, blankCharacter, heritageFeatures, HERITAGE_MODS, normalize, derived, advCounts, markedTraits, subclassTier, proficiency,
    featureMods, severity, duality, roll, die, damageExpr, usage, refreshUses, goldTotal, goldFrom,
    availableCards, advancementOptions, levelUp, undoLevelUp,
    cls, subcls, subclassesOf, cardsIn, card, weapon, armorItem, armorStats, weaponStats, worn, equipped, byName,
  };
  root.DH = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
