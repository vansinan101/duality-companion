# Duality Companion — design notes and open questions

## Source and build
- Game data: Daggerheart SRD 2.0 (25 Aug 2026), from the community Markdown edition github.com/ero-gfld/daggerheart-obsidian-srd-2.0 (v1.3.0), parsed by `tools/build_srd.py` into `src/srd-data.js`.
- Cross-check: `tools/check_srd.py` compares 3,268 numbers (class Evasion/HP/domains, weapon trait/range/damage/burden, armor thresholds/score, card level/domain/type/recall, adversary stats) with an independent transcription (github.com/ZZZZzzzzac/Daggerheart_SRD, `src/DH-SRD-EN.md`). All agree; the remaining differences are text-extraction noise in the reference.
- Corrections made to the transcription: Witch subclasses named "Hedge" and "Moon" as the SRD prints them; "InfernIs" → Infernis; duplicate files dropped (Sword of Light & Flame, Outer Realms Corruptor/Corrupter).
- Build: `python3 src/build.py` (one file, browser saving) · `python3 src/build.py --web DIR [--dev]` (website with Firebase).
- Tests: `node tests/t_rules.js` (rules against SRD examples) · `tests/journey.py` (headless walk-through at 1280 and 390 px).

## Open data questions (check against the official PDF)
1. Dread level 4 card: the transcription calls it **Horror**; the independent copy calls it **Summon Horror**.
2. Full Plate Armor's feature wording in SRD 2.0 ("Heavy" vs "Very Heavy").

## App readings (marked in rules-info.js; confirm with Sinan)
- Advancement slot counts (printed on the sheet, not in the SRD): traits 3, HP 2, Stress 2, Experiences 1, domain card 1, Evasion 1; from tier 3 also subclass 1, Proficiency 1 (both picks), multiclass 1 (both picks).
- Ranger companion starts with 3 Stress slots (sheet value, not in the SRD).
- Heritage features applied automatically: Human +1 Stress slot, Giant +1 HP slot, Simiah +1 Evasion, Earthkin +1 Armor Score and thresholds, Galapa thresholds + Proficiency. Clank's +1 to an Experience is set by hand.
- Equipment features with a plain number ("+1 to Evasion", "−1 to Agility", "+1 to Armor Score") apply while equipped.
- Risk It All with Hope higher clears Hit Points first, then Stress.
- Rests apply moves to yourself; tend an ally on their own sheet.

## Clockwork feature → Duality equivalent
| Clockwork | Duality Companion |
| --- | --- |
| Accounts, table password, GM roles, Free edit by GM | Same (new Firebase project, `dh-` keys) |
| Character switcher, companions | Same; companion = Beastbound Ranger's animal companion |
| Genesis (7 steps, 3d8 rolls) | The SRD's 9 creation steps |
| Karma spending, pool kept honest | Level-up wizard; every stat derived from recorded level-ups, with undo |
| Attributes bar, skill pips | Traits (marked per tier), Evasion, Armor, thresholds, Proficiency |
| Vitals: HP, Blood, Stamina, wounds, rests | HP/Stress/Armor/Hope tracks, damage calculator, rests with downtime moves, death moves |
| Skills & Talents (perks with uses) | Abilities: loadout/vault with Recall Cost, class/subclass/heritage features with use boxes and tokens |
| Gear, weapon cards, inventory | SRD weapons/armor by tier, custom items, consumables, gold |
| Dice switch (app / own rolls) | Same, plus the Duality Dice roller (Hope/Fear applied, Fear to the GM) |
| GM table: party, initiative deck, backups | Fear tracker, party cards, spotlight tokens (optional rule), SRD adversaries and environments, countdowns, Witherwild Wither tokens, backups |
| Tabletop tab (TTS code) | Data tab: save/load a character file |
| Themes | Not yet (plain starter look) — last phase |
