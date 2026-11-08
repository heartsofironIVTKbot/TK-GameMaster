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


fortune_rows = {}
fortune_ops = []


async def run_mysql(fn, *args, label=None):
    if fn is gm._insert_casino_grant_request_sync:
        grants.append({"request_id": args[0], "game": args[1], "target": args[2], "host": args[3], "mode": args[4], "payload": args[5]})
        return None
    if fn is gm._fortunes_row_sync:
        return fortune_rows.get(int(args[1]))
    if fn is gm._fortunes_tool_update_sync:
        fortune_ops.append((args[0], int(args[1]), args[2]))
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
gm._member_is_senior_team = lambda member: bool(getattr(member, "staff", False))
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

    # Emergency Unreserve (step 6): the player leaves for good, with a reason.
    def leave(uid, reason="Family emergency, can't make it"):
        return gm._process_web_casino_emergency_unreserve({"action": "casino_emergency_unreserve", "host_id": uid, "payload": {"thread_id": GAME, "reason": reason}})

    reset()
    ok, _, err = await leave(BOB, "no")
    check("EU: a reason is required", ok is False and "why you're leaving" in (err or "") and store[GAME]["reservations"].get("Germany") == BOB, err)
    ok, _, err = await leave(ALICE)
    check("EU: refused without a nation", ok is False and "don't have a nation" in (err or ""), err)
    ok, result, err = await leave(BOB, "  Family   emergency,\n can't make it  ")
    check("EU: done", ok is True and result == {"unreserved": "Germany"}, err)
    check("EU: nation freed", "Germany" not in store[GAME]["reservations"])
    check("EU: blocked from rolling again", gm._is_emergency_unreserved_blocked(store[GAME], BOB))
    check("EU: reason kept (tidied) for the host's warning", store[GAME]["randomizer_unreserve_reasons"].get(str(BOB)) == "Family emergency, can't make it", store[GAME].get("randomizer_unreserve_reasons"))
    check("EU: web run purged (receipt gone)", dropped == [BOB], dropped)
    check("EU: host and co-host DM'd", sorted(d["to"] for d in dms) == [HOST, COHOST] and all(d["title"] == "🚨 Emergency Unreserve" for d in dms), dms)
    ok, _, err = await leave(BOB)
    check("EU: no second time", ok is False and "already used" in (err or ""), err)
    ok, result, _ = await gm._process_web_roster_assign(request("roster_assign", HOST, {"user_id": str(BOB), "kind": "nation", "nation": "France"}))
    check("EU: the host's Add warns with their reason", ok == gm.WEB_REQUEST_CONFIRM and "Family emergency, can't make it" in " ".join(result.get("warnings", [])), result)
    reset()
    store[GAME]["game_started"] = True
    ok, _, err = await leave(BOB)
    check("EU: closed once the game starts", ok is False and "started or ended" in (err or ""), err)
    reset()
    store[GAME]["randomizer_only"] = False
    ok, _, err = await leave(BOB)
    check("EU: only on Casino games", ok is False and "only for Casino games" in (err or "") and store[GAME]["reservations"].get("Germany") == BOB, err)

    # Fortunes of War (step 7).
    check("Fortunes redraws: casual majors 2, minors 1", gm._fortunes_base_redraws("casual", True) == 2 and gm._fortunes_base_redraws("casual", False) == 1)
    check("Fortunes redraws: competitive majors 1, minors 0", gm._fortunes_base_redraws("competitive", True) == 1 and gm._fortunes_base_redraws("competitive", False) == 0)
    fortunes_game = {
        "mode": "Roleplay", "host_id": HOST, "co_hosts": [str(COHOST)], "fortunes_only": True,
        "reservations": {"Germany": BOB, "Germany_coop": ALICE, "_FILL_Filler": CAROL, "Belgium": STAFF},
    }
    players = gm._fortunes_players(fortunes_game)
    check("Fortunes sync: the main holder, tag and major", players.get(str(BOB)) == {"nation": "Germany", "tag": "GER", "priority": 3, "major": True}, players.get(str(BOB)))
    check("Fortunes sync: a co-op shares the tag, lower priority", players.get(str(ALICE), {}).get("tag") == "GER" and players[str(ALICE)]["priority"] == 2)
    check("Fortunes sync: a minor", players.get(str(STAFF)) == {"nation": "Belgium", "tag": "BEL", "priority": 3, "major": False}, players.get(str(STAFF)))
    check("Fortunes sync: fillers draw no card", str(CAROL) not in players)

    def fortunes_tool(action, actor, uid):
        return gm._process_web_fortunes_tool({"action": action, "host_id": actor, "payload": {"thread_id": GAME, "user_id": str(uid)}})

    def fortunes_reset():
        reset()
        store[GAME] = {**fresh_game(), "randomizer_only": False, "fortunes_only": True, "reservations": {"Germany": BOB}}
        fortune_rows.clear()
        fortune_rows[BOB] = {"nation": "Germany", "state": "locked", "card_name": "Blitzkrieg", "max_redraws": 2, "redraws_used": 2}
        fortune_ops.clear()

    fortunes_reset()
    ok, result, err = await fortunes_tool("fortunes_redraw", COHOST, BOB)
    check("Fortunes: a co-host gives a redraw", ok is True and fortune_ops == [(GAME, BOB, "redraw")], err)
    check("Fortunes: the player is DM'd a GameMaster link", result.get("dm_sent") is True and dms and dms[-1]["to"] == BOB and dms[-1]["url"].endswith(f"/casino/{GAME}"), dms)
    fortunes_reset()
    ok, _, err = await fortunes_tool("fortunes_reset", HOST, BOB)
    check("Fortunes: the host resets a card", ok is True and fortune_ops == [(GAME, BOB, "reset")], err)
    fortunes_reset()
    ok, _, err = await fortunes_tool("fortunes_redraw", OTHER_HOST, BOB)
    check("Fortunes: another host is refused", ok is False and not fortune_ops, err)
    fortunes_reset()
    ok, _, err = await fortunes_tool("fortunes_redraw", HOST, ALICE)
    check("Fortunes: no nation, no card to change", ok is False and "no nation" in (err or "") and not fortune_ops, err)
    fortunes_reset()
    store[GAME]["game_started"] = True
    ok, _, err = await fortunes_tool("fortunes_reset", HOST, BOB)
    check("Fortunes: sealed once the game starts", ok is False and "sealed" in (err or "") and not fortune_ops, err)
    reset()
    ok, _, err = await fortunes_tool("fortunes_redraw", HOST, BOB)
    check("Fortunes: refused on a Casino game", ok is False and "isn't a Fortunes" in (err or ""), err)

    # The Casino is down: the host switches the game to normal reserving (step 8).
    class FakeMessage:
        def __init__(self, content):
            self.content = content

        async def edit(self, content=None, **kwargs):
            self.content = content

    announcement = FakeMessage(
        "# Game Announcement\n" f"**:pencil: Roll at the Casino - {gm._casino_game_url(GAME)}**"
    )

    class FakeChannel:
        async def fetch_message(self, message_id):
            return announcement

    gm.bot.get_channel = lambda channel_id: FakeChannel()

    def fallback(actor):
        return gm._process_web_casino_fallback({"action": "casino_fallback", "host_id": actor, "payload": {"thread_id": GAME}})

    reset()
    store[GAME].update(announcement_message_id=777, announcement_channel_id=888)
    ok, _, err = await fallback(COHOST)
    check("Fallback: a co-host can't switch the game", ok is False and store[GAME]["randomizer_only"] is True, err)
    ok, result, err = await fallback(HOST)
    check("Fallback: the host switches it", ok is True and store[GAME]["randomizer_only"] is False and store[GAME].get("add_on") is None, err)
    check("Fallback: remembered what it was", store[GAME].get("casino_fallback", {}).get("add_on") == "randomizer")
    check("Fallback: reservations kept", store[GAME]["reservations"].get("Germany") == BOB)
    check("Fallback: the announcement now links the map", gm._map_game_url(GAME) in announcement.content and "Reserve Here" in announcement.content and gm._casino_game_url(GAME) not in announcement.content, announcement.content)
    check("Fallback: the result says so", "normal reserving" in result["access"]["title"])
    ok, _, err = await fallback(HOST)
    check("Fallback: a normal game can't be switched again", ok is False and "doesn't use the Casino" in (err or ""), err)
    reset()
    store[GAME]["game_started"] = True
    ok, _, err = await fallback(HOST)
    check("Fallback: not once the game has started", ok is False and store[GAME]["randomizer_only"] is True, err)

    # Normal games are untouched.
    reset()
    store[GAME]["randomizer_only"] = False
    check("normal games aren't Casino games", gm._is_casino_game_dict(store[GAME]) is False)


asyncio.run(main())
print("\n".join(results))
passed = sum(1 for line in results if line.startswith("PASS"))
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
