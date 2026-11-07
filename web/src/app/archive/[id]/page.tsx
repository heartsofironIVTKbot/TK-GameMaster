import type { Metadata } from "next";
import { Suspense } from "react";
import ArchiveGame from "@/components/archive/ArchiveGame";

export const metadata: Metadata = {
  title: "Game · Archive · GameMaster",
  description: "One game's record: every nation, who played it, who came, what they got and how the players rated it.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" />}>
      <ArchiveGame />
    </Suspense>
  );
}
