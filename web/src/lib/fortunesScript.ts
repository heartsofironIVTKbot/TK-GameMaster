/**
 * Fortunes of War: the host's script for the submod (docs/casino-integration.md,
 * step 7). One `TAG = { add_ideas = <card> }` line per nation with a drawn card,
 * inside an on_startup effect (the bot's old _build_fortunes_script). A card
 * still waiting for keep / redraw counts, as the bot's auto-lock did. When two
 * players share a tag (a major and its co-op), the main holder's card wins.
 */

export interface FortunesDrawRow {
  user_id: string;
  name: string;
  nation: string | null;
  tag: string | null;
  /** 3 = main nation, 2 = co-op, 0 = not on the board. */
  priority: number;
  state: "new" | "dealt" | "pending" | "locked";
  card: string | null;
  card_name: string | null;
  redraws_used: number;
  max_redraws: number;
}

export interface FortunesScript {
  /** Paste-ready HOI4 script, or null when nobody has a card yet. */
  script: string | null;
  /** Cards left out, and why (shown to the host, not in the script). */
  skipped: string[];
}

const hasCard = (row: FortunesDrawRow) => Boolean(row.card) && (row.state === "pending" || row.state === "locked");

export function buildFortunesScript(rows: readonly FortunesDrawRow[]): FortunesScript {
  const skipped: string[] = [];
  const byTag = new Map<string, FortunesDrawRow>();
  for (const row of rows.filter(hasCard)) {
    if (!row.nation) {
      skipped.push(`${row.name} (${row.card_name ?? row.card}): not on the board`);
      continue;
    }
    if (!row.tag || !/^[A-Z0-9]{3}$/.test(row.tag)) {
      skipped.push(`${row.name} (${row.nation}): no HOI4 tag known for this nation`);
      continue;
    }
    const held = byTag.get(row.tag);
    if (!held) {
      byTag.set(row.tag, row);
      continue;
    }
    const [keep, drop] = row.priority > held.priority ? [row, held] : [held, row];
    byTag.set(row.tag, keep);
    skipped.push(`${drop.name} (${drop.nation}): ${row.tag} already gets ${keep.name}'s card`);
  }
  if (byTag.size === 0) return { script: null, skipped };
  const lines = [...byTag.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, row]) => `        ${tag} = { add_ideas = ${row.card} }`);
  return { script: `on_startup = {\n    effect = {\n${lines.join("\n")}\n    }\n}`, skipped };
}
