import type { Metadata } from "next";
import { Suspense } from "react";
import RoleplayGame from "@/components/roleplay/RoleplayGame";

export const metadata: Metadata = {
  title: "Game roleplay · GameMaster",
  description: "A Hearts of Iron IV game's story, every player's roleplay and the full chat log.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="gm-backdrop min-h-screen w-full" />}>
      <RoleplayGame />
    </Suspense>
  );
}
