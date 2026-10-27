# Load test results (infrastructure plan, Phase 4)

**Date:** 27 Oct 2026 · **Target:** the live site, https://hoi4gamemaster.online
(Render Starter, $7: 0.5 CPU / 512 MB, Frankfurt · Cloudflare · Aiven MySQL Free)

**Summary:**

- **Up to 250 players on one game:** every target is met.
- **500:** everyone stays connected. The glow and page opens get slower than the
  targets while players are still joining.
- **1,000:** the site stays up, slower but working. 99.4 % connect and 0.5 % of
  requests fail; before the fixes, 31 % failed.
- **The limit is the website server's CPU.** The database and Cloudflare had plenty
  of room.

## How the test works

`scripts/_load_test.mjs` (local only, not in git) simulates players on one
game's map, the way a browser does:

1. Open the page: `/`, then `/api/auth/me`, `/api/games`, `/api/reserve` and
   `/api/schedule/me` together. Every 10th player also downloads the map file,
   which Cloudflare serves from its cache.
2. Keep the live connection (`/api/live`) open, plus the map's 5-minute safety poll.
3. Half the players are logged in. Their session cookies are signed with the site's
   secret and use fake Discord ids. They pick a new nation about every 20 s and
   refresh the held one every 15 s (`/api/live/select`), like the real map.
4. One extra "probe" player changes nation every 3 s, and every 5th player times
   how long it takes to see it. This is the **glow** time: from the click to other
   players' screens.

Players join at **25 per second**, as if a Discord ping brought everyone at once,
then each level is held for 60 s. This is harsher than real life: 1,000 players
arrive in 40 s. Database load is read from MySQL's own counters.

**Read-only:** the test uses an ended game (`1563946569068449813`, 47
reservations), so no real player sees it. Nothing is written to the database, and
selections live only in memory. Not tested:

- **Reservations:** writing them makes the bot post in Discord. A unique key on
  `game_reservations (thread_id, slot_key)` makes double bookings impossible.
- **The 20 hosts on host pages** from the plan.

**Caveat:** every player came from one PC and one internet connection. Most of
the small failure counts below are connection timeouts on that PC's side
(`UND_ERR_CONNECT_TIMEOUT`), not answers from the site. Repeated runs vary by
about ±30 % (Render's shared CPU and the home connection).

## Final results (live site, all fixes deployed)

| Players | Connected | Page open p50 / p95 | Glow p50 / p95 | Select p50 / p95 | Failed requests | DB connections (of 46) | DB queries/s |
|---|---|---|---|---|---|---|---|
| 250 | 100 % | 0.75 s / 1.0 s | 0.14 s / 0.19 s | 0.10 s / 0.20 s | 0.10 % | 21 | 16 |
| 500 | 100 % | 2.3 s / 10 s | 0.22 s / 0.51 s | 0.10 s / 1.1 s | 0.39 % | 21 | 17 |
| 1,000 | 99.4 % | 8.5 s / 21 s | 0.57 s / 1.3 s | 0.36 s / 10.5 s | 0.54 % | 21 | 28 |

Page-open times are measured while 25 players a second are joining. That's the
worst moment: at 500 and 1,000, 250 and 500 of the players opened the page during
that rush.

Against the targets:

| Target | Result |
|---|---|
| Map page opens in under 2 s | Met at 250 (p95 1.0 s). At 500, typical is 2.3 s during the joining rush. |
| Glow in under 0.3 s | Met at 250 (p95 0.19 s). At 500, typical is 0.22 s; the slowest 5 % take 0.51 s. |
| Reserve in under 1 s | Not load-tested (writes). Selection updates, the same path without the database write, are 0.10 s typical at 500. |
| 500 players stay connected, no errors | Met (0.39 % failed, mostly timeouts on the test PC's side). |
| Stays up at 1,000 (slower but working) | Met: 99.4 % connected, 0.54 % failed. |

The database and Cloudflare were never the bottleneck. At most 21 of Aiven's 46
connections were in use (33 during a Render deploy, while the old and new servers
overlap), with under 30 queries a second. Cloudflare served the cached map in about
0.1 s throughout.

## Fixes made during the test

How the live site did at 1,000 players after each round:

| Run | Change | Connected | Failed requests |
|---|---|---|---|
| 1 | Selections sent as changes, not the whole list (`2f56d14`) | 79 % | 31 % |
| 2 | Held selection refreshed every 15 s instead of 5 s (`c01a3a5`) | 86 % | 9.4 % |
| 3 | Fewer requests and socket writes per viewer (`bb022a0`) | 100 % | 1.7 % |
| 4 | Batching only above 400 viewers (`36faf5b`) | 99.4 % | 0.54 % |

1. **Selections sent as changes, not the whole list** (`2f56d14`). Every time
   anyone changed nation, the server sent the full list of everyone's selections
   to every viewer, so traffic grew with viewers × selections. On a local copy of
   the site:

   | Viewers | Before | After |
   |---|---|---|
   | 100 | 1.06 MB/s | 0.06 MB/s |
   | 300 | 18.2 MB/s | 0.26 MB/s |
   | 1,000 | (not possible) | 2.0 MB/s, glow p95 0.12 s |

   Each message is now also built once per game rather than once per viewer, and
   the viewer count goes out at most once a second. The unused avatar URL is no
   longer sent with each selection.
2. **Held selection refreshed every 15 s instead of 5 s** (`c01a3a5`). Closing
   the map already clears the selection, so the server's 40 s expiry is only a
   safety net. Selection requests fell by about two thirds.
3. **Fewer requests and socket writes per viewer** (`bb022a0`):
   - The map no longer reloads the lobby when its live connection comes up
     (one request less per player).
   - The safety reload runs every 5 minutes instead of every minute. A live
     connection that goes silent for 50 s now reconnects by itself.
   - Logged-out viewers stop asking about hot-join requests every 15 s during
     running games.
   - Rooms with very many viewers batch selection changes over 250 ms. A CPU
     profile showed one socket write per viewer per update was the biggest cost
     of a full room.
4. **Batching only above 400 viewers** (`36faf5b`). At 250 viewers the 250 ms
   batch had pushed the glow to 0.34 s (p95). Rooms up to 400 viewers keep
   100 ms updates.

## What limits it

**The website server's CPU.** Render Starter has half a CPU. A CPU profile of a
local copy with 1,000 players showed:

- **Once everyone has joined,** the server is mostly idle. Writing live messages
  to the open connections is the largest cost.
- **The joining rush is the expensive part.** Every new player costs five
  requests: the page plus four API calls.
- **Memory is not a limit.** Render's own graph peaked at about half of the
  512 MB with 1,000 players. The local copy reached about 380 MB, but that
  includes the profiler.

Render's Metrics page confirms this: CPU sat near zero all night and hit 100 %
of the 0.5 CPU in every test run.

When the CPU is saturated, Cloudflare gets no answer in time and returns 502.
After the fixes this happens to 0.5 % of requests at 1,000 players. The server
never crashed, and it recovered by itself as soon as each test stopped.

## When to act

Real games have had 100–200 players, well within the range where every target
is met. Options when bigger games come, cheapest first:

1. **Combine the page's four first API calls into one.** This roughly halves the
   cost of each player joining. It's free, but it's a code change.
2. **Render Standard ($25/month: 1 CPU, 2 GB).** Twice the CPU and four times
   the memory. Expected to meet the targets at 500 and keep 1,000 comfortable.
   Re-run this test after upgrading.
3. **Several website servers.** This needs the shared message bus (Redis) noted in
   `web/src/lib/live/hub.ts`, which is only worth it well past 1,000 players.

## How to run it again

```powershell
# scripts/_load.env: SESSION_SECRET=<the site's, from Render → Environment>
node scripts/_load_test.mjs --stages 250,500,1000 --hold 60 --ramp 25
```

Results are written to `scripts/_load_results.json`, or to the file named in
`$env:LOAD_RESULTS`. Run it when no game is about to start, and expect UptimeRobot
alerts if the site struggles. Setting `$env:LOAD_BASE="http://localhost:3123"`
tests a local copy instead.
