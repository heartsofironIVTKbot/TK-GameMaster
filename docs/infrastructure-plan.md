# GameMaster — infrastructure and future work plan

*Written 25 Oct 2026. The executive plan for taking GameMaster from "works on
my computer" to a reliable, multi-server product.* Follow the phases **in
order**; each one has a "done when" line. The owner is not a programmer, so
whoever works on this should explain every step in plain words.

Related plans: [audit-and-tickets-on-web-plan.md](audit-and-tickets-on-web-plan.md)
(Phase 5) and [realtime-and-scale-plan.md](realtime-and-scale-plan.md)
(background for Phase 3).

---

## Where we are today

- **Bot** (`bot/bot.py.py`, Python, discord.py) runs on **Sparked Host**
  (Apollo panel, a game-server panel), $4/month plan.
- **Database:** MySQL, provided through the same host panel.
- **Website** (`web/`, Next.js 16) was built and tested **offline only**:
  preview mode (`SCHEDULER_DEMO=1`) with sample data. Python tests ran
  against fakes. **Nothing has been tested against the real Discord API and
  the real database yet.** That's the biggest risk right now, bigger than
  scale.

## Targets ("nothing lags", made measurable)

No system can promise "never lags no matter what". We set targets, build to
them, and prove them with a load test (Phase 4).

| What | Target |
| --- | --- |
| Map page opens | under 2 s |
| Someone clicks a nation → everyone sees the yellow glow | under 0.3 s |
| Reserve / unreserve confirmed | under 1 s |
| Players on one game's map at the same time | 500 (tested up to 1,000) |
| Uptime | 99.9% (at most ~45 min down per month) |
| Live server fails | the map falls back to polling (slower, still works) |
| Database lost | restored from yesterday's backup (at most 24 h lost; minutes with binary logs) |

---

## Phase 1 — Staging and go-live check (do first, ~1–2 weeks)

**Goal:** everything works once, for real, before players see it.

1. Create a **test Discord server** and a **second bot application** (its own
   token) in the Discord Developer Portal. Never test with the real bot's
   token.
2. Make a **copy of the real database** (export → import into a new database
   called e.g. `gamemaster_staging`).
3. Run the bot and the website against the test server + staging database
   (separate `.env` files; the website with `SCHEDULER_DEMO` **off**).
4. Click through **every** feature with real accounts (at least: owner, a
   Host Management member, a Senior host, a normal host, a Ticket Support
   member, a developer, a normal player, an unverified player):
   - server setup wizard on the website, every Settings tile, Health checks,
     fix buttons;
   - calendar: schedule, edit, cancel; the announcement post (short bell
     format) and its map link;
   - map: reserve, unreserve, co-op, filler, hover names, locked nations
     greyed, Rules / Mods / My profile buttons, the top bar for hosts vs
     players;
   - Host Tool: add, move, swap, replace, remove, with Notify players on and
     off (check the DMs arrive);
   - Games page: start, end, cancel, late join, hot-join, reminders, message
     players, access/locks, draft games;
   - Database page: commend, warn, ban, Dishonored, host ratings (mirror
     rules, only Host Management can take back), verification, VIP, host
     ranks, role check;
   - Attendance page; crash reports (`/crash`); tickets (`/spawn`, each kind,
     closing, 24 h ping / 48 h auto-close);
   - per-game forum threads, scheduling panel, "Delete GameMaster message".
5. Write down every bug, fix it, re-test.
6. Set up **backups** now (see Phase 2, item 5). They're needed before
   anything goes live.

**Must check in the database:** two players can never hold the same nation
in the same game, even when both click at the same instant. That needs a
**unique index** on (game, slot) or an equivalent transaction, not just a
check in code. Test it by reserving the same nation from two browsers at
once.

**Done when:** the full checklist passes on staging with real Discord.

---

## Phase 2 — Production hosting

**Is the $4 Sparked Host plan enough?** For the **bot alone** while testing:
probably, if it has at least 1 GB RAM. For the **whole system** (website +
live map + database for many servers and hundreds of players): **no**. Game
panels are built for game servers, not web traffic. Their shared MySQL
usually has low connection limits, shared CPU and backups you don't control,
which makes it the most likely cause of a "meltdown".

**Best database:** stay on **MySQL**. All code uses it. Switching (e.g. to
PostgreSQL) would cost weeks and gain little. What matters is **where it
runs** (a proper, dedicated host) and **backups**.

### Recommended setup

| Piece | Recommendation | Why |
| --- | --- | --- |
| Bot | Sparked Host is OK, or move it next to the rest. 1–2 GB RAM. | The bot is light; Discord's rate limits are its real limit. |
| Database | **Managed MySQL** (DigitalOcean, Aiven, AWS RDS…) or MySQL on your own VPS with automatic backups | Proper connection limits, steady CPU, backups. |
| Website | A real Node host: a **VPS** (e.g. Hetzner, ~€8–15/month) **or** a beginner-friendly platform (**Railway** / **Render**) | Next.js needs a long-running Node server. Vercel works for pages but not for the live server in Phase 3. |
| Live server (Phase 3) | Small WebSocket service + **Redis**, next to the website; or a paid service (**Ably / Pusher**) for zero maintenance | Instant updates to every open map. |
| Front door | **Cloudflare** (free plan) | DDoS protection, free HTTPS, caches the big map files near players. |
| Monitoring | **UptimeRobot** or **BetterStack** (alerts when down), **Sentry** (error reports from bot and website) | Know about problems before players report them. |

**Two ways to build it:**
- **Easiest:** Railway (or Render) for website + live server + Redis (+ bot),
  managed MySQL, Cloudflare in front. Little server maintenance.
- **Cheapest:** one Hetzner VPS (e.g. 4 vCPU / 8 GB) running everything with
  Docker Compose (website, live server, Redis, bot, MySQL), Cloudflare in
  front, backups to a separate storage provider. More to maintain yourself.

**Rough cost:** **$25–60 per month** for a solid setup (check current prices
before buying).

**Chosen (Oct 2026):** website on Render (Frankfurt), bot on Apollo,
**Aiven for MySQL, Free plan** (own database — not shared with IronLegion;
the data is ~20 MB of the 1 GB limit), Cloudflare in front,
UptimeRobot/BetterStack for alerts. Both apps connect with `MYSQL_SSL_CA`
(Aiven's CA certificate) so the connection is encrypted and the server is
checked. Data is copied with `scripts/copy_database.py` (skips IronLegion's
tables, compares row counts). Backups: nightly to a private Backblaze B2
bucket (GitHub job, newest 14 kept) plus a manual one before every major
update — see `docs/backups.md`.

> **Reminder — before the final switch-over (step 7):** upgrade Aiven Free
> to **Aiven Developer ($5/month)** for (a) choosing the region (Frankfurt,
> next to Render) and (b) uptime guarantees and email support. It's a
> one-click upgrade; connection details stay the same.

### Steps
1. Buy a domain (if not already) and put it on Cloudflare.
2. Create the production database; import the data; check row counts.
3. Deploy the website and the bot with production `.env` values. Secrets
   (bot token, Discord client secret, `SESSION_SECRET`, database password)
   only in environment variables, never in code or the browser.
4. Set the map files (`web/public/maps/*.geojson`) and other static files to
   be cached by Cloudflare (long cache time).
5. **Backups:** daily `mysqldump` (compressed) copied to a **different
   provider** (e.g. Backblaze B2 / any S3 bucket). Keep 14 daily + 8 weekly.
   Turn on MySQL binary logs if possible. **Test a restore once.** Write the
   restore steps in `docs/backups.md`.
6. Monitoring: uptime checks on the website, the bot's status page and the
   database; Sentry in both apps; alerts to the owner's phone/Discord.
7. Switch over: stop the old bot, start the new one, point the domain to
   the new website. Keep the old setup untouched for a week as a fallback.

**Done when:** production runs on the new setup, backups run daily and one
restore was tested, alerts work.

---

## Phase 3 — Live map (instant updates for everyone)

Today the map **asks** the server for changes every few seconds; we already
made that cheap (it only downloads when something changed, see
`realtime-and-scale-plan.md`). Next: the server **pushes** changes.

1. Add a small **live server** (WebSocket, e.g. Socket.IO or `ws`) with
   **Redis** pub/sub, deployed next to the website.
2. Each open map joins a "room" for its game. When something changes
   (reservation, lock, host move, draft pick), the website/bot publishes one
   small message ("Germany: taken by Ivan") to that room.
3. **The yellow glow live:** when a player selects a nation, their browser
   sends "I'm looking at Germany". Everyone in the room sees Germany glow
   yellow with that player's name. Rules:
   - at most a few events per second per player (throttle in the browser);
   - the server merges events and sends at most ~10 updates per second per
     game;
   - a glow disappears after ~10 s without a refresh, or when the player
     leaves.
4. Login for the live server: the website hands out a short-lived signed
   token; the live server checks it before letting someone join a room.
5. **Fallback:** if the live connection drops, the map silently goes back to
   today's polling and reconnects in the background.

**Done when:** two browsers see each other's clicks and reservations in
under 0.3 s, and pulling the plug on the live server doesn't break the map.

---

## Phase 4 — Load test and harden

1. Use **k6** (or Artillery) to simulate **500, then 1,000** players on one
   game: opening the map, selecting nations, reserving, unreserving, plus
   20 hosts using host pages at the same time.
2. Watch: response times, errors, database CPU and connections, live server
   memory.
3. Fix what breaks first, typically:
   - missing database indexes;
   - too many database connections (tune the pool size on both apps);
   - slow API routes (add caching);
   - no rate limits (add per-user limits on reserve / hot-join / crash /
     ticket actions).
4. Re-run until the **Targets** table passes. Save the results in
   `docs/load-test-results.md`.

**Done when:** the targets pass at 500 players and the system stays up
(slower but working) at 1,000.

---

## Phase 5 — Audit and Tickets pages

Follow [audit-and-tickets-on-web-plan.md](audit-and-tickets-on-web-plan.md).

**Why after Phase 4:** the audit log adds one database write to almost every
action. Building it on the final hosting, with backups already running, is
safer.

**Order inside Phase 5:**
- Stages 1 and 2 (Audit page, Tickets on the website) can be built back to
  back.
- Then **re-run the Phase 4 load test once**, because the audit writes add
  load.
- **Stage 3** (removing the Discord log channels) only after the owner has
  used the new pages for a while and is happy. Don't do it in the same go.

**Done when:** every action shows on `/audit`, tickets are readable on
`/tickets` with the same access rules as Discord, and the load test still
passes.

---

## Phase 6 — Casino integration (TommyKay only) — must happen

The Casino runs on its **own website**. It already does everything for those
games: nation picking, assignment, rolls, cards. GameMaster only needs to
**link to it**, not rebuild it.

**What's in GameMaster today:**
- The Casino and Fortunes of War add-ons are listed but switched off:
  `_UNAVAILABLE_ADDONS = {"randomizer", "fortunes"}` in `bot.py.py`, shown as
  "currently unavailable" on the Calendar.
- They're limited to the home server (`HOME_ONLY_ADDONS`).
- Old Casino pieces were removed from Discord (`/gamble`, `/draw` and their
  panels).

**What the link-up needs** (decide the details with whoever runs the Casino
site):
1. **Turn the add-ons back on** for TommyKay only (remove them from
   `_UNAVAILABLE_ADDONS`; keep `HOME_ONLY_ADDONS`).
2. **Game hand-off:** when a Casino / Fortunes game is scheduled or announced,
   GameMaster tells the Casino site: game id, mode, start time, host, add-on
   options. Use a server-to-server call with a **shared secret**, never from
   the browser.
3. **Links:**
   - the announcement's "📝 Reserve Here" link and the map's reserve button
     send players to the **Casino site's page for that game**, not to
     GameMaster's map;
   - the Games page shows a "Open in Casino" link for the host.
4. **Results back:** the Casino site tells GameMaster who ended up on which
   nation (a webhook to a new GameMaster API route, signed with the shared
   secret), so the roster, attendance, no-show warnings, Merit and
   history keep working.
5. **One login:** both sites use Discord login. Either the Casino site trusts
   a signed link from GameMaster, or both simply log in with Discord
   separately (simplest).
6. **If the Casino site is down:** GameMaster shows "The Casino is
   unavailable right now" and the host can switch the game to a normal
   reservation game.

**Done when:** a Casino game scheduled on GameMaster's calendar shows up on
the Casino site, players pick there, and the result appears in GameMaster's
roster and attendance.

---

## Phase 7 — Grow when needed (not before)

- **Second website server** behind a load balancer when CPU stays above ~60%
  at peak.
- **Read-only database copy** for heavy pages (Audit, Database search).
- **Bot sharding:** Discord requires it only at **2,500 servers**.
- **Bigger database plan** when the database CPU stays above ~60% or
  storage passes 70%.

---

## Summary order

1. Staging + go-live check
2. Production hosting (+ backups, monitoring)
3. Live map
4. Load test and harden
5. Audit and Tickets pages (Stages 1–2 → re-test load → Stage 3 later)
6. Casino integration (TommyKay only)
7. Grow when needed
