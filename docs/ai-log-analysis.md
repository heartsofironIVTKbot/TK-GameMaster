# Chat log + AI analysis

After a game, the host uploads the HOI4 chat log on the website and the AI
grades everyone's roleplay. This replaced the Host Control Center's
"Upload Chat Log" / "Run AI Analysis" buttons (October 2026).

## For hosts (Games page)

1. Open the game on the **Games page** (it must have started; it can still
   be running or already ended).
2. In **Chat log & AI analysis**, click **Upload .txt** and pick the chat log.
   A new upload replaces the old one. Limit: 8 MB.
3. Click **Run the AI analysis**. Long logs can take a minute or two.
4. The results list every player: in-character words, creativity, toxicity,
   the verdict (commend / Merit / nothing) and why, plus up to 3 lines from
   the log.
5. **Nothing is given automatically.** Click **Give** next to a player to give
   what the AI recommended. It goes through the same moderation engine as
   the Database page (host log, the player's record) and the row shows
   **✓ Given**.

The first time a log is analyzed, the bot also:
- posts the log file to the mode's public log archive channel;
- DMs every reserved player that their result is on their profile;
- posts a summary to the host log;
- flags players the chat log shows playing but attendance missed (Attendance
  page hints).

Running the analysis again (e.g. after replacing the log) re-grades without
re-posting the archive unless the log itself changed.

## For players

`/info` → **My profile** → **AI roleplay results**: the verdict for their
recent analyzed games, why, and whether the host has given it yet. Staff
names are never shown.

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

## Where things are stored

| What | Where |
| --- | --- |
| The uploaded log | `game_chat_logs` (one row per game; the website writes it) |
| The analysis | the game's `ai_analysis` (per player) and `ai_analysis_text` (Discord text) |
| Rewards given from the Games page | the game's `ai_rewards_given` |

`/run_ai_analysis` (Discord) was removed: games have no thread to upload
logs into any more, so the Games page is the only way. Old archive posts'
"Request Commend" buttons keep working, also with the new rules; new archive
posts link the profile instead.
