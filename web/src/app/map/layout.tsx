import type { Metadata } from "next";
import type { ReactNode } from "react";

// The live reservation map (the page itself is a client component).
export const metadata: Metadata = {
  title: "Map · GameMaster",
  description: "Reserve your nation for the next Hearts of Iron IV game on the live map.",
};

export default function MapLayout({ children }: { children: ReactNode }) {
  return children;
}
