# Casino integration rework

*Started 2026-11-08.* Brings the Casino and Fortunes of War add-ons back for
TommyKay's server. Replaces Phase 6 of `infrastructure-plan.md`.

## Niko's decisions (2026-11-08)

- **tkcasino.online stays its own site** (its own repo, `hoi4-casino`, on
  Vercel), linked to GameMaster.
- **Both add-ons:** Casino and Fortunes of War.
- **The Casino keeps its own casino style** (gold, roulette, slots).
- **TommyKay only** (`HOME_ONLY_ADDONS` stays).
- **Fortunes of War becomes a room on the Casino site.**
- **The Casino's Vercel project still points at the old database**, so it
  moves to the current (Aiven) one in step 2.

## Where things stand

The Casino site and the bot share one MySQL database, and that already is the
hand-off between them:

| Piece | Today |
| --- | --- |
| Way in | **Broken.** Players got a one-time link from the Casino panel in the game's Discord thread (`CasinoPanelView`): the bot wrote a `web_access_tokens` row (60 s, single use) and the Casino's `/api/access` checks and burns it. Games no longer have threads or panels, so nothing mints links. |
| Game identity | Works. The Casino looks games up by `thread_id`; thread-less games still have a key in that column. |
| Host settings | Mostly there. Creating a Casino game on the Calendar mints a `host_access_tokens` link for the Casino's `/host` page (re-roll budgets, locks, which rooms are on). |
| Results back | There. The Casino writes `game_reservations` and `reservation_sync_queue`; the bot's sync loop and receipt DM loop (`receipt_dm_queue`) pick them up. Not tried with thread-less games yet. |
| Fortunes of War | Gone. It was a Discord card game (`/draw`, card buttons in the thread). The plan since October: it moves to the Casino site. |
| Switched off | `_UNAVAILABLE_ADDONS = {"randomizer", "fortunes"}` (bot) makes the Calendar refuse them. |

## Plan

1. **The way in, from GameMaster.** On a Casino game, the map's Reserve
   button (and the announcement's "Reserve Here" link) go to
   `/casino/<game>` on GameMaster. Signed in with Discord, GameMaster runs the
   checks the panel ran (bans, IronLegion, the game's lock level and the
   player's tier), writes the `web_access_tokens` row the bot used to write,
   and sends the player to tkcasino.online with it. A player who already
   started or finished gets their resume or receipt link the same way. The
   token logic is ported from the bot's `_generate_web_access_token` and
   `CasinoPanelView._issue_link`.
2. **The Casino site follows.** Its texts point to GameMaster instead of the
   Discord panel ("open the game on GameMaster's map"); denied and expired
   screens link back to the map. Move it to the current (Aiven) database:
   its database connection gets TLS with Aiven's certificate (code), and Niko
   puts the same database settings the bot uses into the Casino's Vercel
   project (dashboard; never in git).
3. **Hosts.** The Games page gets "Casino settings", "Inspect" and
   "Override" links for Casino games (the host token links the Discord
   panel used to give).
4. **Results back.** Run a Casino game end to end on a test game: the pick
   lands on the map, in attendance and in the player's history; the receipt
   DM arrives. Fix what breaks for thread-less games.
5. **Fortunes of War on the Casino site.** A card-draw room in the Casino's
   style, ported from the bot's `/draw` (cards, effects, casual / competitive
   redraws), for Fortunes games. The card list comes over from the bot's
   data.
6. **Switch on.** Take both add-ons out of `_UNAVAILABLE_ADDONS` (bot) and the
   Calendar's "currently unavailable" labels; keep them TommyKay only and
   still blocked for draft games. If tkcasino.online is down, the map says so
   and the host can turn the game into a normal reservation game.
7. **Polish.** The front page and docs mention the Casino again; swap the
   Casino's music for the paid-Suno orchestral track.

**Done when:** a Casino game and a Fortunes game scheduled on GameMaster's
Calendar can be played through tkcasino.online from the map, and the results
show in GameMaster's roster, attendance and records.
