import type { Metadata } from "next";
import { Suspense } from "react";
import ScheduleSetupPage from "@/components/schedule/ScheduleSetupPage";

export const metadata: Metadata = {
  title: "Edit Game · GameMaster",
  description: "Change a game on the GameMaster calendar.",
};

export default function Page() {
  return (
    <Suspense
      fallback={<main className="gm-backdrop min-h-screen w-full" aria-busy="true" />}
    >
      <ScheduleSetupPage mode="edit" />
    </Suspense>
  );
}
