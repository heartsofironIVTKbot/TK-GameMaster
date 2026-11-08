import type { Metadata } from "next";
import { Suspense } from "react";
import CasinoGate from "@/components/casino/CasinoGate";

export const metadata: Metadata = {
  title: "Casino · GameMaster",
  description: "Your way into the Casino for this game.",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-screen w-full" aria-busy="true" />}>
      <CasinoGate />
    </Suspense>
  );
}
