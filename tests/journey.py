import asyncio, sys, os
from playwright.async_api import async_playwright
os.makedirs(sys.argv[2], exist_ok=True)
URL = "file://" + os.path.abspath(sys.argv[1]); OUT = sys.argv[2]; W = int(sys.argv[3]) if len(sys.argv) > 3 else 1280
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": W, "height": 900})
        errs = []
        pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        pg.on("console", lambda m: m.type == "error" and "ERR_FAILED" not in m.text and errs.append(m.text))
        await pg.route("**/fonts.g*/**", lambda r: r.abort())
        await pg.goto(URL); await pg.wait_for_timeout(800)
        shot = lambda n: pg.screenshot(path=f"{OUT}/{W}-{n}.png", full_page=True)
        async def click(sel, i=0): await pg.locator(sel).nth(i).click(); await pg.wait_for_timeout(120)
        async def pick(catalog_title, name):   # page through a catalog until the item shows, then choose it
            cat = pg.locator(f".catalog:has(.cat-title:has-text('{catalog_title}'))").first
            for _ in range(30):
                card = cat.locator(f".item-card:has-text('{name}')")
                if await card.count(): await card.first.click(); await pg.wait_for_timeout(120); return
                await cat.locator(".pager[aria-label='Next page']").click(); await pg.wait_for_timeout(80)
            raise Exception("not found in catalog: " + name)
        nxt = lambda: click(".g-arrow.next")
        # First visit as GM: choose the rulebooks (Core only)
        await shot("a0-books"); await click(".m-foot .btn.primary")
        await click("text=Create a character"); await click("text=Character creation")
        await pg.fill(".gs .field input >> nth=0", "Rowan Ashby"); await pg.fill(".gs .field input >> nth=1", "she/her")
        await nxt()
        print("classes offered (Core only):", await pg.locator(".pickcard").count())
        await click(".pickcard:has-text('Warrior')"); await click(".pickcard:has-text('Call of the Brave')"); await shot("g2-class")
        await nxt()
        await click(".pickcard:has-text('Human')"); await click(".pickcard:has-text('Ridgeborne')"); await nxt()
        for v, t in (("+2", "Strength"), ("+1", "Agility"), ("+1", "Instinct"), ("+0", "Finesse"), ("+0", "Knowledge"), ("−1", "Presence")):
            await click(f".val:has-text('{v}')"); await click(f".trait-wrap.pick:has-text('{t}') .trait")
        await shot("g4-traits"); await nxt()
        await pick("Primary weapon", "Longsword"); await pick("Armor", "Chainmail Armor"); await shot("g5-equip"); await nxt()
        await nxt()
        await click(".chip:has-text('Soldier')"); await click(".chip:has-text('Tracker')"); await nxt()
        await click(".dc >> nth=0 >> button:has-text('Choose')"); await click(".dc >> nth=1 >> button:has-text('Choose')"); await shot("g8-cards")
        await nxt(); await shot("g9-summary")
        await click(".g-arrow.finish"); await pg.wait_for_timeout(400)
        await shot("s1-sheet")
        # damage: 9 with an armor slot (Chainmail 8/16 at level 1 → Major 2 HP, minus 1 with armor)
        await pg.fill(".dmgcalc input", "9"); await pg.check(".dmgcalc input[type=checkbox]"); await pg.wait_for_timeout(100)
        print("severity text:", await pg.locator(".sev").inner_text())
        await click(".dmgcalc .btn.primary")
        hp = await pg.locator(".slot.hp.on").count(); arm = await pg.locator(".slot.armor.on").count(); print("HP marked", hp, "armor marked", arm)
        # right-click clears
        await pg.locator(".slot.hp.on").nth(0).click(button="right"); await pg.wait_for_timeout(150)
        print("HP after right-click", await pg.locator(".slot.hp.on").count())
        # duality roll
        await shot("s1b-sheet-top")
        await click(".dock-btn"); await click(".dock .chip:has-text('Strength')"); await click(".dock .btn.primary"); await shot("s2-roll")
        print("roll:", (await pg.locator(".rollres").inner_text()).replace("\n", " | "))
        await click(".dock .iconbtn")
        # short rest
        await click("button:has-text('Short rest')"); await click(".move:has-text('Clear Stress')"); await click(".move:has-text('Prepare')"); await click(".m-foot .btn.primary")
        # rules panel
        await click(".hlink:has-text('Damage & health')"); await shot("s3-rules"); await click(".spanel .iconbtn")
        # level up
        await click("button:has-text('Level up')"); await pg.fill(".lvsteps .field input", "Bodyguard")
        await click(".adv:has-text('Hit Point slot')"); await click(".adv:has-text('two unmarked traits')")
        await click(".pk .chip:has-text('Agility')"); await click(".pk .chip:has-text('Finesse')")
        await click(".lvsteps button:has-text('Choose a card')"); await click(".modal-back >> nth=1 >> .dc >> nth=0 >> button:has-text('Choose')")
        await shot("s4-levelup"); await click(".m-foot .btn.primary"); await pg.wait_for_timeout(300)
        print("level:", (await pg.locator(".lvl").inner_text()).replace("\n", " "), "| HP slots", await pg.locator(".track[aria-label='Hit Points'] .slot").count())
        print("thresholds:", (await pg.locator(".ruler .rl-bar").inner_text()).replace("\n", " "))
        await click(".tab[aria-label='Abilities']"); await shot("s5-abilities")
        await click(".tab[aria-label='Gear']"); await shot("s6-gear")
        await click(".tab[aria-label='Story']"); await click(".tab[aria-label='Data']"); await shot("s7-data")
        await click("button:has-text('+ Companion')"); await pg.wait_for_timeout(300); await shot("s8-companion")
        await click(".viewseg button:has-text('GM table')"); await pg.wait_for_timeout(200)
        await click("button:has-text('+ From the SRD')"); await pg.fill(".gm input[type=search]", "acid"); await click(".item-card:has-text('Acid Burrower') >> button:has-text('Add')")
        await click("button:has-text('+ Countdown')"); await shot("s9-gm")
        sw = await pg.evaluate("document.documentElement.scrollWidth"); print("scrollWidth", sw, "of", W)
        print("ERRORS:", errs or "none")
        await b.close()
        bad = []
        if errs: bad.append("page errors")
        if sw > W: bad.append(f"page scrolls sideways ({sw} > {W})")
        if (hp, arm) != (1, 1): bad.append("damage with an Armor Slot didn't mark 1 HP and 1 slot")
        if bad: print("FAILED:", "; ".join(bad)); sys.exit(1)
asyncio.run(main())
