"""The Discord audit log copy is a switch (docs/audit-and-tickets-on-web-plan.md, Stage 3).

Loads bot.py.py without starting the bot or touching any database. Checks
that audit copies reach Discord only with "Copy the audit log to Discord"
on, that the audit trail row is written either way, that alerts and requests
for staff still reach a channel with the copy off, that saved settings from
before the switch keep their copy, and that the ticket transcript channels
are gone.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/audit_mirror.py"
"""
import asyncio
import importlib.util
import os

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

AUDIT, NOTICES = 7000000000000000001, 7000000000000000002
results = []


def check(name, ok, detail=""):
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + str(detail) + ')' if detail and not ok else ''}")


class Channel:
    def __init__(self, cid):
        self.id = cid
        self.sent = []

    async def send(self, content=None, embed=None, **kwargs):
        self.sent.append(content or (embed.title if embed else ""))
        return type("M", (), {"jump_url": "x", "id": 1})()


channels = {AUDIT: Channel(AUDIT), NOTICES: Channel(NOTICES)}
gm.bot.get_channel = lambda cid: channels.get(cid)
trail = []
gm._audit_mirror_embed = lambda embed=None, content=None: trail.append(content or getattr(embed, "title", ""))


def configure(mirror: bool, notices: bool = True):
    globals_ = gm.__dict__
    globals_["HOST_LOG_CHANNEL_ID"] = AUDIT
    globals_["HOST_LOG_WEBHOOK_URL"] = None
    globals_["HOST_MANAGEMENT_CHANNEL_ID"] = NOTICES if notices else 0
    gm.SERVER_FEATURES["audit_discord_mirror"] = mirror
    for channel in channels.values():
        channel.sent.clear()
    trail.clear()


async def main():
    gm._RUNTIME_INSTALLED_BACKUP = gm._RUNTIME_INSTALLED
    gm.__dict__["_RUNTIME_INSTALLED"] = False  # G.* reads the module values set above

    configure(mirror=False)
    await gm.send_log_message("Auto-VC made 3 channels")
    check("copy off: nothing posted in the audit channel", channels[AUDIT].sent == [])
    check("copy off: the audit trail row is still written", trail == ["Auto-VC made 3 channels"], trail)
    import discord
    out = await gm.send_host_log_embed(discord.Embed(title="Commend given"))
    check("copy off: embeds aren't posted either (and no evidence link)", out is None and channels[AUDIT].sent == [])
    check("copy off: helper gives no audit channel", gm._audit_channel() is None)
    check("copy off: alerts still go to Staff notices", gm._staff_notice_channel() is channels[NOTICES])
    configure(mirror=False, notices=False)
    check("copy off and no Staff notices: alerts fall back to the audit channel", gm._staff_notice_channel() is channels[AUDIT])

    configure(mirror=True)
    await gm.send_log_message("Auto-VC made 3 channels")
    check("copy on: posted in the audit channel", channels[AUDIT].sent == ["Auto-VC made 3 channels"], channels[AUDIT].sent)
    out = await gm.send_host_log_embed(discord.Embed(title="Commend given"))
    check("copy on: embeds posted, with the evidence link", out is not None and "Commend given" in channels[AUDIT].sent)
    check("copy on: helper gives the audit channel", gm._audit_channel() is channels[AUDIT])

    # Saved settings from before the switch.
    old_with = gm._normalize_guild_settings({"channels": {"host_log": str(AUDIT)}, "features": {"valor_merit": True}})
    old_without = gm._normalize_guild_settings({"channels": {}, "features": {"valor_merit": True}})
    chosen = gm._normalize_guild_settings({"channels": {"host_log": str(AUDIT)}, "features": {"audit_discord_mirror": False}})
    check("old settings with an audit channel keep their copy", old_with["features"]["audit_discord_mirror"] is True)
    check("old settings without one don't get a copy", old_without["features"]["audit_discord_mirror"] is False)
    check("an owner's choice to turn it off is kept", chosen["features"]["audit_discord_mirror"] is False)
    check("new servers start without a copy", gm._default_guild_settings()["features"]["audit_discord_mirror"] is False)
    check("the ticket transcript channels are gone from settings",
          "ticket_log" not in gm.SETTINGS_CHANNEL_KEYS and "ticket_private_log" not in gm.SETTINGS_CHANNEL_KEYS
          and "ticket_log" not in old_with["channels"])
    gm.__dict__["_RUNTIME_INSTALLED"] = gm._RUNTIME_INSTALLED_BACKUP

    print("\n".join(results))
    print(f"\n{sum(r.startswith('PASS') for r in results)}/{len(results)} passed")


asyncio.run(main())
