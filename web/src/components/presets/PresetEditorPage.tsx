"use client";

import { useSearchParams } from "next/navigation";
import { Copy, Layers, ScrollText } from "lucide-react";
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
      page="presets"
      title="Game Presets"
      intro="Save a mode's setup once, and load it for every game."
      features={[
        { icon: Layers, title: "Nation groups and locks", text: "Who can reserve which nations." },
        { icon: ScrollText, title: "Rules and mods", text: "Kept with the preset and posted with the game." },
        { icon: Copy, title: "GameMaster's presets", text: "Start from a ready one and save your own copy." },
      ]}
      area="the preset maker"
    >
      {(host) => <PresetMakerApp key={presetId ?? "new"} host={host} presetId={presetId} initialMode={mode} />}
    </HostGate>
  );
}
