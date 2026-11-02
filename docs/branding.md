# Branding — where GameMaster's look lives

GameMaster's visual identity (logo, colours, fonts) is being designed in a
later phase. Until then the site and the bot keep today's look, but every
place the look is decided is now in one spot, so a new identity is a small
change.

## Website

**Colours:** `web/src/app/globals.css`, the `@theme static` block:

| Scale | What it is | Today |
| --- | --- | --- |
| `brand-50` … `brand-950` | The identity colour: buttons, highlights, the tour's lit ring | Tailwind amber |
| `ink-50` … `ink-950` | Backgrounds, panels, borders and text | Tailwind slate |

Components only use `brand-*` and `ink-*` (`bg-brand-400`, `text-ink-300`…),
never `amber-*` or `slate-*`, and the hand-written colours in `globals.css`
use `var(--color-brand-…)` / `var(--color-ink-…)`. Change the two scales and
the whole site follows.

Status colours keep their meaning everywhere and aren't part of the brand:
emerald = good, rose = danger, sky = info, violet / fuchsia = roleplay.

**Font:** `web/src/app/layout.tsx` loads it (Geist today) and `globals.css`
sets it on `body` (`--font-sans`).

**Logo:** the 🎖️ tile in the site menu (`web/src/components/site/SiteMenu.tsx`)
and the page icons passed to `SiteHeader` on each page.

## The shared menu and header

- `web/src/components/site/SiteHeader.tsx`: the header on every page. A page
  passes its name, icon and its own controls; the most used pages show in the
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
