import type { Metadata } from "next";
import { Suspense } from "react";
import ServersPage from "@/components/servers/ServersPage";

export const metadata: Metadata = {
  title: "Servers · GameMaster",
  description: "Add GameMaster to your Discord server and set up its roles, channels, host branches and game modes.",
};

export default function Page() {
  return (
    <Suspense fallback={<main className="gm-backdrop min-h-screen w-full" aria-busy="true" />}>
      <ServersPage />
    </Suspense>
  );
}
