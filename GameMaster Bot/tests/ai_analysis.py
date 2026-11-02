"""AI chat-log analysis (docs/ai-log-analysis.md).

Loads bot.py.py without starting the bot or touching any database; Gemini is
faked. Checks: out-of-character one-liners aren't counted, several log files
are read as one game, the instructions the AI gets, the request settings
(Google Search + the exact answer shape, and the fallbacks when Google refuses
a combination), and a full grading run with the game summary.

Run from the repo root with the bot's packages installed:
  python "GameMaster Bot/tests/ai_analysis.py"
"""
import asyncio
import importlib.util
import json
import os
import sys

BOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BOT)
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
spec = importlib.util.spec_from_file_location("gm", os.path.join(BOT, "bot.py.py"))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

results = []


def check(name, condition):
    results.append((name, bool(condition)))
    print(("PASS " if condition else "FAIL ") + name)


# ---- Out-of-character one-liners --------------------------------------------
for text in ["unpause", "lag?", "gg wp", "((brb))", "ooc: who has the save", "p"]:
    check(f"OOC: {text!r}", gm._is_ooc_payload(text))
check("OOC: 'speed up pls' is NOT dropped (pls isn't a control word)", not gm._is_ooc_payload("speed up pls"))
for text in ["Our troops march on Paris.", "Save the King!", "The Reich demands Danzig.", "No."]:
    check(f"RP kept: {text!r}", not gm._is_ooc_payload(text))

LOG = "\n".join([
    "SOVNikoloza: unpause",
    "SOVNikoloza: lag?",
    "SOVNikoloza: Comrades, the motherland calls upon every worker to take up arms.",
    "GERWilhelm: gg",
    "GERWilhelm: The Reich offers peace to all who respect its borders.",
])
sov = gm._authoritative_nation_rp_stats(LOG, "SOV")
check("Counts skip OOC lines (SOV: 1 RP line)", sov["rp_lines"] == 1)
check("Counts skip OOC words (SOV: 11 words)", sov["rp_words"] == 11)

# ---- Several files, one game ------------------------------------------------
one = gm._chat_log_bundle([{"file_id": 7, "filename": "a.txt", "content": "SOVX: hello", "bytes": 11, "uploaded_at": 100}])
check("One file: the text is the file itself", one["text"] == "SOVX: hello" and one["filename"] == "a.txt")
two = gm._chat_log_bundle([
    {"file_id": 7, "filename": "part1.txt", "content": "SOVX: first", "bytes": 11, "uploaded_at": 100},
    {"file_id": 9, "filename": "part2.txt", "content": "SOVX: second", "bytes": 12, "uploaded_at": 200},
])
check("Two files: marked in order", two["text"].index("FILE 1 of 2: part1.txt") < two["text"].index("FILE 2 of 2: part2.txt"))
check("Two files: both texts kept", "SOVX: first" in two["text"] and "SOVX: second" in two["text"])
check("Two files: summary name and newest upload", two["filename"] == "2 files" and two["uploaded_at"] == 200)
check("Signature changes with the set of files", one["signature"] != two["signature"])
check("File markers aren't counted as anyone's words", gm._authoritative_nation_rp_stats(two["text"], "SOV")["rp_lines"] == 2)

# ---- What the AI is told ----------------------------------------------------
slots = [{"tag": "SOV", "nation": "Soviet Union", "role": "MAIN", "user_id": "111", "name": "niko"}]
stats = {"SOV": gm._authoritative_nation_rp_stats(LOG, "SOV")}
prompt = gm._ai_grading_prompt(two["text"], slots, stats, {"mode": "Kaiserreich (FFA)", "files": 2})
for needle, label in [
    ("Kaiserreich", "names the game mode and its setting"),
    ("NOT a history re-enactment", "says RP games aren't historical"),
    ("Google Search", "may look things up"),
    ("CHAT LOG FILE n of N", "explains several files are one game"),
    ('"unpause"', "ignores game-control chat"),
    ("lobby talk at the very start", "ignores the early lobby chat"),
    ("roster's nation names", "mods can reuse tags"),
    ("game_summary", "asks for the game summary"),
]:
    check(f"Prompt {label}", needle in prompt)
for mode, expected in [
    ("Roleplay", "Road to 56"),
    ("Roleplay (Millennium Dawn)", "Millennium Dawn"),
    ("Roleplay (Novum Vexillum)", "Novum Vexillum"),
    ("TFR", "The Fire Rises"),
    ("Kaiserreich (FFA)", "Kaiserreich"),
    ("Historical (TFB)", "historical game"),
]:
    check(f"Mode note for {mode!r} mentions {expected!r}", expected in gm._ai_mode_note(mode))
historical = gm._ai_grading_prompt(LOG, slots, stats, {"mode": "Historical (Vanilla)", "files": 1})
check("Historical games aren't told they're non-historical", "NOT a history re-enactment" not in historical and "historical game" in historical)
check("Prompt (one file) doesn't mention several files", "CHAT LOG FILE n of N" not in gm._ai_grading_prompt(LOG, slots, stats, {"mode": "Vanilla", "files": 1}))
check("Default model is Gemini 3.8 Flash", os.getenv("GEMINI_MODEL") or gm.GEMINI_MODEL == "gemini-3.8-flash")

# ---- Request settings and fallbacks -------------------------------------------
names = [name for name, _ in gm._gemini_configs(gm._AI_RESPONSE_SCHEMA)]
check("Settings order: search+schema, search, schema", names == ["search+schema", "search", "schema"])
first = gm._gemini_configs(gm._AI_RESPONSE_SCHEMA)[0][1]
check("First try has Google Search and the exact shape", first["tools"] == [{"google_search": {}}] and "response_json_schema" in first)


class FakeModels:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls = []

    async def generate_content(self, model, contents, config):
        self.calls.append((model, config))
        outcome = self.behaviour(len(self.calls), config)
        if isinstance(outcome, Exception):
            raise outcome
        return type("Response", (), {"text": outcome})()


def fake_client(behaviour):
    models = FakeModels(behaviour)
    gm.client = type("Client", (), {"aio": type("Aio", (), {"models": models})()})()
    return models


async def no_sleep(_seconds):
    return None


gm.asyncio.sleep = no_sleep


def refuses_search_with_schema(_call, config):
    if "tools" in config and "response_json_schema" in config:
        return Exception("400 INVALID_ARGUMENT: tool use with a response schema is unsupported")
    return '{"game_summary": "", "players": []}'


gm._gemini_config_ok = None
models = fake_client(refuses_search_with_schema)
text = asyncio.run(gm._gemini_json("prompt", gm._AI_RESPONSE_SCHEMA))
check("Refused combination falls back to the next settings", json.loads(text) == {"game_summary": "", "players": []})
check("Fallback used Search without the schema", "tools" in models.calls[-1][1] and "response_json_schema" not in models.calls[-1][1])
check("Model sent is the configured one", models.calls[0][0] == gm.GEMINI_MODEL)
models = fake_client(refuses_search_with_schema)
asyncio.run(gm._gemini_json("prompt", gm._AI_RESPONSE_SCHEMA))
check("Next run starts with the settings that worked", len(models.calls) == 1)

gm._gemini_config_ok = None
models = fake_client(lambda call, _config: Exception("503 UNAVAILABLE overloaded") if call < 3 else '{"ok": 1}')
check("Overload is retried, then succeeds", json.loads(asyncio.run(gm._gemini_json("p", None))) == {"ok": 1})

gm._gemini_config_ok = None
fake_client(lambda _call, _config: Exception("403 PERMISSION_DENIED: API key not valid"))
try:
    asyncio.run(gm._gemini_json("p", None))
    check("A bad API key is reported, not hidden behind fallbacks", False)
except Exception as error:
    check("A bad API key is reported, not hidden behind fallbacks", "API key" in str(error))

# ---- A full grading run -----------------------------------------------------
gm._gemini_config_ok = None
answer = {
    "game_summary": "The Soviet Union and Germany traded threats over Poland before a tense peace.",
    "players": [
        {"tag": "SOV", "user_id": "111", "in_character_share": 0.9, "share_of_tag": 1, "creativity": 8, "toxicity": 0,
         "low_effort": False, "left_early": False, "summary": "Fiery speeches.", "snippets": ["Comrades, the motherland calls"]},
        {"tag": "GER", "user_id": "", "in_character_share": 0.8, "share_of_tag": 1, "creativity": 5, "toxicity": 0,
         "low_effort": False, "left_early": False, "summary": "Short peace offer.", "snippets": []},
    ],
}
fake_client(lambda _call, _config: json.dumps(answer))
gm.SERVER_FEATURES = {"valor_merit": True} if not hasattr(gm, "SERVER_FEATURES") else gm.SERVER_FEATURES
analysis = asyncio.run(gm.run_ai_log_analysis(LOG, {"Soviet Union": "111"}, None, merit_enabled=True, context={"mode": "Vanilla", "files": 1}))
check("Run returns an analysis", isinstance(analysis, dict))
if isinstance(analysis, dict):
    check("Game summary is kept", analysis["game_summary"].startswith("The Soviet Union"))
    check("Model is recorded", analysis["model"] == gm.GEMINI_MODEL)
    by_tag = {player["tag"]: player for player in analysis["players"]}
    check("Reserved player graded", by_tag.get("SOV", {}).get("user_id") == "111" and by_tag["SOV"]["creativity"] == 8)
    check("Unreserved nation matched with an empty user_id", "GER" in by_tag and by_tag["GER"]["creativity"] == 5)

failed = [name for name, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
