"""Casino games: unfinished rolls (2026-11-15).

A player holding a nation who hasn't finished rolling gets reminders by DM;
the host and co-hosts get the list an hour before; 30 minutes before the
start they're taken off the nation; the checksum reminder waits until
they've finished.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/casino_rolls.py"
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


HOST, COHOST, DONE, MID, NONE, GRANT, COOP = 11, 12, 21, 22, 23, 24, 25
GAME = "1400000000000000001"
NOW = 2_000_000_000


class Member:
    def __init__(self, uid):
        self.id = uid
        self.display_name = f"P{uid}"


STORE = {}
RUNS = {}
DMS = []
DROPPED = []


async def read_games():
    return STORE


async def save_game(key, game, rewrite_reservations=False):
    STORE[key] = game


async def run_mysql(fn, *args, label=None):
    if fn is gm._fetch_casino_runs_mysql:
        return copy.deepcopy(RUNS)
    return None


async def fetch_member(uid):
    return Member(int(uid))


async def dm(member, content=None, embed=None, view=None, label=""):
    DMS.append((member.id, label, content or ""))
    return True


async def drop_state(key, uid):
    DROPPED.append(int(uid))


async def nothing(*args, **kwargs):
    return None


gm._read_games_fresh = read_games
gm.save_single_game = save_game
gm._run_mysql_io = run_mysql
gm._web_fetch_member = fetch_member
gm._dm_user_safe = dm
gm._roster_drop_player_state = drop_state
gm._roster_after_change = nothing
gm.audit_event = lambda *a, **k: None
gm._audit_who = lambda uid: f"P{uid}"


def fresh(start_in, **extra):
    STORE.clear()
    DMS.clear()
    DROPPED.clear()
    RUNS.clear()
    RUNS.update({
        str(DONE): {"current_stage": 5, "status": "FINALIZED", "receipt_dm_sent": 1},
        str(MID): {"current_stage": 2, "status": "IN_PROGRESS", "receipt_dm_sent": 0},
    })
    STORE[GAME] = {
        "randomizer_only": True,
        "thread_name": "Sunday RP",
        "host_id": HOST,
        "co_hosts": [str(COHOST)],
        "start_timestamp": NOW + start_in,
        "reservations": {"Germany": DONE, "Italy": MID, "France": NONE, "Japan": GRANT, "Germany_coop": COOP},
        "web_override_rolls": {str(GRANT): {"nation": "Japan", "ideology": "Fascism"}},
        **extra,
    }


async def watch(start_in):
    await gm._casino_roll_watch_game(GAME, start_in, NOW)


# --- Who has finished ---
fresh(5 * 3600)
unfinished = asyncio.run(gm._casino_unfinished(GAME, STORE[GAME]))
ids = sorted(uid for uid, _n, _s in unfinished)
check("finished runs and returned host grants count as done; co-ops aren't counted", ids == [MID, NONE], unfinished)
check("where they stopped is known", dict((u, s) for u, _n, s in unfinished) == {MID: 2, NONE: 0}, unfinished)
fresh(5 * 3600, casino_settings={"randomizers": {room: {"enabled": False} for room in
                                                  ("nation", "ideology", "path", "doctrine", "build", "achievements")}})
check("a game with no rooms on has nothing to finish", asyncio.run(gm._casino_unfinished(GAME, STORE[GAME])) == [])

# --- Reminders ---
fresh(3 * 3600 - 10)
asyncio.run(watch(3 * 3600 - 10))
reminded = sorted(uid for uid, label, _ in DMS if label == "casino roll reminder")
check("3 hours before: the unfinished get a reminder", reminded == [MID, NONE], DMS)
check("  it says where they stopped and when they'd be taken off",
      any("Doctrine room" in text and "taken off the nation" in text for uid, _l, text in DMS if uid == MID), DMS)
DMS.clear()
asyncio.run(watch(3 * 3600 - 70))
check("  only once per step", not DMS, DMS)
asyncio.run(watch(2 * 3600 - 5))
check("2 hours before: the next one", sorted(uid for uid, label, _ in DMS if label == "casino roll reminder") == [MID, NONE], DMS)

# Joined late: one reminder, not the whole backlog.
fresh(50 * 60)
asyncio.run(watch(50 * 60))
check("a late joiner gets one reminder", len([1 for uid, label, _ in DMS if uid == NONE and label == "casino roll reminder"]) == 1, DMS)

# --- The host's list, an hour before ---
fresh(3600 - 5)
asyncio.run(watch(3600 - 5))
alerts = [(uid, text) for uid, label, text in DMS if label == "casino host alert"]
check("an hour before: the host (not the co-host) gets the list", [uid for uid, _ in alerts] == [HOST], alerts)
check("  naming the players and the nation", alerts and "P22 — Italy" in alerts[0][1] and "P23 — France" in alerts[0][1], alerts)
DMS.clear()
asyncio.run(watch(3600 - 65))
check("  once", not [1 for _u, label, _t in DMS if label == "casino host alert"], DMS)

# --- 30 minutes before: taken off ---
fresh(30 * 60 - 5)
asyncio.run(watch(30 * 60 - 5))
res = STORE[GAME]["reservations"]
check("30 minutes before: the unfinished are taken off", "Italy" not in res and "France" not in res, res)
check("  the finished ones (and host grants) stay", res.get("Germany") == DONE and res.get("Japan") == GRANT, res)
check("  only a host can bring them back", {str(MID), str(NONE)} <= set(STORE[GAME].get("casino_host_removed") or []), STORE[GAME].get("casino_host_removed"))
check("  their runs are cleared", sorted(DROPPED) == [MID, NONE], DROPPED)
check("  they're told", sorted(uid for uid, label, _ in DMS if label == "casino unfinished removed") == [MID, NONE], DMS)
check("  the host gets the list", any(label == "casino host alert" and "Taken off" in text for _u, label, text in DMS), DMS)
DMS.clear()
asyncio.run(watch(30 * 60 - 65))
check("  it happens once", not DMS and STORE[GAME].get("casino_unfinished_removed_at"), DMS)

# --- The checksum reminder waits for the finish ---
fresh(50 * 60, automatic_reminder_sent_at=NOW - 600, automatic_reminder_dm_ids=[DONE, GRANT, COOP])
asyncio.run(watch(50 * 60))
check("no checksum for the unfinished", not [1 for uid, label, _ in DMS if label == "game reminder"], DMS)
RUNS[str(MID)] = {"current_stage": 5, "status": "FINALIZED", "receipt_dm_sent": 1}
DMS.clear()
asyncio.run(watch(49 * 60))
check("once they finish, they get it", [uid for uid, label, _ in DMS if label == "game reminder"] == [MID], DMS)
check("  with the checksum", any("Checksum" in text for uid, label, text in DMS if label == "game reminder"), DMS)

# The one-hour reminder loop itself leaves the unfinished out.
fresh(3500, automatic_reminder=True)


class Guild:
    def get_member(self, uid):
        return SentMember(uid)


SENT = []


class SentMember(Member):
    async def send(self, text):
        SENT.append(self.id)


gm.bot.get_guild = lambda gid: Guild()
gm.bot.wait_until_ready = nothing
gm._load_games_resilient = read_games


async def _get_game_data(key):
    return key, STORE[key]


gm._get_game_data = _get_game_data


async def no_sleep(*a, **k):
    return None


real_sleep = gm.asyncio.sleep
gm.asyncio.sleep = no_sleep
gm.time.time = lambda: NOW
try:
    asyncio.run(gm._scheduled_game_reminder_loop_for_guild())
finally:
    gm.asyncio.sleep = real_sleep
check("the one-hour reminder skips unfinished Casino players", sorted(SENT) == sorted([DONE, GRANT, COOP]), SENT)

print("\n".join(results))
failed = sum(1 for line in results if line.startswith("FAIL"))
print(f"\n{len(results) - failed}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
