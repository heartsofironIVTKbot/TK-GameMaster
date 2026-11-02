import type { Metadata } from "next";
import { Suspense } from "react";
import RoleplayArchive from "@/components/roleplay/RoleplayArchive";

export const metadata: Metadata = {
  title: "Roleplay Archive · GameMaster",
  description: "Every graded Hearts of Iron IV game's story and its best roleplay, searchable by player, nation and line.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="gm-backdrop min-h-screen w-full" />}>
      <RoleplayArchive />
    </Suspense>
  );
}
