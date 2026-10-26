"""Replace whole top-level functions in a JS file. Usage: swap.py file.js new_code.js
new_code.js holds full `function Name(...) {...}` blocks (or `const NAME = ...;` lines); each replaces the same-named one."""
import re, sys
path, newp = sys.argv[1], sys.argv[2]
s = open(path).read(); new = open(newp).read()
starts = [m.start() for m in re.finditer(r"^(?:function \w+|const [A-Z_]+ =|/\* =+)", new, re.M)] + [len(new)]
for a, b in zip(starts, starts[1:]):
    block = new[a:b].rstrip() + "\n"
    m = re.match(r"function (\w+)|const ([A-Z_]+) =", block)
    if not m: continue
    name = m.group(1) or m.group(2)
    pat = re.compile(r"^(function " + name + r"\(|const " + name + r" =)", re.M)
    hit = pat.search(s)
    if not hit: print("NEW (not found, appended):", name); s += "\n" + block; continue
    nxt = re.compile(r"^(?:function \w+|const [A-Z_]+ =|/\* =+|render\()", re.M).search(s, hit.end())
    end = nxt.start() if nxt else len(s)
    s = s[:hit.start()] + block + s[end:]
    print("replaced", name)
open(path, "w").write(s)
