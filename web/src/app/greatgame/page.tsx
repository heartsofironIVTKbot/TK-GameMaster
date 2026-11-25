import type { Metadata } from "next";
import { Suspense } from "react";
import GGFront from "@/components/greatgame/front/GGFront";
import { brush, digit } from "./fonts";
import "./front.css";

export const metadata: Metadata = {
  title: "The Great Game 2026 · Road to 56",
  description: "The Great Game 2026: seven teams of four, drafted live on stream with provably fair draws. Road to 56.",
  // Not indexed until the event is announced on its own terms (flip when ready).
  robots: { index: false, follow: false },
};

/** /greatgame: the event's public front page (components/greatgame/front). */
export default function GreatGameFrontPage() {
  return (
    <div className={`${brush.variable} ${digit.variable}`}>
      {/* The page reads the clock (countdowns), so it renders on each visit, not at build time. */}
      <Suspense fallback={<div className="ggf" />}>
        <GGFront />
      </Suspense>
    </div>
  );
}
