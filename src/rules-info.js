/* Plain-language rules shown when a section heading is clicked (the Head component).
   Each topic: { title, sub, parts: [markdown | { note } | { list }], src }. A { note } marks the app's own reading. */
const RULES_INFO = {
  traits: { title: "Traits", sub: "Agility, Strength, Finesse, Instinct, Presence, Knowledge", src: "Character Creation, step 3; Leveling Up", parts: [
    "Your six traits are the numbers you add to action rolls. When you \"roll with a trait\", its modifier joins the two Duality Dice.",
    "At creation you assign **+2, +1, +1, +0, +0 and −1** in any order.",
    "Leveling up can raise two **unmarked** traits by +1 each; they're then **marked** and can't rise again until marks clear at **levels 5 and 8**.",
    "Your subclass may name a **Spellcast trait**, used for spells and Spellcast Rolls.",
    { note: "Equipment features that change a trait (such as Full Plate Armor's −1 to Agility) are read from the item's text and applied while it's equipped." },
  ] },
  defense: { title: "Evasion, armor and thresholds", src: "Combat; Equipment: Armor", parts: [
    "**Evasion** is the Difficulty of any roll made against you. It starts at your class's number; armor, cards and advancements change it.",
    "**Armor Score** is how many Armor Slots your worn armor gives (never above 12). When you take damage you can mark one slot to drop the damage one step: Severe to Major, Major to Minor, Minor to nothing.",
    "**Damage thresholds** are your armor's base Major and Severe numbers **plus your level**. Unarmored, Major is your level and Severe is twice your level.",
    "**Proficiency** is how many damage dice your weapons roll. It starts at 1 and rises at levels 2, 5 and 8, and with the Proficiency advancement.",
  ] },
  health: { title: "Damage, Hit Points, Stress and Hope", src: "Hit Points & Damage Thresholds; Stress; Hope & Fear; Death", parts: [
    "Damage below your Major threshold marks **1 HP**, at Major **2 HP**, at Severe **3 HP**. Damage reduced to 0 marks nothing. (Optional rule: twice your Severe threshold marks 4.)",
    "Resistance halves the damage before you compare it to your thresholds.",
    "**Stress**: everyone starts with 6 slots. With all Stress marked you're **Vulnerable** until you clear one. If you must mark Stress and can't, mark a Hit Point instead.",
    "**Hope**: you start with 2 and can hold 6. Spend it to Help an Ally, use an Experience, start a Tag Team Roll (3 Hope), or power Hope features.",
    "When you mark your last Hit Point, you make a **death move**: Blaze of Glory, Avoid Death, or Risk It All.",
    { note: "Left-click a box to mark up to it; right-click (or long-press on a phone) to clear back. \"Take damage\" works out the severity and marks the Hit Points for you; tick \"Mark an Armor Slot\" to use one." },
  ] },
  experiences: { title: "Experiences", src: "Character Creation, step 7", parts: [
    "An Experience is a word or phrase for a set of skills, a trait or an aptitude: *Field Medic*, *Silver Tongue*, *Hold the Line*.",
    "Spend a Hope to add a relevant Experience's modifier to an action or reaction roll. You start with two at +2, and gain another at levels 2, 5 and 8.",
    "An Experience can't be too broad (*Lucky*) or grant special powers (*Invulnerable*).",
  ] },
  weapons: { title: "Weapons", src: "Equipment: Weapons", parts: [
    "You can equip one **primary** and one **secondary** weapon, within two hands of **burden**. Two more can sit in your inventory.",
    "A weapon's damage dice are rolled **Proficiency** times; its flat bonus is added once. *Proficiency 2 with d8+2 rolls 2d8+2.*",
    "Swapping an inventory weapon for an active one is free during a rest or a moment of calm; otherwise mark a Stress.",
    "Magic weapons need a Spellcast trait. You can't equip a weapon of a higher tier than yours.",
    "Unarmed attacks use Strength or Finesse and deal Proficiency × d4.",
  ] },
  conditions: { title: "Conditions", src: "Conditions", parts: [
    "**Hidden**: rolls against you have disadvantage until an enemy can see you or you attack.",
    "**Restrained**: you can't move, but can still act from where you are.",
    "**Vulnerable**: all rolls against you have advantage.",
    "Some features give special conditions; the same condition can't apply twice to one target.",
  ] },
  loadout: { title: "Domain cards: loadout and vault", src: "Domains: Loadout & Vault", parts: [
    "You start with two level 1 cards from your class's two domains, and gain one card at or below your level each time you level up.",
    "Up to **5** cards can be in your **loadout** (active). The rest wait in your **vault**.",
    "During a rest you can move cards freely. At other times, bringing a card back from the vault costs **Stress equal to its Recall Cost** (⚡).",
    "Subclass, ancestry, community and transformation cards never count toward your loadout.",
  ] },
  classes: { title: "Classes and subclasses", src: "Classes", parts: [
    "Your class gives two domains, starting Evasion and Hit Points, class features and a **Hope feature** (3 Hope).",
    "Your subclass gives a Spellcast trait (if any) and its **Foundation** card. Its Specialization and Mastery cards come through the \"upgraded subclass\" advancement.",
    { note: "Features that say \"once per rest\", \"once per long rest\" or similar get use boxes; rests refresh them. Features that put tokens on their card get a token counter." },
  ] },
  heritage: { title: "Heritage", src: "Ancestries; Communities; Transformations", parts: [
    "Your **ancestry** gives two features; your **community** gives one.",
    "**Mixed ancestry**: take the first-listed feature of one ancestry and the second-listed feature of another.",
    "A **transformation** (vampire, werewolf and others) is optional and given by the GM; it adds both a benefit and a drawback. You can only have one.",
  ] },
  armor: { title: "Armor", src: "Equipment: Armor", parts: [
    "One armor at a time. Its base thresholds plus your level give your damage thresholds; its base score is your Armor Score.",
    "Each armor tracks its own marked slots. You can't change armor while in danger.",
    "Short rest: Repair Armor clears 1d4 + tier slots. Long rest: Repair All Armor clears them all.",
  ] },
  inventory: { title: "Items and consumables", src: "Loot; Consumables", parts: [
    "Items last until sold, lost or discarded. Consumables are used once; you can hold up to five of each.",
  ] },
  gold: { title: "Gold", src: "Gold", parts: [
    "Gold is counted in **handfuls**, **bags** and a **chest**: 10 handfuls make a bag, 10 bags make a chest, and you can hold one chest.",
    "Optional rule: track **coins** too, 10 to a handful.",
  ] },
  background: { title: "Background", src: "Character Creation, step 6", parts: [
    "Your background has no mechanical effect, but shapes the character you play and the GM's prep. Answer, change or skip the questions, or discover your past in play.",
  ] },
  companion: { title: "Ranger companion", src: "Ranger: Beastbound, Ranger Companion", parts: [
    "A Beastbound Ranger's animal companion starts with **Evasion 10**, two Experiences at +2, and a d6 Melee attack (physical or magic).",
    "Command it with a Spellcast Roll; on a success its damage uses your Proficiency and its damage die.",
    "When it takes damage it marks a **Stress**; at its last Stress it leaves the scene until your next long rest.",
    "Each time you level up, choose one companion level-up option.",
    { note: "The companion sheet's number of Stress slots isn't in the SRD text; the app starts it at 3. Change \"Base Stress slots\" if your sheet differs." },
  ] },
  gmparty: { title: "The party", src: "Hope & Fear; Downtime consequences", parts: [
    "The GM can hold up to **12 Fear**. The GM gains a Fear whenever a player rolls with Fear, 1d4 on a short rest, and 1d4 + the number of PCs on a long rest.",
    { note: "Rolls made with the app's Duality Dice add their Fear here automatically." },
  ] },
  spotlight: { title: "Spotlight tracker (optional)", src: "Turn Order & Action Economy", parts: [
    "There's no initiative: the spotlight moves with the fiction. If your group wants more structure, give each player tokens (3 recommended) and remove one each time they act. The spotlight passes over players with none; when all are out, refill.",
  ] },
  adversaries: { title: "Adversaries", src: "Using Adversaries", parts: [
    "Each adversary has a Difficulty (the target for attacks against it), damage thresholds, Hit Points and Stress.",
    "Damage against an adversary marks HP by its thresholds, the same as for PCs.",
  ] },
  countdowns: { title: "Countdowns", src: "Countdowns", parts: [
    "A countdown tracks a coming event. Tick it down when the trigger happens; at 0 it fires. Looping countdowns reset when they fire.",
  ] },
  levelup: { title: "Leveling up", src: "Leveling Up", parts: [
    "The party levels up together at milestones. Each level: take any **tier achievements**, choose **two advancements**, raise **damage thresholds by 1**, and gain a **domain card** at your level or lower.",
    "Tier achievements: at levels 2, 5 and 8, a new Experience at +2 and +1 Proficiency; at 5 and 8, marked traits clear.",
    { note: "The number of slots each advancement has is printed on the character sheet, not in the SRD text. The app uses: traits 3, Hit Points 2, Stress 2, Experiences 1, domain card 1, Evasion 1, and from tier 3: subclass 1, Proficiency 1 (both picks), multiclass 1 (both picks). Check these against your printed sheets." },
  ] },
};
