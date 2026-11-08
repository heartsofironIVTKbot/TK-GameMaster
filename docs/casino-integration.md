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
2. ✅ **The way in:** `/casino/<game>` on GameMaster and the announcement link
   (2026-11-08). `web/src/lib/casinoEntry.ts` runs the old panel's checks
   (Casino game on the home server, still open, not Emergency-Unreserved,
   in the server, not banned, IronLegion when required) and writes the
   `web_access_tokens` row (tier and flags from `web_member_directory` and
   the server's role ids); a player who already holds a nation gets the
   24-hour resume or receipt link instead. `api/casino/[game]` answers, the
   `/casino/[game]` page signs them in and sends them on (a preview card on
   the dev demo). The announcement says "Roll at the Casino" with that link;
   the map shows "Roll at the Casino" / "Open my Casino receipt" on Casino
   games, and `/api/reserve` refuses picking and unreserving there.
   `CASINO_URL` (default https://tkcasino.online) can point it elsewhere.
   Not yet tried against the real database (step 4's end-to-end test).
3. ✅ **The Casino site** (2026-11-08, `hoi4-casino` commit `01711aa`):
   receipts (live and `/receipt/<id>`) have a **View reservations** button to
   the game's map; the expired-link screen sends players back to GameMaster
   for a fresh link (straight to the game); the old "/gamble" texts are gone;
   the database connection checks the provider's certificate when one is
   set (`lib/db.ts`), and no longer logs any of the password's characters.
   **Niko:** in the Casino's Vercel project, set the database settings to the
   same values the bot uses (incl. the certificate), never in git. The
   Casino's host Inspect / Override pages still mention Discord commands;
   step 5 replaces them.
4. ✅ **Picks on the map at once**, and **View receipt** on players for the host
   and co-hosts (2026-11-08). The Casino bumps `games.reservations_rev` after
   a spin (`hoi4-casino` `app/api/spin/nation`), so GameMaster's live map
   shows it within a second. The map's player cards (board and map avatars)
   have **View receipt** for the game's host, its co-hosts and Host
   Management (`api/casino/[game]/receipt/[user]`): a finished run opens
   the full receipt (a receipt-only link), one still rolling the static
   receipt so far. The bot now stores `add_on` and `co_hosts` (as strings)
   on announced games; the website spots Casino games by `randomizer_only`
   or `add_on` (`isCasinoGame`), as the bot's records only had the former.
   The first real Casino game runs in step 8, once the Casino is on Aiven.
5. ✅ **Host tools** on Casino games (2026-11-08), for the game's host, its
   co-hosts and Host Management only. On the map's Host Tool:
   - **Add:** drop a player on a free nation. It's reserved for them and
     they're DM'd a 24-hour Casino link to roll the rest, with the game's
     re-rolls for a major or a minor. A taken nation, or a player who
     already has one, is refused: no swaps or moves, and no fillers.
   - **Give a roll:** a player without a nation (when the nation wheel is
     on) gets a link for a whole run; the wheel picks the nation.
   - **Extra rolls:** for a player with a nation, 1–10 rolls each for the
     chosen rooms (or All), as a link that continues their run.
   - **Remove:** frees the nation, deletes their run (the receipt goes) and
     DMs them; they can't roll again until a host adds them back.
   - Adding or rolling for someone Emergency-Unreserved or removed asks the
     host first (with the Emergency Unreserve reason); "Add anyway" lifts it.
   The links are the Casino's own grant links (`host_override_requests`,
   `is_grant` tokens). Bot: `_web_casino_add`, `_web_casino_remove`,
   `_process_web_casino_grant` (requests `casino_roll`, `casino_extra`);
   tests in `GameMaster Bot/tests/casino_tools.py`. Not yet tried against
   the real Casino (step 8).
6. **Emergency Unreserve:** the red warning with a reason. (The host's Add
   warning is done in step 5.)
7. **Fortunes of War** room on the Casino site.
8. **Switch on and test:** take both add-ons out of `_UNAVAILABLE_ADDONS`,
   play a Casino and a Fortunes game end to end, and a fallback if the Casino
   is down. Then the front page and docs mention the Casino again, and the
   Casino's music is swapped for the paid-Suno orchestral track.
