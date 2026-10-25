#!/usr/bin/env python3
"""Turn the Daggerheart SRD 2.0 Markdown (one file per entry) into src/srd-data.js.

Usage: python3 -I tools/build_srd.py <path to SRD 2.0 markdown repo> src/srd-data.js

The source is a Markdown transcription of the Daggerheart System Reference Document 2.0 (2026-08-25),
which is Public Game Content under the Darrington Press Community Gaming License. Feature text is kept as
written (light Markdown: bold, italics, lists, tables). Links are dropped to plain text.
Every number the app computes with (Evasion, HP, thresholds, damage, levels, recall costs) is extracted here,
then cross-checked against an independent full-text copy by tools/check_srd.py.
"""
import json, os, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]
problems = []

def read(path):
    with open(path, encoding="utf-8-sig") as f:
        t = f.read()
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)          # links -> text
    t = t.replace(" ", " ").replace("‑", "-")
    t = t.replace("\r", "")
    return t

def files(folder):
    d = os.path.join(SRC, folder)
    return sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith(".md"))

def title(t):
    m = re.search(r"^# (.+)$", t, re.M)
    return m.group(1).strip() if m else ""

def tidy(s):
    for _ in range(3): s = re.sub(r"(?<!\*)\*(\w[^*\n]*?)\* \*([^*\n]*?[\w.,;!?])\*(?!\*)", r"*\1 \2*", s)   # "*a* *b*": italics split at PDF line breaks
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

HEAD = re.compile(r"^(#{1,6} .+|\*\*[A-Z][^*]*\*\*\s*)$")

def sections(t):
    """Split a file into (heading, body) pairs. Headings are #-lines or whole-line **BOLD CAPS**."""
    out, cur, buf = [], "", []
    for line in t.split("\n"):
        s = line.strip()
        if HEAD.match(s) and not s.startswith("# ") and (s.startswith("#") or s.upper() == s):
            out.append((cur, "\n".join(buf)))
            cur, buf = re.sub(r"^#+ |\*\*", "", s).strip(), []
        else:
            buf.append(line)
    out.append((cur, "\n".join(buf)))
    return out

FEAT = re.compile(r"^(?:\*\*\*(.+?)[:.]\*\*\*|\*\*_(.+?)[:.]_\*\*)\s*(.*)$")

def features(body):
    """***Name:*** text paragraphs (and anything under them) -> [{n, x}]"""
    feats, cur = [], None
    for line in body.split("\n"):
        m = FEAT.match(line.strip())
        if m:
            if cur: feats.append(cur)
            cur = {"n": (m.group(1) or m.group(2)).strip(), "x": m.group(3)}
        elif cur is not None:
            cur["x"] += "\n" + line
    if cur: feats.append(cur)
    for f in feats: f["x"] = tidy(f["x"])
    return feats

def lead(t):
    """Description: the paragraphs between the title and the first heading or labelled line."""
    body = t.split("\n", 1)[1] if "\n" in t else ""
    keep = []
    for line in body.split("\n"):
        s = line.strip()
        if HEAD.match(s) or s.startswith("**") or s.startswith("***"):
            if keep and any(k.strip() for k in keep): break
            continue
        keep.append(line)
    return tidy("\n".join(keep))

def bullets(body):
    return [re.sub(r"^[-*]\s+", "", l.strip()).strip() for l in body.split("\n") if re.match(r"^\s*[-*]\s+", l)]

def num(s):
    m = re.search(r"-?\d+", s or "")
    return int(m.group()) if m else None

# ---------------- classes ----------------
classes = []
for p in files("classes"):
    t = read(p); name = title(t)
    c = {"name": name, "desc": lead(t), "domains": [], "evasion": None, "hp": None, "items": "", "hope": None,
         "features": [], "subclasses": [], "background": [], "connections": [], "extra": []}
    m = re.search(r"\*\*DOMAINS\s*[–-]\*\*\s*(.+)", t); c["domains"] = [x.strip() for x in re.split(r"&|and", m.group(1))] if m else []
    c["evasion"] = num((re.search(r"STARTING EVASION\s*[–-]\*\*\s*(.+)", t) or [None, ""])[1])
    c["hp"] = num((re.search(r"STARTING HIT POINTS\s*[–-]\*\*\s*(.+)", t) or [None, ""])[1])
    m = re.search(r"CLASS ITEMS\s*[–-]\*\*\s*(.+)", t); c["items"] = m.group(1).strip() if m else ""
    for head, body in sections(t):
        H = head.upper()
        if "HOPE FEATURE" in H:
            f = features(body); c["hope"] = f[0] if f else None
        elif H.startswith("CLASS FEATURE"):
            c["features"] = features(body)
        elif H == "SUBCLASSES":
            m2 = re.search(r"Choose either the (.+?) or (.+?) subclass", re.sub(r"\s+", " ", body.replace("*", "")))
            c["subclasses"] = [m2.group(1).strip(), m2.group(2).strip()] if m2 else []
        elif H == "BACKGROUND QUESTIONS":
            c["background"] = bullets(body)
        elif H == "CONNECTIONS":
            c["connections"] = bullets(body)
        elif head and head != name:
            c["extra"].append({"h": head.title(), "x": tidy(body)})
    if not (c["domains"] and c["evasion"] and c["hp"] and c["hope"] and c["subclasses"]):
        problems.append(f"class {name}: missing fields")
    classes.append(c)

# The SRD names the Witch subclasses "Hedge" and "Moon"; the transcription calls them "Hedge Witch"/"Moon Witch".
RENAME = {"Hedge Witch": "Hedge", "Moon Witch": "Moon"}
for c in classes:
    c["subclasses"] = [RENAME.get(s, s) for s in c["subclasses"]]

# ---------------- subclasses ----------------
subclasses = []
cls_of = {s: c["name"] for c in classes for s in c["subclasses"]}
for p in files("subclasses"):
    t = read(p); name = RENAME.get(title(t), title(t))
    s = {"name": name, "cls": cls_of.get(name, ""), "desc": lead(t), "spell": None, "foundation": [], "specialization": [], "mastery": [], "extra": []}
    for head, body in sections(t):
        H = head.upper()
        if H == "SPELLCAST TRAIT": s["spell"] = body.strip().split("\n")[0].strip() or None
        elif H in ("BACKGROUND QUESTIONS", "CONNECTIONS"): continue   # the class's questions, repeated in this file
        elif H.startswith("FOUNDATION"): s["foundation"] = features(body)
        elif H.startswith("SPECIALIZATION"): s["specialization"] = features(body)
        elif H.startswith("MASTERY"): s["mastery"] = features(body)
        elif head and head != title(t): s["extra"].append({"h": head.title(), "x": tidy(body)})
    if not (s["cls"] and s["foundation"] and s["specialization"] and s["mastery"]):
        problems.append(f"subclass {name}: missing fields ({s['cls']})")
    subclasses.append(s)
# The Ranger Companion sheet belongs to Beastbound; the transcription files it at the end of Wayfinder.
_wf = next(x for x in subclasses if x["name"] == "Wayfinder"); _bb = next(x for x in subclasses if x["name"] == "Beastbound")
# The class file already carries the Ranger Companion, Beastform and Martial Stance sections, so subclasses drop theirs.
for x in subclasses: x.pop("extra", None)

# ---------------- ancestries, communities, transformations ----------------
def heritage(folder, key):
    out = []
    for p in files(folder):
        t = read(p); name = title(t)
        e = {"name": name, "desc": lead(t), "features": [], "questions": []}
        for head, body in sections(t):
            H = head.upper()
            if "FEATURE" in H:
                e["features"] = features(body)
                adj = re.search(r"^\s*\*([^*]+?)\*\s*$", body, re.M)
                if adj and folder == "communities": e["adjectives"] = adj.group(1).strip()
            elif "QUESTIONS" in H: e["questions"] = bullets(body)
        if not e["features"]: problems.append(f"{folder} {name}: no features")
        out.append(e)
    return out
ancestries = heritage("ancestries", "a")
for a in ancestries:
    if a["name"] == "InfernIs": a["name"] = "Infernis"   # transcription typo
communities = heritage("communities", "c")
transformations = heritage("transformations", "t")
# community adjectives sit in the description as an italic line
for c in communities:
    m = re.search(r"\*([^*]*(?:often|are)[^*]*)\*\s*$", c["desc"])
    if m:
        c["adjectives"] = m.group(1).strip(); c["desc"] = tidy(c["desc"][:m.start()])
mixed = tidy(read(files("ancestry_rules")[0]).split("\n", 1)[1])

# ---------------- domains & cards ----------------
domains, cards = [], []
for p in files("domains"):
    t = read(p); name = title(t)
    domains.append({"name": name, "desc": lead(t)})
for p in files("abilities"):
    t = read(p); name = title(t)
    m = re.search(r"\*\*\*Level (\d+)\*\*\*\s*\*(\w+) (Ability|Spell|Grimoire)\.?\*\s*\*\*\*Recall Cost\*\*\*\s*\*(\d+)\.?\*", t)
    if not m:
        problems.append(f"card {name}: header not parsed"); continue
    body = t[m.end():]
    cards.append({"name": name, "lvl": int(m.group(1)), "dom": m.group(2), "type": m.group(3), "recall": int(m.group(4)), "x": tidy(body)})
dom_names = {d["name"] for d in domains}
for c in cards:
    if c["dom"] not in dom_names: problems.append(f"card {c['name']}: unknown domain {c['dom']}")

# ---------------- weapons, armor ----------------
weapons = []
wseen = set()
for p in files("weapons"):
    t = read(p); name = title(t)
    if name in wseen: continue   # "Sword of Light & Flame" is filed twice
    wseen.add(name)
    if name == "Combat Wheelchair":
        # one file holding three tables of wheelchair models
        for line in t.split("\n"):
            cells = [x.strip() for x in line.strip().strip("|").split("|")]
            if len(cells) >= 7 and re.match(r"d\d", cells[4] or ""):
                feat = re.sub(r"^\*\*(.+?):\*\*", r"***\1:***", cells[6]) if cells[6] not in ("—", "-") else ""
                weapons.append({"name": cells[0].strip("*"), "tier": int(cells[1]), "cat": "Primary", "dmgType": "phy" if "phy" in cells[4] else "mag",
                    "trait": cells[2], "range": cells[3], "dmg": cells[4], "burden": cells[5], "feat": feat, "wheelchair": True})
        continue
    m = re.search(r"\*\*_Tier (\d)_\*\*\s*_(Primary|Secondary)_\s*_(Physical|Magic(?:al)?)_", t)
    s = re.search(r"\*(\w+)\* · \*([\w ]+)\* · \*(d\d+(?:\+\d+)? (?:phy|mag|phy/mag|phy or mag))\* · \*([\w-]+)\*", t)
    if not s:
        b = {k: (re.search(r"\*\*" + k + r":\*\*\s*(.+)", t) or [None, None])[1] for k in ("Trait", "Range", "Damage", "Burden")}
        if all(b.values()):
            s = type("M", (), {"group": lambda self, i, b=b: [None, b["Trait"].strip(), b["Range"].strip(), b["Damage"].strip(), b["Burden"].strip()][i]})()
    if not (m and s):
        problems.append(f"weapon {name}: not parsed"); continue
    feat = ""
    if "### FEATURE" in t:
        feat = tidy(t.split("### FEATURE", 1)[1])
    weapons.append({"name": name, "tier": int(m.group(1)), "cat": m.group(2), "dmgType": "phy/mag" if re.search(r"phy(/| or )mag", s.group(3)) else "phy" if "phy" in s.group(3) else "mag",
        "trait": s.group(1), "range": s.group(2), "dmg": s.group(3), "burden": s.group(4), "feat": feat})
armor = []
for p in files("armor"):
    t = read(p); name = title(t)
    m = re.search(r"\*\*_Tier (\d)_\*\*", t)
    th = re.search(r"Base Thresholds:\*?\s*(\d+)\s*/\s*(\d+)", t)
    sc = re.search(r"Base Score:\*?\s*(\d+)", t)
    if not (m and th and sc):
        problems.append(f"armor {name}: not parsed"); continue
    feat = tidy(t.split("### FEATURE", 1)[1]) if "### FEATURE" in t else ""
    armor.append({"name": name, "tier": int(m.group(1)), "major": int(th.group(1)), "severe": int(th.group(2)), "score": int(sc.group(1)), "feat": feat})

# ---------------- loot ----------------
def loot(folder):
    out = []
    for p in files(folder):
        t = read(p); name = title(t)
        out.append({"name": name, "x": tidy(t.split("\n", 1)[1] if "\n" in t else "")})
    return out
items, consumables = loot("items"), loot("consumables")

# ---------------- beastforms ----------------
beastforms = []
for p in files("beastforms"):
    t = read(p); name = title(t)
    m = re.search(r"\*\*_Tier (\d)_\*\*\s*(\(.*?\))?", t)
    st = re.search(r"\*([A-Za-z]+ [+−-]\d) \| (Evasion [+−-]\d)\*\s*\*(.+?)\*", t)
    adv = re.search(r"\*\*Gain advantage on:\*\*\s*(.+)", t)
    beastforms.append({"name": name, "tier": int(m.group(1)) if m else None, "examples": (m.group(2) or "").strip("()") if m else "",
        "trait": st.group(1) if st else "", "evasion": st.group(2) if st else "", "attack": st.group(3) if st else "",
        "adv": adv.group(1).strip() if adv else "", "features": features(t)})
    if not st: problems.append(f"beastform {name}: stats not parsed")

# ---------------- adversaries & environments ----------------
def statline(t, key):
    m = re.search(r"\*\*" + key + r":\*\*\s*([^|\n]+)", t)
    return m.group(1).strip() if m else ""
adversaries = []
seen = set()
for p in files("adversaries"):
    t = read(p); name = title(t)
    if name in ("Statblocks", "Outer Realms Corruptor") or name in seen: continue   # index note; misspelt duplicate of "Corrupter"
    seen.add(name)
    m = re.search(r"\*\*[*_]Tier (\d) ([A-Za-z ]+?)(?: \((\d+)/HP\))?\.?[_*]\*\*", t)
    atk = re.search(r"\*\*ATK:\*\*\s*([+−-]?\d+)\s*\|\s*\*\*(.+?):\*\*\s*([^|]+?)\s*\|\s*(.+)", t)
    a = {"name": name, "tier": int(m.group(1)) if m else None, "type": m.group(2).strip() if m else "",
         "desc": (re.search(r"^(?:\*\*[*_]Tier[^\n]*?[_*]\*\*\s*)?[*_]([^*_].+?)[*_]\s*$", t, re.M) or [None, ""])[1],
         "motives": statline(t, "Motives & Tactics"), "diff": num(statline(t, "Difficulty")),
         "thresholds": statline(t, "Thresholds"), "hp": num(statline(t, "HP")), "stress": num(statline(t, "Stress")),
         "atk": atk.group(1).replace("−", "-") if atk else "", "attack": atk.group(2) if atk else "",
         "range": atk.group(3).strip() if atk else "", "dmg": atk.group(4).strip() if atk else "",
         "exp": statline(t, "Experience"), "features": features(t)}
    if m and m.group(3): a["horde"] = int(m.group(3))
    if a["hp"] is None or a["diff"] is None or a["tier"] is None: problems.append(f"adversary {name}: stats not parsed")
    adversaries.append(a)
environments = []
for p in files("environments"):
    t = read(p); name = title(t)
    m = re.search(r"\*\*\*Tier (\d) ([^*]+?)\*\*\*", t)
    environments.append({"name": name, "tier": int(m.group(1)) if m else None, "type": m.group(2).strip() if m else "",
        "desc": (re.search(r"^\*([^*].+?)\*\s*$", t, re.M) or [None, ""])[1], "impulses": statline(t, "Impulses"),
        "diff": num(statline(t, "Difficulty")), "potential": statline(t, "Potential Adversaries"), "features": features(t)})

data = {
    "source": "Daggerheart System Reference Document 2.0 (2026-08-25)",
    "classes": classes, "subclasses": subclasses, "ancestries": ancestries, "mixedAncestry": mixed,
    "communities": communities, "transformations": transformations, "domains": domains, "cards": cards,
    "weapons": weapons, "armor": armor, "items": items, "consumables": consumables, "beastforms": beastforms,
    "adversaries": adversaries, "environments": environments,
}
for x in weapons + armor:
    if x["feat"].strip() in ("—", "-", "–"): x["feat"] = ""
counts = {k: len(v) for k, v in data.items() if isinstance(v, list)}
print(json.dumps(counts))
for p in problems: print("PROBLEM:", p)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("/* Game content from the Daggerheart System Reference Document 2.0, © Critical Role, LLC, used under the\n"
            "   Darrington Press Community Gaming License (DPCGL). See ATTRIBUTION.md. Generated by tools/build_srd.py; don't edit by hand. */\n")
    f.write("var SRD = ")   # var, so it is also window.SRD for rules.js
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print("wrote", OUT, os.path.getsize(OUT), "bytes")
