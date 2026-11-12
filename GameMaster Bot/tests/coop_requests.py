"""Co-op requests from the map: ask, withdraw, and the nation's player answers.

A player picks a major someone holds and presses Request co-op; the nation's
player gets a DM (and a pop-up on the map) to accept or decline. Accepting
puts the requester on the next free co-op slot (2026-11-11).

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/coop_requests.py"
"""
import asyncio
import copy
import importlib.util
import os
import time

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


OWNER, ASKER, OTHER, THIRD = 111111, 222222, 333333, 444444
GAME = "900000000000000001"


class Member:
    def __init__(self, uid, name):
        self.id = uid
        self.display_name = name


MEMBERS = {OWNER: Member(OWNER, "Otto"), ASKER: Member(ASKER, "Erwin"), OTHER: Member(OTHER, "Ivan"), THIRD: Member(THIRD, "Tom")}
STORE = {}
DMS = []
SAVES = []
LEVEL_OK = {"value": True}

# Stand-ins for Discord and the database.
gm.get_major_nations_for_mode = lambda mode: ["Germany", "Italy", "Soviet Union"]
gm.is_locked_for_mode = lambda nation, mode, locked: nation in (locked or [])
gm._member_meets_lock_level = lambda member, level, cfg: LEVEL_OK["value"]


async def _read_games_fresh():
    return copy.deepcopy(STORE)


async def save_single_game(key, game, rewrite_reservations=False):
    STORE[key] = copy.deepcopy(game)
    SAVES.append((key, rewrite_reservations))


async def _web_fetch_member(uid):
    return MEMBERS.get(int(uid))


async def _dm_user_safe(user, *, content=None, embed=None, view=None, label=""):
    DMS.append((user.id, content, view))
    return True


async def _yes(*args, **kwargs):
    return True


async def _nothing(*args, **kwargs):
    return None


REAL_SAVE = gm.save_single_game
gm._read_games_fresh = _read_games_fresh
gm.save_single_game = save_single_game
gm._web_fetch_member = _web_fetch_member
gm._dm_user_safe = _dm_user_safe
gm.is_user_authenticated = _yes
gm._roster_after_change = _nothing
gm._roster_send_mode_info_dm = _nothing
gm.audit_event = lambda *a, **k: None
gm._audit_log = lambda *a, **k: None


def fresh_game(**extra):
    STORE.clear()
    DMS.clear()
    SAVES.clear()
    LEVEL_OK["value"] = True
    STORE[GAME] = {"mode": "Roleplay", "status": "announced", "reservations": {"Germany": OWNER, "France": OTHER}, **extra}


def run(action, actor, **payload):
    req = {"action": action, "host_id": actor, "payload": {"thread_id": GAME, **payload}}
    return asyncio.run(gm._process_web_coop(req))


# --- Asking ---
fresh_game()
ok, result, err = run("coop_request", ASKER, nation="germany")
check("a request for a held major is accepted", ok and result == {"coop": "pending", "nation": "Germany"}, (ok, result, err))
entry = STORE[GAME]["coop_requests"].get(str(ASKER), {})
check("it is kept on the game with the owner and the asker's name",
      entry.get("owner") == str(OWNER) and entry.get("name") == "Erwin" and entry.get("status") == "pending", entry)
check("the owner gets a DM with Accept / Decline", len(DMS) == 1 and DMS[0][0] == OWNER and DMS[0][2] is not None, DMS)
customs = [getattr(item, "custom_id", "") for item in DMS[0][2].children] if DMS else []
check("the DM buttons carry server, game and asker",
      any(c.startswith("gmcoop:") and c.endswith(f":accept:{GAME}:{ASKER}") for c in customs), customs)
check("asking doesn't touch the reservations", SAVES == [(GAME, False)], SAVES)

fresh_game()
ok, _, err = run("coop_request", ASKER, nation="Italy")
check("a free major can't be co-oped (reserve it instead)", not ok and "no player yet" in err, err)
ok, _, err = run("coop_request", ASKER, nation="France")
check("a minor can't be co-oped", not ok and "only for major" in err, err)
ok, _, err = run("coop_request", OTHER, nation="Germany")
check("a player who has a nation can't ask", not ok and "You already have a nation" in err, err)
ok, _, err = run("coop_request", OWNER, nation="Germany")
check("the owner can't ask for their own nation", not ok and "already yours" in err, err)

fresh_game(game_started=True)
ok, _, err = run("coop_request", ASKER, nation="Germany")
check("no requests once the game has started", not ok and "started" in err, err)

fresh_game(locked_regions=["Germany"])
ok, _, err = run("coop_request", ASKER, nation="Germany")
check("a locked nation can't be co-oped", not ok and "locked" in err, err)

fresh_game()
STORE[GAME]["reservations"].update({"Germany_coop": OTHER, "Germany_coop_2": THIRD})
STORE[GAME]["reservations"].pop("France")
ok, _, err = run("coop_request", ASKER, nation="Germany")
check("full co-op slots refuse the request", not ok and "co-op slots" in err, err)

fresh_game()
LEVEL_OK["value"] = False
ok, _, err = run("coop_request", ASKER, nation="Germany")
check("the game's major lock level applies to co-ops", not ok and "players" in err, err)

# --- Withdrawing ---
fresh_game()
run("coop_request", ASKER, nation="Germany")
ok, result, _ = run("coop_cancel", ASKER)
check("the asker can withdraw", ok and result == {"coop": "withdrawn"} and STORE[GAME]["coop_requests"][str(ASKER)]["status"] == "withdrawn", result)
ok, result, err = run("coop_decide", OWNER, user_id=str(ASKER), approve=True)
check("a withdrawn request can't be accepted", not ok and "isn't waiting" in err, err)

# --- Answering ---
fresh_game()
run("coop_request", ASKER, nation="Germany")
ok, _, err = run("coop_decide", OTHER, user_id=str(ASKER), approve=True)
check("only the nation's player can answer", not ok and "Only the player on" in err, err)

DMS.clear()
ok, result, err = run("coop_decide", OWNER, user_id=str(ASKER), approve=False)
check("declining works", ok and result.get("coop") == "declined", (ok, result, err))
check("the asker hears about it", any(uid == ASKER and "declined" in text for uid, text, _ in DMS), DMS)
check("declining adds no one", "Germany_coop" not in STORE[GAME]["reservations"], STORE[GAME]["reservations"])

fresh_game()
run("coop_request", ASKER, nation="Germany")
SAVES.clear()
DMS.clear()
ok, result, err = run("coop_decide", OWNER, user_id=str(ASKER), approve=True)
check("accepting puts the asker on the first co-op slot",
      ok and result.get("slot_key") == "Germany_coop" and STORE[GAME]["reservations"].get("Germany_coop") == ASKER, (ok, result, err))
check("the accepted save rewrites the reservations", SAVES == [(GAME, True)], SAVES)
check("the request is marked approved", STORE[GAME]["coop_requests"][str(ASKER)]["status"] == "approved")
check("the asker gets the good news", any(uid == ASKER and "accepted" in text for uid, text, _ in DMS), DMS)

fresh_game()
STORE[GAME]["reservations"]["Germany_coop"] = THIRD
run("coop_request", ASKER, nation="Germany")
ok, result, _ = run("coop_decide", OWNER, user_id=str(ASKER), approve=True)
check("the next free slot is used", ok and result.get("slot_key") == "Germany_coop_2", result)

# The asker took another nation before the owner answered.
fresh_game()
run("coop_request", ASKER, nation="Germany")
STORE[GAME]["reservations"]["Italy"] = ASKER
ok, _, err = run("coop_decide", OWNER, user_id=str(ASKER), approve=True)
check("accepting re-checks the asker", not ok and "They already have a nation" in err, err)
check("and marks the request failed", STORE[GAME]["coop_requests"][str(ASKER)]["status"] == "failed")

# A day-old request.
fresh_game()
run("coop_request", ASKER, nation="Germany")
STORE[GAME]["coop_requests"][str(ASKER)]["ts"] = int(time.time()) - gm.COOP_REQUEST_TTL_SEC - 5
ok, _, err = run("coop_decide", OWNER, user_id=str(ASKER), approve=True)
check("a day-old request expires", not ok and "expired" in err and STORE[GAME]["coop_requests"][str(ASKER)]["status"] == "expired", err)

# The nation changed hands: the old owner's buttons do nothing.
fresh_game()
run("coop_request", ASKER, nation="Germany")
STORE[GAME]["reservations"]["Germany"] = THIRD
ok, _, err = run("coop_decide", OWNER, user_id=str(ASKER), approve=True)
check("a former owner can't accept", not ok and "Only the player on" in err, err)

# --- The nation's player removes a co-op (no host needed) ---
gm._roster_drop_player_state = _nothing
fresh_game()
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
SAVES.clear()
DMS.clear()
ok, result, err = run("coop_kick", OWNER, user_id=str(ASKER))
check("the nation's player can remove their co-op", ok and result.get("coop") == "removed", (ok, result, err))
check("the co-op slot is free again", "Germany_coop" not in STORE[GAME]["reservations"], STORE[GAME]["reservations"])
check("the removal rewrites the reservations", SAVES == [(GAME, True)], SAVES)
check("the removed player gets a DM", any(uid == ASKER and "took you off" in text for uid, text, _ in DMS), DMS)
check("the nation itself stays", STORE[GAME]["reservations"].get("Germany") == OWNER)

fresh_game()
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
ok, _, err = run("coop_kick", OTHER, user_id=str(ASKER))
check("someone else can't remove them", not ok and "Only the player on" in err, err)
ok, _, err = run("coop_kick", ASKER, user_id=str(OTHER))
check("a non-co-op player can't be removed this way", not ok and "aren't on a co-op" in err, err)

fresh_game(host_locks={str(ASKER): 0})
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
ok, _, err = run("coop_kick", OWNER, user_id=str(ASKER))
check("a co-op the host kept in place stays", not ok and "ask a host" in err and "Germany_coop" in STORE[GAME]["reservations"], err)

fresh_game(host_locks={str(ASKER): int(time.time()) + 20})
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
ok, _, err = run("coop_kick", OWNER, user_id=str(ASKER))
check("a co-op the host just placed can be removed after the wait", not ok and "in " in err, err)

fresh_game(host_locks={str(ASKER): int(time.time()) - 5})
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
ok, _, _ = run("coop_kick", OWNER, user_id=str(ASKER))
check("an expired host placement doesn't block it", ok)

fresh_game(game_started=True)
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
ok, _, err = run("coop_kick", OWNER, user_id=str(ASKER))
check("not once the game has started", not ok and "started" in err, err)

# --- The first co-op becomes main when the main leaves ---
promote = gm._promote_coops
res = {"Germany_coop": ASKER, "Germany_coop_2": THIRD, "France": OTHER}
check("main gone: first co-op becomes main, the second moves up",
      promote(res) == [(ASKER, "Germany")] and res == {"Germany": ASKER, "Germany_coop": THIRD, "France": OTHER}, res)
res = {"Germany": OWNER, "Germany_coop_2": THIRD}
check("a gap in the co-op slots closes, no one promoted",
      promote(res) == [] and res == {"Germany": OWNER, "Germany_coop": THIRD}, res)
res = {"Germany": OWNER, "Germany_coop": ASKER, "Germany_coop_2": THIRD}
check("a full nation is left as it is", promote(res) == [] and res == {"Germany": OWNER, "Germany_coop": ASKER, "Germany_coop_2": THIRD}, res)
res = {"Germany_coop": ASKER}
check("a lone co-op becomes main", promote(res) == [(ASKER, "Germany")] and res == {"Germany": ASKER}, res)
res = {"_FILL_Spare": ASKER, "Italy": OTHER}
check("fillers and plain nations are untouched", promote(res) == [] and res == {"_FILL_Spare": ASKER, "Italy": OTHER}, res)


# --- The main hands the nation to a co-op ---
fresh_game()
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
DMS.clear()
ok, result, err = run("coop_promote", OWNER, user_id=str(ASKER))
check("the main can hand the nation to their co-op",
      ok and STORE[GAME]["reservations"].get("Germany") == ASKER and STORE[GAME]["reservations"].get("Germany_coop") == OWNER,
      (ok, err, STORE[GAME]["reservations"]))
check("the new main hears about it", any(uid == ASKER and "made you the main" in text for uid, text, _ in DMS), DMS)

fresh_game()
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
ok, _, err = run("coop_promote", ASKER, user_id=str(ASKER))
check("a co-op can never take the main's place", not ok and "Only the main player" in err and STORE[GAME]["reservations"]["Germany"] == OWNER, err)
ok, _, err = run("coop_promote", OTHER, user_id=str(ASKER))
check("nor can anyone else", not ok and "Only the main player" in err, err)

fresh_game(host_locks={str(OWNER): 0})
STORE[GAME]["reservations"]["Germany_coop"] = ASKER
ok, _, err = run("coop_promote", OWNER, user_id=str(ASKER))
check("a main the host kept in place can't hand it over", not ok and "ask a host" in err, err)

# The rule runs inside the bot's real save (e.g. the host moved the main away).
WRITTEN = []


async def _fake_mysql_io(fn, *args, label=""):
    WRITTEN.append(copy.deepcopy(args[1]["reservations"]) if len(args) > 1 and isinstance(args[1], dict) else None)


async def _real_save_check():
    real_io, real_dm = gm._run_mysql_io, gm._dm_coop_promoted
    promoted_dms = []

    async def dm(tid, game, uid, nation):
        promoted_dms.append((uid, nation))

    gm._run_mysql_io, gm._dm_coop_promoted = _fake_mysql_io, dm
    try:
        game = {"mode": "Roleplay", "reservations": {"Germany_coop": ASKER, "Germany_coop_2": THIRD, "France": OTHER}}
        await REAL_SAVE(GAME, game, rewrite_reservations=True)
        await asyncio.sleep(0)
        draft = {"mode": "Roleplay", "is_draft": True, "draft": {"pool": {}}, "reservations": {"Germany_coop": ASKER}}
        await REAL_SAVE("900000000000000002", draft, rewrite_reservations=True)
        await asyncio.sleep(0)
        return promoted_dms, draft
    finally:
        gm._run_mysql_io, gm._dm_coop_promoted = real_io, real_dm


dms, draft = asyncio.run(_real_save_check())
check("the real save writes the first co-op as main",
      WRITTEN and WRITTEN[0] == {"Germany": ASKER, "Germany_coop": THIRD, "France": OTHER}, WRITTEN)
check("and DMs the promoted player", dms == [(ASKER, "Germany")], dms)
check("draft games are left to the captains", draft["reservations"] == {"Germany_coop": ASKER}, draft)

# --- Anti-spam (2026-11-12): asking, withdrawing and asking again DM'd the owner each time ---
gm.save_single_game = save_single_game
gm._roster_after_change = _nothing
clock = {"now": 2_000_000_000}
gm.time.time = lambda: clock["now"]

fresh_game(reservations={"Germany": OWNER, "Italy": OTHER})
ok, _, err = run("coop_request", ASKER, nation="Germany")
check("spam: the first request goes through", ok and len(DMS) == 1, (ok, err, DMS))
run("coop_cancel", ASKER)
ok, _, err = run("coop_request", ASKER, nation="Germany")
check("spam: asking again right after withdrawing waits", not ok and err.startswith("⏳") and "5 minutes" in err, err)
ok, _, err = run("coop_request", ASKER, nation="Italy")
check("spam: hopping to another nation waits too", not ok and err.startswith("⏳"), err)
check("spam: and no extra DM went out", len(DMS) == 1, DMS)
clock["now"] += 5 * 60
ok, _, err = run("coop_request", ASKER, nation="Italy")
check("spam: after 5 minutes a new request goes through", ok and len(DMS) == 2, (ok, err))

# Declined: that nation waits 30 minutes, another nation only the usual 5.
ok, _, err = asyncio.run(gm._coop_decide(MEMBERS[OTHER], GAME, str(ASKER), False))
check("spam: the owner declines", ok, err)
clock["now"] += 5 * 60
ok, _, err = run("coop_request", ASKER, nation="Italy")
check("spam: the declined nation waits 30 minutes", not ok and "declined your request" in err and "25 minutes" in err, err)
ok, _, err = run("coop_request", ASKER, nation="Germany")
check("spam: another nation is fine after the 5 minutes", ok, err)
clock["now"] += 30 * 60
run("coop_cancel", ASKER)
clock["now"] += 5 * 60
ok, _, err = run("coop_request", ASKER, nation="Italy")
check("spam: after 30 minutes the declined nation can be asked again", ok, err)

# Asking again for the same pending request is free (no DM, no wait).
dm_count = len(DMS)
ok, result, err = run("coop_request", ASKER, nation="Italy")
check("spam: re-pressing the same request is free", ok and result == {"coop": "pending", "nation": "Italy"} and len(DMS) == dm_count, (ok, err))

# Hot-join requests (running game) DM the host: one every 3 minutes.
fresh_game(reservations={"Germany": OWNER}, game_started=True, host_id=THIRD)


def hotjoin(action, actor, **payload):
    req = {"action": action, "host_id": actor, "payload": {"thread_id": GAME, **payload}}
    return asyncio.run(gm._process_web_hotjoin(req))


ok, _, err = hotjoin("hotjoin_request", ASKER, nation="France")
check("spam: a hot-join request goes through", ok and len(DMS) == 1, (ok, err, DMS))
hotjoin("hotjoin_cancel", ASKER)
ok, _, err = hotjoin("hotjoin_request", ASKER, nation="Poland")
check("spam: another hot-join right away waits", not ok and err.startswith("⏳") and "3 minutes" in err, err)
clock["now"] += 3 * 60
ok, _, err = hotjoin("hotjoin_request", ASKER, nation="Poland")
check("spam: after 3 minutes it goes through", ok and len(DMS) == 2, (ok, err))

print("\n".join(results))
failed = sum(1 for line in results if line.startswith("FAIL"))
print(f"\n{len(results) - failed}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
