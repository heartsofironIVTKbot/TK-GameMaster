import type { Tour } from "./types";

/**
 * Every guided tour (docs/tutorial.md). Wording lives here; the engine never
 * changes for it. Raise a tour's `version` after a big change to show it
 * again. Targets are `data-tour` names on the pages.
 */

// ---------------------------------------------------------------------------
// The map (everyone)
// ---------------------------------------------------------------------------

const MAP_PLAYER: Tour = {
  id: "map-player",
  // 2: rebuilt around reserving (shows again to everyone who saw version 1).
  version: 2,
  title: "How to reserve a nation",
  summary: "Pick your nation on the map and reserve it. Start here.",
  paths: ["/"],
  auto: "visit",
  priority: 10,
  anchor: "map.canvas",
  steps: [
    {
      title: "How to reserve a nation",
      body:
        "**/reserve is gone.** You reserve your nation here, on the map, in three clicks:\n\n" +
        "**1.** Open the game. The link in its Discord announcement brings you here.\n" +
        "**2.** Click your nation on the map.\n" +
        "**3.** Press **Reserve Nation**.\n\n" +
        "This tour walks you through it. **Next** (or the → key) moves on, **Esc** closes it.",
    },
    {
      target: "map.gameInfo",
      placement: "bottom",
      when: (facts) => Boolean(facts.hasGame),
      title: "Step 1: the game",
      body:
        "This is the game you're signing up for: its name, the mod it's played with and when it starts.\n\n" +
        "The link in a game's Discord announcement opens the map on that game.",
    },
    {
      when: (facts) => !facts.hasGame,
      title: "No game is open yet",
      body:
        "When a host announces a game, the announcement in Discord has a link that opens it here. " +
        "Until then you can still look around the map.",
    },
    {
      target: "map.ironlegion",
      placement: "right",
      when: (facts) => Boolean(facts.ironLegionRequired),
      title: "This game needs IronLegion",
      body:
        "Players have to be authenticated with IronLegion (Steam) to reserve here. " +
        "Authenticate first, from the link in this box, or the reservation is refused.",
    },
    {
      target: "map.canvas",
      padding: 0,
      waitFor: { fact: "nationSelected" },
      title: "Step 2: click your nation",
      body: "**Click the country you want to play** on the map.\nDrag to move around, scroll to zoom. The roster on the left works too.",
    },
    {
      target: "map.reserve",
      placement: "top",
      when: (facts) => Boolean(facts.loggedIn) && !facts.draftOpen && !facts.gameRunning,
      interactive: true,
      missing: "center",
      title: "Step 3: press Reserve Nation",
      body:
        "If it's the nation you want, **press Reserve Nation** now. It turns green, and your name goes on the roster.\n\n" +
        "Not the one? Click another nation first. **Reserved by…** means someone already has it.",
      missingBody:
        "Click a nation first: a **Reserve Nation** button appears at the bottom of the screen. Press it to claim the nation.",
    },
    {
      target: "map.reserve",
      placement: "top",
      when: (facts) => !facts.loggedIn && !facts.draftOpen && !facts.gameRunning,
      missing: "center",
      title: "Step 3: log in, then reserve",
      body:
        "You need to be logged in with Discord. **Login & Reserve** logs you in and brings you back here: " +
        "click your nation again and press **Reserve Nation**.",
      missingBody:
        "Click a nation, then press **Login & Reserve**. It logs you in with Discord and brings you back here to reserve.",
    },
    {
      when: (facts) => Boolean(facts.hasReservation),
      title: "It's yours",
      body:
        "Your nation is green on the map and your name is on the roster.\n\n" +
        "When the host starts the game, the bot DMs you in Discord to confirm you're playing.",
    },
    {
      when: (facts) => !facts.draftOpen && !facts.gameRunning,
      title: "Changed your mind?",
      body:
        "Click your nation again and press **Unreserve Nation**. You can then reserve another one.\n\n" +
        "Can't make it? Unreserve before the game starts: a no-show costs warnings.",
    },
    {
      when: (facts) => !facts.draftOpen && !facts.gameRunning,
      title: "If it won't let you",
      body:
        "The message under the button says why. Usually:\n" +
        "**Taken**: someone reserved it a moment before you.\n" +
        "**Locked**: the host locked it (it's greyed out).\n" +
        "**Majors for Trusted players**: some games keep the big nations for Trusted or VIP players until a set time.\n" +
        "**Closed**: the host stopped reservations for now.",
    },
    {
      title: "What the colours mean",
      body:
        "**Yellow outline**: the nation you're looking at. It's still free.\n" +
        "**Green**: yours.\n" +
        "**Grey**: someone has it. Their picture sits on the capital: click it to see who.\n" +
        "**Blue**: a taken major that takes co-op players.\n" +
        "**Red**: taken, and no co-op.",
    },
    {
      target: "map.details",
      placement: "left",
      title: "Nation details",
      body:
        "Leader, ideology, resources and national spirits of the nation you picked.\n\n" +
        "In the top bar, **▶** folds this panel and **✕** closes it.",
    },
    {
      target: "map.gamePicker",
      placement: "left",
      when: (facts) => Boolean(facts.loggedIn),
      title: "More than one game?",
      body: "Switch games here. The map changes to that game's mod.",
    },
    {
      target: "map.roster",
      placement: "right",
      title: "The roster",
      body:
        "Everyone signed up so far, with the free nations. Click a row to fly to that nation.\n\n" +
        "**◀** folds the roster away; the **Roaster ▸** tab on the left brings it back.",
    },
    {
      target: "map.rulesMods",
      placement: "bottom",
      title: "Rules and mods",
      body: "**Rules** opens the rules for this game. **Mods** lists the mods to subscribe to before it starts.",
    },
    {
      target: "site.menu",
      placement: "bottom",
      title: "Everything else is in the menu",
      body:
        "**☰ Menu** is on every page. **My profile**: your games, attendance, commends and roles. " +
        "**Roleplay archive**: every graded game's story and everyone's roleplay, searchable. Your tickets, too.",
    },
    {
      target: "help.button",
      placement: "bottom",
      title: "Need this again?",
      body:
        "**Help** replays any tour, or switches tutorials off.\n\n" +
        "Until you've reserved, the bar at the bottom of the map says what to do, and **Show me how** starts this tour again.",
    },
  ],
};

const MAP_DRAFT: Tour = {
  id: "map-draft",
  version: 1,
  title: "Draft games",
  summary: "Join the draft pool; the team captains place you.",
  paths: ["/"],
  auto: { fact: "draftOpen" },
  after: ["map-player"],
  priority: 20,
  anchor: "map.canvas",
  steps: [
    {
      title: "This is a draft game",
      body:
        "In a draft you don't reserve a nation yourself. You join a **pool**, " +
        "and two team captains take turns placing players on their team's nations.",
    },
    {
      target: "map.draftPanel",
      placement: "right",
      missing: "center",
      title: "The draft",
      body:
        "Teams, captains, whose turn it is and everyone in the pool.\n\n" +
        "**🎯 Join the draft** puts you in the pool. Say what you'd like to play (a Major, a Minor, a Major co-op or a filler) and add a note for the host.",
      missingBody:
        "Open the roster on the left to see the teams, the captains and the pool. " +
        "**🎯 Join the draft** puts you in the pool.",
    },
    {
      title: "Captains pick",
      body:
        "Once the host starts the draft, the captain on the clock picks players from the pool. " +
        "When you're placed, your nation turns green on the map.\n\n" +
        "Changed your mind before you're picked? Open **Join the draft** again to change your choice or leave.",
    },
  ],
};

const MAP_RUNNING: Tour = {
  id: "map-running",
  version: 1,
  title: "Games in progress",
  summary: "Hot-join a running game, or send a crash report.",
  paths: ["/"],
  auto: { fact: "gameRunning" },
  after: ["map-player"],
  priority: 20,
  anchor: "map.canvas",
  steps: [
    {
      title: "This game has started",
      body: "Reserving closes when the host starts the game. Two things still work here.",
    },
    {
      target: "map.hotjoin",
      placement: "top",
      missing: "center",
      title: "Hot-join and crashes",
      body:
        "**Hot-join**: click a free nation and press **Ask to hot-join**. The host gets a DM, and so do you when they decide.\n\n" +
        "**🚨 Game crashed?** Send your logs here so staff can check what happened.",
      missingBody:
        "**Hot-join**: click a free nation and press **Ask to hot-join**. The host gets a DM, and so do you when they decide.\n\n" +
        "**Crashed?** The **🚨 Game crashed? Send your logs** button at the bottom sends your logs to staff.",
    },
  ],
};

// ---------------------------------------------------------------------------
// The map (hosts)
// ---------------------------------------------------------------------------

const MAP_HOST: Tour = {
  id: "map-host",
  version: 1,
  title: "Hosting with GameMaster",
  summary: "How a game runs now, and where the host pages are.",
  paths: ["/"],
  when: (facts) => Boolean(facts.isHost),
  auto: "visit",
  after: ["map-player"],
  priority: 5,
  anchor: "map.hostTool",
  next: { tour: "calendar", href: "/schedule", label: "Open the Calendar" },
  steps: [
    {
      title: "You're a host",
      body:
        "Hosting moved from slash commands to the website. A game goes like this:\n\n" +
        "**1. Schedule it** on the Calendar. The bot posts the announcement for you.\n" +
        "**2. Players reserve** on this map.\n" +
        "**3. Start it** on the Games page. Attendance is taken by itself.\n" +
        "**4. End it** on the Games page.",
    },
    {
      target: "site.menu",
      placement: "bottom",
      title: "Your host pages",
      body:
        "They're in **☰ Menu**, on every page. **Calendar**: schedule games. **Games**: start, end and manage games. " +
        "**Attendance**: who showed up. **Database**: player records, commends, warnings, bans. " +
        "**Presets**: saved game setups. Server setup and the audit log are there too.",
    },
    {
      target: "map.hostTool",
      placement: "bottom",
      title: "Host Tool",
      body:
        "Switch it on to move players yourself: drag them onto nations, swap them, add co-ops and fillers, or remove them. " +
        "It replaces /add and /remove. It gets its own short tour the first time you switch it on.",
    },
    {
      title: "Next: your first game",
      body: "Let's open the Calendar, where every game starts. The tour carries on there.",
    },
  ],
};

const MAP_HOST_TOOL: Tour = {
  id: "map-host-tool",
  version: 1,
  title: "Host Tool",
  summary: "Add, move, swap and remove players on the map.",
  paths: ["/"],
  when: (facts) => Boolean(facts.isHost),
  auto: { fact: "hostToolOn" },
  priority: 30,
  anchor: "hosttool.panel",
  steps: [
    {
      target: "hosttool.panel",
      placement: "right",
      title: "Host Tool is on",
      body:
        "This panel manages the game shown on the map. Drag its title bar to move it; **✕** switches the tool off.",
    },
    {
      target: "hosttool.search",
      placement: "right",
      title: "Find a player",
      body:
        "Search by name, nickname or Discord ID. Then **drag** them onto a nation, on the map or in the roster. " +
        "Or **click** them, then click the nation.",
    },
    {
      title: "Dropping on a taken nation",
      body:
        "You choose what happens:\n" +
        "**Co-op**: they join the current player (majors only).\n" +
        "**Swap**: the two players trade nations.\n" +
        "**Replace**: the new player takes it and the old one is taken off.",
    },
    {
      target: "map.roster",
      placement: "right",
      title: "Moving players already in",
      body: "With the tool on, reserved players in the roster, and their pictures on the map, can be dragged to another nation too.",
    },
    {
      target: "hosttool.zones",
      placement: "right",
      title: "Fillers and removing",
      body:
        "Drop a player on **Add as filler** to sign them up without a nation, " +
        "or on **Remove from game** to take them out.",
    },
    {
      target: "hosttool.notify",
      placement: "right",
      title: "Notify players",
      body: "On: players get a DM when you add, move, swap or remove them. Switch it off for quiet fixes.",
    },
    {
      title: "The bot does the change",
      body:
        "Each change shows under **Activity** while the bot applies it. If the bot sees a problem, " +
        "it says what's wrong, and you can **Add anyway** or drop it.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Host pages
// ---------------------------------------------------------------------------

const CALENDAR: Tour = {
  id: "calendar",
  version: 1,
  title: "Calendar",
  summary: "Book a day, set up a game, find your upcoming games.",
  paths: ["/schedule"],
  auto: "visit",
  anchor: "calendar.grid",
  steps: [
    {
      title: "The Host Calendar",
      body:
        "Every game starts here. Pick a day, set the game up, and the bot posts the announcement at the time you choose. " +
        "/schedule and the other scheduling commands are gone.",
    },
    {
      target: "calendar.grid",
      placement: "right",
      title: "The month",
      body:
        "Games are coloured by type (the key is above the days). **Your** games have an amber ring. " +
        "A **🔒** day is locked by staff: nobody can book it.\n\n" +
        "The line under the calendar says how far ahead you can book.",
    },
    {
      target: "calendar.overview",
      placement: "left",
      title: "Your upcoming games",
      body: "Your next games, and any request the bot couldn't do. Click one to jump to its day.",
    },
    {
      target: "calendar.grid",
      placement: "right",
      waitFor: { selector: '[data-tour~="calendar.dayPanel"]' },
      title: "Open a day",
      body: "**Click a day** to see its games.",
    },
    {
      target: "calendar.newGame",
      placement: "left",
      missing: "center",
      title: "Set up a game",
      body:
        "**＋ Set up a game this day** opens the game setup. " +
        "(On the calendar, hovering a day shows a small **＋** that does the same.)",
      missingBody:
        "This day can't be booked: it's in the past, locked by staff or too far ahead. " +
        "Pick another day, then press **＋ Set up a game this day**.",
    },
    {
      target: "calendar.dayPanel",
      placement: "left",
      title: "The day's games",
      body:
        "Each game shows its time, mode and host. On your own games:\n" +
        "**✎ Edit** changes it (once it's announced, only the time and host).\n" +
        "**🎮 Game controls** opens it on the Games page.\n" +
        "**Cancel game…** takes it off the board.",
    },
    {
      target: "calendar.dayLock",
      placement: "left",
      when: (facts) => Boolean(facts.isStaff),
      title: "Locking a day",
      body: "Host Management can lock a day so nobody books it, for a tournament or a server event. Locked days show 🔒.",
    },
    {
      target: "calendar.timezone",
      placement: "bottom",
      title: "Your time zone",
      body: "The calendar shows times in this zone. Players see the announcement in their own time.",
    },
    {
      target: "site.menu",
      placement: "bottom",
      title: "The other host pages",
      body:
        "**☰ Menu** (top right, on every page) has them all. **Games**: start, end and manage games. " +
        "**Presets**: saved setups for a game mode. **Database**: player records. **Attendance**: who showed up.",
    },
  ],
};

const SETUP_TAB_STEPS = [
  {
    target: "setup.tab.game",
    placement: "left" as const,
    title: "🎮 Game",
    body:
      "The **game mode**, the **day** and the **start time**. Other games on the board that day are listed, so you don't clash.\n\n" +
      "A **preset** loads a saved setup (nation groups, locks, access, rules and mods) in one go.",
  },
  {
    target: "setup.tab.announce",
    placement: "left" as const,
    title: "📣 Announce",
    body:
      "When the bot posts the announcement in Discord, with a preview of what players will see. " +
      "Its link opens the map on this game.",
  },
  {
    target: "setup.tab.access",
    placement: "left" as const,
    title: "🔐 Access",
    body:
      "Who can reserve **Majors** and **Minors** (VIP+, Trusted+, Verified+ or Everyone) and when they open up to everyone. " +
      "If your server uses IronLegion, also whether players need to be authenticated to reserve.",
  },
  {
    target: "setup.tab.nations",
    placement: "left" as const,
    title: "🗺️ Nations",
    body:
      "**Nation groups**: how nations are listed on the board.\n" +
      "**Nation locks**: nations nobody can reserve, for the whole game or until a set time. " +
      "Click nations on the map to lock or unlock them.",
  },
  {
    target: "setup.tab.extras",
    placement: "left" as const,
    title: "✨ Extras",
    body:
      "A **draft** game with two captains, add-ons for special events, how attendance is logged, " +
      "and the automatic reminder an hour before the start.",
  },
  {
    target: "setup.tab.review",
    placement: "left" as const,
    title: "✅ Review",
    body: "Everything on one page before you send it. Click a line to go back to its tab.",
  },
];

const GAME_SETUP: Tour = {
  id: "game-setup",
  version: 1,
  title: "Setting up a game",
  summary: "The six tabs of the game setup, and what happens when you schedule.",
  paths: ["/schedule/new", "/schedule/edit"],
  auto: "visit",
  anchor: "setup.tabs",
  steps: [
    {
      title: "Setting up a game",
      body:
        "Six tabs, left to right. Only **Game** needs filling in: the rest starts from the mode's usual settings.\n\n" +
        "A **red dot** on a tab means something there still needs fixing.",
    },
    ...SETUP_TAB_STEPS,
    {
      target: "setup.footer",
      placement: "top",
      title: "Schedule it",
      body:
        "**Next ›** walks through the tabs. On Review, **Schedule game** sends it to the bot.\n\n" +
        "The left side says what's still to fix, or **✓ Ready to schedule**.",
    },
    {
      title: "After you schedule",
      body:
        "The game shows on the calendar straight away, marked as waiting, until the bot adds it to the board. " +
        "The bot posts the announcement at the time you picked.\n\n" +
        "On the day, start it from the **Games** page.",
    },
  ],
};

const GAMES: Tour = {
  id: "games",
  version: 1,
  title: "Games page",
  summary: "Start, end and cancel games; access, reminders and messages.",
  paths: ["/games"],
  auto: "visit",
  anchor: "games.list",
  steps: [
    {
      target: "games.list",
      placement: "right",
      title: "Announced and running games",
      body:
        "Games show here once the calendar has announced them. Tick **Only my games** to hide other hosts' games.",
    },
    {
      target: "games.list",
      placement: "right",
      waitFor: { selector: '[data-tour~="games.header"]' },
      title: "Open a game",
      body: "**Click a game** to manage it.",
    },
    {
      target: "games.panel",
      placement: "left",
      title: "The game",
      body:
        "Its mode, host and time, then the cards for what you can do now. " +
        "The cards change as the game moves on: announced, running, ended.",
    },
    {
      target: "games.start",
      placement: "left",
      title: "Start the game",
      body:
        "Fill in the in-game **server ID**, **password** and **checksum** (filled in from the schedule) " +
        "and how often attendance is checked.\n\n" +
        "**What will happen** lists every step the bot takes: voice channels and the Gamer Pass role, " +
        "the server details for players, the confirmation DMs, attendance, and closing reservations.",
    },
    {
      target: "games.live",
      placement: "left",
      title: "Ending it",
      body:
        "**🏁 End game** (click twice) finishes attendance, removes the voice channels and the Gamer Pass, " +
        "posts the rating poll and DMs you a link to correct attendance.",
    },
    {
      target: "games.access",
      placement: "left",
      title: "Reservation access",
      body:
        "Who can reserve **Majors** and **Minors**, **Lockdown** to stop all reserving, **locked nations** nobody can take, " +
        "and **Clear all reservations**.",
    },
    {
      target: "games.reminders",
      placement: "left",
      title: "Reminders",
      body:
        "**Before the start**: DM every reserved player the time, their nation and the checksum. " +
        "**After the start**: DM those who aren't in a game voice channel yet.",
    },
    {
      target: "games.message",
      placement: "left",
      title: "Message players",
      body: "Write to everyone signed up. You see what they'll get before it's sent.",
    },
    {
      target: "games.lateJoin",
      placement: "left",
      title: "Late join",
      body: "Add someone to a running game, on a free nation or as a filler. They get the Gamer Pass and a DM.",
    },
    {
      target: "games.hotjoin",
      placement: "left",
      title: "Hot-join requests",
      body: "Players ask to hot-join from the map. Accept or decline here.",
    },
    {
      target: "games.draft",
      placement: "left",
      title: "Draft",
      body: "The pool, the teams and the captains. **Change** swaps a captain.",
    },
    {
      target: "games.rulesMods",
      placement: "left",
      title: "Rules & mods",
      body: "Post or update this game's rules and mods lists in Discord.",
    },
    {
      target: "games.cancel",
      placement: "left",
      title: "Cancel game",
      body: "Give a reason (every reserved player gets it in a DM) and click twice. Nobody gets a penalty.",
    },
    {
      target: "games.roster",
      placement: "left",
      title: "Reserved players",
      body: "Everyone signed up. Once the game starts, it also shows who confirmed.",
    },
    {
      target: "games.chatlog",
      placement: "left",
      title: "Chat log & AI analysis",
      body:
        "After the game, add its HOI4 chat log (.txt). Rehosted after a crash? Add every file: the AI reads them as one game, " +
        "in the order shown (↑ ↓ to fix it).\n\n" +
        "**Run the AI analysis**: it grades everyone's roleplay with the strict rules and puts the game on the public " +
        "**roleplay archive**. Nothing is given until you press **Give**.",
    },
    {
      title: "Every action is logged",
      body:
        "After you click, the page shows the bot at work, step by step. You can leave and come back. " +
        "Starts, ends and cancels also go in the game's log on the **Attendance** page.",
    },
  ],
};

const PRESETS: Tour = {
  id: "presets",
  version: 1,
  title: "Presets",
  summary: "Saved game setups you load when scheduling.",
  paths: ["/presets"],
  auto: "visit",
  anchor: "presets.view",
  steps: [
    {
      title: "What a preset is",
      body:
        "A saved setup for one game mode: nation groups, nation locks, who can reserve, and the rules and mods lists. " +
        "Load it on the calendar's **Game** tab and the whole form fills in.",
    },
    {
      target: "presets.view",
      placement: "bottom",
      title: "Yours, or the public library",
      body:
        "**Our presets**: every host on this server can load them. Only the person who made one (or staff) can change it.\n" +
        "**Public library**: presets other servers shared. **Copy to our server** gives you your own version.",
    },
    {
      target: "presets.filters",
      placement: "bottom",
      title: "Filter by mode",
      body: "Show the presets of one game mode only.",
    },
    {
      target: "presets.list",
      placement: "top",
      title: "The presets",
      body:
        "Each card shows what's in the preset.\n" +
        "**🗓️ Use in a game** opens a new game with it loaded.\n" +
        "**✏️ Edit** changes it (**👁️ View** if it isn't yours).\n" +
        "**⧉ Duplicate** makes a copy to change.",
    },
    {
      target: "presets.new",
      placement: "bottom",
      title: "Make one",
      body:
        "**＋ New preset** walks you through it: basics, nation groups, locks, then rules and mods. " +
        "You can share it with the public library when you save.",
    },
  ],
};

const ATTENDANCE: Tour = {
  id: "attendance",
  version: 1,
  title: "Attendance",
  summary: "Voice samples, who's at risk, corrections and the game log.",
  paths: ["/attendance"],
  auto: "visit",
  anchor: "attendance.list",
  steps: [
    {
      title: "How attendance works",
      body:
        "Once a game starts, the bot takes **5 voice samples**. A player counts as present when seen in **2** of them, " +
        "in a game voice channel with the game's Gamer Pass.\n\n" +
        "A no-show costs 2 warnings on a Major, 1 on anything else. VIPs are never warned.",
    },
    {
      target: "attendance.list",
      placement: "right",
      title: "Started games",
      body: "Live games first, with sample progress. An amber number means players worth a look.",
    },
    {
      target: "attendance.list",
      placement: "right",
      waitFor: { selector: '[data-tour~="attendance.header"]' },
      title: "Open a game",
      body: "**Click a game** to see its attendance.",
    },
    {
      target: "attendance.header",
      placement: "bottom",
      title: "The game",
      body:
        "Who's on track, at risk, absent or excused, and the warnings that would be given if nothing changes.\n\n" +
        "**🎧 Check voice now** scans voice without counting it. **📸 Take sample now** takes the next sample early. " +
        "**✅ Finalize attendance** stops sampling and gives the warnings. **⤓ Export CSV** downloads it all.",
    },
    {
      target: "attendance.samples",
      placement: "top",
      title: "Voice samples",
      body: "The five samples, how many were in voice each time, and a countdown to the next one.",
    },
    {
      target: "attendance.roster",
      placement: "top",
      title: "Roster",
      body:
        "One row per player: a dot per sample (hover for details), their reply to the start DM and the result. " +
        "**At risk** means not seen enough yet, but the samples left can still count them.\n\n" +
        "**Change** sets a player to Present, Absent or Excused, with a reason.",
    },
    {
      target: "attendance.log",
      placement: "top",
      title: "Game log",
      body: "Everything that happened in the game, newest first, with who did it: samples, replies, late joins, changes and warnings.",
    },
  ],
};

const DATABASE: Tour = {
  id: "database",
  version: 1,
  title: "Database",
  summary: "Player records: commends, warnings, bans, roles and VIP.",
  paths: ["/database"],
  auto: "visit",
  anchor: "database.search",
  steps: [
    {
      target: "database.search",
      placement: "right",
      title: "Find a player",
      body:
        "Search by name, @handle or Discord ID. The list shows everyone with a history on this server. " +
        "↑ ↓ and Enter work too.",
    },
    {
      target: "database.roleCheck",
      placement: "left",
      title: "Role check",
      body:
        "Checks every member's Trusted, Hearts of Valor and Dishonored roles against their record and fixes them. " +
        "It replaces /scan and also runs by itself once a day.",
    },
    {
      target: "database.activity",
      placement: "top",
      title: "Recent actions",
      body: "The latest commends, warnings, bans and role changes on this server. Click a name to open the record.",
    },
    {
      target: "database.list",
      placement: "right",
      waitFor: { selector: '[data-tour~="database.profile"]' },
      title: "Open a record",
      body: "**Click a player** to open their record.",
    },
    {
      target: "database.profile",
      placement: "bottom",
      title: "Their record",
      body: "Roles, Discord ID, games, attendance, commends and warnings per game type.",
    },
    {
      target: "database.moderate",
      placement: "left",
      title: "🛠️ Moderate",
      body:
        "**Give** or **take** a commend, Merit, a warning, a game ban or Dishonored. " +
        "Pick a reason, and **What will happen** shows the result (a promotion, a role, a ban) before you confirm.",
    },
    {
      target: "database.roles",
      placement: "left",
      title: "Verification, host ranks and VIP",
      body: "RP and Hist Verified, host branches and ranks, and VIP. Each change goes through the bot, which updates the roles in Discord.",
    },
    {
      target: "database.hostStanding",
      placement: "left",
      title: "Host standing",
      body: "On a host's record: hosted games, Acclamations and Violations. Acclamations promote, Violations strip the rank at the limit.",
    },
    {
      target: "database.message",
      placement: "left",
      title: "Send a message",
      body: "DM this player through the bot. It replaced /dm.",
    },
  ],
};

const SERVERS_LIST: Tour = {
  id: "servers",
  version: 1,
  title: "Your servers",
  summary: "Add GameMaster to a server and open its setup.",
  paths: ["/servers"],
  auto: "visit",
  anchor: "servers.list",
  steps: [
    {
      target: "servers.list",
      placement: "bottom",
      title: "Servers you manage",
      body:
        "Servers you own or are an admin in, and ones whose owner let Host Management change settings. " +
        "Each says whether GameMaster is in it and whether setup is finished.",
    },
    {
      target: "servers.add",
      placement: "bottom",
      title: "Add GameMaster",
      body:
        "Adds the bot to another server. Discord asks you to pick the server and approve the permissions, " +
        "then you're back here to set it up.",
    },
  ],
};

const SERVER_SETUP: Tour = {
  id: "server-setup",
  version: 1,
  title: "Server setup",
  summary: "The setup steps, the pickers and finishing setup.",
  paths: ["/servers"],
  auto: "visit",
  anchor: "server.steps",
  steps: [
    {
      title: "Setting up your server",
      body:
        "Ten short steps. Nothing about your server is written in the code: its roles, channels and rules are all set here, " +
        "and you can change them later.\n\nYour progress is saved as you go. Close the tab and pick up where you left off.",
    },
    {
      target: "server.steps",
      placement: "bottom",
      title: "The steps",
      body:
        "A **✓** is done, a red number has problems to fix, and **🔒** steps open once you press **Save & continue**. " +
        "You can go back to any step you've reached.",
    },
    {
      target: "server.step",
      placement: "top",
      title: "Filling it in",
      body:
        "Each role or channel has a **picker** with your server's real roles and channels. It warns you when the bot can't manage a role " +
        "or post in a channel. **Create for me** makes the role or channel with a sensible name.",
    },
    {
      target: "server.save",
      placement: "top",
      title: "Save & continue",
      body:
        "Saves this step and opens the next one. On **Review**, **Finish setup** unlocks once every required field is filled " +
        "and the health check has nothing blocking.",
    },
  ],
};

const SERVER_SETTINGS: Tour = {
  id: "server-settings",
  version: 1,
  title: "Server settings",
  summary: "The settings tiles, health checks and history.",
  paths: ["/servers"],
  auto: "visit",
  anchor: "server.tiles",
  steps: [
    {
      target: "server.tiles",
      placement: "top",
      title: "Settings",
      body:
        "Setup is done, so every section is a tile. A red number means problems, amber means warnings.\n\n" +
        "**Dashboard**: how the server is doing. **Health**: live checks with fix-it buttons. **History**: every settings change and who made it.",
    },
  ],
};

const PROFILE: Tour = {
  id: "profile",
  version: 1,
  title: "Your profile",
  summary: "Your record on this server.",
  paths: ["/profile"],
  auto: "visit",
  anchor: "profile.header",
  steps: [
    {
      target: "profile.header",
      placement: "bottom",
      title: "You on this server",
      body: "Your roles and standing. Records are kept per server: this is your record on the server shown here.",
    },
    {
      target: "profile.portfolio",
      placement: "right",
      title: "Portfolio",
      body:
        "Your games, attendance, commends and warnings for each game type. " +
        "Enough commends (plus Verified) earn Trusted; too many warnings mean a game ban in that type.",
    },
    {
      target: "profile.side",
      placement: "left",
      title: "Results and help",
      body:
        "How the AI rated your roleplay in recent games, your hosting record if you host, and how records work. " +
        "Think something's wrong? Open a ticket on the server.",
    },
    {
      target: "site.menu",
      placement: "bottom",
      title: "Your tickets and everything else",
      body: "**☰ Menu** has every page: your tickets (to read after they're closed), the roleplay archive, the map and more.",
    },
  ],
};

// ---------------------------------------------------------------------------
// The public roleplay archive
// ---------------------------------------------------------------------------

const ROLEPLAY_ARCHIVE: Tour = {
  id: "roleplay-archive",
  version: 1,
  title: "Roleplay archive",
  summary: "Find any game's story and roleplay.",
  paths: ["/roleplay"],
  auto: "visit",
  anchor: "rp.search",
  steps: [
    {
      title: "The roleplay archive",
      body:
        "Every game whose chat log was graded, from every server: the story, everyone's result and every line of roleplay. " +
        "Anyone can read it, no login needed.",
    },
    {
      target: "rp.search",
      placement: "bottom",
      title: "Search",
      body: "Type a player's name, a nation, a game or a few words from a line. Share the page address to share the search.",
    },
    {
      target: "rp.filters",
      placement: "bottom",
      title: "Narrow it down",
      body: "Pick a game mode, only games with rewarded roleplay, a server, or sort by the most roleplay.",
    },
    {
      target: "rp.list",
      placement: "top",
      missing: "center",
      title: "Open a game",
      body: "Each card has the AI's recap of the story and the best roleplayers. Click one to read the whole game.",
      missingBody: "Games appear here once a host uploads the chat log and runs the AI analysis.",
    },
  ],
};

const ROLEPLAY_GAME: Tour = {
  id: "roleplay-game",
  version: 1,
  title: "Reading a game",
  summary: "The story, everyone's result and the full log.",
  paths: ["/roleplay/*"],
  auto: "visit",
  anchor: "rp.players",
  steps: [
    {
      target: "rp.story",
      placement: "bottom",
      title: "The story",
      body: "The AI's short recap of what happened: who allied, who fought, how it ended.",
    },
    {
      target: "rp.players",
      placement: "top",
      title: "Every player",
      body:
        "Their result, how much they wrote in character, how creative it was, and their best lines. " +
        "**Read all of…** jumps to that nation's lines in the log.",
    },
    {
      target: "rp.log",
      placement: "top",
      title: "The full roleplay",
      body:
        "Every line of the game, nation by nation. Search it, pick one nation, or show the out-of-character chat too " +
        "(\"unpause\", \"lag?\" and the like are hidden at first). A rehosted game shows where each part starts.",
    },
  ],
};

export const TOURS: Tour[] = [
  MAP_PLAYER,
  MAP_DRAFT,
  MAP_RUNNING,
  MAP_HOST,
  MAP_HOST_TOOL,
  CALENDAR,
  GAME_SETUP,
  GAMES,
  PRESETS,
  ATTENDANCE,
  DATABASE,
  SERVERS_LIST,
  SERVER_SETUP,
  SERVER_SETTINGS,
  PROFILE,
  ROLEPLAY_ARCHIVE,
  ROLEPLAY_GAME,
];

export const TOURS_BY_ID: ReadonlyMap<string, Tour> = new Map(TOURS.map((tour) => [tour.id, tour]));
export const TOUR_IDS: ReadonlySet<string> = new Set(TOURS.map((tour) => tour.id));
