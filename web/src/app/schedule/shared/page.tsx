import type { Metadata } from "next";
import SharedCalendarPage from "@/components/schedule/SharedCalendarPage";

export const metadata: Metadata = {
  title: "Shared Calendar · GameMaster",
  description: "The games of every GameMaster server that shares its calendar.",
};

export default function Page() {
  return <SharedCalendarPage />;
}
