# Tutorial — guided tours for players and hosts

Old GameMaster was one command: `/reserve`. The website does much more, so a
first visit needs a guide. The tutorial is a set of short **guided tours**
that dim the page, light up one control at a time and explain it in a card
next to it. They start by themselves the first time someone needs them, and
each person can switch them off.

## What people see

- **Spotlight + card.** The page dims; the control being explained stays
  lit (and clickable when the step asks you to try it). The card says what
  it is and what to do, with **Back**, **Next**, a step counter (`3 / 9`)
  and **Skip tour**. On a phone the card sits at the bottom of the screen.
- **Try-it steps.** Some steps wait for you to do the thing ("Click any
  nation"). The card shows *Waiting for you…* and moves on when you do it;
  **Next** still skips ahead. Tours never reserve, schedule, start or send
  anything for you: they only point.
- **Reserving comes first.** The map's tour, **How to reserve a nation**,
  starts with the three clicks (open the game, click your nation, press
  **Reserve Nation**) and has you do them, with the real button lit. It also
  covers IronLegion games, logging in first, unreserving, and why a
  reservation can be refused.
- **The reserve bar.** Until you hold a nation in the open game, the bottom
  of the map says "👆 Click a nation on the map to reserve it" with a
  **Show me how** button that starts that tour, whether or not tutorials are
  switched on or you've seen it. (Not shown for draft games, running games,
  or while the Host Tool is on.)
- **The Help button** (bottom right on every page; top left on the map, beside the roster) opens **Tutorials**:
  - **Show tutorials automatically**: on by default. Off = no tour starts
    by itself; you can still open any tour here.
  - The tours for this page and for you, each with ✓ when done, and
    **Start** / **Replay**.
  - **Reset all tutorials**: every tour shows again as if you were new.
- **Keyboard:** → / Enter next, ← back, Esc closes the tour (it counts as
  skipped and won't start by itself again).

## Who counts as "first time"

Everyone is new to the **website**, including people who used `/reserve` for
years, so "first time" means *hasn't finished or skipped this tour yet*.

- **Logged in:** progress is saved to the account (table
  `web_tutorial_progress`), so a second browser or phone doesn't show the
  tours again.
- **Not logged in:** progress is kept in the browser. On login it's merged
  into the account.
- A tour has a **version**. Raising it after a big change shows it once more
  to everyone who saw the old one.
- A tour never starts on top of another pop-up (the nickname box, the draft
  join box, a host prompt). It waits until that is closed.
- Only one tour starts by itself per page load; the next one waits for the
  next page or for the current one to finish.

## The tours

| Tour | Who | Starts by itself | Covers |
| --- | --- | --- | --- |
| **Reserving a nation** | Everyone | First visit to the map | The game shown (name, mod, start time) · click a nation (try it) · what the colours mean · Reserve / Unreserve · nation details and switching games · the roster on the left · Rules, Mods, My profile · the ❓ button |
| **Draft games** | Everyone | First time a draft game is open on the map | Join the draft (Major, Minor, Co-op, Filler, note) · captains pick · where your nation shows |
| **Running games** | Everyone | First time a running game is open on the map | Hot-join requests · crash reports |
| **Your profile** | Everyone | First visit to My profile | Games, attendance, commends, warnings, roles |
| **Hosting with GameMaster** | Hosts | First time a host opens the map (after the player tour) | The host pages in the top bar · Host Tool · how a game goes: schedule → announce → players reserve → start → attendance → end · then opens the Calendar and carries on there |
| **Host Tool** | Hosts | First time Host Tool is switched on | Pick up / drag players onto nations · taken nation: co-op, swap, replace · filler · remove · Notify players · the action list |
| **Calendar** | Hosts | First visit | Month grid and colours · pick a day · schedule a game · staff locks · your overview · time zone |
| **Scheduling a game** | Hosts | First visit to the game setup | The six tabs one by one (Game + preset, Announce, Access, Nations, Extras, Review) · the timeline · Submit and what the bot does next |
| **Games page** | Hosts | First visit | Running / announced list · Start, End, Cancel · reservation access and lockdown · late join · reminders · message players · rules & mods · draft card |
| **Presets** | Hosts | First visit | What a preset is · your server's presets · making one · loading it in the calendar |
| **Attendance** | Hosts | First visit | Started games · voice samples · roster and corrections · audit log · export |
| **Database** | Hosts | First visit | Search a player · their record · commend, warn, ban, Dishonored · verification & VIP · role check |
| **Server setup** | Owners and admins | First visit to a server's setup | The step strip · pickers and **Create for me** · health check · Finish setup · Settings tiles afterwards |

Each tour is 5–12 steps. A step whose control isn't on the page (no games yet,
a feature switched off on this server, not Host Management) is skipped, or
shows in the middle of the screen with wording that fits, so a tour never
gets stuck.

## How it's built

- `web/src/components/tutorial/`:
  - `TutorialProvider` sits in the root layout. It loads progress, decides
    which tour to start, and runs it.
  - `tours.ts`: every tour as plain data (steps, who, where, when it
    starts). Changing wording never touches the engine.
  - `TutorialOverlay`: spotlight, card, follows the control when the page
    scrolls or resizes.
  - `HelpButton`: the ❓ menu.
- Pages mark controls with `data-tour="…"` and tell the provider facts it
  needs (`isHost`, `draftOpen`, `gameRunning`, `hostToolOn`, `modalOpen`).
  Pages also say when a tour should start
  (`useTutorialTrigger("host-tool", hostToolOn)`).
- `GET /api/tutorial` and `POST /api/tutorial`: read and save
  `{ autoStart, tours: { id: { status, version } } }`. The table is created
  on first use, like the other web tables.
- No new package: the spotlight is one positioned box with a large shadow,
  and the card is placed with plain measuring.

## Out of scope

- Discord-side help (slash commands). The bot's welcome DM already points at
  the website.
- Videos or GIFs inside the cards.
