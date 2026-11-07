// The slides the capture script shoots (see capture-tours.mjs for what each frame key does).
export function slides({ discord, discordView, chatLog }) {
  return {
    calendar: [
      {
        step: "Schedule",
        caption:
          "Every game on one month, coloured by where it stands: scheduled, announced, on-going or ended. The shared calendar shows other servers' games beside yours, so nobody books over each other. Click a day for its games, hosts and announce times.",
        frames: [
          { go: "/schedule", ms: 2400 },
          { click: "Shared calendar", wait: 4500, ms: 2400 },
          { click: "Our calendar", wait: 3500, ms: 900 },
          { click: "re:^[0-9]+ 14:00 BFFU 2", ms: 2000 },
        ],
      },
      {
        step: "Set up",
        caption:
          "Set a game up on the real map, one tab at a time: the mode and its preset, when it's announced, who can reserve which nations, extras like drafts and reminders, then a last review.",
        frames: [
          { click: "Set up a game this day", wait: 6500, read: "setup", ms: 1400 },
          { click: "re:^Announce$", ms: 1000 },
          { click: "re:^Players$", ms: 1000 },
          { click: "re:^Extras$", ms: 1000 },
          { click: "re:^Review$", ms: 1600 },
        ],
      },
      {
        step: "Announce",
        caption:
          "Pick when it's announced and press Schedule. At that moment GameMaster posts the announcement in Discord, pings the mode's role, and edits in the link to the map where players reserve.",
        frames: [
          { click: "re:^Announce$", ms: 1000 },
          { click: "re:^Right away", ms: 1200 },
          { click: "re:^Schedule$", wait: 5000, ms: 1600 },
          { go: discord(0), how: "cut", app: "discord", ms: 800 },
          { go: discord(1), how: "cut", app: "discord", ms: 1300 },
          { go: discord(2), how: "cut", app: "discord", ms: 2400 },
        ],
      },
    ],
    records: [
      {
        step: "Records",
        caption:
          "Everyone with a history on your server, with the latest actions beside them. Open a player for their whole record: games played, their standing in each mode, how close they are to Trusted and Hearts of Valor, and every action ever taken.",
        frames: [
          { go: "/database", ms: 3000 },
          { click: "W Wilhelm", scrollTo: 0, ms: 2000 },
          { scroll: "max", ms: 2400 },
        ],
      },
      {
        step: "Host actions",
        caption:
          "Hosts act right on the record: pick the action (commend, Merit, warning, Dishonor or game ban), the mode and the amount, write the reason the player will see, and give it. It's logged with who did it.",
        frames: [
          { click: "re:^Merit$", pick: "last", ms: 900 },
          { click: "re:^Commend$", pick: "last", ms: 850 },
          { click: "re:^Historical$", pick: "last", ms: 900 },
          { click: "re:^[+]$", pick: "last", ms: 750 },
          { click: "css:textarea", ms: 400 },
          { type: "Held the Allied line all game and helped two new players.", ms: 1000 },
          { click: "re:^Give [0-9]+ ", wait: 3500, ms: 2600 },
        ],
      },
    ],
    presets: [
      {
        step: "Library",
        caption:
          "Your presets for every mode, with a star on each mode's default. The public library holds the ones other servers share: copy one and it's yours to change.",
        frames: [{ go: "/presets", ms: 2200 }, { click: "Public library", ms: 2400 }],
      },
      {
        step: "Editor",
        caption:
          "Build one on the real map, step by step: the basics, the nation groups, the locks at the start, the rules and mods it posts, then save. Every game that uses it gets all of that in one click.",
        frames: [
          { click: "Our presets", ms: 800 },
          { click: "Edit", wait: 6500, also: "re:^Basics$", ms: 1300 },
          { click: "re:^Groups$", ms: 1100 },
          { click: "re:^Locks$", ms: 1100 },
          { click: "re:^Rules and mods$", ms: 1100 },
          { click: "re:^Save$", ms: 2000 },
        ],
      },
    ],
    archive: [
      {
        step: "List",
        caption:
          "Every game on every server, kept for good and rated by its players. Filter by mode in a click, or search for a player, a nation or a game.",
        frames: [
          { go: "/archive", ms: 1600 },
          { click: "re:^Vanilla$", ms: 1000 },
          { click: "re:^Kaiserreich$", ms: 1000 },
          { click: "re:^Roleplay$", ms: 1000 },
          { click: "re:^All$", ms: 1400 },
        ],
      },
      {
        step: "Live game",
        caption:
          "A running game updates itself while it's played: who's in the game, who told the host they had to leave, and every commend, Merit and warning the hosts give, as it happens.",
        frames: [
          { click: "re:^Roleplay #88", wait: 4000, ms: 1600 },
          { live: 4, ms: 1100 },
          { live: 10, ms: 1100 },
          { live: 18, ms: 1100 },
          { live: 25, ms: 2200 },
        ],
      },
      {
        step: "AI write-up",
        badge: "TommyKay only",
        caption:
          "After a roleplay game the host uploads its chat log and runs the AI analysis. It grades everyone's roleplay and writes the game up, nation by nation, for anyone to read. A paid extra: on for TommyKay's community only, for now.",
        frames: [
          { go: "/games", wait: 5000, quiet: true },
          { click: "Chat log", ms: 1400 },
          { click: "Add .txt files", upload: chatLog, wait: 2500, ms: 1600 },
          { click: "Run the AI analysis", wait: 7000, ms: 2200 },
          { go: "/archive", quiet: true },
          { click: "re:^Roleplay #87", quiet: true, wait: 4000 },
          { click: "Read the roleplay", wait: 5000, ms: 1800 },
          { scroll: 650, ms: 2400 },
        ],
      },
    ],
    attendance: [
      {
        step: "Live game",
        caption:
          "A running game at a glance: who's on track, at risk or absent, the voice samples so far, and the host's controls. Below them, every player and a log of everything that happened.",
        frames: [{ go: "/attendance", wait: 7000, ms: 2000 }, { scroll: 700, ms: 1500 }, { scroll: 1700, ms: 1800 }],
      },
      {
        step: "Roster",
        caption:
          "Every 20 minutes GameMaster checks who's in the game's voice channel, on its own. Each check fills in a dot; seen in 2 of 5 counts as present, and the results follow by themselves.",
        frames: [
          { scroll: 230, ms: 1500 },
          { sample: true, overlay: "clock", ms: 1500 },
          { sample: true, overlay: "clock", ms: 1500 },
          { sample: true, overlay: "clock", ms: 1500 },
          { sample: true, overlay: "clock", ms: 2200 },
        ],
      },
      {
        step: "Host actions",
        caption:
          "The host still has the last word: change any result by hand, say why, and it's logged. No-shows get their warning automatically once attendance is finalized.",
        frames: [
          { click: "Change", ms: 1100 },
          { click: "re:^Excused$", ms: 1100 },
          { click: "re:^Crashed", ms: 1000 },
          { click: "re:^Set .+ to Excused", wait: 4000, ms: 2400 },
        ],
      },
    ],
    tickets: [
      {
        step: "In Discord",
        caption:
          "Players open a ticket from the panel in Discord. GameMaster makes a private channel with just the staff who handle that kind, and the player is told when it's closed.",
        frames: [
          { go: discordView("panel"), app: "discord", ms: 2000 },
          { click: "🎮 Game Support", then: discordView("ticket"), app: "discord", ms: 2800 },
          { click: "✅ Close & Resolve", then: discordView("dm"), app: "discord", ms: 2800 },
        ],
      },
      {
        step: "On the website",
        caption:
          "Every closed ticket is saved on the website for the roles that handle it: the whole conversation, the form's answers and who closed it. Reports, appeals, applications and verifications alike.",
        frames: [
          { go: "/tickets", ms: 2000 },
          { click: "#0114", ms: 2400 },
          { click: "All tickets", quiet: true, wait: 2500 },
          { click: "#0118", ms: 2400 },
        ],
      },
    ],
    audit: [
      {
        step: "Log",
        caption:
          "Every change on your server, newest first: reservations, games, moderation, hosts, roles, messages and settings, from the website and the bot alike. Narrow it to one kind in a click.",
        frames: [{ go: "/audit", ms: 2400 }, { click: "re:^Moderation [0-9]+", ms: 2400 }],
      },
      {
        step: "Details",
        caption: "Open any entry to see who did it, to whom, in which game and why, with links straight to them.",
        frames: [{ click: "re:^Kurt \\(Senior Host\\) gave Zoe" }],
      },
    ],
    settings: [
      {
        step: "Servers",
        caption: "Every server you run, and where each one stands: set up, needing a fix, or not added yet.",
        frames: [{ go: "/servers", wait: 4000 }],
      },
      {
        step: "Dashboard",
        caption: "Each server's dashboard: whether the bot is healthy, what needs fixing, the last month's games and staff activity, and the fixes a click away.",
        frames: [{ click: "Settings", wait: 5000 }],
      },
      {
        step: "Settings",
        caption:
          "Your staff, host ranks, player roles, channels, game modes, features and tickets. Every server sets its own, and GameMaster works the way your community does.",
        frames: [
          { click: "re:^Basics$", ms: 900 },
          { click: "re:^Staff & access$", ms: 900 },
          { click: "re:^Host ranks$", ms: 900 },
          { click: "re:^Player roles$", ms: 900 },
          { click: "re:^Channels$", ms: 900 },
          { click: "re:^Game modes$", ms: 900 },
          { click: "re:^Features$", ms: 900 },
          { click: "re:^Tickets$", pick: "last", ms: 1600 },
        ],
      },
      {
        step: "History",
        caption: "Every change to the settings, with who made it and when, so nothing changes behind anyone's back.",
        frames: [{ click: "re:^History$", pick: "last" }],
      },
    ],
  };
}
