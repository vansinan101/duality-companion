// Rules engine checks against SRD examples. Run: node tests/t_rules.js
const fs = require("fs"), path = require("path");
global.SRD = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/srd-data.js"), "utf8").replace(/^[\s\S]*?(?:var|const) SRD = /, "").replace(/;\s*$/, ""));
const DH = require("../src/rules.js");
let fails = 0; const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log("FAIL", m, "got", a, "want", b); } else console.log("ok  ", m); };
const c = DH.blankCharacter(); Object.assign(c, { cls: "Warrior", sub: "Call of the Brave", traits: { agi: 2, str: 1, fin: 0, ins: 1, pre: -1, kno: 0 } });
c.armor = [{ id: "a1", name: "Chainmail Armor", worn: true }];
let d = DH.derived(c);
eq([d.evasion, d.hpMax, d.stressMax, d.hopeMax, d.prof], [10, 6, 6, 6, 1], "Warrior L1 in chainmail: Evasion 11−1 (Heavy), HP 6, Stress 6, Hope 6, Proficiency 1");
eq([d.major, d.severe, d.armorScore], [8, 16, 4], "Chainmail 7/15 + level 1 → 8/16, score 4");
eq(DH.severity(7, 8, 16).hp, 1, "7 damage below Major marks 1 HP");
eq(DH.severity(8, 8, 16).hp, 2, "8 damage at Major marks 2 HP");
eq(DH.severity(16, 8, 16).hp, 3, "16 at Severe marks 3 HP");
eq(DH.severity(32, 8, 16, { massive: true }).hp, 4, "optional Massive Damage at twice Severe marks 4");
eq(DH.severity(20, 8, 16, { resist: true }).hp, 2, "resistance halves before thresholds (20→10: Major)");
eq(DH.damageExpr("d8+2 phy", 2), "2d8+2", "Proficiency 2 with d8+2 rolls 2d8+2 (SRD example)");
eq(DH.damageExpr("d6+1 phy", 1), "1d6+1", "Proficiency 1 with d6+1 rolls 1d6+1 (SRD example)");
const r = DH.duality({ hope: 5, fear: 7, mod: 1 }); eq([r.total, r.withHope, r.crit], [13, false, false], "5 Hope, 7 Fear, +1 → 13 with Fear (SRD example)");
eq(DH.duality({ hope: 9, fear: 9 }).crit, true, "matching dice are a critical success");
const u = DH.duality({ hope: 3, fear: 2, adv: 1, advDie: 4 }); eq(u.total, 9, "advantage adds a d6");
// unarmored: Major = level, Severe = 2 × level
const n = DH.blankCharacter(); n.cls = "Wizard"; n.level = 3; d = DH.derived(n); eq([d.major, d.severe, d.armorScore], [3, 6, 0], "unarmored level 3: 3/6, score 0");
eq(d.prof, 2, "level 3: Proficiency 2 (tier achievement at level 2)");
// level up
const w = DH.normalize(c); w.experiences = [{ id: "x", name: "Soldier", base: 2 }, { id: "y", name: "Bodyguard", base: 2 }];
DH.levelUp(w, { picks: [{ k: "hp", tier: 2 }, { k: "traits", tier: 2, traits: ["agi", "str"] }], card: "A Soldier’s Bond", newExp: "Tracker" });
d = DH.derived(w);
eq([w.level, d.hpMax, d.traits.agi, d.traits.str, d.prof, w.experiences.length], [2, 7, 3, 2, 2, 3], "level 2: +1 HP, +1 Agility & Strength, Proficiency 2, a third Experience");
eq([d.major, d.severe], [9, 17], "level 2 thresholds rise by 1");
eq([...DH.markedTraits(w)], ["agi", "str"], "the raised traits are marked");
const opts = DH.advancementOptions(w, 3); eq(opts.find(o => o.k === "traits").left, 2, "trait advancement has 2 slots left in tier 2");
eq(opts.some(o => o.k === "multi"), false, "multiclass isn't offered in tier 2");
DH.undoLevelUp(w); eq([w.level, DH.derived(w).hpMax, w.experiences.length], [1, 6, 2], "undo restores level 1");
// heritage numbers
const hu = DH.blankCharacter(); hu.cls = "Guardian"; hu.ancestry = "Human"; d = DH.derived(hu); eq([d.stressMax, d.hpMax], [7, 7], "Human High Stamina: +1 Stress slot (Guardian HP 7)");
const ga = DH.blankCharacter(); ga.cls = "Wizard"; ga.ancestry = "Galapa"; ga.level = 2; d = DH.derived(ga); eq([d.major, d.severe], [4, 6], "Galapa Shell adds Proficiency (2) to unarmored thresholds 2/4");
const mx = DH.blankCharacter(); mx.cls = "Rogue"; mx.mixed = { a1: "Giant", a2: "Simiah" }; d = DH.derived(mx); eq([d.hpMax, d.evasion], [7, 13], "Mixed Giant (first: Endurance) + Simiah (second: Nimble)");
// gold
eq(DH.goldFrom(DH.goldTotal({ handfuls: 9, bags: 0, chests: 0 }) + 10), { coins: 0, handfuls: 0, bags: 1, chests: 0 }, "9 handfuls + 1 → 1 bag (SRD example)");
// usage parsing
eq(DH.usage("Once per long rest, when you compliment someone").per, "long", "once per long rest");
eq(DH.usage("You can do this three times per rest").times, 3, "three times per rest");
// card counts
eq(DH.cardsIn("Blade").filter(x => x.lvl === 1).length, 3, "Blade has three level 1 cards");
eq(SRD.classes.length, 13, "13 classes"); eq(SRD.cards.length, 210, "210 domain cards");
// rulebooks: Core only hides Hope & Fear content
DH.setBooks({ hf: false }); eq([DH.list("classes").length, DH.subclassesOf("Witch").length, DH.cardsIn("Dread").length], [9, 0, 0], "Core only: 9 classes, no Witch subclasses, no Dread cards");
DH.setBooks({ hf: true }); eq([DH.list("classes").length, DH.cardsIn("Dread").length], [13, 21], "With Hope & Fear: 13 classes and the Dread domain");
// renamed gear: the player's name wins, the item's stays for its type; older saves without a label still work
const gn = DH.normalize({ weapons: [{ id: "w", name: "Broadsword", slot: "primary", label: "Oathkeeper" }, { id: "v", name: "Dagger", slot: "pack", label: 7 }] });
eq([DH.gearName(gn.weapons[0], DH.weaponStats(gn.weapons[0])), DH.weaponStats(gn.weapons[0]).name, gn.weapons[1].label], ["Oathkeeper", "Broadsword", "7"], "renamed weapon keeps its type");
eq(DH.gearName({ id: "a", name: "Leather Armor", label: "  " }, DH.armorStats({ name: "Leather Armor" })), "Leather Armor", "blank label falls back to the item name");
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
