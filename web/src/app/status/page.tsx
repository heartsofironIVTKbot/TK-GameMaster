import type { Metadata } from "next";
import StatusPage from "@/components/status/StatusPage";

export const metadata: Metadata = {
  title: "Status · GameMaster",
  description: "Is GameMaster online? Uptime for the last 30 days and recent incidents.",
};

export default function Page() {
  return <StatusPage />;
}
