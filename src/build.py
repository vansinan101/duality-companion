#!/usr/bin/env python3
"""Assemble the Duality Companion from src/.

  python3 src/build.py                 -> dist/duality-companion.html  (one file, saves in the browser; for previews)
  python3 src/build.py --web DIR       -> DIR/index.html + firestore.rules + README.md + ATTRIBUTION.md (+ firebase-config.js if missing)
  python3 src/build.py --web DIR --dev -> the same, marked DEV (red ribbon, "DEV" in the title)
Edit the files in src/, never the built HTML.
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
def rd(*p):
    with open(os.path.join(HERE, *p), encoding="utf-8") as f: return f.read()
def script(src): return "<script>\n" + src.replace("</script", "<\\/script") + "\n</script>\n"

APP_SCRIPTS = ["config.js", "srd-data.js", "rules.js", "rules-info.js", "app.js", "levelup.js", "genesis.js", "gm.js"]
VENDOR = ["vendor/preact.umd.js", "vendor/hooks.umd.js", "vendor/htm.umd.js"]
FIREBASE = "11.10.0"

def page(web, dev):
    css = rd("app.css")
    if dev:
        css = css.replace("<title>Duality Companion</title>", "<title>DEV · Duality Companion</title>", 1)
        css = css.replace("</style>", "body::before{content:'DEV';position:fixed;top:12px;left:-30px;z-index:200;background:#c62828;color:#fff;font:700 12px/22px sans-serif;width:110px;text-align:center;transform:rotate(-45deg);pointer-events:none}\n</style>", 1)
    out = ['<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + ('<meta name="robots" content="noindex, nofollow">\n' if web else ''), css, '\n<div id="app"></div>\n']
    if web:
        for m in ("app", "firestore", "auth"):
            out.append(f'<script src="https://www.gstatic.com/firebasejs/{FIREBASE}/firebase-{m}-compat.js"></script>\n')
    out += [script(rd(v)) for v in VENDOR]
    out.append(script(rd("config.js")))
    if web:
        out.append('<script src="firebase-config.js"></script>\n')
        out.append(script(rd("web-backend.js")))
    out += [script(rd(s)) for s in APP_SCRIPTS if s != "config.js"]
    return "".join(out) + "</html>\n"

def main(argv):
    dev = "--dev" in argv
    if "--web" in argv:
        d = argv[argv.index("--web") + 1]
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f: f.write(page(True, dev))
        for name in ("firestore.rules", "README.md"):
            shutil.copy(os.path.join(HERE, "web", name), os.path.join(d, name))
        shutil.copy(os.path.join(ROOT, "ATTRIBUTION.md"), os.path.join(d, "ATTRIBUTION.md"))
        cfg = os.path.join(d, "firebase-config.js")
        if not os.path.exists(cfg): shutil.copy(os.path.join(HERE, "web", "firebase-config.js"), cfg)   # never overwrite real settings
        print("built", os.path.join(d, "index.html"), os.path.getsize(os.path.join(d, "index.html")), "bytes")
    else:
        os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
        p = os.path.join(ROOT, "dist", "duality-companion.html")
        with open(p, "w", encoding="utf-8") as f: f.write(page(False, dev))
        print("built", p, os.path.getsize(p), "bytes")

if __name__ == "__main__": main(sys.argv[1:])
