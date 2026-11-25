import { Kaushan_Script, Orbitron } from "next/font/google";

// The event's poster look: brush script for the wordmark, a digital face for
// clocks. Big Shoulders and Public Sans come from the site's root layout.
// Shared by the draft room ([slug]/layout.tsx) and the front page (page.tsx).
export const brush = Kaushan_Script({ variable: "--font-gg-brush", subsets: ["latin"], weight: "400" });
export const digit = Orbitron({ variable: "--font-gg-digit", subsets: ["latin"], weight: ["600", "800"] });
