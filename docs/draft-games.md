# Draft games — sign-ups, captains and picks on the website

In a **draft game** players don't pick their own nation. They join a shared
**pool** as a Major, a Minor, a Major Co-op or a Filler, and two **team
captains** take turns placing them on their team's nations. The host can
place or move anyone at any time — with a button or by dragging them onto the
map.

Everything happens on the website now. The Discord commands **/start_draft**,
**/draft_pick** and **/empty_draft_pool** are gone (and /reserve, which used
to put players in the pool, was already removed). The bot still does the
Discord side: DMs (captains on their turn). Games no longer have a thread,
so the Draft Pool board and turn posts only appear in older games' threads.

## Setting up a draft game (Calendar)

**Calendar → set up a game → Extras tab → 🎯 Draft game**, switch it on:

- **Two teams** — a name each (e.g. "Allies" / "Axis") and a **captain**
  (search a member by name, @handle or Discord ID; the two captains must be
  different people).
- **Nation groups** — click a group to put it in a team (click it in the other
  team to move it). The groups are the loaded **preset's** groups (see
  [presets-page.md](presets-page.md)), or the mode's standard ones. A group in
  no team can't be picked by captains, but the host can still place players
  there. Not-playable preset nations are never offered.
- **Pick order** — 🪙 **Coin toss** (the winner opens with 3 picks, then the
  captains alternate one by one), or a fixed team first (then one by one).

Draft games can't use the Casino or Fortunes of War add-ons. The
Review tab shows the draft settings, and **Edit** on the Calendar loads them
back.

When the game is announced, the post says **🎯 DRAFT GAME MODE** with the
teams and captains, and "To **join the draft**, open the map and choose Major,
Minor, Major Co-op or Filler" with the game's map link.

## Joining (players)

The announcement link opens the map on that game (`/?game=<thread id>`) and a
**pop-up in the middle of the screen**:

1. Pick what you'd like to play:
   - **👑 Major** — one of the big powers,
   - **🏳️ Minor** — a smaller nation,
   - **🤝 Major Co-op** — share a Major with its main player,
   - **🧩 Filler** — fill in wherever needed (see *Fillers* below).
2. Optionally write a **note for the host** (up to 300 characters), e.g. "I'd
   like to be in the Allies team, a major, maybe France or the U.K."
3. **Join the draft.**

The player then shows in the **Draft pool** in the map's left drawer. They can
open the pop-up again (**Join the draft** button on the map or in the drawer)
to change their choice, edit the note, or **Leave** the pool. Logged-out
players get a log-in button that brings them back to the same game.

The bot refuses a join when: sign-ups are closed (the draft has started),
reservations are in lockdown, the player is banned from the mode, isn't
verified, already has a nation in this game, or the pool is full. The pool
holds as many players as there are seats: the playable nations, two co-op
seats per playable Major and 10 filler seats.

**Who sees the notes:** hosts and the two captains. Other players see the pool
(names and what they signed up as) but not the notes, and the Discord board
doesn't show notes either.

On a draft game the map shows "🎯 Draft game — the team captains place
players on nations" instead of the normal **Reserve** button, and reserving a
nation directly is refused.

## The draft (captains)

The host clicks **🚨 Start the draft** (on the map's drawer or the Games
page). Sign-ups close, the coin is tossed if it's on, and the captain whose
turn it is gets a DM with the map link (the thread gets a post too).

The captain on turn has two ways to pick, in the map's drawer:

- **Pick** next to a pool player opens the list of slots they may use,
  grouped and searchable (what the player asked for is highlighted):
  - **Majors / Minors** — free nations in their team's groups (locked nations
    and not-playable nations are left out),
  - **Co-ops** — a co-op on a Major their team already has (up to 2 per
    nation),
  - **Filler** — a filler seat.
- **Drag** the player (⠿) onto one of their team's nations — on the map or in
  the nation list below the pool. Dropping on a Major their team already has
  adds the player as its co-op; dropping on **🧩 Filler** (under the pool)
  makes them a filler.

After each pick the turn passes to the other team (a team with no free slots
left is skipped), the placed player gets a DM, and the board and thread are
updated. The draft **completes by itself** when the pool is empty or neither
team has room.

## Host tools

The game's host and senior staff can, at any time before the game starts:

- **Place** any pool player anywhere playable, without using a captain's turn:
  the drawer's **Place** button, or drag them onto any nation (map or list),
  onto a taken Major for a co-op, or onto **🧩 Filler**. No need to turn on
  the Host Tool for this. With the Host Tool on, its usual tools work too — a
  player still in the pool leaves it when the host puts them on a nation.
- A host who is also the captain on turn gets one button (**Pick**) and one
  list: their team's slots are marked ★ and use the pick; anything else is a
  host placement. Dragging works the same way.
- **Remove** a player from the pool (✕; they get a DM unless the Host Tool's
  **Notify players** switch is off, see [games-page.md](games-page.md#notify-players-host-tool)).
- **Change a captain** (Games page → Draft card → **Change**).
- **🏁 Finish the draft** (click twice): everyone left in the pool is removed
  and DMed, and the draft is marked complete.

A draft game **can't be started** until its draft is complete (finished, or
the pool emptied). The Games page's start checklist shows this.

A drop that can't work is refused on the spot with the reason, e.g. "Finland
is taken — co-ops are only for Majors". If two drops race for the same co-op
or filler seat, the bot uses the next free one.

## Fillers

A filler has no nation on the map, but is a full player in the game: they're
listed under **Fillers** in the nation list, count as reserved on the Games
page, and when the game starts they get the same DM as everyone else (**Yes**
gives the Gamer Pass and access to the channel with the game ID, password and
checksum) plus a voice channel under **📦 FILLER NATIONS**. Attendance counts
them like any other player.

## Games page — Draft card

On an announced draft game the Games page has a **Draft** card: the phase,
whose turn it is, the coin toss winner, both teams (captain, groups, how many
players are placed), the pool with notes and when each player joined,
**Start the draft**, **Finish the draft**, and **🗺️ Open the draft on the
map**.

## How it works

- The bot keeps the draft in the game's data (`game_data.draft`: phase
  `ENLISTING` → `DRAFTING` → `COMPLETE`, teams, current turn, picks left,
  pool, notes, history). The website only reads it.
- Every change is a request in `web_schedule_requests`: `draft_join`,
  `draft_leave`, `draft_pick` (captains) and `draft_control` (host: start,
  finish, remove, assign, captain). The bot checks everything again before
  applying it. Website API: `GET/POST /api/draft`.
- Calendar draft settings are saved on the schedule slot (`is_draft`,
  `draft_teams`, `draft_coin_flip`, `draft_first_picker`) and turned into
  the game's draft when it's announced.
- Discord IDs are stored as text, so captain IDs stay exact on the website.
- The bot and the map sometimes name a nation differently ("Germany" vs the
  Vanilla map's "German Reich"). Drops are translated to the bot's name, and
  the map and nation list find a reservation under either name.

**Preview mode** (`SCHEDULER_DEMO=1`): a sample draft game (Historical
(Vanilla), Allies vs Axis, 8 players in the pool with notes — Majors, Minors,
a Major Co-op and a Filler) on the map and the Games page. The demo host is the Allies captain, so you can try joining,
starting, picking and finishing. Scheduling a draft game on the Calendar
works too.

## Deploy

1. Restart the bot — it removes /start_draft, /draft_pick and
   /empty_draft_pool from Discord.
2. Redeploy the website.

No new tables. Draft games announced before the update keep working: their old
Allies / Axis captains become the two teams.
