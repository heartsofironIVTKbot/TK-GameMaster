"use client";

import { useSearchParams } from "next/navigation";
import GameSetupApp from "./GameSetupApp";
import HostGate from "./HostGate";

/**
 * /schedule/new?date=YYYY-MM-DD — set up a game on the day picked on the
 * calendar. /schedule/edit?slot=<id> — edit an existing game.
 */
export default function ScheduleSetupPage({ mode }: { mode: "new" | "edit" }) {
  const params = useSearchParams();
  const date = mode === "new" ? params.get("date") : null;
  const slot = mode === "edit" ? params.get("slot") : null;
  const rawPreset = mode === "new" ? params.get("preset") : null;
  const preset = rawPreset && /^[0-9a-f]{32}$/.test(rawPreset) ? rawPreset : null;
  const query = new URLSearchParams();
  if (date) query.set("date", date);
  if (slot) query.set("slot", slot);
  if (preset) query.set("preset", preset);
  const search = query.toString() ? `?${query.toString()}` : "";
  return (
    <HostGate returnPath={`/schedule/${mode}${search}`}>
      {(host) => <GameSetupApp host={host} initialDate={date} editSlotId={slot} initialPresetId={preset} />}
    </HostGate>
  );
}
