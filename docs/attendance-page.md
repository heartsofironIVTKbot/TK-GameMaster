# Attendance page — live attendance, corrections and the audit log

`/attendance` on the website is now where attendance lives. The Discord game
thread no longer gets the participation tracker, the multi-snapshot embeds
or the Mark Present / Absent buttons.
The bot still does everything that needs Discord (voice scans, participation
DMs, warnings, roles, DMs to players); the page shows it and asks the bot to
act through the same request queue as the Calendar and the Database page.

Hosts only (same login and Host-role check as the Calendar). Linked from the
map's top bar (🎯 Attendance, hosts only), the Calendar, the Database page,
the Games page, and the DM the host gets when a game ends.

## The rules (unchanged)

| Thing | Rule |
| --- | --- |
| Samples | 5 voice samples, one every 20 / 30 / 40 minutes (picked when the game is started on the Games page). |
| Present | Seen in **2 of the 5** samples — in a game voice channel (not the lobby) **with the game's Gamer Pass role**. |
| No-show | 2 warnings for a Major, 1 for anything else. In Casual logging only Majors are warned. VIPs are never warned. |
| Excused | Answered **No** to the participation DM on a **Minor in Casual logging** → no warning, not counted as attended. A Major, or a Minor in Strict logging, can't drop out after the start (shown as "No" — warned at finalize unless VIP or a host excuses them). |
| 3 warnings | Automatic game ban in that mode (resets that mode's commends and all Merit, removes Trusted and Hearts of Valor). |

## What hosts see

- **Left — started games**, live ones first: sample progress bar, present /
  players, and an amber number for players to look at.
- **Header** — mode, host, logging mode, start time; after finalize: when,
  by whom (or automatically), and whether the game ended before all samples.
- **Stats** — on track / at risk / absent / excused, and the no-show warnings
  given (or that would be given if nothing changes).
- **Voice samples** — the five samples with their time and how many were in
  voice, the **countdown to the next one**, and planned times for the rest.
  Samples taken early from the page are marked "early by <host>".
- **Roster** — one row per player: nation (×2 = Major), their reply to the
  participation DM (Yes / No / Excused / No reply, with their reason), a dot
  per sample (green in voice · amber lobby · orange no Gamer Pass · red not
  in voice · grey not found · blue excused — hover for details), seen x / n,
  the latest voice check, the result (On track / **At risk** / Absent /
  Excused, or the final verdict), warnings, and VIP / Late join / **Chat
  log** badges. Filter by needs review / present / absent / excused / no
  reply, or search a name or nation.
  - **At risk** = not seen enough yet, but the remaining samples can still
    count them. **Chat log** = the game's chat log shows their country tag
    although the samples didn't count them — worth a look.
- **Audit log** — everything, newest first, with who did it: game start,
  every sample, replies, late joins, voice checks, host changes with their
  reason, warnings given or removed, finalize and chat-log hints. Filter by
  host changes, samples, or player replies.
- **⤓ Export CSV** — the roster with every sample, the result, host changes
  and warnings, for a spreadsheet.

The page refreshes itself every 15 seconds while a game runs.

## What hosts can do

| Action | Who | What happens |
| --- | --- | --- |
| 🎧 Check voice now | Any host | The bot scans voice right now and fills the **Now** column. Doesn't count as a sample. |
| 📸 Take sample now | The game's host or staff | Takes the next sample immediately; the one after is due one interval later. |
| ✅ Finalize attendance | The game's host or staff | Stops sampling and gives no-show warnings from the samples taken (needs 2+). Click twice to confirm. Normally the bot finalizes by itself after the 5th sample or when the game is ended on the Games page. |
| **Change** (per player) | The game's host or staff | Set **Present / Absent / Excused** with a reason. Before finalize it's stored and applied at finalize (**Automatic** hands it back to the samples). After finalize it applies at once: attended games are adjusted, no-show warnings are given or removed, an automatic ban caused by them is lifted (or given at 3), and the player is DMed. The dialog shows exactly what will happen first. |

Every action is in the audit log with the host's name and reason.

## In Discord now

- Games no longer get a Host Control Center thread, so there are no
  attendance messages or buttons in Discord at all. When the game ends, the
  host gets a DM with a link to this page; the host-log embed links to it
  too.
- Participation DMs (Yes / No) to players are unchanged; replies show on the
  page instead of being forwarded to the host.
- Chat-log hints (country tag in the log but not counted) come from the AI
  log analysis, which lived in the Host Control Center — they won't appear
  for new games until that analysis is rebuilt on the website.

(`ATTENDANCE_WEB_ONLY = True` is still in `bot.py.py`, but the old Discord
panels it would bring back lived in the Host Control Center, which games no
longer get.)

## Setup

1. **Restart the bot.** It creates the `attendance_events` table by itself
   (also in `bot/schema.sql`).
2. The links point at `WEB_SITE_URL` (an environment variable for the bot).
   If it isn't set, the bot uses `HOST_CALENDAR_URL` without `/schedule` —
   right when the Calendar is at `<site>/schedule`.
3. Redeploy the website.

Games started before the update show their samples and results, but have no
audit log (it starts with the update).
