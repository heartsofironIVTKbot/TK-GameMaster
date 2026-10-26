# Plan: move the audit log and ticket transcripts from Discord to the website

*Written 25 Oct 2026 as a hand-over for another coding assistant (Cursor).
Nothing in this file has been built yet.* Read the whole file before starting;
it explains the project, the rules, the data model, exactly where to hook in,
and how to check each stage. Build it **in stages, in order**, and stop after
each stage so the owner can test it.

---

## 0. Goal in one paragraph

Today GameMaster posts its private logs into Discord channels: the **Audit log**
channel (every host / staff action, DMs, role changes, slash commands) and two
**ticket transcript** channels (normal and private). The owner wants the
**website to be the place where this history lives**:

- a new **Audit** page that lists every non-ticket action (who reserved what,
  who unreserved, who moved whom, commends, warnings, bans, game start/end,
  settings changes, …), searchable and filterable;
- a **Tickets** page with every closed ticket's transcript, with **the same
  access rules the ticket channels had in Discord**;
- Discord then only keeps what needs someone's attention *now* (the Staff
  notices channel, ticket chats themselves, crash reports).

Benefits the owner agreed with: searchable history, can't be deleted by a
Discord admin, no Discord rate limits, fewer channels to set up, less
dependence on Discord. Risks to handle: the database becomes the only copy
(→ backups + append-only), access rules must be right (→ tests), storage
grows (→ indexes + retention).

---

## 1. Ground rules for this repository (must follow)

The owner has **no coding experience**; explain changes in plain words.

1. **Python:** run it with `py` (Windows launcher), never `python`.
2. **No git.** Git isn't installed — no commits, branches or stashes. Make
   backups of a file before big edits (copy it to a `.bak` next to it or to a
   temp folder) instead.
3. **The bot is one huge file:** `bot/bot.py.py` (yes, `.py.py`), ~31 000
   lines, discord.py + MySQL. It uses **CRLF** line endings and **UTF-8** with
   lots of emoji. Never round-trip it through PowerShell
   `Get-Content`/`Set-Content` (that corrupts emoji). Edit it with the editor,
   or with a Python script that uses `Path.read_text(encoding="utf-8")` /
   `write_text(..., encoding="utf-8")` (that keeps CRLF).
4. **The website** is `web/` — **Next.js 16** (App Router, TypeScript,
   Tailwind v4, mysql2). Read `web/AGENTS.md`: this Next.js version has
   breaking changes; check `web/node_modules/next/dist/docs/` before using an
   API you're unsure of. Run every `npx` command **from inside `web\`**.
5. **Checks after every change:**
   - Bot: `py -m pyflakes bot\bot.py.py` → no new "undefined name" lines.
   - Website (from `web\`): `npx tsc --noEmit -p .` must exit 0;
     `npx eslint src` must have 0 errors (one existing `<img>` warning in
     `ReservationDrawer.tsx` is expected).
6. **Don't change unrelated code.** Never send the Discord access token or bot
   token to the browser.
7. **Preview mode:** the dev server can run without Discord or MySQL using
   `SCHEDULER_DEMO=1` (already set in `web/.env.development.local`). Demo
   data lives in `globalThis` stores in `web/src/lib/*Demo.ts` files. **Every
   new page / API must also work in demo mode** with sample data, following
   the same pattern (see `web/src/lib/crashReports.ts`: `isSchedulerDemo()`,
   `demoReports()` on `globalThis`).
8. **Deploy order** for every stage: restart the **bot first**, then redeploy
   the website.
9. End every report to the owner with a short plain-language summary of what
   changed, what to test, and what's not done.

---

## 2. How the project fits together (what you need to know)

### 2.1 Multi-server ("per guild")

The bot serves many Discord servers. **Every row you store needs a
`guild_id`.**

- Bot: the current server is `cur_gid()`. Code runs "inside" a server via
  `with guild_scope(gid):` or the request loop, which sets it per request.
  Per-server settings are read as `G.NAME` (e.g. `G.HOST_LOG_CHANNEL_ID`,
  `G.TICKET_LOG_CHANNEL_ID`). Lists like `SENIOR_MANAGEMENT_ROLES`,
  `TICKET_SUPPORT_ROLES`, `DEVELOPER_ROLES`, `ALLOWED_HOST_ROLES` are
  per-server proxies; just read them.
- Website: the server the viewer is working on is `await currentGuildId()`
  (`web/src/lib/currentGuild.ts`). Always filter queries by it.

### 2.2 Database access

- Bot: blocking MySQL work runs off the event loop with
  `await _run_mysql_io(func, *args, label="…")`. Inside `func`, get a
  connection with `_db_get_connection()`, use a cursor, commit, and close both
  in `finally` (copy the shape of `_replace_web_member_directory_mysql`).
- Website: `getPool()` from `web/src/lib/db.ts` (mysql2 pool). Tables are
  created lazily with `CREATE TABLE IF NOT EXISTS` in an `ensureTable()`
  helper (copy `web/src/lib/crashReports.ts`, which also shows how to store a
  file in a `LONGBLOB`).
- **Both sides create the same tables with the same DDL** (the bot and the
  website may start in either order). Keep the DDL text identical in both.

### 2.3 Website → bot requests

The website never talks to Discord itself. It inserts a row into
`web_schedule_requests`; the bot's loop `web_schedule_request_loop()`
(`bot.py.py`, search for `async def web_schedule_request_loop`) picks up
pending rows every few seconds, runs `_process_web_<something>(req)` for the
row's `action`, and writes back `status` (`done` / `error` / `confirm`),
`result` and `error`. Each handler returns `(ok, result, err)`.

**Almost every host / staff action already goes through this loop** (calendar,
roster moves, moderation, host ratings, verification, VIP, host ranks, game
start/end/cancel, access changes, reminders, messages, drafts, hot-join,
server setup). That makes it the best single place to record audit events —
see §4.2.

### 2.4 Who is who (permissions)

- `web_host_roster` (bot-mirrored every few minutes): every member with a host
  rank or Host Management, with `is_staff = 1` for **server admins + Host
  Management**. The website's `getHostStatus()` (`web/src/lib/hostAuth.ts`)
  returns `host.is_staff`.
- `web_member_directory`: every member, with `role_ids` (JSON list of role id
  strings), refreshed by the bot every 10 minutes.
- Server settings (`settingsOf(guildId)` in `web/src/lib/serverSettings.ts`,
  shape in `web/src/lib/serverSettingsTypes.ts`):
  - `access.senior_staff_roles` = **Host Management** roles (old key name kept);
  - `access.ticket_support_roles`, `access.developer_roles`;
  - host rank roles per branch under `branches`.

### 2.5 Existing things that already act like an audit (reuse, don't duplicate)

- Settings → **History** (every settings change, who/when/what).
- Database page → a player's **moderation history**.
- Attendance page → its own audit list per game.
- `_audit_log(level, msg)` in the bot (line ~6379) **only prints to the
  console** today. Good place to also write a row (see §4.2).
- `send_log_message(content)` (line ~6572) posts plain text to the Audit log
  channel. Many other places post **embeds** straight to the channel (search
  for `HOST_LOG_CHANNEL_ID`, `AUDIT_CHANNEL_ID`, `LOG_CHANNEL_ID`,
  `ROLE_AUDIT_CHANNEL_ID`; ~22 places). After the settings clean-up, all
  three ids point to the one **Audit log** channel (`channels.host_log` in
  settings).

### 2.6 Tickets today (bot, search `TICKET_KINDS`)

```
"Verification"      RP Verification          staff: support + management        private: no
"Hist-Verification" Historical Verification  staff: support + management        private: no
"Host-App"          RP Host Application      staff: management                  private: YES
"Hist-Host-App"     HIST Host Application    staff: management                  private: YES
"Report-Host"       Host Report              staff: management                  private: YES
"Appeal"            Appeal                   staff: hosts + management          private: no
"Behavior"          Player Report            staff: hosts + management          private: no
"Commend"           Commend Request          staff: hosts + management          private: no
"Question"          General Question         staff: hosts + management          private: no
"Bug"               Bug Report / Suggestion  staff: developers + management     private: no
```

- Groups: `support` = Ticket Support roles, `management` = Host Management
  roles, `hosts` = every host rank role (`ALLOWED_HOST_ROLES`), `developers` =
  Developer roles. **Server admins can see every ticket.**
- **Report-Host:** the reported host (`target=` in the channel topic) is
  **always excluded**, even if they're Host Management.
- The opener can see their own ticket.
- Ticket channel topic format (parse with `_parse_ticket_topic`):
  `GameMaster | #0007 | type=Appeal | opener=<id> | host=<id> | target=<id>`.
- On close, `_finish_ticket(...)` calls `_ticket_transcript(...)` (line
  ~28846). That builds an HTML transcript from `channel.history(...)`, posts it
  to `G.TICKET_LOG_CHANNEL_ID`, or to `G.TICKET_PRIVATE_LOG_CHANNEL_ID` for
  private kinds, and DMs it to the opener.
- **Pitfall:** attachments in the transcript are **Discord CDN links, and they
  expire** (~24 h). Stage 2 must **download the files at close time**.
- **Pitfall:** without the Message Content intent (env `MESSAGE_CONTENT_INTENT=1`
  turns it on), the bot can't read other people's message text, and
  transcripts show "[message text not available]". That's unchanged by this
  plan; mention it in the Tickets page's empty state.

---

## 3. Data model (create in both bot and website, identical DDL)

### 3.1 `audit_events` — one row per action (append-only)

```sql
CREATE TABLE IF NOT EXISTS audit_events (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,              -- unix seconds, UTC
    category VARCHAR(24) NOT NULL,           -- see §3.2
    action VARCHAR(48) NOT NULL,             -- e.g. 'reserve', 'unreserve', 'roster_move'
    actor_id VARCHAR(32) NULL,               -- who did it (NULL = the bot / automatic)
    actor_name VARCHAR(64) NULL,             -- display name at the time
    target_id VARCHAR(32) NULL,              -- the player it was done to (if any)
    target_name VARCHAR(64) NULL,
    game_id VARCHAR(32) NULL,                -- game key (announcement post id / old thread id)
    summary VARCHAR(400) NOT NULL,           -- one human sentence, shown in the list
    details JSON NULL,                       -- anything else (from/to slots, amounts, reason, request id)
    source VARCHAR(12) NOT NULL,             -- 'web' | 'bot' | 'discord' (slash command / button)
    INDEX idx_audit_guild_time (guild_id, created_at),
    INDEX idx_audit_guild_actor (guild_id, actor_id, created_at),
    INDEX idx_audit_guild_target (guild_id, target_id, created_at),
    INDEX idx_audit_guild_game (guild_id, game_id, created_at),
    INDEX idx_audit_guild_cat (guild_id, category, created_at)
)
```

Rules:
- **Never UPDATE or DELETE** rows from application code, except the one
  retention job (§7.3).
- `summary` is written in plain English when the event happens, so the page
  never has to rebuild sentences: e.g. `"Ivan reserved Germany"`,
  `"Host Anna moved Ivan from Italy to Japan"`, `"Ben was given 2 warnings
  (RP): no-show"`.
- Keep `details` small (< 4 KB). No tokens, passwords, IPs or DM bodies of
  private messages beyond what the old Discord log showed.

### 3.2 Categories and actions (use exactly these strings)

| category | actions | written by |
| --- | --- | --- |
| `reservation` | `reserve`, `unreserve`, `reserve_coop`, `reserve_filler`, `nickname_set` | website (`/api/reserve`) |
| `roster` | `roster_add`, `roster_move`, `roster_swap`, `roster_replace`, `roster_remove`, `late_join`, `hotjoin_request`, `hotjoin_approved`, `hotjoin_declined` | bot (request loop) / website (hot-join request) |
| `game` | `scheduled`, `schedule_edited`, `schedule_cancelled`, `announced`, `started`, `ended`, `cancelled`, `access_changed`, `nation_locked`, `nation_unlocked`, `reminder_sent`, `players_messaged` | bot |
| `draft` | `draft_join`, `draft_leave`, `draft_pick`, `draft_start`, `draft_place`, `draft_remove`, `draft_finish`, `draft_captain` | bot |
| `moderation` | `commend`, `warn`, `merit`, `ban`, `unban`, `dishonored`, `undo`, `take` | bot |
| `host` | `host_rank_set`, `acclamation`, `violation`, `acclamation_taken`, `violation_taken` | bot |
| `roles` | `verify`, `vip`, `vip_approved`, `trusted_auto`, `ban_role_auto`, `role_scan` | bot |
| `message` | `host_message`, `dm_failed` | bot |
| `settings` | `settings_saved`, `setup_finished`, `fix_action` | website / bot |
| `system` | `command_used` (slash commands + context menus), `crash_report`, `bot_log` (anything still sent through the old log helpers) | bot |

Tickets are **not** in this table (they have their own, §3.3), but you may
write one `system`/`ticket_closed` line with no transcript so the Audit page
shows that a ticket existed. Only do this for non-private kinds.

### 3.3 Tickets (Stage 2)

```sql
CREATE TABLE IF NOT EXISTS ticket_records (
    ticket_id VARCHAR(32) NOT NULL PRIMARY KEY,   -- e.g. '<guild_id>-0007'
    guild_id VARCHAR(32) NOT NULL,
    number INT NOT NULL,                          -- the 0007 in ticket-0007-appeal
    kind VARCHAR(24) NOT NULL,                    -- TICKET_KINDS key
    channel_name VARCHAR(100) NOT NULL,
    opener_id VARCHAR(32) NOT NULL,
    opener_name VARCHAR(64) NULL,
    host_id VARCHAR(32) NULL,                     -- game support: the game's host
    target_id VARCHAR(32) NULL,                   -- Report-Host: the reported host (ALWAYS excluded)
    status VARCHAR(16) NOT NULL,                  -- 'Resolved' | 'Unresolved'
    closed_by_id VARCHAR(32) NULL,                -- NULL = auto-closed after 48 h
    closed_by_name VARCHAR(64) NULL,
    close_reason VARCHAR(400) NULL,
    opened_at BIGINT NOT NULL,
    closed_at BIGINT NOT NULL,
    message_count INT NOT NULL DEFAULT 0,
    INDEX idx_ticket_guild_time (guild_id, closed_at),
    INDEX idx_ticket_guild_kind (guild_id, kind, closed_at),
    INDEX idx_ticket_opener (guild_id, opener_id)
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(32) NOT NULL,
    position INT NOT NULL,                        -- order in the channel
    author_id VARCHAR(32) NOT NULL,
    author_name VARCHAR(64) NOT NULL,
    is_bot TINYINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    content TEXT NULL,                            -- NULL when the bot couldn't read it
    embeds_json JSON NULL,                        -- title/description/fields of bot embeds (small)
    INDEX idx_ticket_messages (ticket_id, position)
);

CREATE TABLE IF NOT EXISTS ticket_files (
    file_id VARCHAR(32) NOT NULL PRIMARY KEY,     -- random hex
    ticket_id VARCHAR(32) NOT NULL,
    message_position INT NOT NULL,
    filename VARCHAR(200) NOT NULL,
    content_type VARCHAR(100) NULL,
    bytes INT NOT NULL,
    content LONGBLOB NULL,                        -- NULL = too big / download failed (keep the name)
    INDEX idx_ticket_files (ticket_id)
);
```

Limits: download attachments up to **8 MB each and 40 MB per ticket**. Store
the rest as name-only rows (`content` NULL) so the transcript still says
"file not kept: too big".

---

## 4. Stage 1 — Audit events + read-only Audit page (Discord unchanged)

**Done when:** actions appear on a new `/audit` page within seconds; the
Discord Audit log channel still works exactly as before; demo mode shows
sample events.

### 4.1 Website writes (reservations happen on the website)

Create `web/src/lib/auditLog.ts`:

- `ensureAuditTable()`: the DDL from §3.1.
- `recordAudit(event: AuditEventInput): Promise<void>` inserts one row and
  **never throws**. Wrap it in try/catch, log the error with `console.error`,
  and return. The audit must never break the action itself.
- Demo mode: push into a `globalThis.__gmAuditDemoV1` array instead.
- Types go in `web/src/lib/auditTypes.ts`: `AuditCategory`, `AuditEvent`,
  `AuditEventInput`, `AuditQuery`, `AuditPage`.

Call it from:

- `web/src/app/api/reserve/route.ts`: after a successful reserve / unreserve /
  co-op / filler write. Use category `reservation`; the actor is the session
  user; `game_id` = the thread/game id; the summary uses the nation's
  display name.
- The nickname save route, if there is one (search `ingame_nickname` under
  `web/src/app/api`): `nickname_set`.
- The hot-join request route (`web/src/app/api/hotjoin/route.ts`):
  `hotjoin_request`. The bot records approve/decline.
- Server settings save (`saveServerSettings` in `web/src/lib/serverSettings.ts`):
  one `settings_saved` event whose summary uses the existing
  `changeSummary(...)` text. Keep the existing History; this is just a line on
  the Audit page.

### 4.2 Bot writes

Add near `_audit_log` (line ~6379):

```python
def _write_audit_event_mysql(row: tuple) -> None:
    # INSERT INTO audit_events (guild_id, created_at, category, action, actor_id, actor_name,
    #   target_id, target_name, game_id, summary, details, source) VALUES (%s, ... 12 ...)
    ...

async def audit_event(category: str, action: str, summary: str, *, actor=None, target=None,
                      game_id=None, details: dict | None = None, source: str = "bot") -> None:
    """Record one action for the website's Audit page. Never raises."""
```

- `actor` / `target` accept a discord Member/User, an id (int or str) or None.
  Store `str(id)` and `display_name` (cut to 64 characters).
- `guild_id` = `str(cur_gid())`; `created_at` = `int(time.time())`.
- Run the insert with `_run_mysql_io(...)` inside try/except. On failure print
  a `[WARN]` and return. **Don't await it in hot paths that must be fast.**
  Use `asyncio.create_task(audit_event(...))` there. Keep a reference set
  (`_audit_tasks`) so tasks aren't garbage-collected; remove each task in its
  `add_done_callback`.
- Create the table at startup: run the DDL once in the same place other
  tables are created. Search `CREATE TABLE IF NOT EXISTS crash_reports` to see
  where the bot does it.

Where to call it (in this order of value):

1. **The request loop** (`web_schedule_request_loop`): right after
   `ok, result, err` is known for a request, and **before** the status is
   written back. Write one event per finished request, **except** `confirm`
   results (nothing happened yet) and failed ones (log failures only for
   `server_setup` and lifecycle actions). Map `action` to the category/action
   in §3.2. For actions whose handler already knows the details (roster,
   moderation, host rating), **prefer calling `audit_event(...)` inside the
   handler** with a precise summary, and skip the generic loop event for those
   actions (keep a set `_AUDIT_SELF_RECORDED = {...}`). Handlers to cover:
   - `_process_web_roster_assign` / `_process_web_roster_remove`: you have
     `current_key`, `key`, `occupant`, `swapped_to`, `actor`, `target`. Write
     `roster_add` / `roster_move` / `roster_swap` (one event, details contain
     both players) / `roster_replace` / `roster_remove` / `late_join`. The
     existing `_audit_log("INFO", ...)` lines there show the fields.
   - moderation (`apply_moderation_action`, `apply_dishonored_action`), host
     ratings (`apply_host_rating`), verification (`apply_verification`), VIP,
     host ranks (`apply_host_tier`): one event each with amount, branch/mode
     and reason.
   - game lifecycle (start / end / cancel), access (`_process_web_game_access`),
     reminders (`_process_web_game_remind`), messages, draft
     (`_process_web_draft`), hot-join decisions (`_process_web_hotjoin`).
2. **Automatic bot actions** (no request): scheduled announcements (where
   the announcement is posted, search `Game Announcement`), automatic game
   end, the daily role check (`role_scan`), automatic Trusted / game-ban
   roles, Dishonored expiry, ticket 48 h auto-close (only the `system`
   one-liner), crash reports.
3. **Slash commands and context menus** that remain (`/help`, `/info`,
   `/list_code`, `/spawn`, `/close`, "Delete GameMaster message"): one
   `system/command_used` event. There may be a shared command-log hook; search
   `ROLE_AUDIT_CHANNEL_ID` / `on_app_command_completion`.
4. **Safety net:** inside `send_log_message(content)`, also write
   `system/bot_log` with `summary=content[:400]`. Do the same in any other
   helper that posts embeds to the Audit log channel: use the embed title +
   description as the summary. This catches anything not yet mapped
   explicitly. Later stages replace these with precise events.

### 4.3 Read API

`web/src/app/api/audit/route.ts` (GET):

- Access: `getHostStatus()`; status must be `ok` **and** `host.is_staff`
  (admins + Host Management). Everyone else gets 403 with the plain message
  "Only Host Management can see the audit log." (Optional later: let a host see
  events of games they hosted. Not in Stage 1.)
- Query params: `category`, `action`, `actor`, `target` (user id), `game`,
  `q` (text search in `summary`, `LIKE %q%` with escaping), `from` / `to`
  (unix seconds), `before` (id, for paging), `limit` (default 50, max 200).
- Always `WHERE guild_id = ?` with `await currentGuildId()`.
- Paging: keyset (`id < before ORDER BY id DESC LIMIT n`), not OFFSET.
- Response: `{ events: AuditEvent[], next_before: number | null }`.
- `GET /api/audit/export?...same filters` → CSV (max 10 000 rows), staff only.

### 4.4 The Audit page

- Route: `web/src/app/audit/page.tsx` → client component
  `web/src/components/audit/AuditApp.tsx`.
- Copy the layout/style of existing host pages (`/database`, `/games`): dark
  glass cards, amber accents, the same header with the server switcher.
- Top: filter bar. Category chips (with counts for the last 7 days), a search
  box, a player picker (reuse the player search used by the Database page), a
  game id box, and a date range. "Export CSV" button.
- List: one row per event, newest first. Show the time in the viewer's time
  zone (`formatInZone` from `web/src/lib/timeEngine.ts`), a category icon, the
  summary, and links: the actor/target name → `/database?user=<id>` (check the
  real query param the Database page uses), the game id → `/games?game=<id>`.
  Click a row to expand `details` as a small key/value list.
- "Load more" at the bottom (keyset paging). Auto-refresh the first page
  every 15 s while the tab is visible.
- Empty state: "No actions recorded yet. New actions show up here within
  seconds."
- Add it to the top bar's host links (`HOST_LINKS` in
  `web/src/components/TopBar.tsx`) **only for staff**. `TopBar` gets
  `hostTools` for hosts; add an `isStaff` prop from the page
  (`host.isHost` → also expose `is_staff` from `useHostTools`' status). Also
  add it to the Database record: a "History" tab that calls
  `/api/audit?target=<id>` and shows the same rows.
- Demo data: `web/src/lib/auditDemo.ts` with ~40 varied sample events across
  all categories, plus whatever the demo actions push.

### 4.5 Stage 1 checks

- Reserve and unreserve a nation in demo mode → two rows appear on `/audit`.
- A host move / swap / remove with the Host Tool → precise rows with both
  players.
- A non-staff host opening `/api/audit` → 403.
- Bot: write a small test that loads the bot offline (stub `mysql`), replaces
  `_run_mysql_io` with a fake that records the row, calls
  `_process_web_roster_assign` with fakes, and asserts the audit row's
  category/action/summary. (The owner's previous assistant kept such tests
  outside the repo. If you add tests, put them in `bot/tests/` and say so.)
- `pyflakes`, `tsc`, `eslint` clean.

---

## 5. Stage 2 — Tickets on the website

**Done when:** every ticket closed after the deploy can be read on
`/tickets` by exactly the right people. Its files open even weeks later. The
Discord transcript posts still happen (they're removed in Stage 3).

### 5.1 Bot: save the ticket at close

In `_ticket_transcript(...)` (or a new `_ticket_save_record(...)` called from
`_finish_ticket` before the channel is deleted):

1. Read `messages` (already done there).
2. Build the `ticket_records` row from `meta` (`_parse_ticket_topic`), the
   channel name (number = the 4 digits in `ticket-0007-…`), the closer and the
   status. `opened_at` = the first message's time.
3. For each message, add one `ticket_messages` row. For bot embeds, store
   `{title, description, fields:[{name,value}]}` trimmed to ~2 KB.
4. For each attachment: download `att.read()` **now** (it expires later),
   within the limits in §3.3, and insert into `ticket_files`.
5. Insert everything in **one transaction** via `_run_mysql_io`. If it fails,
   print a warning **and still post the Discord transcript** (Stage 2 keeps
   Discord as the fallback).
6. Change the opener's DM: keep the attached HTML file, and add a link
   `"{WEB_SITE_URL}/tickets/{ticket_id}"`.

### 5.2 Website: permission check (the most important part)

Create `web/src/lib/ticketAccess.ts` with **one** function, used by every
ticket API:

```ts
canViewTicket(viewer: { id: string; isAdmin: boolean; roleIds: Set<string> },
              ticket: { kind: string; opener_id: string; target_id: string | null },
              settings: ServerSettings): boolean
```

Rules, checked in this order:
1. `ticket.target_id === viewer.id` → **false** (the reported host never
   sees the report, even as Host Management or admin).
2. `ticket.opener_id === viewer.id` → true (people see their own tickets).
3. `viewer.isAdmin` → true.
4. Allowed groups for the kind (mirror `TICKET_KINDS` in the bot; put the
   table in `web/src/lib/ticketTypes.ts` with a comment saying "keep in sync
   with bot.py.py TICKET_KINDS"):
   - `support` → `settings.access.ticket_support_roles`
   - `management` → `settings.access.senior_staff_roles`
   - `hosts` → every host rank role in `settings.branches[*]` (only ranks
     that are switched on) **plus** management
   - `developers` → `settings.access.developer_roles`
   - true if the viewer has any role in an allowed group.
5. Unknown kind → management only.

Where the viewer data comes from:
- `roleIds`: `web_member_directory.role_ids` for `(guild_id, viewer.id)`.
- `isAdmin`: there is no admin flag in the directory. Use
  `web_host_roster.is_staff` **only together with** checking that the viewer
  is not just Host Management. Simplest correct option: have the bot add an
  `is_admin TINYINT` column to `web_member_directory` (the loop already has
  `member.guild_permissions`). Add it with `ALTER TABLE … ADD COLUMN IF NOT
  EXISTS` style logic (MySQL 8: check `information_schema.COLUMNS` first).
- Write **unit tests** for `canViewTicket` covering every row of the table in
  §2.6, the reported-host exclusion, the opener, admins, and a switched-off
  rank.

### 5.3 Website: API and pages

- `GET /api/tickets?kind=&status=&q=&before=` → the tickets the viewer may see
  (filter in SQL by guild, then apply `canViewTicket` in code; page until you
  have `limit` visible ones or run out).
- `GET /api/tickets/[id]` → record + messages (404 if not allowed: **don't
  reveal that it exists**).
- `GET /api/tickets/[id]/files/[fileId]` → the file with
  `Content-Disposition: attachment` and the stored content type. **Never
  serve HTML or SVG inline** (stored XSS risk); force download for anything
  that isn't png/jpg/gif/webp.
- Pages: `/tickets` (list with kind/status filters and search by opener name or
  number) and `/tickets/[id]` (a Discord-like transcript: avatar initial,
  name, time, text, embeds as cards, images shown inline, other files as
  download chips).
- Players can open `/tickets` too and see only their own tickets.
- Demo data: `web/src/lib/ticketsDemo.ts` with one ticket of each kind,
  including a Report-Host whose target is the demo user (so the exclusion
  can be seen).
- Link: top bar for staff/ticket roles, and the player's own profile page
  ("My tickets").

### 5.4 Stage 2 checks

- Close a ticket of each kind in a test server and open it on `/tickets` as:
  the opener, Ticket Support, a plain host, Host Management, a developer, an
  admin, the reported host. Compare with §2.6.
- A file attached in the ticket opens a week later.
- A non-allowed user gets 404 on the URL of a ticket they can't see.

---

## 6. Stage 3 — Retire the Discord log channels (only after the owner says the pages work)

1. Settings (`web/src/lib/serverSettingsTypes.ts` **and** the bot's
   `_default_guild_settings` / `_normalize_guild_settings` /
   `_apply_settings`):
   - remove `channels.ticket_log` and `channels.ticket_private_log`;
   - make `channels.host_log` (label "Audit log") **optional**, with the hint
     "Optional: a copy of the audit trail in Discord. The website's Audit page
     always has everything."
   - add a feature switch `features.audit_discord_mirror` (default **off** for
     new servers, **on** for servers that already have the channel set, so
     nothing disappears without the owner choosing).
2. Bot: every place that posts to the Audit log channel checks the switch.
   `_ticket_transcript` stops posting to Discord channels (it keeps the
   opener's DM with the website link).
3. Settings → Channels step, Health checks (`settingsIssues`,
   `REQUIRED_PERMISSIONS` reasons, the "Test the audit log" fix button in
   `web/src/lib/serverDashboardTypes.ts`) updated to match.
4. Docs: `docs/server-setup.md`, `docs/tickets.md`, and a new `docs/audit-page.md`.

---

## 7. Protecting the data (do this in Stage 1, not later)

### 7.1 Backups (the most important safety step)
- A daily `mysqldump --single-transaction --routines --triggers <db> | gzip`
  run by the server's scheduler (cron / Task Scheduler) at a quiet hour.
- Copy the file **to a different provider/machine** than the database (e.g.
  an S3-compatible bucket or another VPS). Keep 14 daily + 8 weekly copies.
- Turn on MySQL binary logs (`log_bin`) if the host allows it, so the database
  can be restored to any minute.
- Write `docs/backups.md` with the exact restore steps, and **test a restore
  once** into a scratch database.

### 7.2 Append-only access
- Create a separate MySQL user for the website with only `SELECT, INSERT` on
  `audit_events`, `ticket_records`, `ticket_messages`, `ticket_files`. It must
  have no UPDATE or DELETE on those tables, and its usual rights elsewhere. If
  one website user can't have per-table grants on the host, at least make sure
  no website code path runs UPDATE/DELETE on them. Add a comment block saying
  so at the top of `auditLog.ts`.
- The bot user keeps DELETE only for the retention job.

### 7.3 Retention (one job, nothing else deletes)
- Bot daily loop (reuse the existing daily 04:00 UTC slot used by the role
  check, or add a `tasks.loop(hours=24)`): delete `audit_events` older than
  **400 days**, and `ticket_files.content` (set NULL, keep the row) older than
  **180 days**. Make both numbers constants at the top of the section.
  Delete in batches of 5 000 (`DELETE … ORDER BY id LIMIT 5000` in a loop) so
  the table isn't locked.
- Record one `system/retention` audit event with how many rows were removed.

### 7.4 What can still wipe data (tell the owner)
- Losing the database **and** the backups (that's why backups go elsewhere).
- Someone with the database admin password.
- A badly written migration. Never `DROP`/`TRUNCATE` these tables in code;
  migrations only ADD columns/indexes.

---

## 8. Privacy and limits
- Store only what the Discord log already showed. No IP addresses, no
  OAuth tokens, no email.
- The Audit page is Host Management + admins only (Stage 1).
- A player can see their own tickets, never other people's.
- Audit page queries must always use an index (every filter above starts with
  `guild_id` + time). Don't add `ORDER BY` on unindexed columns.

---

## 9. Order of work and what to report

1. Stage 1: tables + `audit_event` (bot) + `recordAudit` (website) + request-loop
   hook + roster/moderation precise events + `/api/audit` + `/audit` page +
   backups doc. → owner tests → continue.
2. Stage 2: ticket save at close + `ticketAccess.ts` with tests + ticket API +
   pages. → owner tests with real roles → continue.
3. Stage 3: settings/health/docs changes to retire the channels, with the
   mirror switch.

After each stage, tell the owner in plain words:
- what now shows on the website;
- what still goes to Discord;
- what to test (a short click-list);
- deploy order: **restart the bot, then redeploy the website**.

Other open item (unrelated, don't start without the owner): the **Casino
integration** (TommyKay only) is still waiting.
