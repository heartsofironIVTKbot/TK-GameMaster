"""The home server's game modes keep their own mod and rule links.

2026-11-12: the bot joined TommyKay (the home server) while running and gave
it a new server's blank lists (public mods only, no rulesets), so a preset on
"the mode's usual list" announced without TommyKay's submod and ruleset.
Startup now restores modes still on those blank lists; edited modes stay.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/home_mode_links.py"
"""
import copy
import importlib.util
import os

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


seed = gm._HOME_MODE_SEED
check("the bot has its own Roleplay lists", bool(seed.get("Roleplay", {}).get("rule_links")), seed.get("Roleplay"))
names = lambda links: [e["name"] for e in links]
check("they include TommyKay's submod and the ruleset",
      "TommyKay R56RP Submod" in names(seed["Roleplay"]["mod_links"]) and names(seed["Roleplay"]["rule_links"]) == ["Road to 56 Ruleset"],
      seed["Roleplay"])

# A new server's blank settings (what the join wrote for TommyKay).
blank = gm._default_guild_settings("TommyKay")
check("a new server's Roleplay has no TommyKay submod and no rules",
      "TommyKay R56RP Submod" not in names(blank["modes"]["Roleplay"]["mod_links"]) and blank["modes"]["Roleplay"]["rule_links"] == [],
      blank["modes"]["Roleplay"])
left = gm._home_modes_left_blank(blank)
check("every built-in mode on blank lists is found", "Roleplay" in left and "Historical (Vanilla)" in left and "TFR" in left, left)

# A host edited one mode afterwards: it stays as they left it.
edited = copy.deepcopy(blank)
edited["modes"]["TFR"]["rule_links"] = [{"name": "Our TFR rules", "link": "https://example.com/tfr"}]
edited["modes"]["Kaiserreich (FFA)"]["mod_links"] = [{"name": "Kaiserreich", "link": "https://example.com/kr"}]
left = gm._home_modes_left_blank(edited)
check("a mode with its own rules is left alone", "TFR" not in left, left)
check("a mode with changed mods is left alone", "Kaiserreich (FFA)" not in left, left)
check("the others are still restored", "Roleplay" in left, left)

# Already the bot's own lists: nothing to do.
full = gm._fresh_home_settings("TommyKay")
check("the home server's first settings carry the full lists",
      names(full["modes"]["Roleplay"]["rule_links"]) == ["Road to 56 Ruleset"], full["modes"]["Roleplay"])
check("full lists need no repair", gm._home_modes_left_blank(full) == [], gm._home_modes_left_blank(full))

for line in results:
    print(line)
passed = sum(line.startswith("PASS") for line in results)
print(f"{passed}/{len(results)} passed")
raise SystemExit(0 if passed == len(results) else 1)
