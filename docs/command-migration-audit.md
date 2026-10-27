# Discord command audit — what's left, and where each should go

*October 2026.* When this audit was written the bot registered **51 slash
commands**. This lists every one of them, who uses it, what it does, and
where it should go next, so we can keep moving host work from Discord to the
website.

> **Progress (19 Oct 2026):** steps 1–3 are done — /give_host, /take_host,
> /lock, /unlock, /lockdown, /nation_lock, /nation_unlock, /clear and
> /late_join are gone (Database page and Games page; see
> [games-page.md](games-page.md)). A second round removed /reserve,
> /unreserve, /reserve_filler, /reserve_coop (players reserve on the map),
> /refresh_list, /remind (Games page reminders), /unlock_host_panel (no Host
> Control Center any more), /hacker and its system, /report, /report_host,
> /schedule, /refresh_schedule and /clean. Game mode presets then replaced
> /post_mods and /post_rules (Games page → Rules & mods; see
> [presets-page.md](presets-page.md)). Draft games moved to the website and
> replaced /start_draft, /draft_pick and /empty_draft_pool (see
> [draft-games.md](draft-games.md)). /verify, /make_vip and /make_host moved
> to the Database page, with verification split into RP Verified and Hist
> Verified and VIP categories that carry over between servers (see
> [roles-and-vip.md](roles-and-vip.md)). /scan became the Database page's
> Role check (preview first, then apply, plus a daily automatic run — see
> [database-page.md](database-page.md)). /dm became "Send a message" on a
> member's Database record and /dm_participants became "Message players" on
> the Games page. In late October 2026 /gamble, /gamble_for, /draw,
> /draw_for, /achievement, /backfill_portfolios and /search_logs were removed
> too (Casino and Fortunes of War show as "currently unavailable" on the
> Calendar until the Casino website is integrated, TommyKay only), and /info
> now opens the player's own profile page on the website. Then /bot_status
> (the public Status page), /sync_commands (the dashboard's "Re-sync
> commands" button + sync on every start), /forward_log (the website's chat-log
> analysis posts to the archive itself), /upload_bot_banner and
> /upload_bot_profile (change them in the Discord Developer Portal) were
> removed. Then games stopped getting reservation threads (see
> [games-without-threads.md](games-without-threads.md)), so /spawn_panel
> (hot-join and crash reports are on the website) and /run_ai_analysis (the
> Games page's chat-log card) went too. Then the TicketMaster bot was merged
> in (see [tickets.md](tickets.md)), which brought **/spawn** (post the ticket
> panel) and **/close** (close a ticket if its buttons fail). **5 commands.**
> The Settings clean-up added one message context menu, **Delete GameMaster
> message** (right-click → Apps; Host Management only, the bot's own messages
> only, logged in the audit log). The weekly schedule board was removed from the
> bot; a pinned scheduling panel (buttons to the Calendar, Games and
> Attendance pages) took its place.
> Rows marked ✅ below are done; ❌ = removed.
>
> Now: /help, /info, /spawn, /close.
>
> The chat-log upload + AI analysis (lived in the Host Control Center) is
> now on the Games page, with stricter grading — see
> [ai-log-analysis.md](ai-log-analysis.md). (Draft-pool sign-ups, which
> were /reserve, are now on the map.)

**Already moved to the website** (for reference): scheduling and day locks
(Calendar), /give, /take and /sentence (Database), /add, /add_coop,
/add_filler and /remove (live map host tools), attendance (Attendance page),
and /game_start, /game_end, /game_cancel and /announce_game (Games page).

## The short version

| Recommendation | Commands |
| --- | --- |
| **Remove now** — the website already does it | 2 (/give_host, /take_host) — plus /report and /report_host once partners can see records on the web |
| **Move to the Games page** — per-game host tools | 22 |
| **Move to the Database page** — member and role admin | 6 |
| **Small new Admin page** — bot upkeep for senior staff | 5 |
| **Stay in Discord** — players (or chat itself) | 12 |
| Optional: retire later | /schedule (just a link to the Calendar) |

## Suggested order (most value for least work first)

1. ✅ **Delete /give_host and /take_host.** Senior Hosts already give and take
   Acclamations / Violations on the Database page. Tiny job.
2. ✅ **Reservation access on the Games page** — /lock, /unlock, /lockdown,
   /nation_lock, /nation_unlock, /clear. Hosts use these every game. The
   Calendar already sets the same things *before* the announcement; this adds
   them for announced games. Medium job.
3. ✅ **Late join on the website** — /late_join. The live map can already put a
   player on a nation, but on a started game it doesn't give the Gamer Pass or
   voice channel. Wire it to the bot's existing late-join routine. Small job.
4. ✅ **Message players from the Games page** — /remind and /dm_participants.
   Small job.
5. ✅ **"Repair" tools on the Games page** — /refresh_list, ❌ /spawn_panel,
   /unlock_host_panel, ❌ /forward_log, ❌ /run_ai_analysis. Nothing left to
   repair: games have no thread or panels any more.
6. ✅ **Draft controls on the Games page** — /start_draft and /empty_draft_pool
   (done together with /draft_pick: sign-ups, picks and host tools are on the
   map).
7. **Role admin on the Database page** — ✅ /verify, ✅ /make_vip and
   ✅ /make_host are done (Verification, host role & VIP panel), ✅ /scan is the
   Role check card, ✅ /dm is "Send a message" on the record. Small job.
8. **Hacked-game check on the Games page** — /hacker, for ended games, with
   the "who keeps showing up" comparison as a table. Medium job.
9. **Add-on host tools** — /draw_for, /gamble_for, /list_code. Lower priority.
10. ✅ **Mods / rules editor on the web** — /post_mods, /post_rules (done with
    game mode presets).
11. ✅ **Admin page** — covered by the server dashboard and the public Status
    page; /bot_status, /backfill_portfolios, /search_logs,
    /upload_bot_banner, /upload_bot_profile and /sync_commands are removed.

## Every command

### Remove now (already on the website)

| Command | Who | What it does | Where it already is |
| --- | --- | --- | --- |
| ✅ /give_host | Senior Hosts + management | Give a host Acclamations or Violations | Database page → host's record → Host standing |
| ✅ /take_host | Senior Hosts + management | Take them back (correction) | Same place |
| ✅ /report | Hosts **and partners** | Show a player's career, warnings, bans and recent games | Database page → player record. ⚠️ Partners aren't hosts and can't open the Database page — keep /report until they can, or give partners a read-only view |
| ✅ /report_host | Senior management | Show a host's hosted games, Acclamations and Violations | Database page → host's record. Safe to remove once seniors use it |

### Move to the Games page (per-game host tools)

| Command | Who | What it does | Web version |
| --- | --- | --- | --- |
| ✅ /lock | Host | Set who may reserve Majors / Minors / all (role level) | "Access" card on the game: Major / Minor level pickers |
| ✅ /unlock | Host | Lower that level again | Same card |
| ✅ /lockdown | Host | Stop all public reservations in the thread | On / off switch on the same card |
| ✅ /nation_lock | Host | Block one nation from being reserved | Nation picker on the same card (the Calendar already has one) |
| ✅ /nation_unlock | Host | Unblock it | Same |
| ✅ /clear | Host | Wipe every reservation from the game | "Clear roster" button (click twice) |
| ✅ /refresh_list | Host | Re-render or re-post the reservation list in the thread | "Repair → Refresh Discord list" |
| ✅ /remind | Host | Send the early (1 h before) or late ("we're starting, where are you?") reminder | "Message players → Reminder" (the Calendar's automatic reminder already covers the usual case) |
| ✅ /dm_participants | Host | DM everyone in the game | Games page → Message players (everyone or ticked players; the game's host or senior staff) |
| ✅ /late_join | Host | Add a late player: reservation + Gamer Pass + voice channel | "Late join" on the Games page / live map (calls the existing late-join routine) |
| ❌ /spawn_panel | Host | Re-post the crash, hot-join, emergency-unreserve, casino or host-config panel | Removed: hot-join is on the map + Games page, crash reports on /crash (the casino panels come back with the Casino integration) |
| ✅ /post_mods | Host | Open the game's mods post manager | Games page → Rules & mods (presets set them up front) |
| ✅ /post_rules | Host | Open the game's rules post manager | Same card |
| ✅ /unlock_host_panel | Host | Fix a Host Control Center whose buttons stayed grey | "Repair → Unlock Host Control Center" (ended games) |
| ❌ /forward_log | Host | Re-send the log and commend buttons to the public archive | Removed: the Games page's chat-log analysis posts to the archive |
| ❌ /run_ai_analysis | Host | Re-run the AI chat-log analysis | Removed: Games page → Chat log & AI analysis |
| ✅ /hacker | Host | Mark a recent game as hacked and compare players who were in other hacked games | "Report as hacked" on ended games, with the comparison as a table |
| ✅ /start_draft | Host | Start / resume a draft game's draft | "Draft" card on draft games (and the map's drawer) |
| ✅ /empty_draft_pool | Host | Clear leftover pool players and finish the draft | Same card: "Finish the draft" |
| ❌ /draw_for | Host | Draw (or redraw) a Fortunes of War card for a player | Removed; comes back with the Casino integration |
| ❌ /gamble_for | Host / Senior | Get a link to the web casino override panel for a player | Removed; comes back with the Casino integration |
| ❌ /list_code | Host | Rebuild the Fortunes submod sync messages | Removed; comes back with the Fortunes of War → Casino merge |

### Move to the Database page (member and role admin)

| Command | Who | What it does | Web version |
| --- | --- | --- | --- |
| ✅ /verify | Admin / staff | Give a member the HOI4 Verified role | Database → Verification & VIP (now RP Verified + Hist Verified) |
| ✅ /make_vip | GCA and above | Give VIP: Verified + both Trusted roles | Same panel (senior staff; Content Creator / PDX Staff / Highly Trusted) |
| ✅ /make_host | Admin / staff | Give a host tier | Same panel → Host role (Trial / Full / Senior / none; stays on this server) |
| ✅ /dm | Host | Send a member an anonymous message from the bot | Database → member's record → Send a message (anonymous or signed; logged and listed on the record) |
| ✅ /scan | Senior management | Re-check every member's stats-based roles | Database page → Role check: preview, then apply; also runs daily at 04:00 UTC |
| ❌ /search_logs | Host | Search the private bot log channel | Search box on the Database activity feed (web activity log first, then the old channel) |

### Small new Admin page (senior staff)

| Command | Who | What it does | Web version |
| --- | --- | --- | --- |
| ❌ /bot_status | Anyone | Show ping and uptime | Removed: the public Status page (`/status`) |
| ✅ /refresh_schedule | Host | Post and pin a fresh schedule board | Button (or make it automatic) |
| ❌ /backfill_portfolios | Admin / staff | Rebuild web portfolios and import old moderation logs | Removed (the one-time import is done) |
| ❌ /upload_bot_banner | Owner / designer | Change the bot's banner | Removed: Discord Developer Portal |
| ❌ /upload_bot_profile | Owner / designer | Change the bot's profile picture | Removed: Discord Developer Portal |
| ❌ /sync_commands | Senior management | Re-register the bot's commands in Discord | Removed: server dashboard → "Re-sync commands" (and sync on every start) |

### Stay in Discord

| Command | Who | Why it stays |
| --- | --- | --- |
| ✅ /reserve | Players | Players live in the reservation thread. They can already reserve on the website's map too — once most do, it could be retired |
| ✅ /unreserve | Players | Same (the map can unreserve too) |
| ✅ /reserve_filler | Players | Same |
| ✅ /reserve_coop | Players | Same |
| ❌ /draw | Players | Fortunes of War card draw in the thread (removed until the Casino integration) |
| ❌ /chaos | Players | Removed (October 2026) with the All Add-ons add-on. Tommy's Lootboxes and Star Wars were removed too. |
| ❌ /gamble | Players | Hands the player a casino web link (removed until the Casino integration) |
| ❌ /achievement | Players | Fun achievement roll (removed) |
| ✅ /info | Players | Opens the player's own profile on the website (`/profile`): the Database record layout, read-only, without staff names |
| /help | Players | Help menu for connection / game issues |
| ✅ /draft_pick | Draft captains | Moved anyway: captains pick on the website map's draft pool |
| ✅ /clean | Host | Deletes chat messages in the thread — it's about Discord chat itself |
| ✅ /schedule | Host | Just replies with the Calendar link — harmless; keep as a shortcut or remove |

## Things to know before moving more

- **Same pattern every time:** the page sends a request, the bot does the
  Discord part and reports back. The Games page already shows live progress,
  so new game tools can reuse it.
- **Decide who may do what.** Today /refresh_list, /remind and
  /dm_participants only check for a Host role — any host can
  use them on any game thread. The web versions should probably limit that to
  the game's own host and senior staff, like Start / End / Cancel and the new
  Reservation access card. (Done for all three: reminders and Message players
  are the game's host or senior staff.)
- **Partners:** /report is the only place partners can read a player's
  record. Decide whether partners get web access before removing it.
- **Players:** the website map already supports reserving and unreserving.
  Retiring the player commands is possible later, but it changes what players
  are used to and isn't needed to get hosts off Discord.
