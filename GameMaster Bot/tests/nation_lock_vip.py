"""Nation locks from the website (Games page / the map's Host Tool), with the
"VIPs can still reserve it" choice: game_data.vip_open_regions lists the
locked nations VIPs may still reserve (the website's reserve route reads it;
everything else treats them as locked). 2026-11-12.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/nation_lock_vip.py"
"""
import asyncio
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


HOST = 111111
GAME = "900000000000000001"
STORE = {}


class Member:
    def __init__(self, uid):
        self.id = uid
        self.display_name = "Host"


async def _read_games_fresh():
    return copy.deepcopy(STORE)


async def save_single_game(key, game, rewrite_reservations=False):
    STORE[key] = copy.deepcopy(game)


async def _web_fetch_member(uid):
    return Member(int(uid))


gm._read_games_fresh = _read_games_fresh
gm.save_single_game = save_single_game
gm._web_fetch_member = _web_fetch_member
gm._member_is_host = lambda member: True
gm._can_end_assigned_game = lambda member, game: True
gm._get_mode_nation_data = lambda mode: (["Germany", "France", "Italy"], [])
gm.schedule_reservation_update = lambda key: None
gm.mark_live_post_dirty = lambda key: None
gm._audit_log = lambda *a, **k: None


def fresh(**extra):
    STORE.clear()
    STORE[GAME] = {"mode": "Roleplay", "status": "announced", "reservations": {}, **extra}


def run(**payload):
    req = {"action": "game_access", "host_id": HOST, "payload": {"thread_id": GAME, **payload}}
    return asyncio.run(gm._process_web_game_access(req))


def state():
    game = STORE[GAME]
    return game.get("locked_regions") or [], game.get("vip_open_regions") or []


# Lock for everyone (as before).
fresh()
ok, result, err = run(op="nation_lock", nation="germany")
check("a lock for everyone works", ok and state() == (["Germany"], []), (ok, err, state()))
check("its summary says it can't be reserved", ok and "can't be reserved" in result["access"]["summary"], result)
ok, _, err = run(op="nation_lock", nation="Germany")
check("locking it again the same way is refused", not ok and "already locked" in (err or ""), err)

# VIPs excepted.
fresh()
ok, result, err = run(op="nation_lock", nation="France", vip_exempt=True)
check("a lock with VIPs excepted works", ok and state() == (["France"], ["France"]), (ok, err, state()))
check("its summary names VIPs", ok and "VIP" in result["access"]["title"], result)
ok, _, err = run(op="nation_lock", nation="France", vip_exempt=True)
check("the same VIP lock again is refused", not ok and "already locked" in (err or ""), err)

# Switching an existing lock between the two kinds.
ok, _, err = run(op="nation_lock", nation="France", vip_exempt=False)
check("a VIP lock becomes a lock for everyone", ok and state() == (["France"], []), (ok, err, state()))
ok, _, err = run(op="nation_lock", nation="France", vip_exempt=True)
check("and back to VIPs excepted", ok and state() == (["France"], ["France"]), (ok, err, state()))

# Unlocking clears both lists.
ok, _, err = run(op="nation_unlock", nation="france")
check("unlocking clears the VIP list too", ok and state() == ([], []), (ok, err, state()))

# A stale VIP entry (its nation unlocked elsewhere, e.g. a timed release) is dropped.
fresh(locked_regions=["Italy"], vip_open_regions=["Germany"])
ok, _, err = run(op="nation_lock", nation="Italy", vip_exempt=True)
check("stale VIP entries are dropped", ok and state() == (["Italy"], ["Italy"]), (ok, err, state()))

# A preset's not-playable nation can't be given a VIP lock.
fresh(locked_regions=["Italy"], layout_disabled_nations=["Italy"])
ok, _, err = run(op="nation_lock", nation="Italy", vip_exempt=True)
check("a not-playable nation can't be VIP-opened", not ok and "isn't playable" in (err or ""), err)

# Unknown nations are still refused.
fresh()
ok, _, err = run(op="nation_lock", nation="Atlantis", vip_exempt=True)
check("an unknown nation is refused", not ok and "isn't a nation" in (err or ""), err)

for line in results:
    print(line)
passed = sum(line.startswith("PASS") for line in results)
print(f"{passed}/{len(results)} passed")
raise SystemExit(0 if passed == len(results) else 1)
