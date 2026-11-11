import type { Metadata } from "next";
import SystemServers from "@/components/system/SystemServers";

export const metadata: Metadata = {
  title: "All servers · GameMaster",
  description: "Every Discord server using GameMaster (GameMaster's owners only).",
  robots: { index: false },
};

export default function Page() {
  return <SystemServers />;
}
