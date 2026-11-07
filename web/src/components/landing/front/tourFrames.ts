// The front page's feature slideshow: screenshots of the site itself in its
// sample-data preview, taken by scripts/capture-tours.mjs, which clicks
// through each page like a person would. Re-run it when those pages change.
export interface TourFrame {
  src: string;
  /** Where the click that led here landed, as a share of the 1440x900 view (null: no click). */
  cursor: { x: number; y: number } | null;
  /** How this screen comes in: a click (or a scroll's in-between screen) cuts, a new page fades. */
  how: "cut" | "fade";
  /** How long it stays (null: the player decides). */
  ms: number | null;
  /** An in-between screen of a scroll or typing: smaller, and left out of the full-size view. */
  burst?: boolean;
  /** Shot in Discord rather than on the website. */
  app?: "discord";
  /** Something the player draws over it: "clock" = time passing (attendance samples). */
  overlay?: "clock";
}

export interface TourStep {
  name: string;
  caption: string;
  /** A small tag beside the step's name. */
  badge?: string;
  frames: TourFrame[];
}

export const TOURS: Record<string, TourStep[]> = {
  "calendar": [
    {
      "name": "Schedule",
      "caption": "Every game on one month, coloured by where it stands: scheduled, announced, on-going or ended. The shared calendar shows other servers' games beside yours, so nobody books over each other. Click a day for its games, hosts and announce times.",
      "frames": [
        {
          "src": "/landing/tour/calendar/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": 2400
        },
        {
          "src": "/landing/tour/calendar/02.webp",
          "cursor": {
            "x": 0.2874,
            "y": 0.0311
          },
          "how": "cut",
          "ms": 2400
        },
        {
          "src": "/landing/tour/calendar/03.webp",
          "cursor": {
            "x": 0.1893,
            "y": 0.0311
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/calendar/04.webp",
          "cursor": {
            "x": 0.6558,
            "y": 0.3833
          },
          "how": "cut",
          "ms": 2000
        }
      ]
    },
    {
      "name": "Set up",
      "caption": "Set a game up on the real map, one tab at a time: the mode and its preset, when it's announced, who can reserve which nations, extras like drafts and reminders, then a last review.",
      "frames": [
        {
          "src": "/landing/tour/calendar/05.webp",
          "cursor": {
            "x": 0.8514,
            "y": 0.3041
          },
          "how": "cut",
          "ms": 1400
        },
        {
          "src": "/landing/tour/calendar/06.webp",
          "cursor": {
            "x": 0.7985,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/calendar/07.webp",
          "cursor": {
            "x": 0.8545,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/calendar/08.webp",
          "cursor": {
            "x": 0.9105,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/calendar/09.webp",
          "cursor": {
            "x": 0.9665,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1600
        }
      ]
    },
    {
      "name": "Announce",
      "caption": "Pick when it's announced and press Schedule. At that moment GameMaster posts the announcement in Discord, pings the mode's role, and edits in the link to the map where players reserve.",
      "frames": [
        {
          "src": "/landing/tour/calendar/10.webp",
          "cursor": {
            "x": 0.7985,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/calendar/11.webp",
          "cursor": {
            "x": 0.8684,
            "y": 0.3531
          },
          "how": "cut",
          "ms": 1200
        },
        {
          "src": "/landing/tour/calendar/12.webp",
          "cursor": {
            "x": 0.9547,
            "y": 0.9644
          },
          "how": "cut",
          "ms": 1600
        },
        {
          "src": "/landing/tour/calendar/13.webp",
          "cursor": null,
          "how": "cut",
          "ms": 800,
          "app": "discord"
        },
        {
          "src": "/landing/tour/calendar/14.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1300,
          "app": "discord"
        },
        {
          "src": "/landing/tour/calendar/15.webp",
          "cursor": null,
          "how": "cut",
          "ms": 2400,
          "app": "discord"
        }
      ]
    }
  ],
  "records": [
    {
      "name": "Records",
      "caption": "Everyone with a history on your server, with the latest actions beside them. Open a player for their whole record: games played, their standing in each mode, how close they are to Trusted and Hearts of Valor, and every action ever taken.",
      "frames": [
        {
          "src": "/landing/tour/records/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": 3000
        },
        {
          "src": "/landing/tour/records/02.webp",
          "cursor": {
            "x": 0.1347,
            "y": 0.9443
          },
          "how": "cut",
          "ms": 2000
        },
        {
          "src": "/landing/tour/records/03.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/04.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/05.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/06.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/07.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/08.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/09.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/10.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/11.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/12.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/13.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/14.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/15.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/16.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/17.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/18.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/19.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/20.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/21.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/22.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/23.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/24.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/25.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/26.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/27.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/28.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/29.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/30.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/31.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/32.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/records/33.webp",
          "cursor": null,
          "how": "cut",
          "ms": 2400
        }
      ]
    },
    {
      "name": "Host actions",
      "caption": "Hosts act right on the record: pick the action (commend, Merit, warning, Dishonor or game ban), the mode and the amount, write the reason the player will see, and give it. It's logged with who did it.",
      "frames": [
        {
          "src": "/landing/tour/records/34.webp",
          "cursor": {
            "x": 0.7839,
            "y": 0.292
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/records/35.webp",
          "cursor": {
            "x": 0.7303,
            "y": 0.2924
          },
          "how": "cut",
          "ms": 850
        },
        {
          "src": "/landing/tour/records/36.webp",
          "cursor": {
            "x": 0.9035,
            "y": 0.3834
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/records/37.webp",
          "cursor": {
            "x": 0.7979,
            "y": 0.4611
          },
          "how": "cut",
          "ms": 750
        },
        {
          "src": "/landing/tour/records/38.webp",
          "cursor": {
            "x": 0.8375,
            "y": 0.6678
          },
          "how": "cut",
          "ms": 400
        },
        {
          "src": "/landing/tour/records/39.webp",
          "cursor": null,
          "how": "cut",
          "ms": 140,
          "burst": true
        },
        {
          "src": "/landing/tour/records/40.webp",
          "cursor": null,
          "how": "cut",
          "ms": 140,
          "burst": true
        },
        {
          "src": "/landing/tour/records/41.webp",
          "cursor": null,
          "how": "cut",
          "ms": 140,
          "burst": true
        },
        {
          "src": "/landing/tour/records/42.webp",
          "cursor": null,
          "how": "cut",
          "ms": 140,
          "burst": true
        },
        {
          "src": "/landing/tour/records/43.webp",
          "cursor": null,
          "how": "cut",
          "ms": 140,
          "burst": true
        },
        {
          "src": "/landing/tour/records/44.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/records/45.webp",
          "cursor": {
            "x": 0.8375,
            "y": 0.935
          },
          "how": "cut",
          "ms": 2600
        }
      ]
    }
  ],
  "presets": [
    {
      "name": "Library",
      "caption": "Your presets for every mode, with a star on each mode's default. The public library holds the ones other servers share: copy one and it's yours to change.",
      "frames": [
        {
          "src": "/landing/tour/presets/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": 2200
        },
        {
          "src": "/landing/tour/presets/02.webp",
          "cursor": {
            "x": 0.1675,
            "y": 0.1078
          },
          "how": "cut",
          "ms": 2400
        }
      ]
    },
    {
      "name": "Editor",
      "caption": "Build one on the real map, step by step: the basics, the nation groups, the locks at the start, the rules and mods it posts, then save. Every game that uses it gets all of that in one click.",
      "frames": [
        {
          "src": "/landing/tour/presets/03.webp",
          "cursor": {
            "x": 0.0684,
            "y": 0.1078
          },
          "how": "cut",
          "ms": 800
        },
        {
          "src": "/landing/tour/presets/04.webp",
          "cursor": {
            "x": 0.1462,
            "y": 0.4546
          },
          "how": "cut",
          "ms": 1300
        },
        {
          "src": "/landing/tour/presets/05.webp",
          "cursor": {
            "x": 0.0873,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/presets/06.webp",
          "cursor": {
            "x": 0.1418,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/presets/07.webp",
          "cursor": {
            "x": 0.2,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/presets/08.webp",
          "cursor": {
            "x": 0.2582,
            "y": 0.1033
          },
          "how": "cut",
          "ms": 2000
        }
      ]
    }
  ],
  "archive": [
    {
      "name": "List",
      "caption": "Every game on every server, kept for good and rated by its players. Filter by mode in a click, or search for a player, a nation or a game.",
      "frames": [
        {
          "src": "/landing/tour/archive/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": 1600
        },
        {
          "src": "/landing/tour/archive/02.webp",
          "cursor": {
            "x": 0.5802,
            "y": 0.2397
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/archive/03.webp",
          "cursor": {
            "x": 0.6382,
            "y": 0.2397
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/archive/04.webp",
          "cursor": {
            "x": 0.7001,
            "y": 0.2397
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/archive/05.webp",
          "cursor": {
            "x": 0.5395,
            "y": 0.2397
          },
          "how": "cut",
          "ms": 1400
        }
      ]
    },
    {
      "name": "Live game",
      "caption": "A running game updates itself while it's played: who's in the game, who told the host they had to leave, and every commend, Merit and warning the hosts give, as it happens.",
      "frames": [
        {
          "src": "/landing/tour/archive/06.webp",
          "cursor": {
            "x": 0.2632,
            "y": 0.3508
          },
          "how": "cut",
          "ms": 1600
        },
        {
          "src": "/landing/tour/archive/07.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/archive/08.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/archive/09.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/archive/10.webp",
          "cursor": null,
          "how": "cut",
          "ms": 2200
        }
      ]
    },
    {
      "name": "AI write-up",
      "caption": "After a roleplay game the host uploads its chat log and runs the AI analysis. It grades everyone's roleplay and writes the game up, nation by nation, for anyone to read. A paid extra: on for TommyKay's community only, for now.",
      "badge": "TommyKay only",
      "frames": [
        {
          "src": "/landing/tour/archive/11.webp",
          "cursor": {
            "x": 0.655,
            "y": 0.2268
          },
          "how": "cut",
          "ms": 1400
        },
        {
          "src": "/landing/tour/archive/12.webp",
          "cursor": {
            "x": 0.3221,
            "y": 0.4412
          },
          "how": "cut",
          "ms": 1600
        },
        {
          "src": "/landing/tour/archive/13.webp",
          "cursor": {
            "x": 0.6215,
            "y": 0.5145
          },
          "how": "cut",
          "ms": 2200
        },
        {
          "src": "/landing/tour/archive/14.webp",
          "cursor": {
            "x": 0.2372,
            "y": 0.3133
          },
          "how": "cut",
          "ms": 1800
        },
        {
          "src": "/landing/tour/archive/15.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/16.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/17.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/18.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/19.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/20.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/21.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/22.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/23.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/24.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/25.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/26.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/27.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/28.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/29.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/30.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/31.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/32.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/33.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/34.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/35.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/36.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/37.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/38.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/archive/39.webp",
          "cursor": null,
          "how": "cut",
          "ms": 2400
        }
      ]
    }
  ],
  "attendance": [
    {
      "name": "Live game",
      "caption": "A running game at a glance: who's on track, at risk or absent, the voice samples so far, and the host's controls. Below them, every player and a log of everything that happened.",
      "frames": [
        {
          "src": "/landing/tour/attendance/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": 2000
        },
        {
          "src": "/landing/tour/attendance/02.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/03.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/04.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/05.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/06.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/07.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/08.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/09.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/10.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/11.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/12.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/13.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/14.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/15.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/16.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/17.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/18.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/19.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/20.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/21.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/22.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/23.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/24.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/25.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/26.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/27.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/28.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1500
        },
        {
          "src": "/landing/tour/attendance/29.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/30.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/31.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/32.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/33.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/34.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/35.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/36.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/37.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/38.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/39.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/40.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/41.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/42.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/43.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/44.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/45.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/46.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/47.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/48.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/49.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/50.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/51.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/52.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/53.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/54.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/55.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/56.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/57.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/58.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/59.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/60.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/61.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/62.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/63.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/64.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1800
        }
      ]
    },
    {
      "name": "Roster",
      "caption": "Every 20 minutes GameMaster checks who's in the game's voice channel, on its own. Each check fills in a dot; seen in 2 of 5 counts as present, and the results follow by themselves.",
      "frames": [
        {
          "src": "/landing/tour/attendance/65.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/66.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/67.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/68.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/69.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/70.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/71.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/72.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/73.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/74.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/75.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/76.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/77.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/78.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/79.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/80.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/81.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/82.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/83.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/84.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/85.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/86.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/87.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/88.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/89.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/90.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/91.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/92.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/93.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/94.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/95.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/96.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/97.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/98.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/99.webp",
          "cursor": null,
          "how": "cut",
          "ms": 40,
          "burst": true
        },
        {
          "src": "/landing/tour/attendance/100.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1500
        },
        {
          "src": "/landing/tour/attendance/101.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1500,
          "overlay": "clock"
        },
        {
          "src": "/landing/tour/attendance/102.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1500,
          "overlay": "clock"
        },
        {
          "src": "/landing/tour/attendance/103.webp",
          "cursor": null,
          "how": "cut",
          "ms": 1500,
          "overlay": "clock"
        },
        {
          "src": "/landing/tour/attendance/104.webp",
          "cursor": null,
          "how": "cut",
          "ms": 2200,
          "overlay": "clock"
        }
      ]
    },
    {
      "name": "Host actions",
      "caption": "The host still has the last word: change any result by hand, say why, and it's logged. No-shows get their warning automatically once attendance is finalized.",
      "frames": [
        {
          "src": "/landing/tour/attendance/105.webp",
          "cursor": {
            "x": 0.9474,
            "y": 0.5258
          },
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/attendance/106.webp",
          "cursor": {
            "x": 0.5413,
            "y": 0.5383
          },
          "how": "cut",
          "ms": 1100
        },
        {
          "src": "/landing/tour/attendance/107.webp",
          "cursor": {
            "x": 0.5761,
            "y": 0.692
          },
          "how": "cut",
          "ms": 1000
        },
        {
          "src": "/landing/tour/attendance/108.webp",
          "cursor": {
            "x": 0.5,
            "y": 0.7742
          },
          "how": "cut",
          "ms": 2400
        }
      ]
    }
  ],
  "tickets": [
    {
      "name": "In Discord",
      "caption": "Players open a ticket from the panel in Discord. GameMaster makes a private channel with just the staff who handle that kind, and the player is told when it's closed.",
      "frames": [
        {
          "src": "/landing/tour/tickets/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": 2000,
          "app": "discord"
        },
        {
          "src": "/landing/tour/tickets/02.webp",
          "cursor": {
            "x": 0.4486,
            "y": 0.5853
          },
          "how": "cut",
          "ms": 2800,
          "app": "discord"
        },
        {
          "src": "/landing/tour/tickets/03.webp",
          "cursor": {
            "x": 0.3217,
            "y": 0.6603
          },
          "how": "cut",
          "ms": 2800,
          "app": "discord"
        }
      ]
    },
    {
      "name": "On the website",
      "caption": "Every closed ticket is saved on the website for the roles that handle it: the whole conversation, the form's answers and who closed it. Reports, appeals, applications and verifications alike.",
      "frames": [
        {
          "src": "/landing/tour/tickets/04.webp",
          "cursor": null,
          "how": "fade",
          "ms": 2000
        },
        {
          "src": "/landing/tour/tickets/05.webp",
          "cursor": {
            "x": 0.1667,
            "y": 0.5008
          },
          "how": "cut",
          "ms": 2400
        },
        {
          "src": "/landing/tour/tickets/06.webp",
          "cursor": {
            "x": 0.1667,
            "y": 0.3474
          },
          "how": "cut",
          "ms": 2400
        }
      ]
    }
  ],
  "audit": [
    {
      "name": "Log",
      "caption": "Every change on your server, newest first: reservations, games, moderation, hosts, roles, messages and settings, from the website and the bot alike. Narrow it to one kind in a click.",
      "frames": [
        {
          "src": "/landing/tour/audit/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": 2400
        },
        {
          "src": "/landing/tour/audit/02.webp",
          "cursor": {
            "x": 0.4411,
            "y": 0.1263
          },
          "how": "cut",
          "ms": 2400
        }
      ]
    },
    {
      "name": "Details",
      "caption": "Open any entry to see who did it, to whom, in which game and why, with links straight to them.",
      "frames": [
        {
          "src": "/landing/tour/audit/03.webp",
          "cursor": {
            "x": 0.5,
            "y": 0.2842
          },
          "how": "cut",
          "ms": null
        }
      ]
    }
  ],
  "settings": [
    {
      "name": "Servers",
      "caption": "Every server you run, and where each one stands: set up, needing a fix, or not added yet.",
      "frames": [
        {
          "src": "/landing/tour/settings/01.webp",
          "cursor": null,
          "how": "fade",
          "ms": null
        }
      ]
    },
    {
      "name": "Dashboard",
      "caption": "Each server's dashboard: whether the bot is healthy, what needs fixing, the last month's games and staff activity, and the fixes a click away.",
      "frames": [
        {
          "src": "/landing/tour/settings/02.webp",
          "cursor": {
            "x": 0.1909,
            "y": 0.4241
          },
          "how": "cut",
          "ms": null
        }
      ]
    },
    {
      "name": "Settings",
      "caption": "Your staff, host ranks, player roles, channels, game modes, features and tickets. Every server sets its own, and GameMaster works the way your community does.",
      "frames": [
        {
          "src": "/landing/tour/settings/03.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.2711
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/settings/04.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.3178
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/settings/05.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.3645
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/settings/06.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.4111
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/settings/07.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.4578
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/settings/08.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.5045
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/settings/09.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.5511
          },
          "how": "cut",
          "ms": 900
        },
        {
          "src": "/landing/tour/settings/10.webp",
          "cursor": {
            "x": 0.0944,
            "y": 0.5978
          },
          "how": "cut",
          "ms": 1600
        }
      ]
    },
    {
      "name": "History",
      "caption": "Every change to the settings, with who made it and when, so nothing changes behind anyone's back.",
      "frames": [
        {
          "src": "/landing/tour/settings/11.webp",
          "cursor": {
            "x": 0.1031,
            "y": 0.7078
          },
          "how": "cut",
          "ms": null
        }
      ]
    }
  ]
};
