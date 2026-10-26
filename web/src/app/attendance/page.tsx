import type { Metadata } from "next";
import AttendancePage from "@/components/attendance/AttendancePage";

export const metadata: Metadata = {
  title: "Attendance · GameMaster",
  description: "Live attendance for started games: voice samples, who's at risk, host corrections and the full audit log.",
};

export default function Page() {
  return <AttendancePage />;
}
