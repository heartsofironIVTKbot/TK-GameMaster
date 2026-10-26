import type { Metadata } from "next";
import GamesPage from "@/components/games/GamesPage";

export const metadata: Metadata = {
  title: "Games · GameMaster",
  description: "Start, end and cancel games — with live progress — from the web.",
};

export default function Page() {
  return <GamesPage />;
}
