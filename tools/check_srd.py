#!/usr/bin/env python3
"""Cross-check src/srd-data.js against an independent full-text copy of the SRD 2.0.

Usage: python3 -I tools/check_srd.py src/srd-data.js <DH-SRD-EN.md>
Compares every number the app computes with: class Evasion/HP/domains, weapon trait/range/damage/burden,
armor thresholds and score, domain card level/domain/type/recall cost, adversary difficulty/thresholds/HP/Stress/attack.
"""
import json, re, sys, unicodedata

data_js, ref_path = sys.argv[1], sys.argv[2]
src = open(data_js, encoding="utf-8").read()
D = json.loads(src[src.index("{"): src.rindex("}") + 1])
ref = open(ref_path, encoding="utf-8").read().replace("−", "-").replace("–", "-").replace(" ", " ")

def key(s):
    s = unicodedata.normalize("NFKD", s).replace("’", "'")
    return re.sub(r"[^a-z0-9]", "", s.lower())

bad, ok = [], 0
def check(what, got, want):
    global ok
    if str(got).strip().lower() != str(want).strip().lower(): bad.append(f"{what}: data={got!r} reference={want!r}")
    else: ok += 1

# table rows: | Name | ... |
rows = {}
for line in ref.split("\n"):
    if line.startswith("|") and not line.startswith("| ---") and not line.startswith("| Name"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and cells[0]: rows.setdefault(key(cells[0]), cells)

for w in D["weapons"]:
    r = rows.get(key(w["name"]))
    if not r: bad.append(f"weapon {w['name']}: not found in reference tables"); continue
    if w.get("wheelchair"): r = [r[0]] + r[2:]   # wheelchair tables have a Tier column
    check(f"weapon {w['name']} trait", w["trait"], r[1]); check(f"weapon {w['name']} range", w["range"], r[2])
    check(f"weapon {w['name']} damage", w["dmg"], r[3]); check(f"weapon {w['name']} burden", w["burden"], r[4])
for a in D["armor"]:
    r = rows.get(key(a["name"]))
    if not r: bad.append(f"armor {a['name']}: not found"); continue
    check(f"armor {a['name']} thresholds", f"{a['major']} / {a['severe']}", re.sub(r"\s*/\s*", " / ", r[1]))
    check(f"armor {a['name']} score", a["score"], r[2])

# classes: "### NAME" ... DOMAINS – A & B, STARTING EVASION – n, STARTING HIT POINTS – n
for c in D["classes"]:
    m = re.search(r"^### " + re.escape(c["name"].upper()) + r"\s*$(.{0,4000})", ref, re.M | re.S)
    if not m: bad.append(f"class {c['name']}: not found"); continue
    blk = m.group(1)
    dm = re.search(r"DOMAINS\s*-\s*(\w+) & (\w+)", blk); ev = re.search(r"STARTING EVASION\s*-\s*(\d+)", blk); hp = re.search(r"STARTING HIT POINTS\s*-\s*(\d+)", blk)
    check(f"class {c['name']} domains", " & ".join(sorted(c["domains"])), " & ".join(sorted(dm.groups())) if dm else "?")
    check(f"class {c['name']} evasion", c["evasion"], ev.group(1) if ev else "?")
    check(f"class {c['name']} hp", c["hp"], hp.group(1) if hp else "?")

# domain cards: "### TITLE" then "Level n Domain Type" and "Recall Cost: n"
for card in D["cards"]:
    pat = r"^### " + re.escape(card["name"].upper().replace("’", "'")) + r"\s*\n+\s*Level (\d+) (\w+) (\w+)\s*\n\**Recall Cost:?\**\s*(\d+)"
    m = re.search(pat, ref.replace("’", "'"), re.M)
    if not m: bad.append(f"card {card['name']}: not found"); continue
    check(f"card {card['name']} level", card["lvl"], m.group(1)); check(f"card {card['name']} domain", card["dom"], m.group(2))
    check(f"card {card['name']} type", card["type"], m.group(3)); check(f"card {card['name']} recall", card["recall"], m.group(4))

# adversaries: "### NAME" then a few lines with Difficulty: n | Thresholds: a/b | HP: n | Stress: n
found = 0
for a in D["adversaries"]:
    nm = a["name"].upper().replace("’", "'")
    m = re.search(r"^### " + re.escape(nm) + r"\s*$(.{0,900})", ref.replace("’", "'"), re.M | re.S)
    if not m: continue
    blk = re.sub(r"\s+", " ", m.group(1)).replace("*", "")
    s = re.search(r"Difficulty:? (\d+) \| Thresholds:? ([\d/None]+) \| HP:? (\d+) \| Stress:? (\d+)", blk)
    if not s: continue
    found += 1
    check(f"adversary {a['name']} difficulty", a["diff"], s.group(1)); check(f"adversary {a['name']} thresholds", a["thresholds"].replace(" ", ""), s.group(2))
    check(f"adversary {a['name']} hp", a["hp"], s.group(3)); check(f"adversary {a['name']} stress", a["stress"], s.group(4))

print(f"{ok} values agree; adversaries matched in reference: {found}/{len(D['adversaries'])}")
for b in bad: print("DIFF", b)
