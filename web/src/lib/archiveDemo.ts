import type { RawArchiveGame } from "@/lib/archive";
import { RATING_WINDOW_SEC } from "@/lib/archiveTypes";
import { demoDirectory } from "@/lib/liveDemo";
import { DEMO_HOST } from "@/lib/scheduleStore";

/**
 * Preview-mode games for the archive (no database). The first three share
 * their ids with the roleplay archive's demo games, so "Read the roleplay"
 * opens a real demo page. Ratings live in memory, so the Rate this game box
 * can be tried.
 */

type Layout = [string, [string | null, string[]][]][];

const ROAD_TO_56: Layout = [
  ["Majors", [[null, ["Germany", "Soviet Union", "United Kingdom", "France", "Italy", "Japan", "U.S.A"]]]],
  ["Europe", [[null, ["Poland", "Spain", "Hungary", "Romania", "Yugoslavia", "Sweden", "Finland", "Greece"]]]],
  ["Asia", [[null, ["China", "Manchukuo", "Siam", "Mongolia"]]]],
  ["Americas", [[null, ["Canada", "Brazil", "Argentina", "Mexico"]]]],
];

const HISTORICAL: Layout = [
  ["Axis", [["Majors", ["Germany", "Italy", "Japan"]], ["Minors", ["Hungary", "Romania", "Bulgaria"]]]],
  ["Allies", [["Majors", ["United Kingdom", "France", "U.S.A"]], ["Minors", ["Canada", "Australia", "Poland"]]]],
  ["Comintern", [["Majors", ["Soviet Union"]], ["Minors", ["Mongolia"]]]],
];

interface DemoState {
  games: RawArchiveGame[];
}

const globalDemo = globalThis as unknown as { __gmArchiveDemo?: DemoState };

function build(): DemoState {
  const people = demoDirectory().map((member) => member.discord_id);
  const me = DEMO_HOST.discord_id;
  const p = (index: number) => people[index % people.length];
  const now = Math.floor(Date.now() / 1000);
  const hour = 3600;
  const day = 24 * hour;

  const game = (
    id: string,
    name: string,
    mode: string,
    ts: number,
    options: {
      status: "active" | "ended" | "cancelled";
      layout: Layout;
      reservations: Record<string, string>;
      present?: string[];
      dropped?: string[];
      late?: string[];
      actions?: Record<string, Record<string, number>>;
      ratings?: number[];
      evaluated?: boolean;
      endedAt?: number;
      graded?: boolean;
      samplePresent?: string[] | null;
      started?: boolean;
    },
  ): RawArchiveGame => {
    const ratings: Record<string, number> = {};
    (options.ratings ?? []).forEach((stars, index) => {
      ratings[`7${String(index).padStart(17, "0")}`] = stars;
    });
    const present = options.present ?? Object.values(options.reservations);
    return {
      id,
      keys: [id],
      guild_id: "1",
      mode,
      name,
      ts,
      host_id: me,
      status: options.status,
      started: options.started ?? true,
      start_initiated_at: 0,
      start_failed_at: 0,
      started_at: ts + 300,
      ended_at: options.endedAt ?? (options.status === "ended" ? ts + 5 * hour : 0),
      reservations: options.reservations,
      present_ids: options.status === "ended" ? present : [],
      dropped_out: options.dropped ?? [],
      late_join: options.late ?? [],
      data: { game_action_counts: options.actions ?? {} },
      ratings,
      eligible: options.status === "ended" ? [...present, me] : null,
      hosting_evaluated: options.evaluated ?? false,
      layout: options.layout,
      preset_layout: null,
      graded: options.graded ?? false,
      sample_present: options.samplePresent ?? null,
    };
  };

  // One nation each (a co-op on Germany), the demo host joining late as Brazil.
  const big: Record<string, string> = {
    Germany: p(1), Germany_coop: p(12), "Soviet Union": p(2), "United Kingdom": p(3), France: p(4), Italy: p(5),
    Japan: p(6), "U.S.A": p(7), Poland: p(8), Spain: p(9), Hungary: p(10), Romania: p(11), China: p(13),
    Brazil: me,
  };
  const bigUsers = Object.values(big);

  return {
    games: [
      // Running now: the live post links here.
      game("910000000000000001", "Roleplay #88, Road to 56", "Roleplay", now - 2 * hour, {
        status: "active",
        layout: ROAD_TO_56,
        reservations: { ...big },
        samplePresent: bigUsers.slice(0, 10),
        late: ["Brazil"],
      }),
      // Ended three hours ago: rating is open, and the demo host played it.
      game("990000000000000002", "Kaiserreich FFA #48, Second Weltkrieg", "Kaiserreich (FFA)", now - 8 * hour, {
        status: "ended",
        layout: ROAD_TO_56,
        reservations: { Germany: me, "Soviet Union": p(2), France: p(4), Italy: p(5), Poland: p(8), Spain: p(9), China: p(13) },
        present: [me, p(2), p(4), p(5), p(8), p(13)],
        actions: { [p(2)]: { commend: 1 }, [p(5)]: { merit: 2 } },
        ratings: [5, 4, 5, 4],
        endedAt: now - 3 * hour,
        graded: true,
      }),
      game("990000000000000001", "Roleplay #87, Road to 56", "Roleplay", now - 2 * day, {
        status: "ended",
        layout: ROAD_TO_56,
        reservations: { ...big },
        present: bigUsers.filter((user) => ![p(4), p(10), p(9)].includes(user)),
        dropped: [p(9)],
        late: ["Brazil"],
        actions: {
          [p(1)]: { commend: 2 },
          [p(2)]: { commend: 1, merit: 1 },
          [p(3)]: { merit: 1 },
          [p(4)]: { warn: 1 },
          [p(5)]: { commend: 1 },
          [p(8)]: { commend: 1 },
          [p(10)]: { warn: 1, ban: 1 },
          [p(12)]: { merit: 1 },
          [p(13)]: { commend: 1 },
          [p(11)]: { dishonored: 1 },
        },
        ratings: [5, 5, 4, 5, 4, 4, 5, 3, 5, 4, 5, 5, 4, 2, 5, 4, 5, 5, 4, 5, 3],
        evaluated: true,
        graded: true,
      }),
      game("990000000000000003", "Historical #77, Vanilla 1936", "Historical (Vanilla)", now - 4 * day, {
        status: "ended",
        layout: HISTORICAL,
        reservations: { Germany: p(1), Italy: p(5), Japan: p(6), "United Kingdom": p(3), France: p(4), "U.S.A": p(7), "Soviet Union": p(2), Hungary: p(10), Romania: p(11), Poland: p(8) },
        present: [p(1), p(5), p(6), p(3), p(7), p(2), p(8)],
        actions: { [p(4)]: { warn: 1 }, [p(10)]: { warn: 1 }, [p(11)]: { dishonored: 1 } },
        ratings: [3, 2, 4, 3, 2, 3, 3, 4, 2, 3, 3],
        evaluated: true,
        graded: true,
      }),
      game("920000000000000004", "Roleplay #86, Road to 56", "Roleplay", now - 6 * day, {
        status: "ended",
        layout: ROAD_TO_56,
        reservations: { ...big },
        dropped: [p(12)],
        late: ["Brazil"],
        present: bigUsers.filter((user) => user !== p(12)),
        actions: { [p(1)]: { commend: 3 }, [p(2)]: { commend: 2 }, [p(6)]: { merit: 2 }, [p(7)]: { commend: 1, merit: 1 } },
        ratings: [4, 4, 5, 4, 3, 5, 4, 4, 5, 4, 4, 5, 4, 3],
        evaluated: true,
      }),
      game("920000000000000005", "Historical #76, Vanilla 1936", "Historical (Vanilla)", now - 8 * day, {
        status: "ended",
        layout: HISTORICAL,
        reservations: { Germany: p(1), Italy: p(5), "United Kingdom": p(3), France: p(4), "Soviet Union": p(2), Hungary: p(10) },
        actions: { [p(3)]: { merit: 1 } },
        ratings: [4, 3, 4, 4],
        evaluated: true,
      }),
      game("920000000000000006", "Kaiserreich FFA #47", "Kaiserreich (FFA)", now - 9 * day, {
        status: "cancelled",
        layout: ROAD_TO_56,
        reservations: { Germany: p(1), France: p(4), Italy: p(5) },
      }),
    ],
  };
}

function state(): DemoState {
  globalDemo.__gmArchiveDemo ??= build();
  return globalDemo.__gmArchiveDemo;
}

export function demoArchiveGames(): RawArchiveGame[] {
  return state().games;
}

/** Preview-mode answer to a "feedback_rate" request (the bot's job live). */
export function applyDemoRating(
  payload: Record<string, unknown>,
  userId: string,
): { status: "done" | "error"; result: Record<string, unknown> | null; error: string | null } {
  const game = state().games.find((entry) => entry.keys.includes(String(payload.game_id ?? "")));
  const stars = Math.round(Number(payload.stars));
  if (!game) return { status: "error", result: null, error: "❌ That game is no longer in the archive." };
  if (!(stars >= 1 && stars <= 5)) return { status: "error", result: null, error: "❌ Pick 1 to 5 stars." };
  const now = Math.floor(Date.now() / 1000);
  if (game.status !== "ended" || game.hosting_evaluated || now >= game.ended_at + RATING_WINDOW_SEC) {
    return { status: "error", result: null, error: "❌ Rating for this game has closed." };
  }
  if (!(game.eligible ?? game.present_ids).includes(userId)) {
    return { status: "error", result: null, error: "❌ Only players who were counted present can rate this game." };
  }
  const first = !(userId in game.ratings);
  game.ratings[userId] = stars;
  return { status: "done", result: { rating: { stars, first, merit: first ? 1 : 0 } }, error: null };
}
