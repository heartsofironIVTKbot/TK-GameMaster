import type { Metadata } from "next";
import { Kaushan_Script, Orbitron } from "next/font/google";
import type { ReactNode } from "react";
import "./greatgame.css";

// The event's poster look: brush script for the wordmark, a digital face for
// clocks. Big Shoulders and Public Sans come from the site's root layout.
const brush = Kaushan_Script({ variable: "--font-gg-brush", subsets: ["latin"], weight: "400" });
const digit = Orbitron({ variable: "--font-gg-digit", subsets: ["latin"], weight: ["600", "800"] });

export const metadata: Metadata = {
  title: "The Great Game 2026 · GameMaster",
  description: "The Great Game 2026 draft room: players, casters and organizers only.",
  robots: { index: false, follow: false },
};

export default function GreatGameLayout({ children }: { children: ReactNode }) {
  return <div className={`${brush.variable} ${digit.variable}`}>{children}</div>;
}
