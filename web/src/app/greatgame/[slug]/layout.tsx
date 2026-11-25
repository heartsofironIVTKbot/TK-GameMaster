import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brush, digit } from "../fonts";
import "./greatgame.css";

export const metadata: Metadata = {
  title: "The Great Game 2026 · GameMaster",
  description: "The Great Game 2026 draft room: players, casters and organizers only.",
  robots: { index: false, follow: false },
};

export default function GreatGameLayout({ children }: { children: ReactNode }) {
  return <div className={`${brush.variable} ${digit.variable}`}>{children}</div>;
}
