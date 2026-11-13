"""/health (2026-11-12): the bot, the website and the database, each with a
green or red square, and the status page's 30-day uptime squares.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/health.py"
"""
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


days = [{"day": f"2026-10-{d:02d}", "percent": p} for d, p in zip(range(1, 31), [100.0] * 27 + [97.0, 80.0, None])]
status = {"days": days, "uptime_30d": 99.1}

gm.bot._connection._intents.message_content = True
up = gm._health_embed((True, "24 ms"), (True, "310 ms", status), 87, 4, 3 * 3600 + 12 * 60)
fields = {f.name: f.value for f in up.fields}
check("all up: green embed", up.color.value == gm.EmbedColor.SUCCESS, up.color)
check("all up: says so", "All systems are up" in up.description)
check("the bot row is green with latency, uptime, servers and message text",
      fields.get("🟩 Bot") == "Online · 87 ms\nUp 3h 12m · 4 server(s)\nReads message text ✅", fields)
check("message text on: no warning", not any("Message text is off" in name for name in fields), list(fields))
check("the website row is green with its time", fields.get("🟩 Website") == "Online · 310 ms", fields)
check("the database row is green with its time", fields.get("🟩 Database") == "Online · 24 ms", fields)
bars = fields.get("Uptime, last 30 days · 99.1%", "")
check("30 daily squares like the status page", bars == "🟩" * 27 + "🟨🟥⬛", bars)

gm.bot._connection._intents.message_content = False
down = gm._health_embed((False, "no answer in 8 s"), (False, "unreachable (ClientConnectorError)", None), None, 4, 50)
fields = {f.name: f.value for f in down.fields}
check("message text off: the bot row says so", "Can't read message text" in fields.get("🟩 Bot", ""), fields)
warning = fields.get("⚠️ Message text is off", "")
check("message text off: how to turn it on", "Message Content" in warning and "MESSAGE_CONTENT_INTENT=1" in warning, fields)
check("something down: red embed", down.color.value == gm.EmbedColor.DANGER, down.color)
check("the website row turns red with why", fields.get("🟥 Website") == "Down · unreachable (ClientConnectorError)", fields)
check("the database row turns red with why", fields.get("🟥 Database") == "Down · no answer in 8 s", fields)
check("no status data: no uptime row", not any(name.startswith("Uptime") for name in fields), list(fields))
check("a bot still connecting shows it", fields.get("🟩 Bot", "").startswith("Online · connecting"), fields)

check("square thresholds match the status page",
      [gm._health_day_square(p) for p in (100, 99.5, 99.4, 95, 94.9, None)] == ["🟩", "🟩", "🟨", "🟨", "🟥", "⬛"])
check("durations read naturally", [gm._health_duration(s) for s in (59, 3700, 90000)] == ["0m", "1h 1m", "1d 1h"])

for line in results:
    print(line)
passed = sum(line.startswith("PASS") for line in results)
print(f"{passed}/{len(results)} passed")
raise SystemExit(0 if passed == len(results) else 1)
