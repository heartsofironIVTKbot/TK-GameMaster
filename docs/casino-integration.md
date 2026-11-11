# Casino integration rework

*Started 2026-11-08.* Brings the Casino and Fortunes of War add-ons back for
TommyKay's server.

> **2026-11-11: Fortunes of War was removed everywhere** (bot, GameMaster
> website, Casino site). The HOI4 mod developers randomize it inside their
> mods, so it needs neither Discord nor the web. Games scheduled with it
> become plain games (`_RETIRED_ADDONS` / `RETIRED_ADD_ONS`). The old
> `fortunes_draws` table is no longer created or used and can be dropped.
> Step 7 below is kept as history. Replaces Phase 6 of `infrastructure-plan.md`. The design
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

*Before the rework (2026-11-08).* The Casino and the bot share the database,
and that is the hand-off:

| Piece | Then |
| --- | --- |
| Way in | **Broken.** The old Discord panel (`CasinoPanelView`) wrote a one-time `web_access_tokens` row that the Casino's `/api/access` checks and burns; games have no threads or panels now. |
| Game identity | Works: the Casino looks games up by `thread_id`, and thread-less games still have a key there. |
| Host settings | In the Casino's `/host` page (host token from the Calendar); moves into GameMaster's setup. |
| Results back | The Casino writes `game_reservations` + `reservation_sync_queue`; the bot syncs them and DMs receipts (`receipt_dm_queue`). Untried with thread-less games. |
| Overrides | The Casino has them (`host_override_requests`, grant tokens with per-room budgets); the bot DMs the link. |
| Switched off | `_UNAVAILABLE_ADDONS = {"randomizer", "fortunes"}` in the bot. |

**Now (2026-11-09):** steps 1–7 are built and step 8's code is in; what's
left is the end-to-end test game and switching on (step 8).

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
6. ✅ **Emergency Unreserve** (2026-11-08). On a Casino game a player's own
   nation on the map has "Can't play? Emergency Unreserve" under the receipt
   link. It opens a red pop-up in the middle of the screen: no second
   chance (the nation and the Casino receipt go, no more rolls, only a host
   can add them back) and a reason is required (5–300 characters). The
   website queues it (`api/casino/[game]/unreserve`, request
   `casino_emergency_unreserve`); the bot
   (`_process_web_casino_emergency_unreserve`) frees the nation, purges the
   run, blocks them (`randomizer_unreserved`), keeps the reason
   (`randomizer_unreserve_reasons`) and DMs it to the game's host and
   co-hosts. Closed once the game starts. A host adding them back gets the
   warning with that reason (step 5). This replaces the old Discord
   Emergency Unreserve button. Plain unreserving stays off on Casino games.
7. ✅ **Fortunes of War** (2026-11-09; Niko picked: card stays with the
   player, script on the Games page, Redraw + Reset host tools, cards in the
   Casino's own style). Players reserve on the map as usual; their own
   nation then has **Draw your Fortunes card**, which goes through
   `/casino/<game>` (`fortunesEntry` in `casinoEntry.ts`: a nation, in the
   server, not banned, game not started) to the Casino's `/fortunes?k=<key>`
   room (`hoi4-casino`: `app/fortunes`, `components/fortunes/fortunes-room.tsx`,
   `app/api/fortunes`, the 15 cards in `lib/fortunes-deck.ts`, ported from the
   bot). 15 face-down cards on the felt; flip one, keep it or redraw (casual:
   majors 2, minors 1; competitive: majors 1, minors 0); with no redraws left
   it locks at once. Majors draw from all 15, minors from the 11 that aren't
   major-only. The deck stays on the server.
   - **Shared table `fortunes_draws`** (one row per player; the bot creates
     it). The bot's `fortunes_sync_loop` keeps nation, HOI4 tag, major and
     allowance in step with the reservations; the card stays with the player
     if they change nation (off the board = left out of the script).
     GameMaster sets the access key (a day, replaced on each visit); the
     Casino deals and records the card (`new → dealt → pending → locked`).
   - **Games page:** a Fortunes of War card on the Players tab (host, co-hosts,
     Host Management) with everyone's card and **Copy script**: the
     `on_startup` block for the submod (`lib/fortunesScript.ts`; a pending
     card counts; on a shared tag the main holder beats the co-op). It replaces
     the old pinned Discord message.
   - **Host Tool:** on a Fortunes game a picked-up player with a nation gets
     **Give a redraw** (one more; a locked card opens again) and **Reset
     card** (a fresh deck, old links stop working); the bot DMs them a link
     to `/casino/<game>`. Closed once the game starts.
   - `k=preview` shows the room without a database. Not yet tried against the
     real database (step 8). The old Discord `/draw` code is still in the bot,
     unused.
8. **Switch on and test** (2026-11-09; code done, test and switch-on to go).
   - **The switch:** `CASINO_ADDONS_LIVE` in the bot and in
     `web/src/lib/scheduleOptions.ts`, both `False` for now. Until it's on,
     Host Management can still schedule Casino and Fortunes games on
     TommyKay's server (the slot gets `addon_test`, so it's announced with
     the add-on); other hosts see "Currently unavailable". That's how the
     test game runs on the live site.
   - **Fallback (Niko's pick: message + host switch):** the Casino has
     `/api/health` (is it up and can it reach its database). GameMaster's
     `/casino/<game>` asks first (`lib/casinoStatus.ts`, cached 20 s) and,
     if it's down, says so instead of sending players to a dead page. The
     Games page's **Casino card** (Overview, before the start) shows whether
     tkcasino.online is up, and the game's host or Host Management can
     **Switch to normal reserving** (request `casino_fallback`, bot
     `_process_web_casino_fallback`): the game becomes a normal map game for
     good, nations already picked stay, and the announcement's "Roll at the
     Casino" link becomes the map's "Reserve Here".
   - **Docs:** README, games-page, command-migration-audit and
     games-without-threads say the Casino is back. The front page stays as
     it is (Niko: TommyKay-only, so docs only).
   - **Music:** the free-tier Suno tracks are gone; Niko's three tunes
     (`hoi4-casino` `public/audio/casino_tune_1..3.mp3`) play, one picked at
     random per visit, decoded only when played (`lib/audio.ts`), with a
     compact 1 / 2 / 3 switcher on phones.
   - **To go (Niko, then us):** set the Casino's Vercel database settings to
     the bot's database (with the certificate), restart the bot on Apollo,
     then a test Casino game and a test Fortunes game scheduled by Host
     Management: the way in, a roll and a card, the picks on the map, the
     receipts, the host tools, Emergency Unreserve, and the fallback switch.
     If it all works, set `CASINO_ADDONS_LIVE` to true on both sides.
