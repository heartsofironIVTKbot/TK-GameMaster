import type { Metadata } from "next";
import ProfileApp from "@/components/profile/ProfileApp";

export const metadata: Metadata = {
  title: "My profile · GameMaster",
  description: "Your games, attendance, commends, warnings, Merit, Hearts of Valor and roles.",
};

export default function Page() {
  return <ProfileApp />;
}
