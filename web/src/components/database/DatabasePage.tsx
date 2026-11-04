"use client";

import { Gavel, Search, Star } from "lucide-react";
import HostGate from "@/components/schedule/HostGate";
import DatabaseApp from "./DatabaseApp";

export default function DatabasePage() {
  return (
    <HostGate
      returnPath="/database"
      page="database"
      title="Database"
      intro="Every player's record on your server."
      features={[
        { icon: Search, title: "Find any player", text: "Search by name or Discord ID and open their record." },
        { icon: Star, title: "Commends and Merit", text: "Reward good games, or redeem commends against warnings." },
        { icon: Gavel, title: "Warnings, bans and Dishonored", text: "With a reason, logged for Host Management." },
      ]}
      area="the Database"
    >
      {(host) => <DatabaseApp host={host} />}
    </HostGate>
  );
}
