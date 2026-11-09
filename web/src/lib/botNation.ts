import { canonicalName, nationMatchKeys } from "@/data/nationCategories";

/**
 * The bot's name for a map nation in one game mode. The map knows nations by
 * the scenario's names ("German Reich"), the bot by its own list for the mode
 * ("Germany"), and a reservation must use the bot's, or the bot refuses it
 * (Host Tool) and the same nation can be taken twice under two names.
 *
 * `slot` may be a co-op slot ("German Reich_coop", "…_coop_2"): the main
 * nation is translated and the suffix kept. Fillers and names the bot already
 * uses pass through; so does anything without a match (the bot then decides).
 */
export function botNationName(
  lists: { majors: readonly string[]; minors: readonly string[] } | null | undefined,
  tag: string | null | undefined,
  slot: string,
): string {
  if (!lists || slot.startsWith("_FILL_")) return slot;
  const cut = slot.indexOf("_coop");
  const base = cut >= 0 ? slot.slice(0, cut) : slot;
  const suffix = cut >= 0 ? slot.slice(cut) : "";
  const all = [...lists.majors, ...lists.minors];
  if (all.includes(base)) return slot;
  const keys = nationMatchKeys(tag ?? "", base, base);
  const found = all.find((name) => keys.has(canonicalName(name)));
  return found ? found + suffix : slot;
}
