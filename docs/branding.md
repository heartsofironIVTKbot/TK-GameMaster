# Branding — where GameMaster's look lives

GameMaster's identity: black and field green (IronLegion is black and red),
a "cut plate" shape language, one line-icon set, and condensed titles. Every
place the look is decided is in one spot. Samples of the direction are in
`docs/design/` (open the .html files in a browser).

## Website

**Colours:** `web/src/app/globals.css`, the `@theme static` block:

| Scale | What it is | Today |
| --- | --- | --- |
| `brand-50` … `brand-950` | The identity colour: buttons, highlights, the tour's lit ring | Field green (hue 146), GameMaster's answer to IronLegion's red |
| `ink-50` … `ink-950` | Backgrounds, panels, borders and text | Near-black with a faint green cast (hue 152) |
| `night` | The page itself, behind the sky | Darker than ink-950, so panels stand out |

Components only use `brand-*` and `ink-*` (`bg-brand-400`, `text-ink-300`…),
never `amber-*` or `slate-*`, and the hand-written colours in `globals.css`
use `var(--color-brand-…)` / `var(--color-ink-…)`. Change the two scales and
the whole site follows.

Status colours keep their meaning everywhere and aren't part of the brand:
emerald = good (re-tinted mint-jade in `globals.css` so it never matches the brand green), rose = danger, sky = info, violet / fuchsia = roleplay.

**Fonts:** `web/src/app/layout.tsx` loads them, `globals.css` names them.
Public Sans (`font-sans`) for everything you read; Big Shoulders
(`font-display`, through `gm-title`) for page titles; Big Shoulders Stencil
(`font-stencil`) for the logo only.

**Shapes: cut plate.** Two opposite corners clipped, like a stencilled
equipment plate (`docs/design/shape-options.html`, option C). The pieces are
in `globals.css` (`@layer components`): `gm-btn` (+ `-primary`, `-secondary`,
`-quiet`, `-danger`), `gm-plate` (panel), `gm-field` (input box), `gm-tag`
(status chip), `gm-cut` (the bare shape), `gm-title`, `gm-nav-on` (the page
you're on in a row of links). Controls cut 8px, panels 14px; people
(avatars) stay round. `clip-path` clips anything that sticks out of a plate,
so popovers inside one must be portalled.

**Icons:** `lucide-react`, line icons in one colour: grey, green on the page
you're on. No emoji in the interface. Each page's icon is `PAGE_ICONS` in
`web/src/components/site/SiteMenu.tsx`; the header picks it from `page`.

**The map** (`docs/design/map.html` is the approved mock-up): teal-black sea
(`OCEAN` in `MapViewer.tsx`), solid black panels, taken nations show the
player's name in a red tag, and the reserve button glows with three halos
breathing out in turn (`gm-reserve` in `globals.css`; it keeps running with
reduced motion on). Nation panel number boxes use muted game tints (brown
civilian, green military / army, blue naval, red air).

**Map panels** (`docs/design/map-panels.html`): the Draft section sits on top
of the reservations list; its phase uses the status colours (sign-ups green,
drafting blue, complete grey). Draft choices are line icons (`DRAFT_ICONS` in
`PreferenceBadge.tsx`: crown, flag, handshake, puzzle). The Host Tool is a
solid plate; drop zones are hatched plates (blue filler, red remove); a
player being placed or a warning to accept is yellow. Steam status says
Authenticated / Not authenticated (IronLegion's word). Help sits on layer
1200: above the map panels, under every window.

**Games page** (`docs/design/games.html`): the game list rows and the phase
tag use the calendar's status colours (`PHASE` in `components/games/labels.tsx`;
starting / on-going / ending are blue). A game's cards sit in tabs: Overview,
Players, Messages, Nations and rules, Chat log. Card headings are `CardTitle`
(a green line icon and the display title). Plain inputs use `gm-input`.

**Database page** (`docs/design/database.html`): an action's colour says
what it means: mint good (commends, Merit), yellow a warning, red a sanction
(ban, Dishonored), grey neutral (`ActionIcon` in
`components/database/actionIcons.tsx`). A record's actions sit in tabs:
Moderate, Roles, Host (hosts only), Message. The portfolio view
(`PlayerPortfolioModal.tsx`) uses mode icons and is shared with the map and
the profile page.

**Attendance page** (`docs/design/attendance.html`): voice states and results
have one colour each: mint in voice / counted, yellow lobby / at risk, orange
no Gamer Pass, red offline / absent, blue excused, grey not in the server
(`components/attendance/labels.ts`). Per-sample marks stay round dots; on
phones the roster is player cards instead of the wide table.

**Presets** (`docs/design/presets.html`): presets are cards (mode icon,
name, tags, facts with line icons). Tags: Default is green with a star,
GameMaster is grey with a green check, the rest grey. A copy whose original
changed gets a yellow edge and a yellow "See changes" strip; the change list
uses mint for added, red for removed, grey for changed. Mode chips scroll
sideways on phones instead of squeezing. The editor's panel sits on the left
with five line-icon steps; nations show their own mod's flags, and
Kaiserreich's factions have marks (Entente blue shield, Third International
red star, Reichspakt grey crown, Moscow Accord gold snowflake; `GroupMark` in
`components/presets/parts.tsx`). Saving a preset you can't change says "Save
as our copy" under a blue note.

**Game setup** (`docs/design/setup.html`): the map with a 420px panel on
the right, five line-icon steps (Game, Announce, Players, Extras, Review;
Players holds who can reserve and the nation locks), sections in
`SectionCard` (`components/schedule/ui.tsx`, a green line icon per section).
A compact timeline strip above the footer shows when the game is announced
and starts; Schedule is in the footer on every step. The map uses the preset
editor's border glows: purple for the lock group being edited, blue for the
others, red on not-playable nations when "Show not playable" is on.

**Server setup** (`docs/design/servers.html`): a 272px list on the left
holds the ten setup steps (during setup) or Dashboard, Health, the
sections and History (once set up); each entry has its line icon from
`STEP_ICON` (`components/servers/shared.tsx`), a green check when done, a
red number for problems, yellow for warnings, a lock until reached. On
phones the list folds behind "All steps" / "All settings". The save bar
sticks to the bottom and leaves room on the right for the Help button.

**Small pages** (`docs/design/small-pages.html`): the log-in page is
`LoginScreen` (`components/schedule/HostGate.tsx`): what the page does on
the left (three line-icon features each page passes in), the Discord card
on the right; errors and "hosts only" use `GateMessage`, a card in the
middle. Profile has the Database record's layout. Tickets are rows. The
roleplay archive and its games are the one purple place (`gm-plate-rp`,
violet chips and bars). Status opens with a big plate tinted by the
state. The audit log keeps its filters on top, with a line icon and
colour per category (`CATEGORY_ICON`). The crash report has three
numbered steps.

**The archive** (`docs/design/archive.html`, `docs/game-archive.md`): one
public list of every game with tabs (All games, Roleplay, Historical); the
roleplay archive is its Roleplay tab. Presence and marks have one icon and
colour each everywhere (`components/archive/parts.tsx`): played mint check,
no-show red cross, told the host sky door, joined late amber key; commend
mint star, Merit yellow medal, warning amber triangle, Dishonored orange
scale, game ban red gavel. Ratings are yellow stars. A game's page copies
the map's reservation board: count boxes, small region headers, then flag,
nation, the player's red tag, presence and marks.

**The calendars** (`docs/design/calendar.html`): a game's colour is its
status and nothing else: yellow scheduled, green announced, blue on-going,
grey ended, red cancelled (`GameState` in `web/src/lib/scheduleOptions.ts`,
`.gm-game` / `[data-game-state]` in `globals.css`). An add-on blends purple
into the status colour. The mode is an icon: masks for Roleplay, a tank for
Historical (`ModeIcon.tsx`; Lucide has no tank). Yours is the bottom-right
corner filled green. A day with two or more games splits one card's space
into slanted slices (`gm-split` / `gm-slice`; three at most, then "+N"), so
busy days never make a row taller. Other tags (announce time, locked nations) stay grey so
they don't read as a status. Mix colours with `color-mix(in oklab, …)`: in
oklch, mixing into the near-black ink swings the hue (purple turns blue, red
turns olive). The **Shared Calendar** (`/schedule/shared`,
`web/src/lib/sharedCalendar.ts`) shows one week by hour for every server
that turns on "Share our calendar with other servers" (server setup,
Features); only those servers' hosts see it, and it never shows hosts,
players or nations.

**The front page** (`/`, `web/src/app/page.tsx`; the live map moved to
`/map`, and old `/?game=…` links redirect there in `next.config.ts`;
pieces in `web/src/components/landing/front/`). Headline "Master your
game." (the logo above finishes the pun). Then, in order:

1. **Trailer** (`SceneTrailer.tsx`): a 32-second phonk trailer, 16:9 on
   the site and 9:16 for TikTok / Shorts / Reels (Niko, 2026-11-07: action,
   TikTok style, informative, epic wording but only true claims). Music:
   "Master Your Game", Niko's Suno track (made on a paid plan; the WAV stays
   out of git). Plays muted on a loop while on screen; "Play with sound"
   restarts it with the music. Made in `web/src/components/trailer/`
   (`script.ts` is the edit, shot by shot, on the track's beat map from
   `web/scripts/trailer/analyze.mjs`); preview it with the music at
   `/lab/trailer` (dev only), render with `web/scripts/trailer/render.mjs`
   (headless Edge frame by frame + ffmpeg).
2. **The live map** playing itself (a cursor reserves the United Kingdom,
   then the lobby fills region by region; it starts when it's on screen,
   pauses off screen, loops, and always fills its frame).
3. **"The rest of the job, handled."** (`FeatureShow.tsx`): a slideshow,
   IronLegion's "What it keeps out" pattern (Niko, 2026-11-07, over the
   six rows): wide slides gliding sideways with the neighbours dimmed,
   labelled feature tabs on top whose line fills as the slide plays,
   previous / pause / next, swipe and arrow keys. Eight slides: Calendar,
   Player records, Presets, Archive, Live attendance, Tickets, Audit log,
   Server settings ("Each server is in charge"). Each plays the real page:
   the site's own screenshots in its sample-data preview, a cursor
   clicking through (a click cuts, a new page fades), no zoom. A scroll or
   typing is a quick run of small in-between screens, like a recording:
   moving whole screenshots doubled the sticky headers and panels, and a
   screen still decoding showed as a blink, so the one before always stays
   under the one on. A few short steps per slide, listed beside the screen;
   the one playing opens with its caption and a progress line. Tab rows
   (game setup, preset editor, server settings) run as one quick step.
   The calendar's Announce step ends in a Discord channel
   (`/lab/discord`, dev only) with the bot's real post, and Tickets opens
   in Discord (the panel, ticket #0114's channel, the closing DM with the
   website link) before the website's saved copy. The archive's running
   game fills with 4, 10, 18, then 25 commends, Merit and warnings; its AI
   write-up is tagged "TommyKay only" (a paid extra, off elsewhere).
   Calendar runs Schedule (month, shared calendar, a day) → Set up →
   Announce; the archive's AI step shows the chat log uploaded on the
   Games page and the analysis run; attendance samples arrive by
   themselves under a spinning clock (no button presses: the tour takes
   them behind the scenes and wipes the "taken early" marks). Every
   screen gets 0.4 s and every step 1 s on top of its shot time, for
   reading. The slides' steps and captions live in
   `web/scripts/tour-assets/slides.mjs`.
   It never pauses on hover; the screen opens full size on click. The
   screens come from `web/scripts/capture-tours.mjs` (restart the dev
   server first); re-run it when those pages change.
4. **"Built for the community, not for profit."** (`ScenePromise.tsx`): no
   monetization (AI analysis named as the one paid extra), ad-free, your
   data stays yours. IronLegion's promise section, in GameMaster's look.
5. A feature ticker and Add to Discord.

Glitches are binary only: rows of flickering 0s and 1s over a strip, or
letters corrupting into 0/1 (`fx.tsx`); nothing shakes, which read as lag.
Niko turned down a radar roll call, a paper dossier and a teleprinter
report (2026-11-06). The globe and these effects are the one exception
to the rule below:
the vanilla HOI4 map on a dark globe with glowing green coasts and borders
and no land fill (Niko, 2026-11-07: the dotted fill was too gritty), spinning,
with missiles, interceptions and explosions (Niko, 2026-11-06: vanilla,
"Dramatic", high glow, always moving even with reduce motion on). It loads
three.js only on that page and steps down to no glow on slow devices. Its
map data is `web/public/landing/globe-*.json`, built from the site's maps
by `web/scripts/build-globe-data.py` (HOI4's flat layout pinned to real
capitals). North of 66 N it's the real Arctic instead (Natural Earth, in
`web/scripts/data/arctic.json` from `build-arctic-data.py`): HOI4's maps
stop at about 73.7 N and squeezed land up to a hard ring round the pole
(Niko, 2026-11-07). The fit is also pinned along North America's
north-west coast and round Alaska, which HOI4 squeezes north; without
those pins the 66 N cut lost Alaska's middle and left sea before Yukon. Capitals are steady red glowing dots; borders follow
the globe's curve so they never break up; blasts and their shockwave rings
stay whole right up to the globe's edge. It never runs where the browser
draws WebGL in software (hardware acceleration off): there it froze the
page, so the hero keeps its quiet glow instead. Try other looks at `/lab/globe` (dev only).

**Green means "do this" or "you are here"** (main button, current page).
No gradient washes, glows, glass blur or decorative motion, with two
exceptions: the front page's globe, and the night sky behind every page.

**The background** (`web/src/components/site/SkyBackground.tsx`, drawn by
`skyEngine.ts`): a night sky on one canvas behind every page, Niko's pick
(2026-11-07): stars on near-black (about one in five brand green, 2026-11-08), a very faint brand-green haze in two
corners, and a shooting star about every 40 seconds. About half the stars
twinkle: they fade almost out, then flare brighter and a little bigger with
a halo, so the sky reads as alive (a gentler twinkle was nearly invisible).
Pages leave their own background clear (the body is `night`, darker than
ink-950, in light and dark system modes alike) and panels stay solid, so it
only shows in the margins and gaps. The front page's globe renders on a
see-through canvas over it (no stars of its own), and the hero fades out
at its foot, so the sky runs unbroken from the top. It doesn't run on the full-screen map
or the two map editors. Like the globe it keeps moving with reduced motion
on; it pauses while the tab is hidden. The other layers (drift, satellites,
grid, aurora) can be compared at `/lab/background` (dev only).

**Logo:** `BrandMark` in `SiteMenu.tsx`, "GM" in stencil on a green cut
plate, a stand-in until the real logo.

## The shared menu and header

- `web/src/components/site/SiteHeader.tsx`: the header on every page. A page
  passes its `page`, name and its own controls; the most used pages show in the
  header on wide screens.
- `web/src/components/site/SiteMenu.tsx`: **☰ Menu**, every page grouped (Play,
  Host, Servers), shown to who can use it. The map's top bar uses the same
  menu. Add a page here once and it's everywhere.
- The two full-screen map editors (game setup, preset editor) keep their own
  compact bar, with the menu button in it.

## Discord bot

`class EmbedColor` near the top of `GameMaster Bot/bot.py.py`: every embed
colour, by meaning (`BRAND`, `SUCCESS`, `DANGER`, `WARNING`, `INFO`,
`ROLEPLAY`, `NEUTRAL`, `INK`). Game data colours (factions, ideologies,
Fortunes cards) are content, not branding, and stay where they are.
