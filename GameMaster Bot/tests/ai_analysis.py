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


def check(name, condition, detail=None):
    results.append((name, bool(condition)))
    print(("PASS " if condition else "FAIL ") + name + ("" if condition or detail is None else f"  ({detail})"))


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
    """Both endpoints record into the same list; `beta` tells which was used."""
    messages = FakeMessages(outcome)
    beta = FakeMessages(outcome)
    beta.calls = messages.calls

    def beta_stream(**kwargs):
        return FakeMessages.stream(beta, **kwargs, beta=True)

    beta.stream = beta_stream
    gm.client = type("Client", (), {"messages": messages, "beta": type("Beta", (), {"messages": beta})()})()
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
real_model = gm.AI_MODEL
gm.AI_MODEL = "claude-haiku-5-5"
messages = fake_client(("end_turn", '{"ok": 1}'))
asyncio.run(gm._ai_json("prompt", schema))
check("Haiku: plain endpoint, no fallbacks (Haiku has none)",
      "beta" not in messages.calls[0] and "fallbacks" not in messages.calls[0] and messages.calls[0]["model"] == "claude-haiku-5-5")
gm.AI_MODEL = "claude-sonnet-5-5"
messages = fake_client(("end_turn", '{"ok": 1}'))
asyncio.run(gm._ai_json("prompt", schema))
check("Sonnet (AI_MODEL): refusal fallback is on (beta endpoint, fallbacks default)",
      messages.calls[0].get("beta") is True and messages.calls[0].get("fallbacks") == "default"
      and messages.calls[0].get("betas") == [gm.AI_FALLBACK_BETA])
gm.AI_MODEL = real_model

check("Refusal is reported", "declined" in (ai_error(("refusal", "")) or ""))
check("A cut-off answer is reported", "cut off" in (ai_error(("max_tokens", '{"ok"')) or ""))
check("A bad API key is named", "ANTHROPIC_API_KEY" in (ai_error(api_error(anthropic.AuthenticationError, 401, "invalid x-api-key")) or ""))
check("No credits left is explained", "out of credits" in (ai_error(api_error(
    anthropic.BadRequestError, 400, "Your credit balance is too low to access the Anthropic API.")) or ""))
check("A wrong model name is named", "AI_MODEL" in (ai_error(api_error(anthropic.NotFoundError, 404, "model not found")) or ""))
check("Rate limiting is explained", "rate-limiting" in (ai_error(api_error(anthropic.RateLimitError, 429, "rate limited")) or ""))
check("An Anthropic outage is explained", "trouble" in (ai_error(api_error(anthropic.InternalServerError, 500, "boom")) or ""))

# ---- The reward rules (lowered 19 Nov 2026) -----------------------------------
def reward(words, creativity, merit=True):
    r = gm._ai_reward(words, creativity, 0, False, merit)
    return (r["commends"], r["merit"])


for words, creativity, expected, label in [
    (149, 9, (0, 0), "149 words: nothing"),
    (150, 4, (0, 2), "150 words, creativity 4: 2 Merit"),
    (150, 3, (0, 0), "150 words, creativity 3: nothing"),
    (300, 5, (0, 3), "300 words, creativity 5: 3 Merit"),
    (300, 4, (0, 2), "300 words, creativity 4: 2 Merit (3 needs 5)"),
    (450, 5, (0, 4), "450 words, creativity 5: 4 Merit"),
    (600, 6, (1, 0), "600 words, creativity 6: 1 commend"),
    (600, 5, (0, 4), "600 words, creativity 5: 4 Merit (a commend needs 6)"),
    (1200, 7, (2, 0), "1,200 words, creativity 7: 2 commends"),
    (1200, 6, (1, 0), "1,200 words, creativity 6: 1 commend (2 need 7)"),
    (2500, 8, (3, 0), "2,500 words, creativity 8: 3 commends"),
    (2500, 7, (2, 0), "2,500 words, creativity 7: 2 commends (3 need 8)"),
]:
    check(f"Rules: {label}", reward(words, creativity) == expected)
check("Rules: Merit off, 600 words creativity 5 gets nothing", reward(600, 5, merit=False) == (0, 0))
check("Rules: Merit off, 600 words creativity 6 gets 1 commend", reward(600, 6, merit=False) == (1, 0))
check("Rules: why names the creativity needed", "needs 4/10" in gm._ai_reward(200, 3, 0, False, True)["why"])
rules = gm._ai_rules()
check("Rules for the website carry each tier's creativity", rules["merit_tiers"][-1] == [150, 2, 4] and rules["commend_tiers"][0] == [2500, 3, 8])

# ---- Shared nations: who wrote what --------------------------------------------
FRANCE_LOG = "\n".join([
    "FRAnezemennn joined.",
    "[19:20] (\x12FRAnezemennn): The bonapartes have been gaining more and more power in the Country.",
    "[19:25] (\x12FRAnezemennn): We will fully take over the Benelux region and reintegrate them.",
    "[19:30] (\x12FRA56789): France is not lost yet we will fight on!",
    "[19:31] (\x12FRA56789): unpause",
    "[19:32] (\x12GERWilhelm): The Reich offers peace.",
])
speakers = gm._ai_tag_speakers(FRANCE_LOG, "FRA")
check("Speakers: in-game names under the tag, OOC and joins left out", speakers == {"nezemennn": 23, "56789": 9}, speakers)
check("Names: 'nezemennn' matches Discord 'ne_zemen'", gm._ai_name_score("nezemennn", ["ne_zemen", "Ne Zemen"]) >= gm._AI_NAME_MATCH)
check("Names: '56789' doesn't match 'Apap Noc'", gm._ai_name_score("56789", ["nie4321", "Apap Noc"]) < gm._AI_NAME_MATCH)
france = [
    {"tag": "FRA", "nation": "France", "user_id": "1", "role": "MAIN", "name": "nie4321", "names": ["nie4321", "Apap Noc"]},
    {"tag": "FRA", "nation": "France", "user_id": "2", "role": "COOP", "name": "ne_zemen", "names": ["ne_zemen", "Ne Zemen"]},
]
coop = gm._ai_coop_speakers(FRANCE_LOG, france)
check("Co-op: the co-op gets their own in-game name", coop[1]["speakers"] == ["nezemennn"], coop)
check("Co-op: the unmatched name goes to the one player left", coop[0]["speakers"] == ["56789"], coop)
check("Co-op: shares come from the words each wrote", abs(coop[1]["share"] - 23 / 32) < 1e-9 and abs(coop[0]["share"] - 9 / 32) < 1e-9, coop)
three = france + [{"tag": "FRA", "nation": "France", "user_id": "3", "role": "COOP", "name": "zed", "names": ["zed_x"]}]
coop3 = gm._ai_coop_speakers(FRANCE_LOG, three)
check("Co-op: with two unplaced players the bot doesn't guess (AI decides)", coop3[0]["share"] is None and coop3[1]["speakers"] == ["nezemennn"], coop3)
fra_stats = {"FRA": gm._authoritative_nation_rp_stats(FRANCE_LOG, "FRA"), "GER": gm._authoritative_nation_rp_stats(FRANCE_LOG, "GER")}
fra_prompt = gm._ai_grading_prompt(FRANCE_LOG, france, fra_stats, {"mode": "Roleplay", "files": 1}, coop)
check("Prompt: tells the AI which in-game names are the co-op's", "in-game name(s): nezemennn" in fra_prompt)
check("Prompt: a nation can have any number of players", "any number of players" in fra_prompt)
ai_rows = [  # the AI repeats its old mistake: all of France's lines to the main
    {"tag": "FRA", "user_id": "1", "in_character_share": 1, "share_of_tag": 1, "creativity": 6, "toxicity": 0,
     "low_effort": False, "left_early": False, "summary": "", "snippets": []},
    {"tag": "FRA", "user_id": "2", "in_character_share": 1, "share_of_tag": 0, "creativity": 6, "toxicity": 0,
     "low_effort": False, "left_early": False, "summary": "", "snippets": []},
]
assembled = gm._ai_assemble(france, fra_stats, ai_rows, True, coop)
words_fra = fra_stats["FRA"]["rp_words"]
check("Co-op: the bot's share wins over the AI's wrong one",
      assembled[1]["meaningful_words"] == round(words_fra * 23 / 32) and assembled[0]["meaningful_words"] == round(words_fra * 9 / 32)
      and assembled[1]["meaningful_words"] > assembled[0]["meaningful_words"] > 0,
      [(p["user_id"], p["meaningful_words"]) for p in assembled])
check("Co-op: Discord names aren't stored in the results", all("names" not in p for p in assembled))

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
