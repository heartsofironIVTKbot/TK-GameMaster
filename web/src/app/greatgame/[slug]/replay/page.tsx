import type { Metadata } from "next";
import { Suspense } from "react";
import GGReplayClient from "@/components/greatgame/GGReplayClient";

export const metadata: Metadata = {
  title: "Replay · The Great Game 2026 · GameMaster",
  description: "The Great Game 2026 draft, move by move, with every draw checked: players, casters and organizers only.",
  robots: { index: false, follow: false },
};

/** /greatgame/<event>/replay: the night again, move by move (components/greatgame/GGReplay.tsx, browser only). */
export default function GreatGameReplayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" style={{ background: "#0b0618" }} />}>
      <GGReplayClient />
    </Suspense>
  );
}
