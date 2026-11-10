/**
 * A major's co-op players move up when its main player leaves (unreserves or
 * switches on the map): the first co-op becomes the main player and the
 * others close the gap ("_coop", "_coop_2", ...). The bot applies the same
 * rule to its own changes (bot.py.py _promote_coops). Client-safe, pure.
 */

export interface SlotMove {
  user_id: string;
  from: string;
  to: string;
}

const coopIndex = (key: string): number => {
  const rest = key.split("_coop", 2)[1]?.replace(/^_+/, "") ?? "";
  return /^\d+$/.test(rest) ? Number(rest) : 1;
};

const coopKey = (base: string, index: number) => (index === 1 ? `${base}_coop` : `${base}_coop_${index}`);

/**
 * The moves that close up the co-op slots of these nations, given the slots
 * still taken (slot → user) after the main left.
 */
export function coopPromotions(taken: ReadonlyMap<string, string>, nations: readonly string[]): SlotMove[] {
  const moves: SlotMove[] = [];
  for (const base of new Set(nations)) {
    if (!base || base.startsWith("_FILL_") || base.includes("_coop")) continue;
    const keys = [...taken.keys()]
      .filter((key) => key.includes("_coop") && key.split("_coop", 1)[0] === base)
      .sort((a, b) => coopIndex(a) - coopIndex(b));
    if (keys.length === 0) continue;
    const targets = taken.has(base) ? keys.map((_, i) => coopKey(base, i + 1)) : [base, ...keys.slice(1).map((_, i) => coopKey(base, i + 1))];
    keys.forEach((key, i) => {
      if (key !== targets[i]) moves.push({ user_id: String(taken.get(key)), from: key, to: targets[i] });
    });
  }
  return moves;
}
