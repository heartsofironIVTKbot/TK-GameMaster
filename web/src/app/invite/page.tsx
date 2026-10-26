import type { Metadata } from "next";
import InviteLanding from "@/components/servers/InviteLanding";

export const metadata: Metadata = {
  title: "Add GameMaster · Discord bot for HOI4 multiplayer",
  description: "Add GameMaster to your Discord server: scheduling, reservations, attendance, moderation and host teams for Hearts of Iron IV multiplayer.",
};

export default function Page() {
  return <InviteLanding />;
}
