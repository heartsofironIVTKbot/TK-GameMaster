# Chat log + AI analysis

After a game, the host uploads the HOI4 chat log on the website and the AI
grades everyone's roleplay. The result, the story and the roleplay itself go
on the public **roleplay archive** (`/roleplay`). This replaced the Host
Control Center's "Upload Chat Log" / "Run AI Analysis" buttons (October
2026).

## For hosts (Games page)

1. Open the game on the **Games page** (it must have started; it can still
   be running or already ended).
2. In **Chat log & AI analysis**, click **Add .txt files** (or drop them on
   the box). A game rehosted after a crash, or a log saved in parts, gets
   **every file**: the AI reads them as **one game**, in the order shown.
   **↑ ↓** fix the order, **✕** removes a file. Up to 10 files and 3 MB in
   all per game (HOI4 logs are usually well under 1 MB).
3. Click **Run the AI analysis**. Long logs can take a minute or two.
4. The results list every player: in-character words, creativity, toxicity,
   the verdict (commend / Merit / nothing) and why, plus up to 3 lines from
   the log. Above them, the AI's 2-4 sentence recap of the game's story.
5. **Nothing is given automatically.** Click **Give** next to a player to give
   what the AI recommended. It goes through the same moderation engine as
   the Database page (host log, the player's record) and the row shows
   **✓ Given**.
6. Changed the files after a run? The card says the analysis is out of date:
   run it again.

The first time a set of files is analyzed, the bot also:
- posts the files (up to 10, Discord's limit) to the mode's public log
  archive channel, with a link to the game's roleplay page (just the link
  if the files are too big for Discord);
- DMs every reserved player the link to the game's roleplay page;
- posts a summary to the host log;
- flags players the chat log shows playing but attendance missed (Attendance
  page hints).

Running the analysis again re-grades without re-posting the archive unless
the files changed (added, removed, replaced or reordered).

## The public roleplay archive (`/roleplay`)

Anyone can read it, no login: the **🎭 Roleplay** button on the map, the
profile's AI results and the bot's links all lead there.

- **The archive:** every graded game from every server, newest first. Search
  for a player, a nation, a game, or words from the story or a quote. Filter
  by game mode, server and "rewarded roleplay only"; sort by newest, oldest
  or most roleplay. The page address keeps the search, so it can be shared.
- **A game** (`/roleplay/<game id>`): the AI's story recap, a card per player
  (result, in-character words, creativity, summary, best lines, **Read all
  of…**), and the **full log** as a readable transcript: nation by nation
  with flags, searchable, filterable by nation, with out-of-character chat
  hidden at first. Rehosted games show where each file starts.
- **What stays private:** Discord IDs, staff names, and toxicity. A player
  not rewarded for conduct just shows "No reward".

## What the AI is told

The bot sends the whole log (all files, marked `===== CHAT LOG FILE n of N
=====`) with the roster and its own word counts, and asks for scores only.
The instructions say:

- **The game mode and its setting** (Kaiserreich, Millennium Dawn, Novum
  Vexillum, The Fire Rises, Road to 56, or a Historical game).
- **Roleplay games aren't history re-enactments:** alternate paths are the
  point and are never marked down. Historical games are told small
  departures are fine too.
- **It may use Google Search** briefly, to understand a focus path, an event,
  a mod's lore or an unfamiliar tag.
- **What tags mean:** the base game's tag list, and that the roster's nation
  names win when a mod reuses a tag.
- **What isn't roleplay:** the lobby talk at the very start of the log, and
  out-of-character chat anywhere ("unpause", "lag", "rehost", "gg",
  mechanics, ((brackets)), "ooc:").
- **Several files are one game**, in order; a player may rejoin under a
  slightly different name.

The bot also drops plainly out-of-character messages from its own word
counts: a message of at most 4 words that are all game-control words
(`_OOC_WORDS` in `bot.py.py`: "unpause", "lag", "gg wp"…), or one in
((brackets)) or starting with "ooc". The website dims the same lines; the
two word lists are kept equal by `web/tests/roleplay.test.mjs`.

## The model

**Gemini 3.8 Flash** (`gemini-3.8-flash`), chosen in November 2026 for price,
long logs and speed. Set `GEMINI_MODEL` on the bot to use another model.

Each run asks for Google Search plus the exact answer shape. If Google
refuses that combination, the bot tries Search alone (answer read from the
text), then the answer shape alone, and remembers what worked. A wrong API
key or an overloaded model is reported, not hidden.

## The strict rules

Hosts said almost everyone got 2–3 Merit. Now the AI only judges **quality**;
the bot counts the words itself and applies these rules, so the AI can't be
generous:

| Reward | In-character words | Creativity |
| --- | --- | --- |
| 3 commends | 3,000+ | 7/10+ |
| 2 commends | 1,500+ | 7/10+ |
| 1 commend | 750+ | 7/10+ |
| 4 Merit | 500+ | 6/10+ |
| 3 Merit | 350+ | 6/10+ |
| 2 Merit | 200+ | 6/10+ |

- **In-character words** = the nation's words × the share the AI judges to
  be real roleplay (diplomacy, speeches, news, story). Out-of-character chat
  ("lag?", "gg", game mechanics, coordinating) doesn't count. Main + co-op
  on one nation split it by who wrote what.
- **Nothing** for toxicity 4/10 or more, or for mostly one-liners / spam.
- **Merit is only recommended where the server uses it** (server settings →
  Features → Hearts of Valor & Merit). With it off, only commends.
- Under 20 words of roleplay = "0 RP".

Before (for comparison): 2 Merit from 51 words, 3 from 101, 4 from 176, a
commend from 250, no quality bar.

The numbers live in `bot.py.py` (`AI_COMMEND_TIERS`, `AI_MERIT_TIERS`,
`AI_*_MIN_CREATIVITY`, `AI_TOXIC_FROM`) and are mirrored in
`web/src/lib/aiAnalysisTypes.ts` for the page's explanation.

## For players

The **🎭 Roleplay** archive (above), and **My profile → AI roleplay
results**: the verdict for their recent analyzed games, why, whether the host
has given it yet, and a link to each game's roleplay page.

## Where things are stored

| What | Where |
| --- | --- |
| The uploaded files | `game_chat_log_files` (one row per file, `part` = order; the website writes it) |
| Older single uploads | `game_chat_logs`; moved into `game_chat_log_files` as file 1 the first time the game's files are listed |
| The analysis | the game's `ai_analysis` (per player, `game_summary`, `model`, and `log` with the files' `signature`) and `ai_analysis_text` (Discord text) |
| Rewards given from the Games page | the game's `ai_rewards_given` |
| Archived once | the game's `chat_log_archived_upload` (the files' signature) |

`/run_ai_analysis` (Discord) was removed: games have no thread to upload
logs into any more, so the Games page is the only way. Old archive posts'
"Request Commend" buttons keep working, also with the new rules.

## Tests

- Bot: `python "GameMaster Bot/tests/ai_analysis.py"` from the repo root with
  the bot's packages installed (Gemini is faked; no database needed).
- Website: from `web/`, `node --test` (`tests/roleplay.test.mjs`).
