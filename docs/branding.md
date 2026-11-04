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

**Green means "do this" or "you are here"** (main button, current page).
No gradient washes, glows, glass blur or decorative motion.

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
