"""The Host Tool on Casino games (docs/casino-integration.md, step 5).

Loads bot.py.py without starting the bot or touching any database: the game
store, Discord members, DMs, tokens and the override table are faked. Checks
who may use it (the game's host, its co-hosts, Host Management; not other
hosts), that Casino games never move or swap players, the Casino link each
action DMs (a fresh run on a fixed nation with the game's re-rolls, a random
nation, or extra rolls for some rooms), Emergency Unreserve / host-removed
warnings, and removal (receipt purged, kept out until a host adds them).

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/casino_tools.py"
"""
import asyncio
import base64
import importlib.util
import json
import os
import sys

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

GAME = "1300000000000000001"
HOST, COHOST, OTHER_HOST, STAFF = 501, 502, 503, 504
ALICE, BOB, CAROL = 601, 602, 603
results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


class Member:
    def __init__(self, uid, name, staff=False):
        self.id = uid
        self.display_name = name
        self.name = name.lower()
        self.staff = staff


MEMBERS = {uid: Member(uid, name, staff=(uid == STAFF)) for uid, name in [
    (HOST, "Host"), (COHOST, "Cohost"), (OTHER_HOST, "Other"), (STAFF, "Staff"),
    (ALICE, "Alice"), (BOB, "Bob"), (CAROL, "Carol"),
]}


def fresh_game():
    return {
        "mode": "Roleplay",
        "host_id": HOST,
        "co_hosts": [str(COHOST)],
        "randomizer_only": True,
        "status": None,
        "game_started": False,
        "reservations": {"Germany": BOB},
        "randomizer_unreserved": [CAROL],
        "randomizer_unreserve_reasons": {str(CAROL): "family emergency"},
        "casino_settings": {
            "randomizers": {
                "nation": {"enabled": True, "rerolls": {"major": 0, "minor": 0}},
                "ideology": {"enabled": True, "rerolls": {"major": 2, "minor": 1}},
                "path": {"enabled": False, "rerolls": {"major": 5, "minor": 5}},
                "doctrine": {"enabled": True, "rerolls": {"major": 1, "minor": 0}},
                "build": {"enabled": True, "rerolls": {"land": {"major": 1, "minor": 0}, "navyAir": {"major": 3, "minor": 2}}},
                "achievements": {"enabled": False, "rerolls": {"major": 0, "minor": 0}},
            },
        },
    }


store = {}
grants = []
dms = []
notes = []
dropped = []


async def read_games():
    return store


async def save_game(key, game, rewrite_reservations=False):
    store[key] = game


async def run_mysql(fn, *args, label=None):
    if fn is gm._insert_casino_grant_request_sync:
        grants.append({"request_id": args[0], "game": args[1], "target": args[2], "host": args[3], "mode": args[4], "payload": args[5]})
        return None
    return None


async def fetch_member(uid):
    return MEMBERS.get(int(uid))


async def make_token(uid, **kwargs):
    return f"tok-{uid}-{kwargs.get('ttl_seconds')}-{int(bool(kwargs.get('is_grant')))}"


async def dm(member, embed=None, view=None, label=""):
    url = view.children[0].url if view and view.children else None
    dms.append({"to": member.id, "title": embed.title if embed else None, "url": url, "label": label})
    return True


async def notify(member, game, key, actor, *, title, text, color, label):
    notes.append({"to": getattr(member, "id", None), "title": title, "text": text})
    return True


async def drop_state(key, uid):
    dropped.append(uid)


async def nothing(*args, **kwargs):
    return None


gm._read_games_fresh = read_games
gm.save_single_game = save_game
gm._run_mysql_io = run_mysql
gm._web_fetch_member = fetch_member
gm._generate_web_access_token = make_token
gm._dm_user_safe = dm
gm._roster_notify_player = notify
gm._roster_drop_player_state = drop_state
gm._roster_after_change = nothing
gm.audit_event = lambda *args, **kwargs: None
gm._audit_log = lambda *args, **kwargs: None
gm._audit_who = lambda uid: MEMBERS.get(int(uid)).display_name if MEMBERS.get(int(uid)) else None
gm._member_is_host = lambda member: member is not None
gm._member_is_staff = lambda member: bool(getattr(member, "staff", False))
gm._member_identity_flags = lambda member: (member.name, False)
gm._live_role_flags = lambda member: {"can_roll_majors": True, "role_tier": 1, "is_vip": False, "is_trusted": True, "is_verified": True, "is_authenticated": False}
gm._roster_valid_nations = lambda mode: ["Germany", "France", "Belgium", "Italy"]
gm.is_major = lambda nation, mode: nation in ("Germany", "France", "Italy")


def config_of(url):
    encoded = url.split("&config=", 1)[1]
    return json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))


def request(action, actor, payload):
    return {"action": action, "host_id": actor, "payload": {"thread_id": GAME, **payload}}


async def main():
    def reset():
        store.clear()
        store[GAME] = fresh_game()
        grants.clear()
        dms.clear()
        notes.clear()
        dropped.clear()

    # Who may use it.
    reset()
    ok, _, err = await gm._process_web_roster_assign(request("roster_assign", OTHER_HOST, {"user_id": str(ALICE), "kind": "nation", "nation": "France"}))
    check("another game's host is refused", ok is False and "co-hosts" in (err or ""), err)
    check("  and nothing changed", "France" not in store[GAME]["reservations"])
    for who, name in ((HOST, "the game's host"), (COHOST, "a co-host"), (STAFF, "Host Management")):
        reset()
        ok, _, err = await gm._process_web_roster_assign(request("roster_assign", who, {"user_id": str(ALICE), "kind": "nation", "nation": "France"}))
        check(f"{name} can add a player", ok is True and store[GAME]["reservations"].get("France") == ALICE, err)

    # Add: a fresh run on that nation, the game's re-rolls for a major, by DM.
    reset()
    ok, result, err = await gm._process_web_roster_assign(request("roster_assign", COHOST, {"user_id": str(ALICE), "kind": "nation", "nation": "France"}))
    check("add: done, DM sent", ok is True and result.get("dm_sent") is True, err)
    check("add: one grant recorded, fresh", len(grants) == 1 and grants[0]["mode"] == "fresh" and grants[0]["target"] == ALICE)
    cfg = config_of(dms[0]["url"]) if dms else {}
    check("add: link fixes the nation", cfg.get("nation") == "France", cfg)
    check("add: only the rooms that are on", [k for k in gm._CASINO_ROOMS if cfg.get(k)] == ["ideology", "doctrine", "build"], cfg)
    check("add: major re-rolls per stage (build = larger reel)", json.loads(cfg.get("stageRedraws", "{}")) == {"1": 2, "2": 1, "3": 3}, cfg.get("stageRedraws"))
    check("add: link is a 24-hour grant", "-86400-1" in (dms[0]["url"] if dms else ""), dms[0]["url"] if dms else None)
    check("add: the override key matches the record", cfg.get("overrideKey") == grants[0]["request_id"] if grants else False)

    reset()
    await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(ALICE), "kind": "nation", "nation": "Belgium"}))
    cfg = config_of(dms[0]["url"]) if dms else {}
    check("add: a minor gets the minor re-rolls", json.loads(cfg.get("stageRedraws", "{}")) == {"1": 1, "2": 0, "3": 2}, cfg.get("stageRedraws"))

    # Never a move or a swap.
    reset()
    ok, _, err = await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(ALICE), "kind": "nation", "nation": "Germany", "occupied": "swap"}))
    check("taken nation: refused, no swap", ok is False and "never swap" in (err or "") and store[GAME]["reservations"]["Germany"] == BOB, err)
    ok, _, err = await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(BOB), "kind": "nation", "nation": "France"}))
    check("player with a nation: refused, no move", ok is False and "remove them first" in (err or "") and "France" not in store[GAME]["reservations"], err)
    ok, _, err = await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(ALICE), "kind": "filler", "nation": None, "filler_name": "x"}))
    check("fillers / co-ops refused", ok is False and "only have nations" in (err or ""), err)

    # Emergency Unreserve: the host is warned, then may add them back.
    reset()
    ok, result, _ = await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(CAROL), "kind": "nation", "nation": "Italy"}))
    check("EU player: a warning first, with their reason", ok == gm.WEB_REQUEST_CONFIRM and "family emergency" in " ".join(result.get("warnings", [])), result)
    ok, _, _ = await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(CAROL), "kind": "nation", "nation": "Italy", "force": True}))
    check("EU player: 'Add anyway' adds them and lifts the block", ok is True and store[GAME]["reservations"].get("Italy") == CAROL and CAROL not in store[GAME]["randomizer_unreserved"])

    # Remove: receipt purged, kept out, DM'd.
    reset()
    ok, result, err = await gm._process_web_roster_remove(request("roster_remove", COHOST, {"user_id": str(BOB)}))
    check("remove: done", ok is True and result.get("removed") == "Germany", err)
    check("remove: nation freed", "Germany" not in store[GAME]["reservations"])
    check("remove: web run purged (receipt gone)", dropped == [BOB], dropped)
    check("remove: kept out until a host adds them", str(BOB) in store[GAME]["casino_host_removed"])
    check("remove: DM'd", notes and notes[0]["to"] == BOB and "receipt" in notes[0]["text"], notes)
    reset()
    ok, _, err = await gm._process_web_roster_remove(request("roster_remove", OTHER_HOST, {"user_id": str(BOB)}))
    check("remove: another host is refused", ok is False and store[GAME]["reservations"].get("Germany") == BOB, err)
    reset()
    await gm._process_web_roster_remove(request("roster_remove", HOST, {"user_id": str(BOB)}))
    ok, result, _ = await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(BOB), "kind": "nation", "nation": "France"}))
    check("re-adding a removed player warns", ok == gm.WEB_REQUEST_CONFIRM and "removed" in " ".join(result.get("warnings", [])), result)

    # Give a roll: random nation, whole run.
    reset()
    ok, result, err = await gm._process_web_casino_grant(request("casino_roll", HOST, {"user_id": str(ALICE)}))
    cfg = config_of(dms[0]["url"]) if dms else {}
    check("roll: done, DM'd", ok is True and result.get("dm_sent") is True, err)
    check("roll: nation by the wheel, fresh", cfg.get("nation") == "random" and cfg.get("overrideMode") == "fresh", cfg)
    check("roll: re-rolls are the larger of major / minor", json.loads(cfg.get("stageRedraws", "{}")) == {"1": 2, "2": 1, "3": 3}, cfg.get("stageRedraws"))
    check("roll: no reservation until they roll", "France" not in store[GAME]["reservations"] and len(store[GAME]["reservations"]) == 1)
    reset()
    ok, _, err = await gm._process_web_casino_grant(request("casino_roll", HOST, {"user_id": str(BOB)}))
    check("roll: refused for a player with a nation", ok is False and "extra rolls" in (err or ""), err)
    reset()
    store[GAME]["casino_settings"]["randomizers"]["nation"]["enabled"] = False
    ok, _, err = await gm._process_web_casino_grant(request("casino_roll", HOST, {"user_id": str(ALICE)}))
    check("roll: refused when the nation wheel is off", ok is False and "doesn't roll nations" in (err or ""), err)

    # Extra rolls: only the asked rooms that are on, partial, the count each.
    reset()
    ok, _, err = await gm._process_web_casino_grant(request("casino_extra", COHOST, {"user_id": str(BOB), "rooms": ["ideology", "path", "build"], "count": 3}))
    cfg = config_of(dms[0]["url"]) if dms else {}
    check("extra: done", ok is True, err)
    check("extra: partial, no nation", cfg.get("overrideMode") == "partial" and "nation" not in cfg, cfg)
    check("extra: path is off so it's dropped", [k for k in gm._CASINO_ROOMS if cfg.get(k)] == ["ideology", "build"], cfg)
    check("extra: the count per stage", json.loads(cfg.get("stageRedraws", "{}")) == {"1": 3, "3": 3}, cfg.get("stageRedraws"))
    reset()
    ok, _, err = await gm._process_web_casino_grant(request("casino_extra", HOST, {"user_id": str(ALICE), "rooms": ["ideology"], "count": 1}))
    check("extra: refused for a player without a nation", ok is False and "no nation" in (err or ""), err)
    reset()
    ok, _, err = await gm._process_web_casino_grant(request("casino_extra", HOST, {"user_id": str(BOB), "rooms": ["path"], "count": 1}))
    check("extra: refused when no asked room is on", ok is False and "at least one room" in (err or ""), err)
    reset()
    ok, _, err = await gm._process_web_casino_grant(request("casino_extra", OTHER_HOST, {"user_id": str(BOB), "rooms": ["ideology"], "count": 1}))
    check("extra: another host is refused", ok is False and "co-hosts" in (err or ""), err)
    reset()
    store[GAME]["game_started"] = True
    ok, _, err = await gm._process_web_casino_grant(request("casino_roll", HOST, {"user_id": str(ALICE)}))
    check("a started game: no more rolls", ok is False and "closed" in (err or ""), err)

    # Normal games are untouched.
    reset()
    store[GAME]["randomizer_only"] = False
    check("normal games aren't Casino games", gm._is_casino_game_dict(store[GAME]) is False)


asyncio.run(main())
print("\n".join(results))
passed = sum(1 for line in results if line.startswith("PASS"))
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
