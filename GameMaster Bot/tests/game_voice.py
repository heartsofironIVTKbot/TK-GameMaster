"""A game's voice channels (2026-11-12): GameMaster keeps access to the
categories it creates (it isn't an Administrator, and @everyone is hidden),
so game end / cancel can delete them; the game's categories go together, in
order, below the mode's anchor in one bulk move; the pass role sits on the
categories only and the channels follow them.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/game_voice.py"
"""
import asyncio
import importlib.util
import os

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)
discord = gm.discord

results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


class Cat:
    def __init__(self, cid, name, position):
        self.id = cid
        self.name = name
        self.position = position
        self.channels = []
        self.overwrites = None
        self.deleted = False

    async def create_voice_channel(self, name, **kwargs):
        channel = Voice(len(GUILD.channels) + 1000, name, self, kwargs)
        self.channels.append(channel)
        GUILD.channels[channel.id] = channel
        return channel

    async def delete(self):
        self.deleted = True
        GUILD.channels.pop(self.id, None)


class Voice:
    def __init__(self, cid, name, category, kwargs):
        self.id = cid
        self.name = name
        self.category = category
        self.kwargs = kwargs
        self.deleted = False

    async def delete(self):
        self.deleted = True
        GUILD.channels.pop(self.id, None)
        if self in self.category.channels:
            self.category.channels.remove(self)


class Role:
    def __init__(self, rid, name):
        self.id = rid
        self.name = name
        self.deleted = False

    async def delete(self, reason=None):
        self.deleted = True


class Http:
    def __init__(self):
        self.calls = []

    async def bulk_channel_update(self, guild_id, data, reason=None):
        self.calls.append(data)
        for entry in data:
            channel = GUILD.channels.get(entry["id"])
            if channel is not None:
                channel.position = entry["position"]


class State:
    def __init__(self):
        self.http = Http()


class Guild:
    def __init__(self):
        self.id = 1
        self.default_role = Role(1, "@everyone")
        self.me = Role(2, "GameMaster (member)")
        self.channels = {}
        self.roles = {}
        self._state = State()

    @property
    def categories(self):
        return [c for c in self.channels.values() if isinstance(c, Cat)]

    def get_channel(self, cid):
        return self.channels.get(cid)

    async def fetch_channel(self, cid):
        raise discord.NotFound(type("R", (), {"status": 404, "reason": "Not Found"})(), "Unknown Channel")

    def get_role(self, rid):
        return self.roles.get(rid)

    async def create_role(self, name, permissions=None, reason=None):
        role = Role(5000 + len(self.roles), name)
        self.roles[role.id] = role
        return role

    async def create_category(self, name, overwrites=None, position=None):
        cat = Cat(2000 + len(self.channels), name, 99)
        cat.overwrites = overwrites
        self.channels[cat.id] = cat
        return cat


GUILD = Guild()
# The server's categories, top to bottom.
for index, name in enumerate(["INFO", "HOI4 ROLEPLAY", "HOI4 HISTORICAL", "STELLARIS RP", "ARCHIVE"]):
    GUILD.channels[100 + index] = Cat(100 + index, name, index)

gm.GAME_VOICE_ANCHORS["RP"] = (101, 102)  # below HOI4 ROLEPLAY, above HOI4 HISTORICAL
gm.GAME_VOICE_MANAGER_ROLES[:] = []
gm.ALLOWED_HOST_ROLES = []


async def _no_sleep(*_a, **_k):
    return None


gm.asyncio.sleep = _no_sleep

reservations = {"Germany": 1, "France": 2, "Australia": 3, "China": 4, "United States": 5}
cat_ids, vc_ids, role_id = asyncio.run(gm.create_game_voice_channels(GUILD, "Roleplay", reservations, "game-1"))
created = [GUILD.channels[c] for c in cat_ids]
names = [c.name for c in created]
check("one category per region with reservations", any("EURO-AFRICA" in n for n in names) and any("ASIA-OCEANIA" in n for n in names), names)

order = [c.name for c in sorted(GUILD.categories, key=lambda c: c.position)]
start = order.index("HOI4 ROLEPLAY")
check("the game's categories sit together right below the anchor, in order",
      order[start + 1:start + 1 + len(created)] == names, order)
check("and above the next section", order.index("HOI4 HISTORICAL") > order.index(names[-1]), order)
check("in one bulk move", len(GUILD._state.http.calls) == 1, GUILD._state.http.calls)

ow = created[0].overwrites
check("@everyone can't see the categories", ow[GUILD.default_role].view_channel is False)
check("the pass role can see and join them", ow[GUILD.roles[role_id]].view_channel is True and ow[GUILD.roles[role_id]].connect is True)
mine = ow.get(GUILD.me)
check("GameMaster keeps access to its own categories",
      mine is not None and mine.view_channel and mine.manage_channels and mine.move_members, mine)
voices = [GUILD.channels[v] for v in vc_ids]
check("voice channels carry no permissions of their own (they follow the category)",
      voices and all("overwrites" not in v.kwargs for v in voices), [v.kwargs for v in voices])

# A host adds a channel to a game category by hand; the game is cancelled.
extra = asyncio.run(created[0].create_voice_channel("Extra lobby"))
asyncio.run(gm.cleanup_game_voice_channels(GUILD, cat_ids, vc_ids, role_id))
check("every voice channel is deleted", all(v.deleted for v in voices))
check("even one added to a game category later", extra.deleted is True)
check("the categories are deleted", all(c.deleted for c in created))
check("the pass role is deleted", GUILD.roles[role_id].deleted is True)
check("the server's own categories stay", all(not GUILD.channels[100 + i].deleted for i in range(5)))

# Order without an anchor: below the server's first category.
order2 = gm._game_category_order([Cat(1, "A", 0), Cat(2, "B", 1)], [Cat(9, "G1", 5), Cat(8, "G2", 6)], None)
check("no anchor: right below the first category", [c.name for c in order2] == ["A", "G1", "G2", "B"], [c.name for c in order2])

for line in results:
    print(line)
passed = sum(line.startswith("PASS") for line in results)
print(f"{passed}/{len(results)} passed")
raise SystemExit(0 if passed == len(results) else 1)
