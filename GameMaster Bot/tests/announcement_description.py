"""The host's note under a game announcement's map link (2026-11-11).

Game setup → Description: shown after one empty line as a ❗ quote, cleaned
(trimmed, at most 6 lines / 400 characters) and never able to ping anyone.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/announcement_description.py"
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
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{'  (' + repr(detail) + ')' if detail and not ok else ''}")


clean = gm._clean_game_description
block = gm._announcement_description_block
swap = gm._replace_announcement_description

check("nothing gives no note", block("") == "" and block(None) == "" and block("   \n  ") == "")
check("one line: an empty line, then a ❗ quote", block("Bring snacks") == "\n\n> ❗ Bring snacks", block("Bring snacks"))
check("more lines stay in the quote", block("Line one\nLine two") == "\n\n> ❗ Line one\n> Line two", block("Line one\nLine two"))
check("blank runs and edges are trimmed", clean("\n\n  a  \n\n\n\nb\n\n") == "a\n\nb", clean("\n\n  a  \n\n\n\nb\n\n"))
check("at most 6 lines", clean("\n".join(str(i) for i in range(10))).count("\n") == 5)
check("at most 400 characters", len(clean("x" * 1000)) == 400)
defused = clean("@everyone and @here, <@123456789012345678> <@!123456789012345678> <@&987654321098765432>")
check("mentions can't ping", "@everyone" not in defused and "@here" not in defused and "<@1" not in defused and "<@&" not in defused and "<@!" not in defused, defused)
check("cleaning twice changes nothing", clean(defused) == defused)

post = (
    "# 🔔 Game Announcement 🔔\n||<@&1>||\n\n"
    "**:clock4: <t:1:F> (<t:1:R>)**\n**:video_game: Host - <@2>**\n"
    "**:pencil: [Reserve Here](<https://x/map?game=3>)**"
)
with_note = swap(post, "Old note")
check("a note is added under the link", with_note == post + "\n\n> ❗ Old note", with_note)
check("a note is replaced", swap(with_note, "New note") == post + "\n\n> ❗ New note")
check("a note is removed", swap(with_note, "") == post)
check("a post without the link line is left alone", swap("hello", "x") == "hello")
down = "\n⚠️ *The Casino is down: reserve on the map instead.*"
check("the Casino-down line stays last", swap(post + "\n\n> ❗ Old" + down, "New") == post + "\n\n> ❗ New" + down)

print("\n".join(results))
failed = sum(1 for line in results if line.startswith("FAIL"))
print(f"\n{len(results) - failed}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
