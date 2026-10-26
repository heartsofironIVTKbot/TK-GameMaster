import type { Metadata } from "next";
import PresetsPage from "@/components/presets/PresetsPage";

export const metadata: Metadata = {
  title: "Presets · GameMaster",
  description: "Game mode presets for this server, and the public library shared by every server.",
};

export default function Page() {
  return <PresetsPage />;
}
