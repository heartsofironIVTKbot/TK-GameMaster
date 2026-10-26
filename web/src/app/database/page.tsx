import type { Metadata } from "next";
import DatabasePage from "@/components/database/DatabasePage";

export const metadata: Metadata = {
  title: "Database · GameMaster",
  description: "Search players and manage commends, Merit, warnings, game bans and Dishonored.",
};

export default function Page() {
  return <DatabasePage />;
}
