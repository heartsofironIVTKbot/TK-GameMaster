"""The live game post and rating by DM (docs/game-archive.md).

Loads bot.py.py without starting the bot or touching any database: Discord
and the saves are faked, and every Discord call is counted. Checks what the
post shows at each stage, that unchanged renders cost nothing, a burst of
events is one edit, the per-channel bucket, 429 / 404 / 403 handling, the
no-duplicate first post after a restart, that a finished post is never
touched again, the rating rules and the stale-save merges.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/live_post.py"
"""
import asyncio
import importlib.util
import os
import time

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)
import discord  # noqa: E402

GUILD = gm.GUILD_ID
CHANNEL = 3000000000000000001
KEY = "4000000000000000001"
results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


class Resp:
    def __init__(self, status, retry_after=None):
        self.status = status
        self.reason = "fake"
        self.headers = {"Retry-After": str(retry_after)} if retry_after is not None else {}


def http_error(cls, status, retry_after=None):
    data = {"message": "fake", "code": 0}
    if retry_after is not None:
        data["retry_after"] = retry_after
    return cls(Resp(status, retry_after), data)


class FakeDiscord:
    """A channel that records sends and edits; `fail` makes the next call raise."""

    def __init__(self):
        self.sent = []
        self.edits = []
        self.history_messages = []
        self.fail = []
        self.next_id = 9000000000000000001

    def _maybe_fail(self):
        if self.fail:
            raise self.fail.pop(0)

    def get_partial_messageable(self, channel_id, guild_id=None):
        return self

    def get_partial_message(self, message_id):
        outer = self

        class Msg:
            async def edit(self, embed=None):
                outer._maybe_fail()
                outer.edits.append((message_id, embed.to_dict()))

        return Msg()

    async def send(self, embed=None, nonce=None):
        self._maybe_fail()
        self.next_id += 1
        self.sent.append((self.next_id, embed.to_dict(), nonce))
        return type("Sent", (), {"id": self.next_id})()

    def history(self, limit=50):
        messages = list(self.history_messages)

        async def gen():
            for message in messages:
                yield message

        return gen()


fake = FakeDiscord()
games = {}
saves = []


async def fake_save(key, game, rewrite_reservations=False):
    saves.append((key, dict(game.get("live_post") or {})))


gm.bot.get_partial_messageable = fake.get_partial_messageable
gm.save_single_game = fake_save
gm._games_view = lambda games_arg=None, gid=None: games
gm._CHANNEL_EDIT_GAP_SEC = 0.0
gm._discord_api_sem = asyncio.Semaphore(3)


def new_game(**extra):
    now = int(time.time())
    game = {
        "guild_id": GUILD,
        "mode": "Roleplay",
        "thread_name": "Roleplay #88, Road to 56 Reservations",
        "host_id": 5000000000000000001,
        "start_timestamp": now - 3600,
        "status": "active",
        "reservations": {f"Nation{i}": 6000000000000000000 + i for i in range(32)},
        "live_post": {"channel_id": str(CHANNEL)},
    }
    game.update(extra)
    return game


def fresh_engine():
    gm._channel_edit_next_ok.clear()
    engine = gm.LivePostEngine()
    return engine


async def main():
    now = time.time()
    users = list(range(6000000000000000000, 6000000000000000032))

    # ---- what the post shows -------------------------------------------------
    check("a scheduled game has no post", gm.render_live_post(new_game(live_post={}), KEY) is None)
    starting = gm.render_live_post(new_game(game_start_started_at=int(now)), KEY)
    fields = {f["name"]: f["value"] for f in starting["embed"].to_dict()["fields"]}
    check("start pressed: Starting, 32 reserved", fields.get("Status") == "Starting" and fields.get("Players") == "32 reserved", fields)
    check("the title drops 'Reservations' and links to the archive",
          starting["embed"].title == "Roleplay #88, Road to 56" and starting["embed"].url.endswith(f"/archive/{KEY}"))
    check("only time, host, status, players", list(fields) == ["Time", "Host", "Status", "Players"], list(fields))
    stopped = gm.render_live_post(new_game(game_start_started_at=int(now) - 60, game_start_failed_at=int(now)), KEY)
    check("a failed start says so", stopped["embed"].to_dict()["fields"][2]["value"].startswith("Start stopped"))
    live = new_game(game_started=True, presence_snapshots=[{"present_ids": users[:24]}], late_join_nations=["Nation30"])
    live_fields = {f["name"]: f["value"] for f in gm.render_live_post(live, KEY)["embed"].to_dict()["fields"]}
    check("running: the latest sample plus late joiners", live_fields["Players"] == "25 of 32 in game", live_fields["Players"])
    ended = new_game(game_started=True, status="ended", ended_at=int(now) - 3600, present_ids=users[:28],
                     dropped_out=[users[0]], feedback_ratings={"1": 5, "2": 4, "3": 4})
    ended_post = gm.render_live_post(ended, KEY)
    ended_fields = {f["name"]: f["value"] for f in ended_post["embed"].to_dict()["fields"]}
    check("ended: who played (told the host doesn't count)", ended_fields["Players"] == "27 of 32 played", ended_fields["Players"])
    check("ended: the rating line, and when it closes", "4.3" in ended_fields.get("Rating", "") and "Rating closes" in ended_fields["Rating"], ended_fields)
    check("rating open: not final yet", not ended_post["final"])
    closed = dict(ended, hosting_evaluated=True)
    closed_post = gm.render_live_post(closed, KEY)
    check("rating closed: final, no closing line", closed_post["final"] and "closes" not in closed_post["embed"].to_dict()["fields"][-1]["value"])
    check("cancelled after the start: final", gm.render_live_post(new_game(status="cancelled", game_started=True), KEY)["final"])
    check("cancelled before any start: no post", gm.render_live_post(new_game(status="cancelled", live_post={}), KEY) is None)
    check("same state, same hash", gm.render_live_post(ended, KEY, now)["hash"] == gm.render_live_post(dict(ended), KEY, now)["hash"])
    check("a new rating changes the hash",
          gm.render_live_post(ended, KEY, now)["hash"] != gm.render_live_post(dict(ended, feedback_ratings={"1": 1}), KEY, now)["hash"])
    check("rewards aren't on the post (no edit for a commend)",
          gm.render_live_post(ended, KEY, now)["hash"] == gm.render_live_post(dict(ended, game_action_counts={"6000000000000000001": {"commend": 2}}), KEY, now)["hash"])

    # ---- the engine: first post, no-ops, bursts ------------------------------------
    engine = fresh_engine()
    games.clear()
    games[KEY] = new_game(game_start_started_at=int(now))
    out = await engine.flush((GUILD, KEY))
    check("first flush posts once", out == "sent" and len(fake.sent) == 1 and not fake.edits, (out, len(fake.sent)))
    lp = games[KEY]["live_post"]
    check("the message id is saved, posting_at cleared", lp.get("message_id") == str(fake.sent[0][0]) and "posting_at" not in lp, lp)
    check("posting_at was saved before sending", any(s[1].get("posting_at") for s in saves))
    calls = len(fake.sent) + len(fake.edits)
    out = await engine.flush((GUILD, KEY))
    check("nothing changed: no call", out == "skip" and len(fake.sent) + len(fake.edits) == calls, out)
    for _ in range(200):
        engine.mark(GUILD, KEY, "change")
    check("200 events, one queued update", len(engine._dirty) == 1)
    engine.mark(GUILD, KEY, "status")
    check("a status change raises its priority", engine._dirty[(GUILD, KEY)]["priority"] == 2)
    games[KEY]["game_started"] = True
    engine._channel_buckets.clear()
    out = await engine.flush((GUILD, KEY))
    check("the change is one edit", out == "sent" and len(fake.edits) == 1, (out, len(fake.edits)))

    # ---- the per-channel bucket ---------------------------------------------------
    engine = fresh_engine()
    outcomes = []
    for i in range(4):
        games[KEY]["presence_snapshots"] = [{"present_ids": users[: i + 1]}]
        outcomes.append(await engine.flush((GUILD, KEY)))
    check("3 quick edits, then the channel bucket waits", outcomes[:3] == ["sent"] * 3 and isinstance(outcomes[3], tuple), outcomes)

    # ---- 429, 404, 403 ------------------------------------------------------------
    engine = fresh_engine()
    fake.fail.append(http_error(discord.HTTPException, 429, retry_after=3.0))
    games[KEY]["presence_snapshots"] = [{"present_ids": users[:20]}]
    out = await engine.flush((GUILD, KEY))
    check("429: wait, and the channel is paused", isinstance(out, tuple) and out[1] >= 3.0 and engine._bucket(CHANNEL).wait_time() > 2, out)

    engine = fresh_engine()
    sent_before = len(fake.sent)
    fake.fail.append(http_error(discord.NotFound, 404))
    games[KEY]["presence_snapshots"] = [{"present_ids": users[:21]}]
    out = await engine.flush((GUILD, KEY))
    check("404: posted again once", out == "sent" and len(fake.sent) == sent_before + 1, out)
    fake.fail.append(http_error(discord.NotFound, 404))
    games[KEY]["presence_snapshots"] = [{"present_ids": users[:22]}]
    engine._channel_buckets.clear()
    out = await engine.flush((GUILD, KEY))
    check("deleted again right away: no repost loop", out == "skip" and len(fake.sent) == sent_before + 1, out)
    games[KEY]["live_post"].pop("reposted_at", None)

    engine = fresh_engine()
    notices = []

    async def fake_notice(channel_id):
        notices.append(channel_id)

    gm._live_post_blocked_notice = fake_notice
    fake.fail.append(http_error(discord.Forbidden, 403))
    games[KEY]["presence_snapshots"] = [{"present_ids": users[:23]}]
    out = await engine.flush((GUILD, KEY))
    calls = len(fake.sent) + len(fake.edits)
    out2 = await engine.flush((GUILD, KEY))
    check("403: stops, tells the host log, and doesn't retry right away",
          out == "skip" and notices == [CHANNEL] and out2 == "skip" and len(fake.sent) + len(fake.edits) == calls, (out, notices, out2))
    games[KEY]["live_post"].pop("blocked_until", None)

    # ---- a restart lost the new message id ------------------------------------------
    engine = fresh_engine()
    games["4000000000000000002"] = new_game(game_start_started_at=int(now),
                                            live_post={"channel_id": str(CHANNEL), "posting_at": int(now) - 5})
    mine = type("M", (), {"id": 7777, "author": type("A", (), {"id": None})(),
                          "embeds": [type("E", (), {"url": gm._archive_game_url("4000000000000000002")})()]})()
    gm.bot._connection.user = None  # bot.user is None here, so the author check matches None
    fake.history_messages = [mine]
    sent_before = len(fake.sent)
    out = await engine.flush((GUILD, "4000000000000000002"))
    check("after a restart it adopts its own post instead of posting twice",
          out == "sent" and len(fake.sent) == sent_before and games["4000000000000000002"]["live_post"]["message_id"] == "7777", out)

    # ---- the end: rating, then final forever ----------------------------------------
    engine = fresh_engine()
    games[KEY].update(status="ended", ended_at=int(now) - 3600, present_ids=users[:28], feedback_ratings={"1": 5})
    out = await engine.flush((GUILD, KEY))
    check("ended: edited with the rating", out == "sent" and "Rating" in str(fake.edits[-1][1]))
    games[KEY]["hosting_evaluated"] = True
    engine._channel_buckets.clear()
    out = await engine.flush((GUILD, KEY))
    check("rating closed: last edit, marked final", out == "sent" and games[KEY]["live_post"].get("final"), games[KEY]["live_post"])
    calls = len(fake.sent) + len(fake.edits)
    games[KEY]["game_action_counts"] = {"x": {"warn": 1}}
    games[KEY]["feedback_ratings"] = {"1": 1}
    engine._channel_buckets.clear()
    out = await engine.flush((GUILD, KEY))
    check("a final post is never touched again", out == "skip" and len(fake.sent) + len(fake.edits) == calls)

    # ---- the boot pass -------------------------------------------------------------
    engine = fresh_engine()
    games.clear()
    games["a"] = new_game(game_started=True)                                   # running: re-check
    games["b"] = new_game(status="ended", ended_at=int(now) - 90000, present_ids=[], live_post={})  # ended long ago, never posted
    games["c"] = new_game(public_log_msg_ids=["1"], live_post=None, game_started=True)  # the old log posted it
    games["d"] = new_game(status="ended", live_post={"final": True})
    count = engine.boot(GUILD)
    check("after a restart only the running game is re-checked", count == 1 and list(engine._dirty) == [(GUILD, "a")], list(engine._dirty))

    # ---- rating ------------------------------------------------------------------------
    rated = new_game(status="ended", ended_at=int(now) - 600, feedback_eligible=[111, 222], feedback_ratings={},
                     feedback_merit_awarded=[], hosting_evaluated=False)
    store = {KEY: rated}
    merits, marks = [], []

    async def fake_load():
        return store

    async def fake_merit(user_id, delta, **kwargs):
        merits.append((user_id, delta))
        return {"new": 1}

    gm._load_games_resilient = fake_load
    gm._apply_merit_change = fake_merit
    gm.mark_live_post_dirty = lambda key, reason="change", gid=None: marks.append(reason)
    first = await gm._record_game_rating(KEY, 111, 4)
    marks_after_first = list(marks)
    again = await gm._record_game_rating(KEY, 111, 5)
    stranger = await gm._record_game_rating(KEY, 333, 5)
    check("a present player rates: saved, 1 Merit, post marked", first["ok"] and first["merit"] == 1 and marks_after_first == ["rating"], marks_after_first)
    check("changing it: no second Merit", again["ok"] and again["merit"] == 0 and rated["feedback_ratings"]["111"] == 5 and len(merits) == 1)
    check("someone who wasn't present can't", not stranger["ok"] and "present" in stranger["error"])
    rated["hosting_evaluated"] = True
    late = await gm._record_game_rating(KEY, 222, 3)
    check("after the judgement rating is closed", not late["ok"] and "closed" in late["error"])

    embed, view = gm.build_rating_dm(dict(rated, hosting_evaluated=False), GUILD, KEY, chosen=4, merit=1)
    buttons = [item for item in view.children if isinstance(item, gm.GameRatingButton)]
    check("the DM: five star buttons, the chosen one green",
          len(buttons) == 5 and buttons[3].item.style == discord.ButtonStyle.success and "4 stars" in embed.description)
    _embed, closed_view = gm.build_rating_dm(rated, GUILD, KEY)
    check("closed: the buttons are disabled", all(b.item.disabled for b in closed_view.children if isinstance(b, gm.GameRatingButton)))
    check("the button id fits Discord's 100 characters", all(len(b.custom_id) <= 100 for b in buttons))

    # ---- stale saves ---------------------------------------------------------------------
    incoming = {"feedback_ratings": {"111": 2}, "feedback_rated_at": {"111": 100}, "live_post": {"channel_id": "1"}}
    existing = {"feedback_ratings": {"111": 5, "222": 3}, "feedback_rated_at": {"111": 200, "222": 50},
                "live_post": {"channel_id": "1", "message_id": "42", "final": True, "sent_at": 9}}
    gm._preserve_sticky_game_fields(incoming, existing)
    check("a stale save keeps newer and missing ratings", incoming["feedback_ratings"] == {"111": 5, "222": 3}, incoming["feedback_ratings"])
    check("a stale save keeps the post's message id and final",
          incoming["live_post"].get("message_id") == "42" and incoming["live_post"].get("final"), incoming["live_post"])

    print("\n".join(results))
    print(f"\n{sum(r.startswith('PASS') for r in results)}/{len(results)} passed")


asyncio.run(main())
