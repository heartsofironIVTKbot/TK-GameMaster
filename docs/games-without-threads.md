# Games without reservation threads

*Late October 2026.* New games no longer get a reservation thread in
Discord. Everything the thread was for is on the website now; the
announcement post stays and links to the map.

## What changed

| Used to be in the thread | Now |
| --- | --- |
| The reservation list | The website map (it always was the real list) |
| IronLegion "Authenticate" prompt | When a game requires IronLegion, the announcement says where to authenticate, and the map shows a "Steam authentication required" note above the nations with a link to the server's IronLegion authentication channel. Hot-join checks it too |
| Draft Pool board, "your turn" posts | The map's draft panel; captains still get a DM on their turn |
| **Hot-Join panel** | The map: in a running game, click a free nation → **Ask to hot-join**. The host gets a DM and decides on the Games page (**Hot-join requests** card) |
| **Crash Report panel** (+ the DM upload) | The website's **/crash** page: describe what happened, pick the zipped logs folder, send. Linked from the map and from the "game is starting" DM |
| Emergency Unreserve panel | Only Casino / Fortunes games had it — those are unavailable until the Casino integration |
| "Game Has Started" / "Game End Initialized" posts | Players already get DMs at the start and the end |
| Late reminder list ("Waiting for players…") | The late reminder DMs each missing player; the host sees who on the Games page |
| Scheduled nation unlock notices | The map shows the unlock; the host gets a DM |

Removed commands: **/spawn_panel** (no panels to re-post) and
**/run_ai_analysis** (the Games page's chat-log card does it). Discord now
has two commands: `/help` and `/info` (`/list_code` was removed later; it
comes back with the Fortunes of War → Casino merge).

## The announcement post

Kept short (the website preview in game setup → Announce shows the same lines):

```
# 🔔 Game Announcement 🔔        (the animated yellow bell, <a:line:1480537685478084781>)
||@ping||                         (+ one add-on / 🎯 DRAFT GAME line when there is one)
🕓 <start time — Discord shows it in each reader's own time zone> (in N hours)
🎮 Host - @host
📝 Reserve Here - <map link>      ("Join the Draft Here" for draft games)
```

Nothing goes below the link: the rules and mods are behind the map's
**📜 Rules** / **🧩 Mods** buttons (and still posted in the mode's rules / mods
channels). Captains, submod details and the old dashed lines were dropped.

## The map's top bar

Everyone sees **📜 Rules** and **🧩 Mods** (glowing, with a light sweep) and
**👤 My profile** (the same page as `/info`). Hosts also see Schedule,
Database, Games, Attendance, Servers and the Host Tool. There's no mode
picker any more: the map follows the selected game's mode. Hovering a nation
shows just its name in a small pill under the top bar, and nations the host
locked are greyed out like taken ones.

## The game's id

A game used to be saved under its thread's number. New games are saved under
the **announcement post's** number instead (also a unique Discord id), so
website links (`/?game=…`, `/games?game=…`, `/attendance?game=…`) look the
same. The game document has `"no_thread": true`.

Games announced before this change keep their thread until they end. Their
old Hot-Join and Crash Report buttons still answer — with a link to the
website. No new panels are posted in them.

## Hot-join, step by step

1. A game is running. A player opens the map (the game shows as
   "🔴 In progress" in the game picker) and clicks a free nation.
2. **🔥 Ask to hot-join as …** sends the request. Checks: the game is running,
   the nation is free and playable, the player isn't already in the game,
   and, when the game requires it, they're authenticated with IronLegion (they
   hold the role IronLegion gives on that server).
3. The game's host gets a Discord DM with a link to the Games page.
4. On the Games page, **Hot-join requests** lists them (waiting ones first).
   **Approve** runs the normal late join: the nation, the Gamer Pass, a voice
   channel, marked late on the Attendance page, and a DM to the player. If
   there's a warning (recent Major, same Minor twice, Dishonored), the card
   asks first — **Approve anyway** confirms. **Decline** DMs the player.
5. The player can **Withdraw** while it's waiting; the map shows the answer.

Only the game's host or senior staff can decide.

## Crash reports, step by step

1. `/crash?game=<id>` — linked from the map ("🚨 Game crashed? Send your
   logs") and the participation DM when the game starts.
2. The player writes what happened, picks the **logs** folder zipped
   (500 KB – 15 MB) and sends it.
3. The bot checks it's a real HOI4 logs archive, posts it to the server's
   crash-report channel (pinging the crash-report role) and gives Merit:
   +2 if HOI4 Verified, +1 otherwise, one reward every 6 hours.
4. The page shows the result and the player's reports for that game.

Only games that are running accept reports (same as the old panel). If a zip
is too big for Discord to attach (it depends on the server's boost level),
the post links to it on the website instead; hosts and staff of that server
can download it there.

## Where things are stored

| What | Where |
| --- | --- |
| Hot-join requests | The game document, `hotjoin_requests` (one per player, last 40) |
| Crash reports | `crash_reports` table (the website and the bot both create it). The zip is deleted once it's attached in Discord |

## Deploy

1. Restart the bot first (new request types, commands removed from Discord).
2. Then redeploy the website.
