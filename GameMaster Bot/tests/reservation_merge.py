"""The bot's reservation save never undoes the website's newer reservations.

The bot keeps its own copy of each game's reservations and hears about the
website's changes every 10 seconds. A save from an older copy used to rewrite
the table from that copy, so a player who had just reserved on the map
vanished until the next sync (2026-11-09). Now the save merges: only the
slots the bot itself changed since it last read the table are applied.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/reservation_merge.py"
"""
import importlib.util
import os
import sys

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


merge = gm._merge_reservations
P, Q, R = 1, 2, 3

# Niko's case: the host moved P to Yugoslavia; P then unreserved and took
# Germany on the map; meanwhile the bot saved something from its old copy.
base = {"Yugoslavia": P}
mine = {"Yugoslavia": P}  # the bot's copy, not yet synced
db = {"Germany": P}  # what the website wrote
check("a save from an old copy keeps the player's new nation", merge(db, base, mine) == {"Germany": P}, merge(db, base, mine))

# The host moves a player: that change still goes through.
base = {"Germany": P, "France": Q}
mine = {"Yugoslavia": P, "France": Q}
db = {"Germany": P, "France": Q, "Italy": R}  # R reserved on the map meanwhile
check("the host's move applies; another player's new reservation stays",
      merge(db, base, mine) == {"Yugoslavia": P, "France": Q, "Italy": R}, merge(db, base, mine))

# The bot frees a slot that someone else took on the map since: the newcomer stays.
base = {"Germany": P}
mine = {}
db = {"Germany": Q}
check("freeing a slot never removes someone who took it since", merge(db, base, mine) == {"Germany": Q}, merge(db, base, mine))

# The bot frees a slot nobody touched: it goes.
base = {"Germany": P, "France": Q}
mine = {"France": Q}
db = {"Germany": P, "France": Q}
check("a removal the website didn't touch goes through", merge(db, base, mine) == {"France": Q}, merge(db, base, mine))

# A player unreserved on the map; the bot's copy still has them: they stay off.
base = {"Germany": P}
mine = {"Germany": P}
db = {}
check("a website unreserve isn't undone by an old copy", merge(db, base, mine) == {}, merge(db, base, mine))

# Base is noted only from real reservation data.
gm._reservation_base.clear()
gm._game_row_to_dict({"thread_id": "9", "game_data": "{}"}, None)
check("no base from a row without reservations", "9" not in gm._reservation_base)
gm._game_row_to_dict({"thread_id": "9", "game_data": "{}"}, {"Germany": "1"})
check("base noted from loaded reservations", gm._reservation_base.get("9") == {"Germany": 1}, gm._reservation_base.get("9"))

# The Host Tool's placement lock (players can't undo a host's move themselves).
game = {}
gm._host_lock(game, 5, keep=False)
until = game["host_locks"]["5"]
check("a placed player is locked for 30 s", 0 < until - int(gm.time.time()) <= gm.HOST_PLACE_LOCK_SEC, until)
gm._host_lock(game, 6, keep=True)
check("'keep where I put them' locks until a host changes it", game["host_locks"]["6"] == 0)
game["host_locks"]["7"] = int(gm.time.time()) - 5
gm._host_lock(game, 8, keep=False)
check("expired locks are tidied away", "7" not in game["host_locks"] and "6" in game["host_locks"], game["host_locks"])
gm._host_unlock(game, 6)
check("a host removing the player lifts the lock", "6" not in game["host_locks"])

print("\n".join(results))
passed = sum(1 for line in results if line.startswith("PASS"))
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
