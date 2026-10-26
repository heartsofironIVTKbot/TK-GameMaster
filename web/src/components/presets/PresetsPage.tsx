"use client";

import HostGate from "@/components/schedule/HostGate";
import PresetsApp from "./PresetsApp";

export default function PresetsPage() {
  return (
    <HostGate
      returnPath="/presets"
      icon="🧩"
      title="Game Presets"
      intro="Save a mode's nation groups, nation locks, rules and mods as a preset, and load it whenever you schedule a game. Log in with the Discord account you host with."
      area="the Presets page"
    >
      {(host) => <PresetsApp host={host} />}
    </HostGate>
  );
}
