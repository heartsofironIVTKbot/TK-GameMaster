"use client";

import { Copy, Layers, ScrollText } from "lucide-react";
import HostGate from "@/components/schedule/HostGate";
import PresetsApp from "./PresetsApp";

export default function PresetsPage() {
  return (
    <HostGate
      returnPath="/presets"
      page="presets"
      title="Game Presets"
      intro="Save a mode's setup once, and load it for every game."
      features={[
        { icon: Layers, title: "Nation groups and locks", text: "Who can reserve which nations." },
        { icon: ScrollText, title: "Rules and mods", text: "Kept with the preset and posted with the game." },
        { icon: Copy, title: "GameMaster's presets", text: "Start from a ready one and save your own copy." },
      ]}
      area="the Presets page"
    >
      {(host) => <PresetsApp host={host} />}
    </HostGate>
  );
}
