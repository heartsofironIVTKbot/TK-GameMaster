# Presets page — game mode presets

`/presets` on the website. A **preset** is one game mode's saved setup that a
host loads when scheduling a game:

- **Nation groups** — keep the mode's standard groups (Europe, Asia… or the
  Axis / Allies factions), or make your own: rename, reorder, turn groups
  off, add new groups (e.g. "Axis", "Pacific") with optional sub-headings
  ("Majors", "Minors"), and move nations between them.
- **Nation locks** — groups of nations that start locked, all game or until
  1–72 hours before the start.
- **Who can reserve** — Majors and Minors access levels (VIP+ … Everyone).
- **Rules and mods** — the lists posted in the rules and mods channels (up
  to 4 rulesets and 5 mods), or the mode's standard lists.

Hosts only (same login and Host-role check as the Calendar). Linked from the
Calendar, Games, Attendance and Database pages.

## Each server keeps its own presets

Presets belong to the Discord server they were made on. A server only ever
lists, loads and edits its own presets — they don't mix between servers
the way maps and game modes do.

**Sharing:** switch on **Share in the public library** and every server can
see the preset under **🌐 Public library** and **Copy to our server**. A copy
is a new preset that belongs to the server (and host) that copied it; the
original never changes. Unshared presets never show to other servers.

## Who can do what

| Action | Who |
| --- | --- |
| Make a preset, copy one, load one on the Calendar | Any host |
| Change or delete a preset | Its creator, or staff (admins + Senior Management) |
| View someone else's preset | Any host (read-only, with **Duplicate to edit**) |

## Making a preset

**＋ New preset** opens the maker: the mode's map fills the screen with a
panel on the right.

1. **Basics** — mode, name, description, sharing. (A saved preset keeps its
   mode; duplicate it for another mode.)
2. **Groups** — **Mode's standard groups** or **Custom groups**. Custom starts
   from the standard groups. Click a group to edit it, then click nations on
   the map to put them in it (red = the group you're editing, blue = other
   playable groups, grey = not playable) or search by name. Groups can be
   renamed, reordered (↑ ↓), turned off, deleted and split into up to 4
   sub-groups.
3. **Locks** — who can reserve, and nation lock groups (map clicks lock /
   unlock nations here).
4. **Rules & mods** — the mode's standard lists, or a custom list (name +
   https link each).
5. **Save** — a summary and anything left to fix. Saving keeps you in the
   maker; **Schedule a game with this preset →** opens the Calendar with it
   loaded.

The map and the bot sometimes name a nation differently ("Spanish Republic"
vs "Spain"); the maker matches them the same way the reservation map does
and always saves the bot's names.

### Not playable

A nation that isn't in a **turned-on** group — its group is off, or it was
never put in any group — is **not playable** in games that use the preset:

- it's left off the Discord reservation list and the website map's roster,
- it's locked for good: the website refuses to reserve it, and the Games
  page can't unlock it (the bot refuses too, and timed lock releases skip
  it).

The Groups tab lists them under **🚫 Not playable**.

## Using a preset

- **Calendar → Game tab → Preset:** pick the mode, then **Load** one of the
  server's presets for it. Loading copies its nation locks, access levels,
  groups, rules and mods into the form — everything stays editable for that
  game. **Remove** goes back to the mode's standard groups, rules and mods.
  The Nations tab shows the preset's groups and how many nations aren't
  playable; the Extras tab has the rules and mods lists (also editable for
  games without a preset).
- From the Presets page: **🗓️ Use in a game** opens the Calendar with it
  loaded (`/schedule/new?preset=<id>`).
- A game keeps the settings it was scheduled with — changing or deleting the
  preset later doesn't touch games already on the calendar. The preset card
  shows how many games used it.

When the game is announced, the bot posts its own rules and mods lists and,
for custom groups, writes the reservation list with the preset's groups. The
Games page shows the preset under the game's title and has a **Rules &
mods** card to change the lists afterwards (see [games-page.md](games-page.md)).

## How it works

- Presets live in the `game_presets` MySQL table (`guild_id` = the server;
  `shared` = in the public library; `data` = JSON). The website reads and
  writes it directly and creates it if it's missing; the bot also creates it
  at startup (`bot/schema.sql` has the definition).
- API: `GET/POST /api/presets`, `GET /api/presets/library`,
  `GET /api/presets/defaults`, `GET/PUT/DELETE /api/presets/<id>`,
  `POST /api/presets/<id>/copy`.
- The bot publishes each mode's standard groups, nation names, rulesets and
  mods (and the server's name) to `bot_config` at startup; the maker starts
  from those.
- Scheduling sends the preset's settings with the game (`preset_id`,
  `preset_name`, `nation_layout`, `rules`, `mods`); the bot checks the nation
  names and limits again. At the announcement it stores them on the game
  (`nation_layout`, `layout_disabled_nations`, `managed_mods`,
  `managed_rulesets`) and adds the not-playable nations to `locked_regions`.
- Rules & mods changes from the Games page go through the bot's request
  queue (`game_resources`), which edits the posts.

**Preview mode** (`SCHEDULER_DEMO=1`): sample presets for this server, a
"public library" with presets from two other sample servers (and one private
one that must never show), a sample preset game on the Games page and a
"Europe Only (preset)" lobby on the map.

## Deploy

1. Restart the bot — it creates `game_presets`, publishes the standard
   groups / rules / mods, and removes `/post_mods` and `/post_rules` from
   Discord.
2. Redeploy the website.
3. Optional: `DISCORD_GUILD_ID` (this server's id, default the bot's
   `GUILD_ID`) and `DISCORD_GUILD_NAME` (shown in the library if the bot
   hasn't published the server name yet).
