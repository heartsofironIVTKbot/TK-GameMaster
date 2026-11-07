import type { Metadata } from "next";
import { Suspense } from "react";
import ArchiveApp from "@/components/archive/ArchiveApp";

export const metadata: Metadata = {
  title: "Archive · GameMaster",
  description: "Every Hearts of Iron IV game on every GameMaster server: who played which nation, who came, what they got and how it was rated.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" />}>
      <ArchiveApp />
    </Suspense>
  );
}
