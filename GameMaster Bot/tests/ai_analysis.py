"""AI chat-log analysis (docs/ai-log-analysis.md).

Loads bot.py.py without starting the bot or touching any database; Claude is
faked. Checks: out-of-character one-liners aren't counted, several log files
are read as one game, the instructions the AI gets, the request to Claude
(model, exact answer shape, effort) and the reasons shown to hosts when it
fails, and a full grading run with the game summary.

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
    ("never mark roleplay down because you don't recognise it", "doesn't punish unfamiliar lore"),
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
check("Default model is Claude Haiku 5.5", os.getenv("AI_MODEL") or gm.AI_MODEL == "claude-haiku-5-5")

# ---- The request to Claude (faked) ---------------------------------------------
import anthropic  # noqa: E402
import httpx2  # noqa: E402  (anthropic 2.x is built on httpx2)

schema = gm._AI_RESPONSE_SCHEMA
check("Answer shape is closed (structured output needs additionalProperties: false)",
      schema["additionalProperties"] is False and schema["properties"]["players"]["items"]["additionalProperties"] is False)


class Block:
    def __init__(self, type_, text=""):
        self.type, self.text = type_, text


class FakeStream:
    def __init__(self, outcome):
        self.outcome = outcome

    async def __aenter__(self):
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self

    async def __aexit__(self, *exc):
        return False

    async def get_final_message(self):
        stop_reason, text = self.outcome
        return type("Message", (), {
            "stop_reason": stop_reason,
            "content": [Block("thinking"), Block("text", text)],
            "usage": type("Usage", (), {"input_tokens": 30000, "output_tokens": 5000})(),
        })()


class FakeMessages:
    def __init__(self, outcome):
        self.outcome, self.calls = outcome, []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream(self.outcome)


def fake_client(outcome):
    messages = FakeMessages(outcome)
    gm.client = type("Client", (), {"messages": messages})()
    return messages


def api_error(cls, status, message):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls(message, response=httpx2.Response(status, request=request), body=None)


def ai_error(outcome):
    fake_client(outcome)
    try:
        asyncio.run(gm._ai_json("p", schema))
        return None
    except gm.AIError as error:
        return str(error)


messages = fake_client(("end_turn", '{"ok": 1}'))
check("Answer text is returned (thinking blocks skipped)", json.loads(asyncio.run(gm._ai_json("prompt", schema))) == {"ok": 1})
sent = messages.calls[0]
check("Model sent is the configured one", sent["model"] == gm.AI_MODEL)
check("Structured output asks for the exact shape", sent["output_config"]["format"] == {"type": "json_schema", "schema": schema})
check("Effort is set explicitly", sent["output_config"]["effort"] == "medium")
check("The prompt goes in one user message", sent["messages"] == [{"role": "user", "content": "prompt"}])
check("No web search tool is sent", "tools" not in sent)

check("Refusal is reported", "declined" in (ai_error(("refusal", "")) or ""))
check("A cut-off answer is reported", "cut off" in (ai_error(("max_tokens", '{"ok"')) or ""))
check("A bad API key is named", "ANTHROPIC_API_KEY" in (ai_error(api_error(anthropic.AuthenticationError, 401, "invalid x-api-key")) or ""))
check("No credits left is explained", "out of credits" in (ai_error(api_error(
    anthropic.BadRequestError, 400, "Your credit balance is too low to access the Anthropic API.")) or ""))
check("A wrong model name is named", "AI_MODEL" in (ai_error(api_error(anthropic.NotFoundError, 404, "model not found")) or ""))
check("Rate limiting is explained", "rate-limiting" in (ai_error(api_error(anthropic.RateLimitError, 429, "rate limited")) or ""))
check("An Anthropic outage is explained", "trouble" in (ai_error(api_error(anthropic.InternalServerError, 500, "boom")) or ""))

# ---- A full grading run -----------------------------------------------------
answer = {
    "game_summary": "The Soviet Union and Germany traded threats over Poland before a tense peace.",
    "players": [
        {"tag": "SOV", "user_id": "111", "in_character_share": 0.9, "share_of_tag": 1, "creativity": 8, "toxicity": 0,
         "low_effort": False, "left_early": False, "summary": "Fiery speeches.", "snippets": ["Comrades, the motherland calls"]},
        {"tag": "GER", "user_id": "", "in_character_share": 0.8, "share_of_tag": 1, "creativity": 5, "toxicity": 0,
         "low_effort": False, "left_early": False, "summary": "Short peace offer.", "snippets": []},
    ],
}
fake_client(("end_turn", json.dumps(answer)))
gm.SERVER_FEATURES = {"valor_merit": True} if not hasattr(gm, "SERVER_FEATURES") else gm.SERVER_FEATURES
analysis = asyncio.run(gm.run_ai_log_analysis(LOG, {"Soviet Union": "111"}, None, merit_enabled=True, context={"mode": "Vanilla", "files": 1}))
check("Run returns an analysis", isinstance(analysis, dict))
if isinstance(analysis, dict):
    check("Game summary is kept", analysis["game_summary"].startswith("The Soviet Union"))
    check("Model is recorded", analysis["model"] == gm.AI_MODEL)
    by_tag = {player["tag"]: player for player in analysis["players"]}
    check("Reserved player graded", by_tag.get("SOV", {}).get("user_id") == "111" and by_tag["SOV"]["creativity"] == 8)
    check("Unreserved nation matched with an empty user_id", "GER" in by_tag and by_tag["GER"]["creativity"] == 5)
fake_client(api_error(anthropic.AuthenticationError, 401, "invalid x-api-key"))
failed_run = asyncio.run(gm.run_ai_log_analysis(LOG, {"Soviet Union": "111"}, None, merit_enabled=True, context={"mode": "Vanilla", "files": 1}))
check("A failed run tells the host why", isinstance(failed_run, str) and "ANTHROPIC_API_KEY" in failed_run)

failed = [name for name, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
