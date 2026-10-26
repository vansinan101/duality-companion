/* Rules shown in the side panel when a section heading is clicked (the Head component).
   Each topic: { title, sub, icon, flavor, parts, src }. Parts render as a visual breakdown (RuleTopic in app.js):
     "markdown"                         a paragraph (rule words become icon tokens)
     { h, i }                           a section heading with an icon medal
     { items: [[icon, label, md, hf?]] } tiles, for a few parallel things worth comparing at a glance (hf: Hope & Fear only)
     { items: [[icon, label, md, hf?]] } a light icon list, for everything else: use tiles sparingly so they keep their weight
     { eq: [[kind, value, caption] | "op"] }  an equation of chips, e.g. d8+2 × 2 = 2d8+2
     { scale: [[label, sub, result]] }  a tiered bar, left to right, mildest first
     { gems: ["+2", …] }                small value gems
     { steps: [md, …] }                 numbered steps
     { ex }                             a worked example
     { note }                           the app's own reading where the SRD is silent
   Flavour lines are the app's own words; rules text follows the SRD 2.0. */
const RULES_INFO = {
  traits: { title: "Traits", sub: "The six measures of your hero", icon: "dice", src: "Character Creation, step 3; Core Mechanics: Action Rolls; Leveling Up",
    flavor: "Six measures of what your hero can do, and how the dice lean when they try.", parts: [
    { items: [["agi", "Agility", "Sprint, Leap, Maneuver"], ["str", "Strength", "Lift, Smash, Grapple"], ["fin", "Finesse", "Control, Hide, Tinker"],
      ["ins", "Instinct", "Perceive, Sense, Navigate"], ["pre", "Presence", "Charm, Perform, Deceive"], ["kno", "Knowledge", "Recall, Analyze, Comprehend"]] },
    { h: "Rolling with a trait", i: "dice" },
    { eq: [["hope", "d12", "Hope Die"], "+", ["fear", "d12", "Fear Die"], "+", ["trait", "+2", "your trait"], "=", ["total", "Total", "vs the Difficulty"]] },
    "Whichever die rolls higher sets the tone: **with Hope**, you gain a Hope; **with Fear**, the GM gains a Fear. Matching dice are a **critical success**.",
    { h: "At creation", i: "quill" },
    { gems: ["+2", "+1", "+1", "+0", "+0", "−1"] },
    "Set these six values into your traits in any order.",
    { h: "Growing stronger", i: "crown" },
    "Leveling up can raise two **unmarked** traits by +1 each. Raised traits are **marked** and can't rise again until the marks clear at **levels 5 and 8**.",
    { h: "Spellcast trait", i: "spellcast" },
    "Your subclass may name a **Spellcast trait**. Its shield carries the glowing arcane hand, and you use it for every Spellcast Roll.",
    { note: "Equipment features that change a trait (such as Full Plate Armor's −1 to Agility) are read from the item's text and applied while it's equipped." },
  ] },
  defense: { title: "Evasion, armor and thresholds", sub: "How hard you are to hit and to hurt", icon: "valor", src: "Core Mechanics: Combat; Equipment: Armor",
    flavor: "What stands between you and the blow: how hard you are to hit, and how much you can shrug off.", parts: [
    { items: [["valor", "Evasion", "The Difficulty of any roll made against you. Starts at your class's number; armor, cards and advancements change it."],
      ["armor", "Armor Score", "How many Armor Slots your worn armor gives you, never above 12."],
      ["dice", "Proficiency", "How many damage dice your weapons roll. Starts at 1; rises at levels 2, 5 and 8."]] },
    { h: "Damage thresholds", i: "heart" },
    { scale: [["Minor", "below Major", "1 HP"], ["Major", "Major or more", "2 HP"], ["Severe", "Severe or more", "3 HP"]] },
    "Your thresholds are your armor's base Major and Severe numbers **plus your level**. Unarmored, Major is your level and Severe is twice your level.",
    { h: "Spending an Armor Slot", i: "armor" },
    { eq: [["hp", "Severe", ""], "→", ["hp", "Major", ""], "→", ["hp", "Minor", ""], "→", ["none", "None", ""]] },
    "When you take damage, mark one Armor Slot to drop it one step.",
    { ex: "Level 3 in Leather Armor (base 6 / 13): thresholds **9 / 16**. A hit for 12 is Major, 2 HP. Marking an Armor Slot makes it Minor, 1 HP." },
  ] },
  health: { title: "Damage, Hit Points, Stress and Hope", sub: "Wounds, strain, and the light that keeps you going", icon: "heart", src: "Core Mechanics: Hit Points & Damage Thresholds; Stress; Hope & Fear; Death",
    flavor: "Every hero bends before they break. Track the wounds, the strain, and the light that keeps you going.", parts: [
    { h: "Hit Points", i: "heart" },
    { scale: [["Minor", "below Major", "1 HP"], ["Major", "Major or more", "2 HP"], ["Severe", "Severe or more", "3 HP"]] },
    "Damage reduced to 0 marks nothing. Resistance halves the damage before you compare it to your thresholds. (Optional rule: twice your Severe threshold marks 4.)",
    { h: "Stress", i: "stress" },
    "Everyone starts with **6** Stress slots. With all of them marked you're *Vulnerable* until you clear one, and if you must mark Stress and can't, you mark a Hit Point instead.",
    { h: "Hope", i: "hope" },
    "You start with **2 Hope** and can hold **6**. Spend it on:",
    { items: [["hope", "Help an Ally", "1 Hope: roll an advantage die for their action roll."], ["quill", "Use an Experience", "1 Hope each: add its modifier to a roll."],
      ["spotlight", "Tag Team Roll", "3 Hope, once per session: act together with another PC."], ["spell", "Hope features", "Your class's Hope feature, and other features that ask for it."]] },
    { h: "Death moves", i: "wound" },
    "When you mark your last Hit Point, choose one:",
    { items: [["crown", "Blaze of Glory", "One final action that critically succeeds, then you die."], ["rest", "Avoid Death", "Fall unconscious; roll your Hope Die, and at or below your level you gain a scar."],
      ["dice", "Risk It All", "Roll the Duality Dice: Hope higher clears HP or Stress; Fear higher, you die; matching clears everything."]] },
    { note: "Left-click a box to mark up to it; right-click (or long-press on a phone) to clear back. \"Take damage\" works out the severity and marks the Hit Points for you; tick \"Mark an Armor Slot\" to use one." },
  ] },
  experiences: { title: "Experiences", sub: "What your hero has lived through", icon: "quill", src: "Character Creation, step 7; Core Mechanics: Hope & Fear",
    flavor: "Where you've been and what you learned there: words you can call on when it matters most.", parts: [
    "An Experience is a word or phrase for a set of skills, a trait or an aptitude.",
    { ex: "*Field Medic* · *Silver Tongue* · *Hold the Line* · *Raised by Wolves*" },
    { h: "Using one", i: "hope" },
    { eq: [["hope", "1 Hope", "spend"], "→", ["trait", "+2", "add its modifier"]] },
    "Spend a Hope to add a relevant Experience to an action or reaction roll. You can spend more Hope to use several on one roll.",
    { h: "Gaining more", i: "crown" },
    { items: [["quill", "At creation", "Two Experiences at +2."], ["crown", "Levels 2, 5, 8", "A new Experience at +2 each time."]] },
    "An Experience can't be too broad (*Lucky*) or grant special powers (*Invulnerable*).",
  ] },
  weapons: { title: "Weapons", sub: "What you carry into the fight", icon: "weapon", src: "Equipment: Weapons",
    flavor: "Steel, spellwork or something stranger: what you carry into the fight, and how hard it lands.", parts: [
    { h: "Hands and burden", i: "weapon" },
    { items: [["weapon", "Primary", "Your main weapon. One equipped at a time."], ["blade", "Secondary", "An off-hand weapon or shield. One at a time."], ["pack", "Inventory", "Up to two more, carried but not in hand."]] },
    "Together, your equipped weapons can use at most **two hands** of burden.",
    { h: "Damage", i: "dice" },
    { eq: [["dice", "d8+2", "weapon damage"], "×", ["prof", "2", "Proficiency"], "=", ["dice", "2d8+2", "you roll"]] },
    "The damage dice are rolled **Proficiency** times; the flat bonus is added once.",
    { h: "Swapping", i: "stress" },
    "Swapping an inventory weapon for an equipped one is free during a rest or a moment of calm. In the thick of it, **mark a Stress**.",
    { h: "Limits", i: "spellcast" },
    { items: [["spellcast", "Magic weapons", "Need a Spellcast trait to wield."], ["crown", "Tier", "Nothing above your own tier."], ["str", "Unarmed", "Strength or Finesse; Proficiency × d4."]] },
  ] },
  worn: { title: "Worn gear", sub: "What you have on", icon: "helm", src: "Equipment; Loot",
    flavor: "Everything you carry into danger, ready to hand.", parts: [
    { items: [["weapon", "Weapons", "One primary and one secondary, within two hands of burden."], ["helm", "Armor", "One suit at a time: its thresholds plus your level, and its Armor Slots."],
      ["pack", "Worn items", "Rings, amulets and other loot you have on. Mark them with **Equip** in your inventory."]] },
    "Equip weapons, wear armor and equip items on the **Gear** tab; they appear here.",
  ] },
  conditions: { title: "Conditions", sub: "Effects that cling to a target", icon: "wound", src: "Core Mechanics: Conditions",
    flavor: "The marks a fight leaves on you: some help, most hinder, all of them matter.", parts: [
    { h: "Standard conditions", i: "wound" },
    { items: [["ins", "Hidden", "Out of sight of every enemy: rolls against you have disadvantage. Ends when they could see you, or you attack."],
      ["str", "Restrained", "You can't move, but can still act from where you are."], ["wound", "Vulnerable", "All rolls targeting you have advantage."]] },
    { h: "Special conditions", i: "spell" },
    "Features can apply their own conditions, such as *Asleep* or *Hexed*. They work as the feature says and end when it says they do.",
    "A condition tagged **temporary** can be cleared by making a move against it, usually a successful action roll with a fitting trait.",
    "The same condition can't apply twice to one target.",
  ] },
  loadout: { title: "Domain cards", sub: "Loadout and vault", icon: "spell", src: "Domains: Loadout & Vault",
    flavor: "Your hand of power: the cards you can call on now, and the ones waiting in the vault.", parts: [
    { items: [["spell", "Loadout", "Up to **5** active cards you can use."], ["book", "Vault", "The rest: kept, but out of reach until recalled."]] },
    { h: "Recalling a card", i: "recall" },
    { eq: [["recall", "2", "Recall Cost"], "=", ["stress", "2 Stress", "to mark"]] },
    "During a rest, move cards freely. At any other time, bringing a card back from the vault costs Stress equal to its **Recall Cost**.",
    { h: "Gaining cards", i: "crown" },
    { items: [["quill", "At creation", "Two level 1 cards from your class's two domains."], ["crown", "Each level up", "One card at or below your new level."]] },
    "Subclass, ancestry, community and transformation cards never count toward your loadout.",
  ] },
  classes: { title: "Classes and subclasses", sub: "Your calling", icon: "crown", src: "Classes",
    flavor: "Your calling: the domains you draw on, and the feats only your class can do.", parts: [
    { items: [["spell", "Two domains", "Where your domain cards come from."], ["valor", "Evasion and HP", "Your starting numbers."], ["hope", "Hope feature", "Your class's signature move, for 3 Hope."]] },
    { h: "Subclass", i: "foundation" },
    { items: [["foundation", "Foundation", "Taken at creation. May give a Spellcast trait."], ["specialization", "Specialization", "From the upgraded subclass advancement."], ["mastery", "Mastery", "From that advancement again, later."]] },
    { note: "Features that say \"once per rest\", \"once per long rest\" or similar get use boxes; rests refresh them. Features that put tokens on their card get a token counter." },
  ] },
  heritage: { title: "Heritage", sub: "Ancestry and community", icon: "ancestry", src: "Ancestries; Communities; Transformations",
    flavor: "Who you were before the adventure: the blood you carry and the people who raised you.", parts: [
    { items: [["ancestry", "Ancestry", "Two features."], ["community", "Community", "One feature."], ["transformation", "Transformation", "Optional, given by the GM: a gift with a cost. Only one.", 1]] },
    { h: "Mixed ancestry", i: "ancestry" },
    "Take the **first** feature of one ancestry and the **second** feature of another.",
  ] },
  armor: { title: "Armor", sub: "One suit at a time", icon: "helm", src: "Equipment: Armor; Core Mechanics: Downtime",
    flavor: "Leather, mail or plate: the armor that turns a killing blow into a bruise.", parts: [
    "Your damage thresholds are the armor's base Major and Severe numbers **plus your level**, and its base score is your number of Armor Slots. Each armor tracks its own marked slots, and you can't change armor while in danger.",
    { h: "Repairs", i: "rest" },
    { items: [["rest", "Short rest", "Repair Armor: clear 1d4 + your tier in slots."], ["longrest", "Long rest", "Repair All Armor: clear every slot."]] },
  ] },
  inventory: { title: "Items and consumables", sub: "What's in the pack", icon: "pack", src: "Loot; Consumables",
    flavor: "Every adventurer's pack tells a story.", parts: [
    { items: [["pack", "Items", "Last until sold, lost or discarded."], ["potion", "Consumables", "Used once. Hold up to five of each."]] },
  ] },
  gold: { title: "Gold", sub: "Handfuls, bags and a chest", icon: "coins", src: "Gold",
    flavor: "Counted the adventurer's way: by the handful.", parts: [
    { eq: [["gold", "10", "handfuls"], "=", ["gold", "1", "bag"]] },
    { eq: [["gold", "10", "bags"], "=", ["gold", "1", "chest"]] },
    "You can hold **one chest**. Optional rule: track **coins** too, 10 to a handful.",
  ] },
  background: { title: "Background", sub: "Your story so far", icon: "book", src: "Character Creation, step 6",
    flavor: "The questions that shaped you, and the answers you'll find along the way.", parts: [
    "Your background has no mechanical effect, but it shapes the character you play and what the GM prepares. Answer, change or skip the questions, or discover your past in play.",
  ] },
  companion: { title: "Ranger companion", sub: "Beastbound", icon: "ranger", src: "Ranger: Beastbound, Ranger Companion",
    flavor: "A loyal beast at your side, as much a hero as you are.", parts: [
    { items: [["valor", "Evasion 10", "Its own Evasion."], ["quill", "Two Experiences", "Both at +2."], ["dice", "d6 attack", "Melee, physical or magic."]] },
    { steps: ["Command it with a **Spellcast Roll**; on a success its damage uses your Proficiency and its damage die.",
      "When it takes damage it marks a **Stress**. At its last Stress it leaves the scene until your next long rest.",
      "Each time you level up, choose one companion level-up option."] },
    { note: "The companion sheet's number of Stress slots isn't in the SRD text; the app starts it at 3. Change \"Base Stress slots\" if your sheet differs." },
  ] },
  gmparty: { title: "The party", sub: "Fear and the table", icon: "fear", src: "Core Mechanics: Hope & Fear; Downtime",
    flavor: "Fear gathers in the dark between the heroes' rolls.", parts: [
    "The GM can hold up to **12 Fear**. The GM gains Fear:",
    { items: [["dice", "Roll with Fear", "1 Fear each time a player's action roll lands with Fear."], ["rest", "Short rest", "1d4 Fear."], ["longrest", "Long rest", "1d4 + the number of PCs."]] },
    { note: "Rolls made with the app's Duality Dice add their Fear here automatically." },
  ] },
  spotlight: { title: "Spotlight tracker", sub: "Optional", icon: "spotlight", src: "Core Mechanics: Turn Order & Action Economy",
    flavor: "No initiative: the spotlight follows the story.", parts: [
    { steps: ["Give each player tokens (3 is recommended).", "Remove one each time they act.", "The spotlight passes over players with none left.", "When everyone is out, refill."] },
  ] },
  adversaries: { title: "Adversaries", sub: "Foes on the table", icon: "foe", src: "Using Adversaries",
    flavor: "Every foe has a weakness and a breaking point.", parts: [
    { items: [["valor", "Difficulty", "The target number for attacks against it."], ["heart", "Thresholds and HP", "Damage marks HP by its thresholds, as for PCs."], ["stress", "Stress", "Spent on its features."]] },
  ] },
  countdowns: { title: "Countdowns", sub: "Trouble on the way", icon: "countdown", src: "Making Moves: Countdowns",
    flavor: "Something is coming. The only question is when.", parts: [
    { steps: ["Set a countdown for a coming event.", "Tick it down when its trigger happens.", "At 0 it fires. A looping countdown resets."] },
  ] },
  levelup: { title: "Leveling up", sub: "Growing into a legend", icon: "crown", src: "Leveling Up",
    flavor: "The party grows together, milestone by milestone.", parts: [
    { steps: ["Take any **tier achievements**.", "Choose **two advancements**.", "Raise your **damage thresholds by 1**.", "Gain a **domain card** at your level or lower."] },
    { h: "Tier achievements", i: "crown" },
    { items: [["quill", "Levels 2, 5, 8", "A new Experience at +2, and +1 Proficiency."], ["crown", "Levels 5, 8", "Marked traits clear."]] },
    { note: "The number of slots each advancement has is printed on the character sheet, not in the SRD text. The app uses: traits 3, Hit Points 2, Stress 2, Experiences 1, domain card 1, Evasion 1, and from tier 3: subclass 1, Proficiency 1 (both picks), multiclass 1 (both picks). Check these against your printed sheets." },
  ] },
};

/* Short definitions behind rule tokens: hover (or tap) a token to see its card.
   Keys: spellcast, reaction, trait:<Trait>, range:<Range>, cond:<Condition>, armor, fear. */
const GLOSSARY = {
  spellcast: { t: "Spellcast Roll", i: "spellcast", arcane: 1, x: "A trait roll using your **Spellcast trait**, which your subclass sets. Roll the Duality Dice and add that trait; on a success the effect happens. A number in brackets, like (13), is the Difficulty. If it can deal damage, it's also an attack roll." },
  reaction: { t: "Reaction Roll", i: "dice", x: "Made to avoid or withstand something. Works like an action roll, but it gives no Hope or Fear and allies can't Help. A critical success gives no Hope, but you shrug off what a success would avoid." },
  trait: { t: "{T} Roll", x: "An action roll with **{T}**: roll the Duality Dice and add your {T}. Meet the Difficulty (in brackets, or set by the GM) to succeed." },
  "range:Melee": { t: "Melee range", i: "range", x: "Close enough to touch, up to a few feet away." },
  "range:Very Close": { t: "Very Close range", i: "range", x: "About 5–10 feet: close enough to see fine details. In danger, you can move from here into Melee as part of your action. On a map: a card's short edge." },
  "range:Close": { t: "Close range", i: "range", x: "About 10–30 feet: close enough to see prominent details. In danger, you can move from here into Melee as part of your action. On a map: a pencil's length." },
  "range:Far": { t: "Far range", i: "range", x: "About 30–100 feet: you can make out little detail. In danger, reaching Melee from here takes an Agility Roll. On a map: a sheet of paper's long edge." },
  "range:Very Far": { t: "Very Far range", i: "range", x: "About 100–300 feet: too far to see details. In danger, reaching Melee from here takes an Agility Roll. Beyond this is out of range." },
  "cond:Hidden": { t: "Hidden", i: "ins", x: "You're out of sight of every enemy and they don't know where you are. Rolls against you have **disadvantage**. It ends when an enemy moves to where they'd see you, you step into view, or you attack." },
  "cond:Restrained": { t: "Restrained", i: "str", x: "You **can't move**, but you can still take actions from where you are." },
  "cond:Vulnerable": { t: "Vulnerable", i: "wound", x: "All rolls targeting you have **advantage**. You're Vulnerable while all your Stress is marked." },
  "cond:Unconscious": { t: "Unconscious", i: "rest", x: "You **can't move or act**, and you can't be targeted by attacks. You wake when an ally clears one or more of your Hit Points, or when the party finishes a long rest." },
  cond: { t: "{T}", i: "wound", x: "A **special condition** from a feature: it works as that feature says and ends when it says. If it's tagged temporary, you can clear it by making a move against it, usually a successful action roll." },
  armor: { t: "Armor Slot", i: "armor", x: "When you take damage, mark one to drop the damage one step: Severe to Major, Major to Minor, Minor to none. You have as many as your Armor Score; rests repair them." },
  fear: { t: "Fear", i: "fear", x: "The GM's resource, up to 12. The GM gains it when players roll with Fear, and spends it to make moves, interrupt the action, and power adversary features." },
};
