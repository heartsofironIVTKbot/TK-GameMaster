# Presets page — game mode presets

`/presets` on the website. A **preset** is one game mode's saved setup that a
host loads when scheduling a game:

- **Nation groups** — the **whole map** (every nation on the mode's map is
  playable, grouped the mode's usual way), or your own groups: rename,
  reorder, turn groups off, add new groups (e.g. "Axis", "Pacific") with
  optional sub-headings ("Majors", "Minors"), and move nations between them.
- **Nation locks** — groups of nations that start locked, all game or until
  1–72 hours before the start.
- **Who can reserve** — Majors and Minors access levels (VIP+ … Everyone).
- **Rules and mods** — the lists posted in the rules and mods channels (up
  to 4 rulesets and 5 mods), or the mode's usual lists.

Hosts only (same login and Host-role check as the Calendar). Linked from the
Calendar, Games, Attendance and Database pages. Two guided tours explain it:
**Presets** (the page) and **Preset editor**.

## No preset = the whole map

A game with no preset lists **every nation on its map**, on every server.
TommyKay's curated reservation lists (the bot's `NATION_CATEGORIES`,
`KAISERREICH_REGIONS`, `MILLENNIUM_DAWN_REGIONS`, `TFR_DATA`) are now
GameMaster's own presets instead (below). The bot knows the whole map through
`MAP_NATION_LAYOUTS` in `bot.py.py`, written by
`scripts/export_map_nations.py` from the website's maps: run it again after a
map or a curated list changes (`--check` says whether anything is out of
date). It names each map nation the way the bot does when the bot lists it,
and otherwise by the map's own name (what a website reservation stores).

Older games with a Discord reservation thread keep the curated lists they
were played with.

## GameMaster's presets

One per mode, made from the bot's curated lists
(`web/src/data/officialPresets.json`, written by the same script). They
belong to the home server (TommyKay), are written into the table when the
website starts, and never change from the website.

| Mode | Preset | Who sees it |
| --- | --- | --- |
| Roleplay | Road to 56 (7 Majors, 50 Minors) | TommyKay only |
| Kaiserreich | FFA (Entente, Third International, Reichspakt, Moscow Accord) | TommyKay only |
| Millennium Dawn, Novum Vexillum | Main nations | Public library |
| The Fire Rises | Five factions | Public library |
| Vanilla, TFB, Hearts of Oak, Horstorical, BFFU 2 | Main factions | Public library |

On TommyKay each one is its mode's **default** until staff pick another, so
TommyKay's games look the same as before. The mode "Kaiserreich FFA" is now
shown as **Kaiserreich** (its key stays `Kaiserreich (FFA)`).

## Each server keeps its own presets

Presets belong to the Discord server they were made on. A server only ever
lists, loads and edits its own presets — they don't mix between servers
the way maps and game modes do.

**Sharing:** switch on **Share in the public library** and every server can
see the preset under **Public library** and **Copy to our server**. A copy is
a new preset that belongs to the server (and host) that copied it; the
original never changes. Unshared presets never show to other servers.

**Editing someone else's preset:** anyone can open any preset they can see
and change it, but saving a GameMaster preset, another server's, or another
host's always saves **your own copy** ("Save as our copy"). Nobody can change
anyone else's preset.

**Updates:** a copy remembers its original. When the original changes, the
copy's card shows **The original changed — See changes**: a window lists what
updating would change (nations added to or removed from each group, groups,
who can reserve, locks, rules, mods) and warns if you changed your copy too.
Then **Keep mine** (stops asking until the next change), **Update** (takes
the original's settings, keeps your name and sharing) or **Update as a new
preset** (keeps yours and saves the new version beside it).

**Default:** the star on a card (staff only) makes it the mode's default: a
new game on the Calendar starts from it. Without a default, a new game starts
from the whole map.

## Who can do what

| Action | Who |
| --- | --- |
| Make a preset, copy one, load one on the Calendar | Any host |
| Change or delete a preset | Its creator, or staff (admins + Senior Management) |
| Edit anyone else's or GameMaster's preset | Any host (saves your own copy) |
| Pick the default preset of a mode | Staff |

## Making a preset

**New preset** opens the editor: a panel on the left with five steps, the
mode's map beside it.

1. **Basics** — mode, name, description, sharing. (A saved preset keeps its
   mode; duplicate it for another mode.)
2. **Groups** — **Whole map** or **Our own groups**. Our own groups start
   from the whole map's groups. Click a group to edit it, then click nations
   on the map to put them in it, or search by name. The strip along the top
   of the map says what each colour means: purple = the group you're
   editing, blue = the other playable groups. **Show not playable in red**
   marks the rest red; switched off, they're greyed out the way players see
   them. Groups can be
   renamed, reordered, turned off, deleted and split into up to 4 sub-groups.
   Nations show their flags from the mode's own files (Kaiserreich's flags in
   Kaiserreich); Kaiserreich's four factions have their own marks (Entente
   blue shield, Third International red star, Reichspakt grey crown, Moscow
   Accord gold snowflake).
3. **Locks** — who can reserve, and nation lock groups (map clicks lock /
   unlock nations here).
4. **Rules and mods** — the mode's usual lists, or our own (name + https link
   each).
5. **Save** — a summary and anything left to fix. A red dot on a step means
   something there needs fixing.

The map and the bot sometimes name a nation differently ("Spanish Republic"
vs "Spain"); the editor matches the same name first, then the looser
matching the reservation map uses, and always saves the bot's names.

### Not playable

A nation that isn't in a **turned-on** group — its group is off, or it was
never put in any group — is **not playable** in games that use the preset:

- it's left off the website map's roster and greyed out on the map,
- it's locked for good: the website refuses to reserve it (it also checks the
  map nation's tag, so a lock on "Australia" covers the map's "Commonwealth
  of Australia"), and the Games page can't unlock it (the bot refuses too,
  and timed lock releases skip it).

The Groups step lists them under **Not playable**.

## Using a preset

- **Calendar → Game tab → Preset:** a new game starts from the mode's
  default preset, if it has one. **Load** another of the server's presets
  for the mode, or **Remove** to go back to the whole map and the usual rules
  and mods. Loading copies its nation locks, access levels, groups, rules and
  mods into the form — everything stays editable for that game.
- From the Presets page: **Use in a game** opens the Calendar with it loaded
  (`/schedule/new?preset=<id>`).
- A game keeps the settings it was scheduled with — changing or deleting the
  preset later doesn't touch games already on the calendar. The preset card
  shows how many games used it.

When the game is announced, the bot posts its own rules and mods lists. The
Games page shows the preset under the game's title and has a **Rules & mods**
card to change the lists afterwards (see [games-page.md](games-page.md)).

## How it works

- Presets live in the `game_presets` MySQL table (`guild_id` = the server;
  `shared` = in the public library; `official` = GameMaster's; `copied_from`,
  `copied_version`, `copied_hash` = a copy's original and when it last
  matched; `data` = JSON). Defaults are in `game_preset_defaults`. The
  website reads and writes both directly, creates them (and the new columns)
  if they're missing, and writes GameMaster's presets; the bot also creates
  `game_presets` at startup (`GameMaster Bot/schema.sql` has both).
- API: `GET/POST /api/presets` (POST takes `copied_from` for a copy),
  `GET /api/presets/library`, `GET /api/presets/defaults` (each mode's whole
  map, nations, rules and mods), `GET/PUT/DELETE /api/presets/<id>`,
  `POST /api/presets/<id>/copy`, `POST /api/presets/<id>/default`,
  `GET/POST /api/presets/<id>/update`.
- The bot publishes each mode's standard groups (now the whole map), nation
  names, rulesets and mods (and the server's name) to `bot_config` at
  startup; the editor starts from those.
- Scheduling sends the preset's settings with the game (`preset_id`,
  `preset_name`, `nation_layout`, `rules`, `mods`); the bot checks the nation
  names and limits again and works out the not-playable nations from the
  whole map. At the announcement it stores them on the game (`nation_layout`,
  `layout_disabled_nations`, `managed_mods`, `managed_rulesets`) and adds the
  not-playable nations to `locked_regions`.
- Rules & mods changes from the Games page go through the bot's request
  queue (`game_resources`), which edits the posts.

**Known gaps:** a few curated nations aren't drawn on their map, so they
can't be clicked or reserved on the website: Kaiserreich's American civil
war sides (United States Federal Government, Combined Syndicates of America,
American Union State, Pacific States of America) and the Bharatiya Commune,
TFB / Hearts of Oak's Vichy France, Horstorical's Croatia and Slovakia, and
TFR's four American sides. The script lists them (`--verbose`).

**Preview mode** (`SCHEDULER_DEMO=1`): GameMaster's presets as the home
server has them (TFB's changed a week ago), a copy of it that's out of date,
sample presets for this server, a "public library" with presets from two
other sample servers (and one private one that must never show), a sample
preset game on the Games page and a "Europe Only (preset)" lobby on the map.

## Deploy

1. Restart the bot — it creates `game_presets`, publishes the whole-map
   groups / rules / mods, and removes `/post_mods` and `/post_rules` from
   Discord.
2. Redeploy the website; the first Presets request adds the new columns, the
   defaults table and GameMaster's presets.
3. Optional: `DISCORD_GUILD_ID` (this server's id, default the bot's
   `GUILD_ID`; GameMaster's presets belong to it) and `DISCORD_GUILD_NAME`
   (shown in the library if the bot hasn't published the server name yet).
