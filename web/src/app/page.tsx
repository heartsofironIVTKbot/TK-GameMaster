import type { Metadata } from "next";
import FrontPage from "@/components/landing/front/FrontPage";

// The public front page (components/landing/front). The live map is at /map;
// old /?game= links redirect there (next.config.ts).
export const metadata: Metadata = {
  title: "GameMaster · Hearts of Iron IV multiplayer, run on Discord",
  description:
    "GameMaster runs Hearts of Iron IV multiplayer communities on Discord: the game calendar, nation reservations on a live map, attendance, player records and an archive of every game.",
};

export default function Home() {
  return <FrontPage />;
}
