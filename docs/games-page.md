# Games page — start, end and cancel games from the web

`/games` on the website replaces Discord's **/game_start**, **/game_end** and
**/game_cancel**. **/announce_game** is gone too: every game announces itself
at the time picked on the Calendar ("Before the game", "Exact time" or
"Right away"). The bot still does all the Discord work (voice channels,
roles, DMs, posts); the page asks it through the same request queue as the
Calendar, Database and Attendance pages and shows its progress live.

Hosts only (same login and Host-role check as the Calendar). Linked from the
map's top bar (🎮 Games, hosts only), the Calendar header, every announced
game on the Calendar (**🎮 Game controls**) and the Database and Attendance
pages.

## Who can do what

| Action | Who |
| --- | --- |
| View any game | Any host |
| Start / End / Cancel | The game's host or senior staff (Senior Management / admins) — same rule as the old commands. (Before, any host could run /game_cancel.) |

## What hosts see

- **Left — games:** *Running* (live, starting, ending), *Announced* (by
  start time) and *Finished · last 2 days*. "Only my games" filters the
  list. A spinner shows on a game the bot is starting, ending or
  cancelling.
- **Right — the selected game:** mode, host, logging mode, scheduled time,
  a link to the game's Discord post (older games: its thread) and to its Attendance page, and the reserved
  players (with ✓ Yes / No reply once it has started).

## Start game (was /game_start)

Fill in the **in-game server ID**, **password** and **checksum** (prefilled
from the schedule) and pick the **attendance interval** (20 / 30 / 40 min).
A checklist shows what's ready: players reserved, draft finished (draft
games can't start before), how far the scheduled time is, and whether the
checksum differs from the scheduled one (it's updated if so). "What will
happen" lists exactly what the bot does:

1. Creates the voice channels and a Gamer Pass role.
2. Posts the server ID, password and checksum in the game-info channel (only
   Gamer Pass holders see it).
3. DMs every reserved player to confirm; confirming gives them the pass.
4. Starts attendance: 5 voice samples, present = seen in 2.
5. Locks reservations. Players can then ask to hot-join on the map and send
   crash logs on the website (see
   [games-without-threads.md](games-without-threads.md)).

The password is removed from the request record as soon as the bot has used
it.

## End game (was /game_end)

Click twice to confirm. Finalizes attendance (with one last voice scan) and
the public log, removes the voice channels and Gamer Pass, posts the rating
poll, DMs the players who were present, deletes the announcement / mods /
rules posts (and an older game's reservation thread), and DMs you a link to the game's
attendance for corrections. If an end was cut off (for example the bot
restarted), the game shows **Ending** and **Finish ending the game** picks
up where it stopped.

## Cancel game (was /game_cancel)

Give a reason (it's DMed to every reserved player) and click twice. No
penalties: this game's no-show warnings are reverted and spent commends
refunded; the voice channels, role, announcement and mods / rules posts are
removed (and an older game's reservation thread or Host Control Center);
the calendar shows it as
cancelled and the host log gets a note. A game that has already ended can't
be cancelled. (A game that was never announced is still removed from the
Calendar's day panel — "Cancel game…" there.)

## Live progress

After you click, the page shows the bot at work: *Waiting for the bot…*,
then each step as it happens (✓ done, spinner on the current one), then the
result — or the reason it was refused. You can leave and come back: the page
picks the progress up again. Other hosts see that the game is being
started / ended / cancelled.

Every start, end and cancel is also in the game's audit log on the
Attendance page (with who did it and the cancel reason).

## Reservation access (was /lock, /unlock, /lockdown, /nation_lock, /nation_unlock, /clear)

On announced and running games, a **Reservation access** card:

- **Majors / Minors:** who may reserve — VIP+, Trusted+, Verified+ or
  Everyone. Pick both, then **Save access levels**. (Once a game has started
  reservations are closed anyway; the setting applies if it's reopened.)
- **Lockdown:** one switch that stops players reserving — on the website map;
  your host tools (live map, late join)
  still work.
- **Locked nations:** nations nobody can reserve (⚫ on the list). Type a
  nation (suggestions come from the bot's own list for the mode) and press
  **Lock**; × unlocks it. Locking a nation someone already holds doesn't
  remove them — the result says who has it.
- **Clear all reservations** (announced games only, click twice): removes
  everyone from their nations. On a started game it's refused because it
  would break attendance — remove players one by one or cancel instead.

Only the game's host or senior staff can change these. (The old commands let
any host change any game.)

## Late join (was /late_join)

On a running game, a **Late join** card: search the member (name, @handle or
Discord ID), pick **Nation** (suggestions show free nations) or **Filler**,
and click **Add**. The bot puts them on the slot, gives them the Gamer Pass
and a voice channel, marks them as a late join on the Attendance page and
DMs them. A taken nation is refused (remove that player first). If something
needs a second look (a Dishonored restriction, a recent Major, the same
Minor twice), the bot asks first and **Add anyway** confirms.

The live map's host tools do the same: dropping a player onto a nation of a
game that has already started is now a full late join too.

### Notify players (Host Tool)

The Host Tool panel on the map has a **🔔 Notify players** switch, **on by
default**. While it's on, every change a host makes there sends the players
involved a DM: what happened, which game (mode and start time), which host
did it, and an **Open the map** button.

| Host Tool action | Who gets a DM |
| --- | --- |
| Add to a free nation, co-op or filler | the player ("📋 You were added to a game") |
| Move to another slot | the player ("🔄 You were moved", from → to) |
| Swap with someone | both players ("🔁 Your slot was swapped") |
| Replace someone | the new player, and the old one ("🚫 You were removed from a game") |
| Remove from the game | the player ("🚫 You were removed from a game") |
| Late join (game already running) | the player ("🎮 Added to a running game") |
| Draft game: place a pool player / remove from the pool | the player |

Switched **off**, the changes still happen but nobody is DMed (the TFR
briefing DM is skipped too); the remove / swap prompts say so. A host moving
themselves is never DMed. The switch is remembered in that host's browser.
On the map the draft drawer's **Place** and ✕ follow the switch too. The
Games page's Late join card and hot-join approvals always notify. The bot skips the DMs
when the request carries `"notify": false` (`_roster_notify_on` /
`_roster_notify_player` in `bot.py.py`), and writes `notified=` to the audit log.

## Reminders (was /remind)

On announced and running games, a **Reminders** card:

- **Before the start — Send early reminder:** DMs every reserved player the
  start time, their nation, the checksum, what a no-show costs (2 warnings
  for a Major, 1 otherwise; Casual logging only counts Majors) and a link to unreserve
  on the website. It counts as the automatic one-hour reminder, so players
  don't get both. The card says whether the automatic reminder is on, when
  it goes out, or that one was already sent.
- **After the start — Send late reminder:** DMs every reserved player who
  isn't in a game voice channel with the Gamer Pass yet (older games also
  get the list posted in their thread).

The card also shows the last reminder (when, by whom, how many were DMed).
Only the game's host or senior staff can send reminders.

## Message players (was /dm_participants)

Every game (announced, running, ended or cancelled) has a **Message
players** card: write a message (up to 2,000 characters) and the bot DMs it
to the game's players as "📢 Message from the host of your <mode> game",
with a link to the game on the website (older games: also their thread).

- **Who gets it:** everyone signed up — reserved nations, co-ops, fillers
  and the draft pool. **Choose players…** lets you untick people (each shows
  what they are in the game).
- **What they'll see** is previewed before sending; Send asks for a second
  click.
- The bot sends in the background and the card counts along ("DMing
  players… 5 of 12"). The result says who couldn't be reached (DMs closed or
  left the server).
- Every message goes to the **host log** channel and the card lists the last
  five (when, by whom, how many got it).

Only the game's host or senior staff can send (the old command let any host
use it in any game thread).

## Rules & mods (was /post_mods, /post_rules)

On announced and running games, a **Rules & mods** card shows what the
game's posts in the rules and mods channels list. **Edit** opens the list:
change names and links, reorder, add (up to 5 mods / 5 rulesets) or remove,
then **Save & update the … post**. The bot edits the post in place (or posts
it, if the game had none). Only the game's host or senior staff can change
them.

A game starts with the lists from its preset or the calendar (see
[presets-page.md](presets-page.md)), else the mode's standard ones. Casino
games always get the casino rules added.

**Preset games** show a 🧩 line under the title: the preset's name, its
groups and how many nations aren't playable (hover for the list). Those
nations don't appear in the Locked nations list — they're locked for good
and can't be unlocked.

## Players reserve on the website

/reserve, /unreserve, /reserve_filler and /reserve_coop are gone. Players
reserve and unreserve on the website map. The announcement post now says
"To **Reserve**, open the map and pick your nation" with a link that opens
the map on that game (`/?game=<game id>`); reminder DMs link there too.
There's no reservation thread under the post any more — see
[games-without-threads.md](games-without-threads.md).
Casino and Fortunes of War are currently unavailable (they come back with
the Casino website, TommyKay only); games scheduled with them before are
announced as normal map games.

**Draft games:** players don't reserve a nation. The map link opens a pop-up
to join the draft pool as a Major, a Minor, a Major Co-op or a Filler (with a
note for the host), and the team captains place them. See
[draft-games.md](draft-games.md).

## Draft (was /start_draft, /draft_pick, /empty_draft_pool)

On announced draft games, a **Draft** card: the pool (with players' notes),
both teams and captains (**Change** to swap a captain), **Start the draft**
(closes sign-ups, tosses the coin), **Finish the draft** (click twice; clears
whoever is left in the pool) and a link to the draft on the map, where
captains pick and the host can place anyone — with a button or by dragging
pool players onto nations. Only the game's host or senior
staff can use the buttons. Details in [draft-games.md](draft-games.md).

## In Discord now

These commands no longer exist (they disappear from Discord when the bot
restarts and syncs commands):

- Games: /game_start, /game_end, /game_cancel, /announce_game, /remind,
  /dm_participants (the Message players card above).
- Messages: /dm (Database page → a member's record → Send a message).
- Reservations: /reserve, /unreserve, /reserve_filler, /reserve_coop,
  /late_join, /clear, /refresh_list.
- Access: /lock, /unlock, /lockdown, /nation_lock, /nation_unlock.
- Host Control Center: /unlock_host_panel — and the bot no longer creates
  Host Control Center threads at all.
- Records and schedule: /give_host, /take_host, /report, /report_host,
  /schedule, /refresh_schedule.
- Clean-up: /clean, and /hacker together with its whole hacked-game system.
- Rules and mods posts: /post_mods, /post_rules (the Rules & mods card above).
- Draft: /start_draft, /draft_pick, /empty_draft_pool (the Draft card above
  and the map).

What changed because of that:

- **No Host Control Center.** Chat-log upload and **Run AI Analysis** lived
  there, so they don't work for new games until they're rebuilt on the
  website. The hourly "/save" reminders that were posted there are gone too.
  Ending a game now DMs the host a link to the game's attendance instead.
- **Hot-join requests** come from the map now; running games have a
  **Hot-join requests** card with Approve / Decline (the host gets a DM for
  each). See [games-without-threads.md](games-without-threads.md).
- Messages that used to say "run /game_start", "use /reserve" or
  "/unreserve in the thread" now point to the website.

## Scheduling change

The Calendar's setup no longer has **"Manually (/announce_game)"**. Every
game needs an announcement time (or "Right away"). Games scheduled the old
way (no announcement time) stay on the board without announcing — open them
with **Edit** and pick a time; the form suggests one.

## Setup

1. Restart the bot (it removes the old commands from Discord and publishes
   each mode's nation list for the nation pickers).
2. Redeploy the website.
3. Optional: `DISCORD_GUILD_ID` for the website if the Discord thread links
   should point at a different server than the bot's `GUILD_ID`.

Nothing else is needed — no new tables.

## Chat log & AI analysis

Played games (live or ended) have a **Chat log & AI analysis** card: upload
the HOI4 chat log (.txt), run the AI analysis, then click **Give** for the
rewards you agree with — nothing is given automatically. The grading is
strict (in-character words + creativity; see
[ai-log-analysis.md](ai-log-analysis.md)). Players see their result on their
profile (`/info`).
