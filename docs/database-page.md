# Database page — commends, Merit, warnings, game bans and Dishonored

`/database` on the website replaces Discord's `/give`, `/take` and
`/sentence` (removed from the bot). `/report` stays. Hosts only — same login
and Host-role check as the Host Calendar. Linked from the map's top bar
(🗂️ Database, hosts only), the Portfolio window (🗂️ Moderate) and the
Calendar.

Two modes only: **Roleplay** and **Historical**. Stellaris was removed from
the bot and the website, and **Blacklist no longer exists** (Dishonored
replaced it).

## The rules (October 2026)

| Thing | Rule |
| --- | --- |
| ⭐ Commend | 5 in a mode + the Verified role → that mode's Trusted (never while game banned in any mode). Below 5 → Trusted removed (Roleplay keeps it for VIP / Hearts of Valor). |
| ⚠️ Warning | 3 in a mode → automatic game ban in that mode. Taking warnings below 3 lifts an **automatic** ban; a ban a host gave by hand stays until a host lifts it. |
| ♻️ Redeem | The **only** way commends reduce warnings: a host spends N commends to clear N warnings in one mode. Commends and warnings never cancel each other automatically — not when giving, not on no-shows, not when a host marks someone absent. |
| ➖ Take a warning | Free (no commends spent) — for warnings that were unjustified. |
| 🎖️ Merit | One pool for all modes. Never turns into commends and never touches warnings. |
| 🎖️ Hearts of Valor | **25 Merit + 50 attended games** (marked present in the attendance log — reservations alone don't count), no game ban, **no current warning**. If a warning is in the way, the user is DMed once to open a ticket (and the host log notes it); the promotion happens automatically once they're clear. On earning it they get a perks DM: (1) a DM **1 hour before every scheduled game announcement**, (2) a **Trusted role of their choice** — they pick Roleplay or Historical in the DM, the host team gets an Approve / Decline card in the host channel. The approved pick is kept while they hold Valor (even below 5 commends) and is lost with Valor or a game ban. |
| 🔴 Game ban | Lasts until lifted. Every game ban — given by a host or automatic at 3 warnings — resets **the banned mode's commends and all Merit to 0** and removes **Trusted (RP + MP) and Hearts of Valor**. No positive role comes back while any game ban is active. Lifting the ban doesn't restore what was reset. |
| ⚖️ Dishonor | A **time-out**: blocks All Majors and/or chosen Majors / Minors in one mode, usually for 1 week – 3 months (1–365 days allowed). Commends, Merit, warnings and roles stay untouched (only the Dishonored marker role is added). Adds to an active sentence, or replaces it if the host picks that. |

Amounts are 1–20 per action. Every action needs a reason (shown to the player
in their DM and in the host log). Hosts can't moderate themselves.

**Player DMs for a warning, game ban or Dishonor** (from the Database page or
the automatic no-show warning) carry two buttons: green **Acknowledge** and red
**Appeal**. Appeal opens a short form; the appeal goes to the host channel and
shows up on the player's record ("Appeal submitted"). Each DM can be
acknowledged or appealed once. Valor Trusted requests and appeals go to the
host log channel (`HOST_TEAM_CHANNEL_ID` in `bot.py.py`).

## What hosts see

- **Left — users:** everyone with any history — played a game, or has
  commends, warnings, Merit, a ban, a Dishonored sentence or a moderation
  record (including people who left the server, greyed out). Search by name,
  @handle or Discord ID (`/` jumps to the box; ↑ ↓ Enter to pick); a search
  also finds server members with no history yet ("no history yet"), so a
  host can act on them. Each row shows just the name, @handle, games played
  and status badges (🛡️ Trusted, 🎖️ Valor, ⚖️ Dishonored, 🔴 banned). Filters with live counts: Warned, Banned, Dishonored,
  Trusted, Valor. Sort by name, warnings, commends, games or most recently
  moderated.
- **Right — nobody selected:** the **🛡️ Role check** card (below), the
  server-wide moderation feed (newest first, refreshes every 30 s) and a
  one-glance rules card.
- **Right — a user:** profile (roles, ID with copy), the full portfolio
  (same as the map's Portfolio window) and the **Moderate** panel:
  - **Give / Take**, then a **Type**: Commend · Merit · Warning · Dishonor ·
    Game ban. Then mode · amount · optional game (only ended games in that
    mode) · reason with quick templates.
  - **Give → Dishonor:** mode, All Majors toggle, Major chips, searchable
    Minors (the bot's own nation lists), a **1 day – 3 months slider** with
    presets (1 wk, 2 wk, 3 wk, 1 mo, 6 wk, 2 mo, 3 mo) and an exact-days box
    for anything longer (up to 365), replace/add toggle.
  - **Take → Dishonor:** the active sentences; pick one and lift it.
  - **Redeem** — commends → warnings, capped at what the user has.
  - **"What will happen"** preview before sending (e.g. "warnings 2 → 3 —
    automatic game ban · resets Roleplay commends 6 → 0 and Merit 31 → 0").
  - Game bans, Dishonor and anything that triggers a ban need a second
    click to confirm.
  - After the bot applies it: the result, its notes and a **Log ↗** link,
    plus **Undo** for 10 minutes (not for Redeem or for adding to an
    existing Dishonored sentence; undoing a ban can't bring back the
    commends and Merit it reset; undoing a Lift puts the same sentence back
    for the time it had left).
- **Host standing** (on any host's record, under Moderate): hosted games,
  and **one row per host branch (RP and HIST)** with that branch's rank,
  Acclamations (with how many to the next rank), Violations and
  🟢 Active / 🟠 Final warning / 🔴 Terminated. **Senior Hosts of a branch**
  can rate that branch; **Senior Management** (+ admins) can rate both — pick
  the branch, then **Give** Acclamations or Violations (1–10, reason
  required, preview first, two clicks for a Violation). This replaces
  `/give_host` / `/take_host` (removed from Discord). They work exactly like
  commends and warnings: Acclamations promote (2 → Assistant becomes Full,
  4 → Full becomes Senior), Violations strip that branch's rank at 3, and
  **giving one never removes the other kind**. Only **Host Management** can
  **Take** either back; the rank then follows what's left. Ranks a server
  switched off are skipped (Settings → Host ranks). Everything stays within
  the one branch (see [roles-and-vip.md](roles-and-vip.md#host-branches-formerly-make_host)). Nobody can rate themselves. The host is DMed, it goes to the
  host log, and it shows in their moderation history.
- **Verification & VIP** (on every record): RP Verified and Hist Verified
  (who gave them and when), VIP with its category (Content Creator / PDX
  Staff / Highly Trusted), VIPs on other servers and ones waiting for
  approval. Senior staff give and take them there — this replaced `/verify`
  and `/make_vip`. See [roles-and-vip.md](roles-and-vip.md).
- **Send a message** (on every record — replaced `/dm`): any host writes a
  message (up to 2,000 characters) and the bot DMs it. It shows as from
  "a Game Host" unless **Sign it with my name** is ticked; a preview shows
  exactly what they'll see. Every message goes to the host log channel and
  is listed under **Earlier messages** on the record (who sent it, when,
  signed or anonymous, and "Not delivered" when their DMs are closed). Kept
  in the bot's `host_messages` table (this server's rows only).
- Open a record directly with `/database?player=<discord id>`.

## Role check (was /scan)

The role check cross-checks every relevant member's roles against their
records:

- **Trusted** (RP and MP / Hist): 5+ commends in that mode, VIP, or their
  approved Hearts of Valor pick — and that game type's Verified role (RP
  Verified / Hist Verified) and no game ban in any mode. Missing ones are
  given, wrong ones removed.
- **Hearts of Valor** and **Dishonored** roles, from Merit / attended games
  and active restrictions.
- The database's **Verified** and **host tier** flags, fixed to match Discord
  (these are record fixes only — no roles change).

Senior staff press **🔍 Preview changes**: nothing changes; the card lists
every change it would make, grouped (Trusted removed / added, Valor,
Dishonored, records fixed), with who and why — click a name to open their
record. **✅ Apply these changes** (click twice) runs it for real; it checks
everything again at that moment, then posts the full result to the host log.
Applying can take a few minutes (role changes go out one by one); it runs in
the background, so the page and other actions keep working.

It also **runs by itself every day at 04:00 UTC** (and applies). The card
shows the last run — when, automatic or by whom, and what changed. Any host
can see the card; only senior staff can run it.

## How it works

1. The page sends the action to `POST /api/schedule/requests`
   (`action: "moderation"` or `"dishonored"`); the web checks the shape
   (`lib/moderationValidation.ts`) and queues it in `web_schedule_requests`.
2. The bot's request loop picks it up within seconds, re-checks the host's
   role, and runs `apply_moderation_action` / `apply_dishonored_action`
   (`bot.py.py`, "MODERATION ENGINE"): stats, roles, auto ban / unban (with
   `_apply_game_ban_wipe`), Trusted, Merit conversion, the game archive,
   player DM, host-log embed (also forwarded to an older game's Host Control
   Center, if it has one) and
   `moderation_events`.
3. The page polls the request, shows the result and reloads the record
   fresh.

The role check is `action: "role_scan"` with `payload: {mode: "preview" |
"apply"}` (senior staff); the bot runs `_run_role_verification_scan` in the
background and saves the last preview and the last applied run in
`bot_config` (`web_role_scan_last`), which `GET /api/database/role-scan`
returns.

The bot publishes its Dishonored nation lists to `bot_config`
(`web_moderation_options`) at startup, so the page offers exactly the names
the bot accepts.

**Preview mode** (`SCHEDULER_DEMO=1`, `npm run dev`): sample users and a
simulated bot that follows the same rules (`lib/databaseDemo.ts`).

## Retired data

The `users` table still has the old Stellaris and blacklist columns
(`stellaris_verified`, `stel_*`, `blacklisted`, `stellaris_host_tier`). The
bot no longer reads or updates them (it only writes 0 into them for brand-new
rows, in case the table has no defaults), so nothing was deleted. They can be
dropped from the database later if you want them gone for good. Anyone who
still holds the old Blacklisted role or flag is **no longer blocked** — give
them an All Majors Dishonor if they should be.

## Deploy

1. Deploy the website.
2. Restart the bot — it removes `/give`, `/take`, `/sentence` and the Stellaris
   choices from Discord, publishes the nation lists and adds the
   `users.valor_trusted` column. Current Valor holders who got RP Trusted
   from the old automatic rule keep it as their approved pick. Valor holders
   who don't reach the new 50-attended-games bar lose Valor at the next role
   scan.
3. (Once, if not done yet) `/backfill_portfolios` for older history in the
   activity feed.
