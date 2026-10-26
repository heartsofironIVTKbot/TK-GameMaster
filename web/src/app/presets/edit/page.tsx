import type { Metadata } from "next";
import { Suspense } from "react";
import PresetEditorPage from "@/components/presets/PresetEditorPage";

export const metadata: Metadata = {
  title: "Edit Preset · GameMaster",
  description: "Change a game mode preset.",
};

export default function Page() {
  return (
    <Suspense fallback={<main className="gm-backdrop min-h-screen w-full" aria-busy="true" />}>
      <PresetEditorPage kind="edit" />
    </Suspense>
  );
}
