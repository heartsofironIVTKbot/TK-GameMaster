import type { Metadata } from "next";
import { Suspense } from "react";
import PresetEditorPage from "@/components/presets/PresetEditorPage";

export const metadata: Metadata = {
  title: "New Preset · GameMaster",
  description: "Make a game mode preset: nation groups, nation locks, rules and mods.",
};

export default function Page() {
  return (
    <Suspense fallback={<main className="gm-backdrop min-h-screen w-full" aria-busy="true" />}>
      <PresetEditorPage kind="new" />
    </Suspense>
  );
}
