"""The IronLegion lock on reservations (docs/server-setup.md, "Require IronLegion").

Loads bot.py.py without starting the bot or touching any database: IronLegion's
read-only view is faked. Checks who may reserve (the server's switch, a game's
own switch, the bypasses, IronLegion's authenticated role), what happens when
IronLegion's database can't be reached, and the announcement's and the
refusal's pointer to the authentication channel.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/ironlegion_lock.py"
"""
import asyncio
import importlib.util
import os
import sys

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
# A login so the lock is active; the fetch below is replaced, so nothing connects.
os.environ.update({"IRONLEGION_DB_HOST": "fake", "IRONLEGION_DB_USER": "fake", "IRONLEGION_DB_PASSWORD": "fake", "IRONLEGION_DB_NAME": "fake"})
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)
import discord  # noqa: E402

GUILD, OTHER = 1000000000000000001, 1000000000000000002
ROLE, CHANNEL = 2000000000000000001, 2000000000000000002
ROWS = {GUILD: {"bot_present": 1, "verified_role_id": ROLE, "verify_channel_id": CHANNEL}}
reachable = {"value": True}


def fake_fetch(config, guild_id):
    if not reachable["value"]:
        raise ConnectionError("IronLegion is down")
    return ROWS.get(guild_id)


gm._ironlegion_fetch_sync = fake_fetch
results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


class R:
    def __init__(self, rid):
        self.id = rid


class FakeMember(discord.Member):
    def __init__(self, guild_id, role_ids, admin=False):  # no super(): only these are read
        self._g = type("G", (), {"id": guild_id})()
        self._roles = [R(r) for r in role_ids]
        self._admin = admin

    @property
    def guild(self):
        return self._g

    @property
    def roles(self):
        return self._roles

    @property
    def guild_permissions(self):
        return discord.Permissions(administrator=self._admin)


async def main():
    plain, authenticated, admin = FakeMember(GUILD, []), FakeMember(GUILD, [ROLE]), FakeMember(GUILD, [], admin=True)
    gm.SERVER_FEATURES["ironlegion"] = False
    check("the server doesn't require it: everyone may reserve", await gm.is_user_authenticated(plain))
    gm.SERVER_FEATURES["ironlegion"] = True
    check("required: without IronLegion's role, refused", not await gm.is_user_authenticated(plain))
    check("required: with IronLegion's role, allowed", await gm.is_user_authenticated(authenticated))
    check("required: admins bypass", await gm.is_user_authenticated(admin))
    check("required, but IronLegion isn't on that server: allowed", await gm.is_user_authenticated(FakeMember(OTHER, [])))

    gm._games_cache["555"] = {"require_ironlegion": False}
    check("a game switched off overrides the server", await gm.is_user_authenticated(plain, 555))
    gm.SERVER_FEATURES["ironlegion"] = False
    gm._games_cache["556"] = {"require_ironlegion": True}
    check("a game switched on overrides the server", not await gm.is_user_authenticated(plain, 556))
    check("a game with no switch follows the server", await gm.is_user_authenticated(plain, 557))

    check("refusal points at the authentication channel", f"<#{CHANNEL}>" in gm.ironlegion_unverified_message(GUILD))
    check("member directory: the flag ignores the server setting", gm._member_role_verified(plain) is False and gm._member_role_verified(authenticated) is True)
    check("casino token: IronLegion's role counts", gm._live_role_flags(authenticated)["is_authenticated"] is True)

    with gm.guild_scope(GUILD):
        gm.SERVER_FEATURES["ironlegion"] = True
        line = await gm._ironlegion_announcement_line(None)
        check("announcement: says where to authenticate", f"<#{CHANNEL}>" in line and "Steam authentication required" in line, line)
        check("announcement: a game switched off says nothing", await gm._ironlegion_announcement_line(False) == "")
    with gm.guild_scope(OTHER):
        check("announcement: IronLegion not set up there, nothing", await gm._ironlegion_announcement_line(True) == "")

    gm.SERVER_FEATURES["ironlegion"] = True
    reachable["value"] = False
    gm._ironlegion_rows[GUILD]["ts"] = 0
    check("outage: the last known role still counts", not await gm.is_user_authenticated(plain))
    gm._ironlegion_rows.clear()
    check("outage with nothing known: players may reserve", await gm.is_user_authenticated(plain))
    reachable["value"] = True

    gm._IRONLEGION_DB = None
    gm._ironlegion_rows.clear()
    check("no IronLegion login set: nothing locked", await gm.is_user_authenticated(plain))
    print("\n".join(results))
    print(f"\n{sum(r.startswith('PASS') for r in results)}/{len(results)} passed")


asyncio.run(main())
