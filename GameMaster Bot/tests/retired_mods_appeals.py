"""Retired mods and appeal tickets (Niko, 2026-11-26).

1. The Road to 56 RP Submod is retired: gone from the bot's own lists, and a
   startup step takes it out of every server's saved standard mod lists.
   Games already announced keep their own copy; scheduled games still on the
   mode's standard list get that list (with the submod) written onto the
   slot first, so they keep it too.
2. Appeal on a moderation DM opens an Appeal ticket in the server instead of
   posting in Staff notices (a player who left the server still goes there).

Loads bot.py.py without starting the bot or touching any database.
Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/retired_mods_appeals.py"
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

import discord  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


RETIRED = {"name": "The Road to 56 RP Submod", "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=2790635823"}
R56 = {"name": "Road to 56 Mod", "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=820260968"}
TK = {"name": "TommyKay R56RP Submod", "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=3342783457"}
names = lambda links: [e["name"] for e in links or []]

# --- 1a. The bot's own lists --------------------------------------------------
check("the retired submod is recognised by its Workshop id", gm._is_retired_mod(RETIRED) and not gm._is_retired_mod(R56))
check("the bot's own Roleplay list no longer has it", RETIRED["name"] not in names(gm._HOME_MODE_SEED["Roleplay"]["mod_links"]),
      gm._HOME_MODE_SEED["Roleplay"])
check("a new server's Roleplay list no longer has it",
      RETIRED["name"] not in names(gm._default_guild_settings("X")["modes"]["Roleplay"]["mod_links"]))
check("the home server's first settings keep the other mods",
      names(gm._fresh_home_settings("TK")["modes"]["Roleplay"]["mod_links"]) == ["Road to 56 Mod", "TommyKay R56RP Submod"],
      gm._fresh_home_settings("TK")["modes"]["Roleplay"]["mod_links"])

# --- 1b. The startup step -----------------------------------------------------
GID = 900000000000000777
settings = gm._fresh_home_settings("TK")
settings["modes"]["Roleplay"]["mod_links"] = [R56, RETIRED, TK]
rt = gm._rt(GID)
rt.settings = copy.deepcopy(settings)

OWN = [{"name": "Own mod", "link": "https://example.com/own"}]
schedule = [
    {"slot_id": "a", "guild_id": str(GID), "mode": "Roleplay", "announced": False, "mods": None},
    {"slot_id": "b", "guild_id": str(GID), "mode": "Roleplay", "announced": False, "mods": list(OWN)},
    {"slot_id": "c", "guild_id": str(GID), "mode": "Roleplay", "announced": True},
    {"slot_id": "d", "guild_id": str(GID), "mode": "TFR", "announced": False},
]
writes, saves = [], []


async def read_json(name):
    return [dict(s) for s in schedule] if name == gm.SCHEDULE_FILE else {}


async def write_json(name, data):
    writes.append((name, copy.deepcopy(list(data))))


async def save_bot_settings(gid, new, *, summary, status=None):
    saves.append((gid, copy.deepcopy(new), summary))
    return True


gm.read_json, gm.write_json, gm._save_bot_settings = read_json, write_json, save_bot_settings
gm._apply_settings = lambda rt_, s: None
asyncio.run(gm._retire_mods())

by_id = {s["slot_id"]: s for s in (writes[0][1] if writes else [])}
check("the schedule was saved once", len(writes) == 1 and writes[0][0] == gm.SCHEDULE_FILE, writes)
check("a scheduled game on the standard list keeps the submod",
      names(by_id.get("a", {}).get("mods")) == ["Road to 56 Mod", "The Road to 56 RP Submod", "TommyKay R56RP Submod"], by_id.get("a"))
check("a scheduled game with its own list is untouched", by_id.get("b", {}).get("mods") == OWN, by_id.get("b"))
check("an announced game is untouched (it has its own copy)", "mods" not in by_id.get("c", {}), by_id.get("c"))
check("another mode's game is untouched", "mods" not in by_id.get("d", {}), by_id.get("d"))
check("the saved standard list loses the submod",
      len(saves) == 1 and names(saves[0][1]["modes"]["Roleplay"]["mod_links"]) == ["Road to 56 Mod", "TommyKay R56RP Submod"],
      saves)
check("the runtime has the new list", names(rt.settings["modes"]["Roleplay"]["mod_links"]) == ["Road to 56 Mod", "TommyKay R56RP Submod"])

writes.clear()
saves.clear()
asyncio.run(gm._retire_mods())
check("a second start does nothing", not writes and not saves, (writes, saves))

# --- 2. Appeals open tickets -----------------------------------------------------
dm_embed = discord.Embed(title="Moderation Update (Roleplay)")
dm_embed.add_field(name="Action", value="Roleplay Game Banned")
dm_embed.add_field(name="Reason", value="Toxic behaviour.")


class DM:
    embeds = [dm_embed]
    content = ""
    edited = None

    async def edit(self, view=None):
        DM.edited = view


class User:
    id = 555000000000000001
    mention = "<@555000000000000001>"


class Interaction:
    user = User()
    guild = None


tickets, events, notices, posted = [], [], [], []


async def create_ticket(interaction, kind, *, fields=None, guild=None, member=None, **kwargs):
    tickets.append({"kind": kind, "fields": fields, "guild": guild, "member": member})
    return type("Ch", (), {"name": "ticket-0042-appeal", "mention": "#ticket-0042-appeal"})()


async def notice(interaction, text):
    notices.append(text)


class StaffChannel:
    async def send(self, embed=None, **kwargs):
        posted.append(embed.title if embed else "")


gm._create_ticket = create_ticket
gm._interaction_notice = notice
gm.record_moderation_event = lambda user_id, action, **kw: events.append((user_id, action, kw))
gm._guild_active = lambda gid: True
gm._staff_notice_channel = lambda: StaffChannel()
gm.bot.get_guild = lambda gid: type("G", (), {"id": gid})()

member = object()


async def get_member(guild, user_id):
    return member


async def submit(in_server: bool):
    gm._get_member_safe = get_member if in_server else (lambda g, u: asyncio.sleep(0, result=None))
    with gm.guild_scope(GID):
        modal = gm.ModerationAppealModal(DM())
    modal.appeal._value = "I wasn't the one writing those things."
    await modal.on_submit(Interaction())


asyncio.run(submit(True))
check("an appeal opens an Appeal ticket", len(tickets) == 1 and tickets[0]["kind"] == "Appeal", tickets)
check("the ticket is in the DM button's server, opened as the player",
      tickets and tickets[0]["guild"].id == GID and tickets[0]["member"] is member, tickets)
check("the ticket says what's appealed and why",
      tickets and "Roleplay Game Banned" in tickets[0]["fields"]["Appealing"]
      and tickets[0]["fields"]["Why"] == "I wasn't the one writing those things.", tickets)
check("nothing is posted in Staff notices", posted == [], posted)
check("the appeal still goes on the player's record (with the ticket)",
      len(events) == 1 and events[0][1] == "appeal" and events[0][2]["details"].get("ticket") == "ticket-0042-appeal", events)
check("the DM's buttons turn into 'Appeal sent'", DM.edited is not None)
check("no second notice (the ticket link is the answer)", notices == [], notices)

tickets.clear()
events.clear()
asyncio.run(submit(False))
check("a player who left the server: no ticket", tickets == [], tickets)
check("…their appeal goes to Staff notices", posted == ["📨 Appeal"], posted)
check("…and they're told it was sent", len(notices) == 1 and "sent to the host team" in notices[0], notices)

for line in results:
    print(line)
passed = sum(line.startswith("PASS") for line in results)
print(f"{passed}/{len(results)} passed")
raise SystemExit(0 if passed == len(results) else 1)
