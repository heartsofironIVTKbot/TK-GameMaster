"use client";

import HostGate from "@/components/schedule/HostGate";
import GamesApp from "./GamesApp";

export default function GamesPage() {
  return (
    <HostGate
      returnPath="/games"
      icon="🎮"
      title="Games"
      intro="Start, end and cancel your games from the web and watch the bot do it step by step. Log in with the Discord account you host with."
      area="the Games page"
    >
      {(host) => <GamesApp host={host} />}
    </HostGate>
  );
}
