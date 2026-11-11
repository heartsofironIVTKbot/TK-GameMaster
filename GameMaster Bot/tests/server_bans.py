"""Banned servers and GameMaster's owners (2026-11-11).

A banned server is left when GameMaster is added to it and on every
heartbeat; the home server never is. The app's owners (or its team) are
published as the website's system admins; the first two bans are seeded once.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/server_bans.py"
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


class Guild:
    def __init__(self, gid, name="Server"):
        self.id = gid
        self.name = name
        self.left = False

    async def leave(self):
        self.left = True


BANNED = {684826492571615262, 1444724820771209332}
HOME = gm.GUILD_ID or 1000000000000000001
gm.GUILD_ID = HOME
audits = []
gm.audit_event = lambda *a, **k: audits.append(a)


async def blocked():
    return set(BANNED) | {HOME}


gm._blocked_guild_ids = blocked

check("the two servers are the seeded bans", set(gm.SEEDED_BLOCKED_GUILDS) == BANNED)

banned, other, home = Guild(684826492571615262, "Bad"), Guild(555555555555555555, "Fine"), Guild(HOME, "Home")
left = asyncio.run(gm._leave_if_blocked(banned))
check("a banned server is left", left and banned.left)
check("and it's in the audit log", any(a[1] == "server_banned_left" for a in audits), audits)
check("a normal server is not", not asyncio.run(gm._leave_if_blocked(other)) and not other.left)
check("the home server never is, even if listed", not asyncio.run(gm._leave_if_blocked(home)) and not home.left)


# Added to a banned server: it leaves before recording or welcoming anything.
calls = []


async def record(guild):
    calls.append("record")


async def welcome(guild):
    calls.append("welcome")


gm._record_guild = record
gm._welcome_new_guild = welcome
joined = Guild(1444724820771209332, "Also bad")
asyncio.run(gm.on_guild_join(joined))
check("joining a banned server: left at once, nothing else runs", joined.left and calls == [], calls)


# The owners: a team's members, else the app's owner.
published = []


async def fake_io(fn, *args, label=""):
    return fn()


gm._publish_bot_owners_mysql = lambda ids: published.append(list(ids))
gm._seed_blocklist_mysql = lambda ids: published.append(("seed", tuple(ids)))
gm._run_mysql_io = fake_io
config = {}


async def read_json(path):
    return dict(config)


async def write_json(path, data):
    config.clear()
    config.update(data)


gm.read_json, gm.write_json = read_json, write_json
gm.bot = types.SimpleNamespace(guilds=[], application_info=None)


async def app_team():
    team = types.SimpleNamespace(members=[types.SimpleNamespace(id=11), types.SimpleNamespace(id=22)])
    return types.SimpleNamespace(team=team, owner=types.SimpleNamespace(id=99))


async def app_owner():
    return types.SimpleNamespace(team=None, owner=types.SimpleNamespace(id=99))


gm.bot.application_info = app_team
asyncio.run(gm._system_startup())
check("a team's members are the owners", [11, 22] in published, published)
check("the first bans are seeded", ("seed", tuple(gm.SEEDED_BLOCKED_GUILDS)) in published, published)
published.clear()
gm.bot.application_info = app_owner
asyncio.run(gm._system_startup())
check("else the app's owner", [99] in published, published)
check("the bans are seeded only once (unbans stick)", not any(isinstance(p, tuple) for p in published), published)

print("\n".join(results))
failed = sum(1 for line in results if line.startswith("FAIL"))
print(f"\n{len(results) - failed}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
