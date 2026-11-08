# Casino integration rework

*Started 2026-11-08.* Brings the Casino and Fortunes of War add-ons back for
TommyKay's server. Replaces Phase 6 of `infrastructure-plan.md`. The design
is Niko's (2026-11-08); the earlier "hosts work on the Casino site" plan was
dropped in its favour.

## Decisions

- **tkcasino.online stays its own site** (repo `hoi4-casino`, on Vercel) in
  its own casino style. Everything a host does happens in GameMaster.
- **Both add-ons:** Casino and Fortunes of War. Fortunes becomes a room on
  the Casino site.
- **TommyKay only:** the home server, guild 341585283881631744
  (`HOME_ONLY_ADDONS` stays).
- **The way in goes through GameMaster** (option A): the announcement's link
  opens `hoi4gamemaster.online/casino/<game>`, which signs the player in with
  Discord (if needed) and sends them on to tkcasino.online with a one-time
  link. No second login on the Casino.
- **Co-hosts are for Casino games only.** Starting, ending and cancelling a
  game stay with the game's host and Host Management (already so on the
  website and in the bot).
- The Casino's Vercel project still points at the old database; it moves to
  the current (Aiven) one.

## How it works

**1. Setting up.** In GameMaster's game setup (Calendar), ticking the Casino
add-on shows every Casino setting under everything else: which rooms are on
(nation, ideology, path, doctrine, build, achievements), re-rolls per room for
majors and minors (build: land and navy/air separately), who may roll majors
and minors, when nations unlock (automated unlock steps), the achievements'
tiers, and the game's **co-hosts**. They're saved in the format the Casino
already reads (`host_settings`, see the Casino's `lib/gate.ts`) and can be
changed later. This replaces the Casino's own Host panel.

**2. Announcing.** The announcement's link goes to the Casino via GameMaster
(see Decisions). GameMaster runs the checks the old Discord panel ran (bans,
IronLegion, the player's tier against the game's current lock level) before
handing out the link. A player who already started or finished gets their
resume or receipt link the same way.

**3. Rolling.** Nation selection and every room happen on tkcasino.online, as
built. Each pick appears on GameMaster's map at once, without a reload. The
receipt page gets a **View reservations** button that opens the game's map.

**4. Host tools on Casino games** (the game's host, its co-hosts, Host
Management). Never a swap or a move: that would break the path, build and the
rest that belong to one nation. Instead:
- **Add** a player to a free nation. They get the game's default re-rolls for
  the rooms that are on (e.g. ideology and build on, path off; majors 2,
  minors 1) and a DM: "You've been added to <nation>; here's your link to
  roll."
- **Give another roll** (an override) without a nation, when the nation
  randomizer is on: search the player, run the override; they get a DM with
  a fresh link.
- **Extra rolls** for one room or for all of them (the Casino's existing
  override grants, as /gamble_for's host override panel did).
- **Remove** a player: the nation is freed, their receipt is deleted, and
  they get a DM that the host removed them.
- **Receipts:** clicking a player, on the reservation board or their round
  avatar on the map, shows a **View receipt** link to the host and co-hosts.

**5. Unreserving (Emergency Unreserve).** On a Casino game, a player's
Unreserve opens a red warning in the middle of the screen: if they unreserve,
they won't get a second chance. It asks for a reason (required), which the
host sees. The host can still bring them back with Add, after a warning that
this player unreserved (and why).

**6. Fortunes of War** becomes a card room on the Casino site in the
Casino's style, ported from the bot's old `/draw` (cards, effects, casual /
competitive redraws).

## Where things stand

The Casino and the bot share the database, and that is the hand-off:

| Piece | Today |
| --- | --- |
| Way in | **Broken.** The old Discord panel (`CasinoPanelView`) wrote a one-time `web_access_tokens` row that the Casino's `/api/access` checks and burns; games have no threads or panels now. |
| Game identity | Works: the Casino looks games up by `thread_id`, and thread-less games still have a key there. |
| Host settings | In the Casino's `/host` page (host token from the Calendar); moves into GameMaster's setup. |
| Results back | The Casino writes `game_reservations` + `reservation_sync_queue`; the bot syncs them and DMs receipts (`receipt_dm_queue`). Untried with thread-less games. |
| Overrides | The Casino has them (`host_override_requests`, grant tokens with per-room budgets); the bot DMs the link. |
| Switched off | `_UNAVAILABLE_ADDONS = {"randomizer", "fortunes"}` in the bot. |

## Steps

1. ✅ **Casino settings in game setup**, including co-hosts, saved as
   `host_settings` (2026-11-08). Extras → Casino rooms / Access step-down /
   Co-hosts (`web/src/components/schedule/setup/CasinoSection.tsx`, format in
   `web/src/lib/casinoSettings.ts`); "who can reserve" on the Players tab is
   the first tier. The bot checks it again (`_sanitize_casino_settings`),
   keeps it on the slot and writes `host_settings`; it no longer DMs the
   Casino Host Panel link. Until step 8 only the local dev server can pick
   the add-ons, and only on the home server.
2. **The way in:** `/casino/<game>` on GameMaster and the announcement link.
3. **The Casino site:** View reservations button, texts that point to
   GameMaster, denied/expired screens that link back, TLS for Aiven. Niko puts
   the bot's database settings into the Casino's Vercel project (dashboard,
   never in git).
4. **Picks on the map at once**, and **View receipt** on players for the host
   and co-hosts.
5. **Host tools:** add, give a roll, extra rolls, remove, with the DMs; no
   swaps or moves on Casino games.
6. **Emergency Unreserve:** the red warning with a reason; the host's Add
   warning.
7. **Fortunes of War** room on the Casino site.
8. **Switch on and test:** take both add-ons out of `_UNAVAILABLE_ADDONS`,
   play a Casino and a Fortunes game end to end, and a fallback if the Casino
   is down. Then the front page and docs mention the Casino again, and the
   Casino's music is swapped for the paid-Suno orchestral track.
