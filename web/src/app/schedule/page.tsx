import type { Metadata } from "next";
import ScheduleCalendarPage from "@/components/schedule/ScheduleCalendarPage";

export const metadata: Metadata = {
  title: "Host Calendar · GameMaster",
  description: "Schedule HOI4 games on the GameMaster board.",
};

export default function Page() {
  return <ScheduleCalendarPage />;
}
