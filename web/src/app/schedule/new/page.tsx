import type { Metadata } from "next";
import { Suspense } from "react";
import ScheduleSetupPage from "@/components/schedule/ScheduleSetupPage";

export const metadata: Metadata = {
  title: "Set Up Game · GameMaster",
  description: "Configure and schedule a game on the GameMaster board.",
};

export default function Page() {
  return (
    <Suspense
      fallback={<main className="gm-backdrop min-h-screen w-full" aria-busy="true" />}
    >
      <ScheduleSetupPage mode="new" />
    </Suspense>
  );
}
