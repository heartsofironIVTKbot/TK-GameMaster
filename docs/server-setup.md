# Adding GameMaster to a server, and setting it up on the website

GameMaster started as TommyKay's own bot: its roles, channels and rules
were written straight into `bot.py.py`. This is the plan (and, for Stages 1
and 2, the manual) for turning it into a bot **any Discord server can add**,
set up entirely on the website.

## Decisions (October 2026)

| Question | Decision |
| --- | --- |
| Player records across servers | **Separate per server, with alerts.** Each server keeps its own commends, warnings and bans. When someone game-banned on another server joins, that server's staff get a notice and decide. |
| Who can add the bot | **Anyone, instantly.** |
| Who can set it up | The **server owner** and **Discord admins** (Administrator permission). The owner can also let the roles mapped as **Host Management** edit settings. |
| Extra features for other servers | **Hearts of Valor & Merit** (on/off). **IronLegion Steam verification** later. Casino (the randomizer) and Fortunes of War stay TommyKay-only, and so does AI chat-log analysis. |
| Game modes | **Built-in modes only**: Roleplay (R56), Millennium Dawn, Novum Vexillum, Kaiserreich FFA, The Fire Rises, Historical Vanilla, TFB, Hearts of Oak, Horstorical, BFFU 2. Each server turns modes on or off and sets that mode's channels, ping role, rules and mod links. |
| Rule numbers | **Adjustable per server**, starting from TommyKay's numbers. |
| Bot permissions | **Only what it needs** (no Administrator). Setup runs a health check. |
| Rollout | **In stages** (below). |

## Stages

1. **Invite + setup + settings (done).** Invite page, "Your servers"
   page, a step-by-step setup wizard and a settings page with change history.
   TommyKay itself now runs on these settings, so its roles, channels and
   numbers can be changed on the website instead of in the code.
2. **Every feature works per server (done).** The bot runs calendar, games,
   map, attendance, database, host branches, VIP and Valor for every server
   that finished setup. Records are split by server, the website has a server
   switcher, and cross-server ban alerts are on. See
   [Stage 2: how servers are kept apart](#stage-2-how-servers-are-kept-apart).
3. **Owner dashboard and polish (done, except IronLegion).** A dashboard for
   each set-up server, live health checks with fix-it buttons, and a public
   status page. See [Stage 3](#stage-3-dashboard-health-and-status).
   IronLegion integration comes later.

## How adding the bot works (Stage 1)

1. **`/invite`** (public page) explains what GameMaster does and which
   permissions it asks for, with an **Add to Discord** button.
2. Discord asks the owner to pick a server and approve the permissions, then
   returns to the website already logged in. The bot is now in the server.
3. The bot records the server (`guild_settings`, status *needs setup*),
   mirrors its roles and channels for the website (`web_guild_snapshot`) and
   sends the owner a welcome DM with the setup link. If the owner's DMs are
   closed, the welcome goes to the server's system channel.
4. **`/servers`** lists every server where you're the owner or an admin, or
   where you were given settings access. Each one shows whether the bot is in
   it, whether setup is finished, and **Add bot** / **Set up** / **Settings**
   buttons.
5. **The setup wizard** (`/servers?guild=<id>`) walks through the steps
   below, shown as a numbered strip across the top. Progress is saved as you
   go: close the tab and pick up where you left off. **Finish setup** is only
   enabled once every required field is filled and the health check has no
   blocking problems.
6. After setup, the same page becomes **Settings**: a grid of square tiles
   (Dashboard, Health, every step, Overview, History). A tile with problems
   shows a red (errors) or amber (warnings) number. Each page has an
   **← All settings** button back to the tiles. **Health** also shows the
   30-day uptime bars from the public status page.

## The setup steps (every setting)

Each role or channel field offers a **picker** of the server's real roles or
channels: colours, categories, and a warning when the bot can't manage the
role or can't post in the channel. A **Create for me** button lets the bot
make the role or channel with a sensible name.

### 1. Welcome & bot check
- The bot is in the server, and when it last reported in.
- **Permissions**: every permission GameMaster needs and why. Anything
  missing is listed, with a **Fix permissions** link that re-invites the bot
  with the right set.
- **Role position**: the bot's highest role must be above every role it
  gives out (host ranks, Verified, Trusted, game bans, VIP, Valor,
  Dishonored). Any role that's too high is flagged.

### 2. Basics
- **Community name**, shown on the website and in bot messages.
- **Host branches**: RP (Roleplay games), HIST (Historical games), or both.
  At least one must be on. Turning a branch off also turns off its game modes
  and hides its roles everywhere.

### 3. Staff & access
- **Host Management roles** (was "Senior Staff"): the rank above Senior
  hosts that oversees everything — day locks, managing other hosts' games,
  VIP, verification, host ranks, the role check, rating hosts in both
  branches, host applications and host reports. It can be a moderation role,
  a team lead role or a dedicated Host Management role. Server admins always
  count as Host Management. Host Management also manages the voice channels
  GameMaster makes for each game (this replaced the old "Game channel
  managers" setting) and can delete GameMaster's messages by hand:
  right-click a message → **Apps** → **Delete GameMaster message** (only the
  bot's own messages; logged in the audit log).
- The old **Extra host-page roles** setting is gone: only host ranks and Host
  Management open the host pages.
- **Who can change settings**: owner and admins always. Optionally Host
  Management too.

### 4. Host ranks (one block per branch that's on)
- **Full host** role: always on.
- **Assistant (Trialist)** and **Senior host**: each has an on/off switch.
  - Assistant off: new hosts (and approved host applications) start at Full.
  - Senior off: promotions stop at Full, and only Host Management rates
    hosts (gives or takes Acclamations and Violations) in that branch.
  - A switched-off rank has no role, isn't shown on the Database page and
    can't be given.
- **Promotion numbers**: Acclamations to reach Full (2) and Senior (4), and
  Violations that strip the rank (3).
- **Acclamations and Violations work like commends and warnings**: giving
  one never removes the other kind. Acclamations promote; Violations strip
  the rank at the limit. Only Host Management can take either back; the rank
  then follows what's left (fewer Acclamations demote, fewer Violations than
  the limit give the earned rank back).

### 5. Player roles
- Per branch: **Verified**, **Trusted** and **Game ban** roles (required),
  plus **Dishonored** (shown while that branch has an active restriction)
  and a **Notification ping** role (pinged for that branch's game
  announcements; a game mode can use its own). Both are optional, and one
  role can be used for both branches.
- **VIP** role, and whether Content Creator and PDX Staff VIPs from other
  servers are accepted automatically. Highly Trusted VIPs always need
  approval.
- **Commends for Trusted** (5) and **warnings for an automatic game ban** (3).
- **Crash report ping role**: pinged when a crash report arrives (optional).

### 6. Channels
- **Audit log** (required, was "Host log"): every host and staff action,
  DMs, game messages, every slash command and every role change. The
  separate audit log setting was merged into it.
- **Staff notices**: VIP notices, streak alerts and cross-server ban
  alerts.
- **Scheduling panel channel**: a host channel. GameMaster posts and pins a
  panel there with buttons to the Calendar, Games and Attendance pages.
  **Post / re-post the panel** (also on Health) removes the old one and pins a
  new one. The old weekly schedule board is gone; the Calendar replaces it.
- **Host chat-logs forum**: when a game ends, GameMaster opens one thread
  for it, named like `20.05.2026 · The Fire Rises · #1234` (date, game mode,
  game number), with a **Manage this game** link to its Games page panel.
  Commends, warnings, Dishonored notes, the AI log analysis and the game's
  feedback archive given for that game go in that thread. A plain text
  channel works too (threads are made under a message).
- **Crash reports**: where crash reports are delivered.
- **Game lobby voice channels** (required, several allowed): where players
  wait before and between games. **People in these channels are never
  counted as present** in attendance snapshots, so every waiting-room channel
  must be listed.
- **Game voice channels**, per branch: the category they're created under,
  and the category they must stay above.

### 7. Tickets
- **Ticket Support roles** (verification tickets only) and **Developer
  roles** (bug reports and suggestions).
- **Ticket panel channel**, **ticket category**, **ticket transcripts** and
  **private ticket transcripts** (host applications and host reports).
- **Remind and close inactive tickets**: a ping after 24 hours without
  messages, closed as unresolved after 48.
- Details in [tickets.md](tickets.md).

### 7b. Game modes
Only modes of branches that are on are shown. A new server starts with every
mode **off**; it switches on the ones it runs (at least one). Modes that are
off are hidden on the calendar and refused by the bot. **Same channels as…**
copies another mode's channels and ping role. Per mode:
- **On / off**.
- **Announcement channel** (game announcements; they link to the map), **game info**,
  **rules**, **mods** and **public log** channels.
- **Ping role** for announcements.
- **Standard rules and mod links** (name + link), used when a game has no
  preset.

### 8. Features
- **Hearts of Valor & Merit**: on/off, the Hearts of Valor role, Merit
  needed (25), attended games needed (50). Off: nobody is given the title,
  but Merit is still counted.
- **Daily role check** (04:00 UTC): on/off.
- **Alerts for players banned on other servers**: on/off (on by default).
  When someone joins who is game-banned on another GameMaster server, staff
  get a notice in Staff notices (or the host log) naming the server, the
  game type and since when, with a link to the player's record. Nothing
  changes automatically.
- **Hosting success**: average rating that counts as a successful hosting
  (3.0 / 5).
- **Casino & add-ons**: TommyKay only. Its channels (casino panel,
  randomizer / receipt log, Fortunes log) are set here on TommyKay.
- *Coming later:* IronLegion Steam verification.

### 9. Review & finish
A summary of every step with **Edit** links, the health check, and
**Finish setup**.

## What's stored where

| Table | What | Written by |
| --- | --- | --- |
| `guild_settings` | One row per server: status, the settings (JSON), version, who changed it last | Website (settings), bot (status, roles it creates) |
| `guild_settings_history` | Every settings change: who, when, which fields changed | Website, bot |
| `web_guild_snapshot` | The server's roles, channels, the bot's permissions and role position, Host Management members | Bot (on join, on role/channel changes, every few minutes) |
| `web_schedule_requests` | "Create this role / channel" from the wizard (`server_setup` action) | Website → bot |

Saving uses a **version number**: if two people edit at once, the second
save is refused with "someone else changed these settings, reload".

## TommyKay on the new settings

On first start the bot copies TommyKay's current roles, channels, modes and
numbers into `guild_settings`, so nothing changes. From then on the bot
reads them from there and picks up website changes within about 30 seconds.
It posts what changed to the host log.

Saving rules:
- **During setup**, every step saves as a draft, even with problems.
  **Finish setup** needs zero ⛔ problems; ⚠️ warnings don't block it.
- **After setup**, a save that would *add* a problem is refused (for example,
  clearing the host log). Problems that already existed (a role someone moved
  above the bot in Discord) don't block unrelated saves.
- If someone else saved in between, the save is refused with a "reload"
  message, so nobody overwrites anyone.
- The home server can't be edited until the bot has copied its current
  settings (first restart after this update).

Not moved to settings yet:
- IronLegion's Authenticated role and verify channel.
- The custom emojis and the bot designer's user id.
- The host log webhook (`HOST_LOG_WEBHOOK_URL`). It is only used while the
  host log is still its original channel; after a change the bot posts to
  the new channel directly.
- The website's previews (Database page "what will happen") still use the
  default numbers (5 commends, 3 warnings, 2 / 4 Acclamations). The bot
  always uses the server's numbers.

## Adding a game mode later (Novum Vexillum and BFFU 2, October 2026)

A built-in mode added to the bot after a server finished setup:
- **TommyKay** gets it switched on at the next bot start, with the channels
  written in the bot (Novum Vexillum uses the Roleplay channels like
  Millennium Dawn; BFFU 2 the Historical ones like Their Finest Bruh). The
  settings history shows "Added new game modes: …".
- **Other servers** see it switched off under Game modes, ready to turn on.

Novum Vexillum uses the modern-day map and Millennium Dawn's reservation
list (same regions and names). BFFU 2 uses its own map and Their Finest
Bruh's factions (it's built on TFB's country files).

## Stage 2: how servers are kept apart

**Which servers are live.** The bot works on TommyKay always, and on any
other server once its setup is finished and the bot is in it. Until then the
bot stays quiet there (only the setup wizard's "Create for me" works). A
server that finishes setup gets GameMaster's slash commands right away,
except the TommyKay-only `/list_code`. (Re-syncing
commands is the dashboard's "Re-sync commands" button; the bot also syncs on
every start.)

**Player records.** TommyKay's records stay in the `users` table, exactly as
before. Every other server's records (commends, warnings, bans, Merit,
Dishonored, Verified, host ranks) are in `guild_users`, one row per player
per server. A warning on one server never shows on another. The in-game
nickname is the one thing shared: a player sets it once.

**Everything else** has a `guild_id` (server) column: games, the schedule,
day locks, host stats, player summaries, the moderation log, the attendance
log, the host roster, the member list, server roles and website requests.
Rows that existed before Stage 2 belong to TommyKay. The bot's other saved
values (schedule message, role-check results, the Database page's nation
lists, role IDs for the website) are kept per server too.

**Discord buttons in DMs** (feedback, Valor's Trusted pick, VIP) remember
which server they came from, so a click is handled by the right server.
Crash reports and hot-join requests go through the website, which sends them
to the game's own server.

**Server switcher (website).** The host pages (Calendar, Games, Attendance,
Presets, Database) show one server at a time. When you host on more than one
server, a switcher appears next to the page title; it only lists servers
where you're on the host roster. Switching reloads the page on the new
server. The map shows the games of the server you picked, or, when opened
from a game link the bot posted, that game's server. Map host tools and
draft games always act on the game's own server (if you host there).
Presets are per server; shared presets in the library still work across
servers.

**Ban alerts.** When someone joins a live server, the bot checks whether
they're game-banned on any other GameMaster server (TommyKay included) and,
if so, posts one notice for staff. Servers can turn this off in Features.

## Stage 3: dashboard, health and status

**Dashboard.** A set-up server's page now opens on **Dashboard** (same people
as the settings: owner, admins, and Host Management if allowed):
- **At a glance:** is GameMaster online, how many problems, when it last read
  the server's roles and channels, how many slash commands it has.
- **Problems to fix:** every live problem and every settings problem, each
  with a **Fix** button (a one-click repair, the setup step that fixes it, or
  the re-invite link for missing permissions).
- **Last 30 days:** games hosted, different players, active hosts, attendance
  (reserved players who showed up), busiest modes.
- **Upcoming games** (next on the calendar) and **recently finished** ones.
- **Staff activity:** top hosts, recent moderation, recent settings changes.

**Health tab** = live checks on top of the existing permission / role checks:
GameMaster online, roles and channels up to date (read in the last 30 min),
slash commands synced, website requests not stuck or failing.

**Fix-it buttons** (Dashboard and Health): **Re-check now** (re-read roles,
channels, permissions), **Re-sync commands**, **Test the audit log** (posts a
test message), **Re-post scheduling panel**, **Re-send welcome**, **Fix permissions** (re-invite with every
permission; settings stay). The bot does each one and the page shows the result.

**Public status page** (`/status`, anyone): online or offline, how long it's
been running, how many communities it serves, uptime per day for 30 days and
recent incidents (outages and restarts). No server names.

How it works: the bot writes a heartbeat every minute (`bot_heartbeat`) and a
minute of uptime per UTC day (`bot_uptime_days`). On start it compares with
the last heartbeat: more than 3 minutes of silence is recorded as an outage,
otherwise as a restart (`bot_incidents`). Each command sync is recorded per
server (`guild_bot_status`). The bot creates these tables itself.

## Deploy (Stage 3)

Restart the bot (it creates the status tables and starts the heartbeat), then
redeploy the website. Until the bot runs this update, the status page says
"Status not available yet" and the dashboard shows "No status yet".

## Deploy (Stage 2)

Order matters: **restart the bot first, then redeploy the website.**

1. Restart the bot. On start it adds the `guild_id` column to the tables
   above (existing rows become TommyKay's), creates `guild_users`, and
   re-publishes the website's role IDs and nation lists per server. This
   takes a few seconds on a large database.
2. Redeploy the website. Its queries need the new `guild_id` columns, so a
   website deployed before the bot restart shows "database unavailable"
   errors until the bot has restarted.
3. Nothing changes for TommyKay's hosts and players: the switcher only
   appears for people who host on two or more servers.

## Deploy (Stage 1)

1. Discord Developer Portal → your application → **OAuth2**: add the
   website's callback (the same `DISCORD_REDIRECT_URI`) if it isn't there.
   Turn **Public Bot** on so anyone can add it.
2. Restart the bot. It creates the new tables, copies TommyKay's settings,
   and starts listening for servers joining and leaving.
3. Redeploy the website. New pages: `/invite` and `/servers`.
