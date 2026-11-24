import { Suspense } from "react";
import GGClient from "@/components/greatgame/GGClient";

/** /greatgame/<event>: the Great Game draft room (components/greatgame/GGApp.tsx, browser only). */
export default function GreatGamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" style={{ background: "#0b0618" }} />}>
      <GGClient />
    </Suspense>
  );
}
