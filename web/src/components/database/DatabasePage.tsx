"use client";

import HostGate from "@/components/schedule/HostGate";
import DatabaseApp from "./DatabaseApp";

export default function DatabasePage() {
  return (
    <HostGate
      returnPath="/database"
      icon="🗂️"
      title="Database"
      intro="Search every player's record and give or take commends, Merit, warnings, game bans and Dishonored. Log in with the Discord account you host with."
      area="the Database"
    >
      {(host) => <DatabaseApp host={host} />}
    </HostGate>
  );
}
