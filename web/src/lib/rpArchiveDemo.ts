import { DEFAULT_AI_RULES, aiReward } from "@/lib/aiAnalysisTypes";
import { seedDemoChatLog } from "@/lib/chatLogs";
import { HOME_GUILD_ID } from "@/lib/currentGuild";
import { demoControlRaw } from "@/lib/gameControlDemo";
import { demoDirectory } from "@/lib/liveDemo";
import type { RawRpGame } from "@/lib/rpArchive";

/**
 * Preview mode: sample graded games for the public roleplay archive, with
 * their chat logs (one comes in two files, as after a rehost), plus any
 * preview game a host graded on the Games page.
 */

interface SamplePlayer {
  member: number;
  tag: string;
  nation: string;
  lines: string[];
  creativity: number;
  share: number;
  summary: string;
}

interface Sample {
  id: string;
  mode: string;
  name: string;
  daysAgo: number;
  summary: string;
  players: SamplePlayer[];
  /** Splits the log in two files at this many RP lines (a rehost). */
  rehostAfter?: number;
}

const LOBBY = ["ready", "who has the checksum", "gl hf", "unpause"];

const SAMPLES: Sample[] = [
  {
    id: "990000000000000001",
    mode: "Roleplay",
    name: "Roleplay Game #212 — The Iron Spring",
    daysAgo: 1,
    summary:
      "A monarchist Germany and a reformed Soviet Union carved up their spheres in a tense summit at Brest, while Britain " +
      "rallied a Commonwealth bloc against both. Poland's daring neutrality kept the war in the east cold until the last session.",
    players: [
      {
        member: 4,
        tag: "GER",
        nation: "German Reich",
        creativity: 9,
        share: 0.92,
        summary: "Ran a restored Kaiserreich with memorable speeches and careful diplomacy.",
        lines: [
          "By the grace of God, the Hohenzollern crown returns to Berlin. Let every German know: the long night of the Republic is over.",
          "The Reich extends its hand to Warsaw. We seek no Polish soil, only a guarantee that the Vistula stays a river and not a front.",
          "Berliner Tageblatt: Kaiser Wilhelm III opens the new Reichstag with a promise of bread, order and honour.",
          "To the Soviet delegation: Brest-Litovsk was a humiliation for you. Let Brest 1937 be a partnership instead.",
          "Our engineers will finish the Mittellandkanal before winter. Prosperity is the best propaganda.",
        ],
      },
      {
        member: 2,
        tag: "SOV",
        nation: "Soviet Union",
        creativity: 7,
        share: 0.84,
        summary: "Played a reformist Soviet leadership with strong radio broadcasts.",
        lines: [
          "Radio Moscow: Comrades, the Party has heard you. The collective farms will keep a share of their own harvest.",
          "We accept the German invitation to Brest. The Soviet people want bread and peace, but they will not beg for either.",
          "Pravda: The new constitution guarantees the soviets their voice again. Long live the workers' councils!",
          "A warning to London: the Baltic is not your sea.",
        ],
      },
      {
        member: 7,
        tag: "ENG",
        nation: "United Kingdom",
        creativity: 6,
        share: 0.7,
        summary: "Built a Commonwealth front with a few strong addresses.",
        lines: [
          "His Majesty's Government will not stand idle while two empires divide Europe at a railway station.",
          "The Dominions are called to London. Canberra, Ottawa, Pretoria, Wellington: the Empire stands together.",
          "lag?",
        ],
      },
      {
        member: 5,
        tag: "POL",
        nation: "Poland",
        creativity: 8,
        share: 0.9,
        summary: "Kept Poland neutral with sharp, witty diplomacy between the two giants.",
        lines: [
          "Warsaw thanks Berlin for its kind guarantee, and Moscow for its kind silence. We will remember both.",
          "Marshal Rydz-Śmigły to the Sejm: we are a bridge, not a battlefield. Bridges are expensive to burn.",
          "Polish Radio: the Baltic port at Gdynia breaks its trade record for the third year running.",
        ],
      },
      {
        member: 11,
        tag: "HOL",
        nation: "Netherlands",
        creativity: 3,
        share: 0.2,
        summary: "",
        lines: ["gg", "brb"],
      },
    ],
  },
  {
    id: "990000000000000002",
    mode: "Kaiserreich (FFA)",
    name: "Kaiserreich FFA #48 — Second Weltkrieg",
    daysAgo: 4,
    rehostAfter: 6,
    summary:
      "The Commune of France and the Union of Britain struck at a tired German Empire while Austria-Hungary teetered on collapse. " +
      "After a rehost the Internationale pushed to the Rhine, but a last-minute Danubian federation saved Vienna.",
    players: [
      {
        member: 8,
        tag: "FRA",
        nation: "Commune of France",
        creativity: 8,
        share: 0.88,
        summary: "Fiery syndicalist rhetoric and a clear war narrative.",
        lines: [
          "Citoyens! The Revanche is not the old men's revenge: it is the workers' liberation of the Rhineland.",
          "L'Humanité: The Paris Commune of 1871 lives again in every factory council from Lyon to Lille.",
          "To our British comrades: the Channel is no longer a border between us, only a river of solidarity.",
          "The Grande Armée Rouge crosses the Moselle. Germans, lay down your arms: your officers are not your friends.",
        ],
      },
      {
        member: 1,
        tag: "GER",
        nation: "German Empire",
        creativity: 7,
        share: 0.86,
        summary: "Defended a tired Empire with stubborn, proud speeches.",
        lines: [
          "The Kaiser does not negotiate with mobs flying red flags. The Rhine will hold.",
          "Mitteleuropa stands. Every nation that traded with us in peace will stand with us in war.",
          "unpause",
          "Order of the day: no retreat beyond the Westwall. The Reich has been here before and it has won before.",
        ],
      },
      {
        member: 9,
        tag: "AUS",
        nation: "Austria-Hungary",
        creativity: 9,
        share: 0.95,
        summary: "Turned the collapse of the Dual Monarchy into the game's best storyline.",
        lines: [
          "Kaiser Otto speaks to the peoples of the Danube: you are not subjects of Vienna, you are its partners.",
          "Prague, Zagreb, Kraków: the federation charter is signed. A monarchy of free nations, or no monarchy at all.",
          "Wiener Zeitung: crowds in the Ringstrasse sing in eleven languages tonight.",
        ],
      },
      {
        member: 10,
        tag: "ENG",
        nation: "Union of Britain",
        creativity: 6,
        share: 0.75,
        summary: "Solid support for the Internationale, mostly short updates.",
        lines: ["The Union sends three divisions to Calais. Solidarity is not a word, it is a timetable.", "ok", "rehost?"],
      },
    ],
  },
  {
    id: "990000000000000003",
    mode: "Historical (Vanilla)",
    name: "Historical #77 — Vanilla 1936",
    daysAgo: 9,
    summary:
      "A largely historical game: Germany took Poland in two weeks and France held the Maginot line until Belgium fell. " +
      "Japan's push into Southeast Asia brought the United States in a year earlier than history.",
    players: [
      {
        member: 3,
        tag: "GER",
        nation: "German Reich",
        creativity: 5,
        share: 0.6,
        summary: "Short in-character updates between operations.",
        lines: ["The Wehrmacht marches. Danzig is German again.", "Fall Gelb begins at dawn.", "speed up"],
      },
      {
        member: 6,
        tag: "JAP",
        nation: "Japan",
        creativity: 6,
        share: 0.72,
        summary: "A few good imperial proclamations around the southern push.",
        lines: [
          "The Imperial Government announces the Greater East Asia Co-Prosperity Sphere: Asia for the Asians.",
          "Our fleet sails south. The oil of the Indies will not be denied to the Empire of the Rising Sun.",
        ],
      },
      { member: 12, tag: "ITA", nation: "Italy", creativity: 2, share: 0.1, summary: "", lines: ["p"] },
    ],
  },
];

function buildLog(sample: Sample, members: ReturnType<typeof demoDirectory>): { filename: string; content: string }[] {
  const speaker = (player: SamplePlayer) => `${player.tag}${members[player.member]?.display_name ?? "Player"}`;
  const opening = LOBBY.map((line, index) => `${speaker(sample.players[index % sample.players.length])}: ${line}`);
  const body: string[] = [];
  const longest = Math.max(...sample.players.map((player) => player.lines.length));
  for (let round = 0; round < longest; round += 1) {
    for (const player of sample.players) {
      if (player.lines[round]) body.push(`${speaker(player)}: ${player.lines[round]}`);
    }
  }
  if (!sample.rehostAfter) return [{ filename: "game.txt", content: [...opening, ...body].join("\n") }];
  return [
    { filename: "game_part1.txt", content: [...opening, ...body.slice(0, sample.rehostAfter)].join("\n") },
    { filename: "game_part2_after_rehost.txt", content: [`${speaker(sample.players[0])}: rehost done, same checksum`, ...body.slice(sample.rehostAfter)].join("\n") },
  ];
}

function analysisOf(sample: Sample, members: ReturnType<typeof demoDirectory>, at: number): Record<string, unknown> {
  return {
    version: 3,
    at,
    merit_enabled: true,
    rules: DEFAULT_AI_RULES,
    game_summary: sample.summary,
    players: sample.players.map((player) => {
      const words = player.lines.join(" ").split(/\s+/).filter(Boolean).length * 40;
      const meaningful = Math.round(words * player.share);
      const lowEffort = player.share < 0.3;
      const reward = words < 80 ? { commends: 0, merit: 0, why: "No real roleplay in the log." } : aiReward(meaningful, player.creativity, 0, lowEffort, true);
      const status = words < 80 ? "no_rp" : reward.commends || reward.merit ? "rewarded" : "minimal";
      return {
        tag: player.tag,
        nation: player.nation,
        user_id: members[player.member]?.discord_id ?? null,
        role: "MAIN",
        name: null,
        lines: player.lines.length,
        words,
        meaningful_words: meaningful,
        in_character_share: player.share,
        creativity: player.creativity,
        toxicity: 0,
        low_effort: lowEffort,
        left_early: false,
        graded: true,
        summary: player.summary,
        snippets: player.lines.filter((line) => line.split(" ").length > 6).slice(0, 2),
        reward,
        status,
      };
    }),
  };
}

export function demoRpGames(): RawRpGame[] {
  const members = demoDirectory();
  const now = Math.floor(Date.now() / 1000);
  const samples = SAMPLES.map((sample): RawRpGame => {
    const ts = now - sample.daysAgo * 86_400;
    seedDemoChatLog(
      sample.id,
      buildLog(sample, members).map((file, index) => ({ ...file, uploaded_at: ts + 4 * 3600 + index * 1800 })),
    );
    const analysis = analysisOf(sample, members, ts + 5 * 3600);
    return {
      id: sample.id,
      keys: [sample.id],
      mode: sample.mode,
      name: sample.name,
      ts,
      host_id: members[0]?.discord_id ?? null,
      guild_id: HOME_GUILD_ID,
      analysis,
      // The top player's reward was already given by the host.
      given: { [String(members[sample.players[0].member]?.discord_id)]: { kind: "commend", amount: 1, by: members[0]?.discord_id, at: ts } },
    };
  });
  // Preview games a host graded on the Games page.
  const graded = demoControlRaw()
    .filter((raw) => obj(raw.data.ai_analysis).at)
    .map(
      (raw): RawRpGame => ({
        id: raw.storage_key,
        keys: [raw.storage_key, String(raw.data.lobby_thread_id ?? ""), String(raw.data.original_thread_id ?? "")].filter(Boolean),
        mode: raw.mode ?? "Roleplay",
        name: (raw.thread_name ?? raw.mode ?? "Game").replace(/\s*Reservations\s*$/i, ""),
        ts: Number(raw.start_timestamp) || now,
        host_id: raw.host_id ?? null,
        guild_id: raw.guild_id || HOME_GUILD_ID,
        analysis: obj(raw.data.ai_analysis),
        given: obj(raw.data.ai_rewards_given),
      }),
    );
  return [...graded, ...samples];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
