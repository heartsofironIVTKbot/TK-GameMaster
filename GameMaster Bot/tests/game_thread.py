"""Game Threads (2026-11-12): a thread on each game's announcement for talk
about the game. GameMaster pins an intro, posts unlocks / start / end, and
when the game ends the thread is locked, saved (database for the website +
an HTML file in the game's host chat-logs post) and deleted.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/game_thread.py"
"""
import asyncio
import datetime
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


class Avatar:
    def __init__(self, url):
        self.url = url


class Author:
    def __init__(self, uid, name, bot=False):
        self.id = uid
        self.display_name = name
        self.name = name
        self.bot = bot
        self.display_avatar = Avatar(f"https://cdn.discordapp.com/avatars/{uid}.png")


class Msg:
    def __init__(self, author, content, minute, kind=None):
        self.id = 1000 + minute
        self.author = author
        self.clean_content = content
        self.created_at = datetime.datetime(2026, 11, 14, 14, minute, tzinfo=datetime.timezone.utc)
        self.attachments = []
        self.embeds = []
        self.type = kind or discord.MessageType.default


class FakeThread(discord.Thread):
    def __init__(self, tid, name, messages):  # no super(): only these are read
        self.id = tid
        self.name = name
        self.archived = False
        self.locked = False
        self._messages = messages
        self.sent = []
        self.deleted = False
        self.edits = []

    async def history(self, limit=None, oldest_first=False):
        for message in self._messages:
            yield message

    async def send(self, content=None, **kwargs):
        self.sent.append(content)

    async def edit(self, **kwargs):
        self.edits.append(kwargs)
        for key, value in kwargs.items():
            setattr(self, key, value)

    async def delete(self):
        self.deleted = True


class FakeLogThread:
    def __init__(self):
        self.files = []

    async def send(self, content=None, file=None, **kwargs):
        self.files.append((content, file))


GAMEMASTER = Author(999, "GameMaster", bot=True)
OTTO = Author(111, "Otto")
SAVED = []
LOG = FakeLogThread()
THREADS = {}

gm.bot.get_channel = lambda cid: THREADS.get(cid)


async def _run_mysql_io(fn, *args, label=None):
    SAVED.append((fn.__name__, args))


async def _open_game_log_thread(key, game):
    return LOG


gm._run_mysql_io = _run_mysql_io
gm._open_game_log_thread = _open_game_log_thread

# --- The intro ---
intro = gm._game_thread_intro({"host_id": 555}, "1570407426308448318")
check("the intro names it a Game Thread", "Game Thread" in intro, intro)
check("it tells players to ping the host", "<@555>" in intro and "Ping" in intro, intro)
check("it asks to keep it clean and on this game", "keep it clean" in intro and "this game" in intro, intro)
check("it links the game's map", "/map?game=1570407426308448318" in intro, intro)
check("it never says Reservation Thread", "Reservation" not in intro, intro)

# --- The HTML transcript ---
page = gm._game_thread_html("RP <Game>", [
    {"author": "Otto <b>", "avatar": None, "bot": False, "ts": 1794492000, "content": "<script>alert(1)</script>\nline 2",
     "attachments": [{"name": "save.zip", "url": "https://cdn.discordapp.com/a/save.zip"}], "embeds": ["Embed text"]},
])
check("names and text are escaped", "<script>" not in page and "&lt;script&gt;" in page and "Otto &lt;b&gt;" in page, page[:300])
check("line breaks are kept", "line 2" in page and "<br>" in page)
check("attachments are linked", 'href="https://cdn.discordapp.com/a/save.zip"' in page)
check("the title is escaped", "<title>RP &lt;Game&gt;</title>" in page)

# --- Posting, closing, archiving and deleting ---
thread = FakeThread(42, "Roleplay Game - Saturday - 11.14.2026", [
    Msg(GAMEMASTER, "Game Thread intro", 0),
    Msg(OTTO, "Which submod?", 5),
    Msg(OTTO, "pinned a message", 6, kind=discord.MessageType.pins_add),
])
THREADS[42] = thread
game = {"game_thread_id": 42, "guild_id": "341585283881631744", "lobby_thread_id": "42", "status": "ended"}

asyncio.run(gm._post_in_game_thread(game, "🔓 Majors unlocked"))
check("notices are posted in the thread", thread.sent == ["🔓 Majors unlocked"], thread.sent)
check("a game without a thread posts nothing", asyncio.run(gm._post_in_game_thread({}, "x")) is False)

asyncio.run(gm._close_game_thread(game, "## 🏁 Game Is Ending"))
check("ending posts the notice", thread.sent[-1] == "## 🏁 Game Is Ending", thread.sent)
check("and locks the thread", thread.locked is True, thread.edits)

ok = asyncio.run(gm._archive_and_delete_game_thread("42", game))
check("archiving succeeds", ok is True)
saved = [args for name, args in SAVED if name == "_save_game_thread_log_mysql"]
check("the thread is saved for the website under the game's id", saved and saved[0][0] == "42" and saved[0][1] == "341585283881631744", saved)
records = saved[0][3] if saved else []
check("only real messages are saved (not 'pinned a message')", [r["content"] for r in records] == ["Game Thread intro", "Which submod?"], records)
check("each saved message has author, time and bot flag",
      records and records[1]["author"] == "Otto" and records[1]["bot"] is False and records[0]["bot"] is True and records[1]["ts"] > 0, records)
check("an HTML file goes to the game's chat-logs post",
      LOG.files and LOG.files[0][1].filename.endswith(".html") and "2 message(s)" in LOG.files[0][0], LOG.files)
check("then the thread is deleted", thread.deleted is True)
check("and the game remembers it's done", bool(game.get("game_thread_archived_at")))

# Repeating the end (an interrupted end resumes) does nothing twice.
SAVED.clear()
LOG.files.clear()
check("a repeat is a no-op", asyncio.run(gm._archive_and_delete_game_thread("42", game)) is True and not SAVED and not LOG.files)

# A cancelled game: saved for the record, no HTML post.
SAVED.clear()
LOG.files.clear()
thread2 = FakeThread(43, "Cancelled game", [Msg(OTTO, "hi", 1)])
THREADS[43] = thread2
cancelled = {"game_thread_id": 43, "guild_id": "1", "lobby_thread_id": "43"}
asyncio.run(gm._archive_and_delete_game_thread("43", cancelled, post_html=False))
check("a cancelled game's thread is saved without an HTML post", len(SAVED) == 1 and not LOG.files and thread2.deleted, (SAVED, LOG.files))

# The database save failing keeps the thread (nothing is lost).
async def _failing(fn, *args, label=None):
    raise RuntimeError("database down")
gm._run_mysql_io = _failing
thread3 = FakeThread(44, "Kept", [Msg(OTTO, "hi", 1)])
THREADS[44] = thread3
kept = {"game_thread_id": 44, "lobby_thread_id": "44"}
check("a failed save keeps the thread", asyncio.run(gm._archive_and_delete_game_thread("44", kept)) is False and not thread3.deleted)
check("and it can be tried again later", not kept.get("game_thread_archived_at"))

for line in results:
    print(line)
passed = sum(line.startswith("PASS") for line in results)
print(f"{passed}/{len(results)} passed")
raise SystemExit(0 if passed == len(results) else 1)
