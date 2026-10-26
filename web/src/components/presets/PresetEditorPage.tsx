"use client";

import { useSearchParams } from "next/navigation";
import HostGate from "@/components/schedule/HostGate";
import PresetMakerApp from "./PresetMakerApp";

/** /presets/new[?mode=…] — make a preset. /presets/edit?id=<id> — change (or view) one. */
export default function PresetEditorPage({ kind }: { kind: "new" | "edit" }) {
  const params = useSearchParams();
  const id = kind === "edit" ? params.get("id") : null;
  const mode = kind === "new" ? params.get("mode") : null;
  const presetId = id && /^[0-9a-f]{32}$/.test(id) ? id : null;
  const query = presetId ? `?id=${presetId}` : mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return (
    <HostGate
      returnPath={`/presets/${kind}${query}`}
      icon="🧩"
      title="Game Presets"
      intro="Save a mode's nation groups, nation locks, rules and mods as a preset, and load it whenever you schedule a game. Log in with the Discord account you host with."
      area="the preset maker"
    >
      {(host) => <PresetMakerApp key={presetId ?? "new"} host={host} presetId={presetId} initialMode={mode} />}
    </HostGate>
  );
}
