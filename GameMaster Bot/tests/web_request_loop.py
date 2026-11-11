"""Website requests run while GameMaster isn't in its home server (2026-11-11).

With TommyKay as home before the bot was added there, the request loop
checked the home server once and stopped: no website request ran at all
("Removing from the board…" forever). Now each request needs only its own
server; requests for a server the bot isn't in wait, and never block others.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/web_request_loop.py"
"""
import asyncio
import importlib.util
import os
import types

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + repr(detail) + ')' if detail and not ok else ''}")


HOME, TEST, ELSEWHERE = 341585283881631744, 1434977277115891725, 999999999999999999
gm.GUILD_ID = HOME


# ————— the query: only servers the bot is in —————
class Cursor:
    def __init__(self):
        self.sql = None
        self.params = None

    def execute(self, sql, params=()):
        self.sql, self.params = sql, params

    def fetchall(self):
        return []

    def close(self):
        pass


class Conn:
    def __init__(self):
        self.cur = Cursor()

    def cursor(self, dictionary=False):
        return self.cur

    def close(self):
        pass


conn = Conn()
gm._db_get_connection = lambda: conn
gm._fetch_pending_web_schedule_requests_mysql([TEST])
check("only the bot's servers are fetched", "guild_id IN (%s)" in conn.cur.sql and conn.cur.params == (str(TEST), 20), (conn.cur.sql, conn.cur.params))
check("without home, rows with no server aren't fetched", "IS NULL" not in conn.cur.sql)
gm._fetch_pending_web_schedule_requests_mysql([HOME, TEST])
check("with home, rows with no server are home's", "OR guild_id IS NULL" in conn.cur.sql, conn.cur.sql)
check("in no server: nothing fetched", gm._fetch_pending_web_schedule_requests_mysql([]) == [])


# ————— the loop: runs without the home server —————
handled, finished = [], []
fetched_with = []


async def fake_io(fn, *args, label=""):
    if fn is gm._fetch_pending_web_schedule_requests_mysql:
        fetched_with.append(args[0])
        return [
            {"request_id": "a", "action": "remove_slot", "guild_id": str(TEST), "host_id": 1, "payload": {}},
            {"request_id": "b", "action": "remove_slot", "guild_id": str(ELSEWHERE), "host_id": 1, "payload": {}},
        ]
    if fn is gm._finish_web_schedule_request_mysql:
        finished.append(args[0])
        return None
    return None


async def remove(req):
    handled.append((req["request_id"], gm.cur_gid()))
    return True, {"slot_id": "x"}, None


async def nothing(*a, **k):
    return None


guilds = {TEST: types.SimpleNamespace(id=TEST, name="Test")}
gm.bot = types.SimpleNamespace(
    guilds=list(guilds.values()),
    get_guild=lambda gid: guilds.get(int(gid or 0)),
    wait_until_ready=nothing,
)
gm._run_mysql_io = fake_io
gm._process_web_schedule_remove = remove
gm._guild_active = lambda *a, **k: True
gm._web_stale_lifecycle_checked = True
gm._audit_web_request = lambda *a, **k: None
gm.audit_event = lambda *a, **k: None

# Right after a restart, before the servers' settings are read: nothing runs (no false "not switched on").
gm._SERVER_SETTINGS_READY = False
asyncio.run(gm.web_schedule_request_loop.coro())
check("before settings are loaded, requests wait", not fetched_with and not handled and not finished, (fetched_with, handled, finished))

gm._SERVER_SETTINGS_READY = True
asyncio.run(gm.web_schedule_request_loop.coro())
check("the loop runs although the bot isn't in its home server", ("a", TEST) in handled, handled)
check("it asked only for its own servers", fetched_with == [[TEST]], fetched_with)
check("a request for a server it isn't in waits", all(rid != "b" for rid, _ in handled) and "b" not in finished, (handled, finished))
check("the handled one is marked done", "a" in finished, finished)

print("\n".join(results))
failed = sum(1 for line in results if line.startswith("FAIL"))
print(f"\n{len(results) - failed}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
