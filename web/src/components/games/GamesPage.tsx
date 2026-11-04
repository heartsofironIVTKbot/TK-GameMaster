"use client";

import { Play, ScrollText, Users } from "lucide-react";
import HostGate from "@/components/schedule/HostGate";
import GamesApp from "./GamesApp";

export default function GamesPage() {
  return (
    <HostGate
      returnPath="/games"
      page="games"
      title="Games"
      intro="Run your games from the web."
      features={[
        { icon: Play, title: "Start, end and cancel", text: "And watch the bot do each step." },
        { icon: Users, title: "Players and messages", text: "The roster, the pings and the game's messages." },
        { icon: ScrollText, title: "Chat log and nations", text: "Upload the chat log and check the rules." },
      ]}
      area="the Games page"
    >
      {(host) => <GamesApp host={host} />}
    </HostGate>
  );
}
