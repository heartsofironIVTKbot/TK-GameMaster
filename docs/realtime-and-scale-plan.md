# Realtime & scale plan — live map, profiles, portfolios

Goal: a lobby map with **50–100+ players and many hosts watching at once**, months
of game history, and **no visible lag** — updates land in well under a second,
the map never stutters, and a host's portfolio opens instantly.

This is a phased plan: each phase is useful on its own, and nothing needs a
rewrite of what came before.

---

## Where we started (October 2026, before Phase 0)

| Piece | How it works now | Cost at 100 viewers |
|---|---|---|
| Lobby state (map + roster) | Every browser polls `GET /api/reserve?thread_id` **every 8s**. Each call runs 4 queries (game row, all reservations, `users`, `web_member_directory`) with **no server cache**. | ~12 requests/s → ~50 queries/s, even when nothing changed. Changes appear 0–8s late. |
| Bot ↔ web sync | Web writes reservations straight to MySQL. The bot's `reservation_sync_loop` mirrors them to Discord every 10s. Host Tool actions go through `web_schedule_requests` (bot polls, web polls the result). | Fine; latency up to ~10s for Discord-side effects. |
| Profile card | `GET /api/players/<id>` on click, cached in the browser for the visit. | Cheap. |
| Portfolio | `GET /api/players/<id>/portfolio` on click: `users` row + a join of **all** the player's `game_reservations` with `games`, reading `present_ids`/`game_bans` out of each game's JSON. | **The weak spot.** `game_reservations` has no index starting with `user_id` (only `(thread_id, user_id)`), so every portfolio scans the whole table, and the JSON is parsed per game. Grows with every game ever played. |
| Map rendering | Static base layer; highlight overlays mirror path geometry (no re-projection). Avatars are ~100 DOM markers. | Good up to a few hundred markers. |

---

## Phase 0 — Quick wins ✅ done (October 2026)

1. **Index for portfolios** ✅ — the bot self-heals
   `INDEX idx_game_reservations_user_only (user_id)` on startup (skipped when
   an index already starts with `user_id`, e.g. schema.sql's
   `idx_res_user_global`). Player history becomes an index range read.
2. **Version-gated polling** ✅ — `lib/lobbySnapshot.ts`. A lobby *version* is
   a fingerprint of one primary-key read of the games row
   (`reservations_rev`, status, host, lock fields), plus a 60-second bucket so
   name/avatar edits and any write that skips the rev still land within a
   minute. The map sends `known=<version>`; unchanged lobbies get
   `{ unchanged: true }` (47 bytes instead of the full payload, measured).
   Version checks are shared per lobby for 1 s, so 100 viewers polling every
   8 s cost **at most ~1 query/s per lobby** while idle.
3. **Shared lobby snapshot** ✅ — the full payload is built once per version
   and shared by every viewer (concurrent misses wait for the same build).
   Our own reserve/unreserve writes clear the cached version immediately.
4. **Profile & portfolio caches** ✅ — `lib/ttlCache.ts`: profile cards 60 s,
   portfolios 30 s, with request de-duplication. (A stats *version* to
   invalidate portfolios instantly needs Phase 1's `player_summary.version`;
   until then a moderation change shows within 30 s.)
5. **Payload trimming** ✅ — portfolios ship the latest 20 games only; whole
   game documents never reach the browser.

Not yet measured against a real database under load (Phase 0 was verified
in preview mode): run the load test below once deployed.

## Phase 1 — Precomputed player data ✅ built (October 2026)

Every portfolio is now a handful of primary-key / indexed reads, however old
the history:

- **`player_summary`** ✅ — one row per player: total games, attended,
  attendance-tracked, latest 20 games (JSON), the latest game that recorded
  a ban per mode, `version`, `updated_at`. Kept fresh by the bot's
  `player_summary_loop` (every 15 s): it diffs a small signature of every
  cached game (reservations, attendance, bans, status) and rebuilds only the
  players of games that changed — including players just removed — in one
  pass over the games. Full rebuild on every bot start.
- **`moderation_events`** ✅ — written by the moderation engine behind the
  web **Database** page (give / take / redeem and the automatic ban / unban
  they trigger — see [database-page.md](database-page.md)), the automatic
  no-show warning (+ its 3-warning ban), Dishonored give/take, crash-report
  merit and Hearts of Valor. Each row
  carries the reason, issuer, game and the **host-log message link**
  (`send_host_log_embed` now returns it via the webhook's `?wait=true`).
- **Web** ✅ — the portfolio reads `player_summary` (falling back to the live
  history query for players not summarized yet) and `moderation_events`:
  Game Banned cards show the real reason, issuer and date; Dishonored and bans
  link to their log; a new **Moderation history** list shows the latest 20
  actions with "Log ↗" links.
- **`/report`** ✅ — reads its evidence from `moderation_events` (instant);
  the old 60-second channel scan only runs for players with no stored events.
- **Backfill** ✅ — `/backfill_portfolios` (admin): rebuilds every summary,
  then imports the host-log channel's past moderation embeds. Re-runnable —
  rows are keyed by the log message id, so nothing is imported twice, and
  live rows written after deploy are skipped by the same key.

**Deploy steps:** restart the bot (creates the tables, starts the loop,
builds all summaries), then run `/backfill_portfolios` once.
Not covered yet: game-cancellation warn/commend refunds and the statistics
role scan don't write events (the stats themselves are always live).

## Phase 2 — Live push instead of polling (~3–5 days)

Server → browser push, so changes appear in **< 500 ms** and idle viewers cost nothing.

- **Event bus:** every writer publishes a small event after commit —
  `{ type: "reservation" | "lock" | "game", thread_id, rev, changes }`.
  Writers: the web API (reservations, Host Tool requests) and the bot
  (sync loop, host commands, attendance).
- **Browser side:** subscribe to `lobby:<thread_id>`, apply the diff, and if
  `rev` skips a number, refetch one snapshot (self-healing). Keep a slow
  (60s) safety poll.
- **Transport — depends on hosting (decision needed):**
  - Web on a **long-running Node server** (VPS / Docker / Railway-style):
    use **Server-Sent Events** from a Next.js route handler
    (`/api/live/<thread_id>/stream`), with one shared upstream listener per
    lobby (Redis pub/sub, or MySQL `rev` watch as a stopgap). One-way push is
    all the map needs; auto-reconnect is built in; no extra service.
  - Web on **serverless (e.g. Vercel)**: long-lived connections aren't
    practical there, so use a managed realtime service (Ably, Pusher,
    Supabase Realtime, or Cloudflare Durable Objects / PartyKit). Bot and
    web publish over its HTTP API; browsers subscribe with a short-lived
    token minted by our API.

## Phase 3 — Two-way WebSocket hub (when we want live presence)

Needed for the features that are impossible with plain polling:
**other players' live "pending" selection** (the breathing yellow), seeing a
host drag an avatar in real time, "N players viewing", live chat.

- A small dedicated **realtime service** (Node + `uWebSockets.js`, or a managed
  WebSocket provider), **Redis pub/sub** as the bus between bot, web and hub.
- **Rooms per lobby**; auth with a signed short-lived token from
  `/api/live/token` (based on the existing session cookie).
- **Presence is ephemeral** (never written to MySQL): clients send
  `select`/`hover` intents, rate-limited per user (≈5/s), and the hub
  **coalesces per room every 100 ms** — so 100 people clicking around still
  produces at most ~10 small broadcasts/s per lobby. Browsers render others'
  pending nations with the cheap opacity "breathing" (compositor-only), never
  the snake.
- Versioned message schema, heartbeats, reconnect with resume-from-`rev`,
  per-connection backpressure (drop presence, never drop state).

## Phase 4 — Client rendering at the high end

- 100+ avatars: switch the DOM markers to a single canvas/WebGL layer or
  cluster them at low zoom.
- Roster: virtualize the list (only render visible rows).
- Images: request 64/128px Discord CDN sizes only; lazy-load banners.

---

## Targets & how we'll prove them

| Metric | Today | After P0 | After P2 | After P3 |
|---|---|---|---|---|
| Update reaches other viewers | 0–8 s | 0–8 s | < 500 ms | < 150 ms |
| Portfolio open (500-game player) | grows with history | < 50 ms | — | — |
| DB queries/s, 100 viewers, idle lobby | ~50 | ≤ 1 PK lookup | ~0 | ~0 |

- **Load test** (k6 or Artillery): 200 simulated viewers on one lobby + 20
  hosts opening portfolios + a burst of 50 reservations in 10 s. Pass if the
  p95 API time is < 100 ms, there are no errors, and DB CPU stays < 30%.
- **Observability:** `Server-Timing` headers on the API, slow-query log on
  MySQL, and a tiny `/api/health/metrics` (requests/s, cache hit rate,
  connected clients per lobby).

## Decisions needed before Phase 2

1. **Where does the web app run in production?** (Long-running server vs
   serverless — this picks SSE vs a managed realtime service.)
2. Budget for a managed realtime provider (most have a free tier that covers
   a few hundred concurrent connections).
3. Redis available next to the bot/web? (Needed for Phase 2 on our own
   server, and for Phase 3.)
