"use client";

import HostGate from "@/components/schedule/HostGate";
import AttendanceApp from "./AttendanceApp";

export default function AttendancePage() {
  return (
    <HostGate
      returnPath="/attendance"
      icon="🎯"
      title="Attendance"
      intro="Follow attendance live while a game runs, fix it when the bot got it wrong, and see exactly who changed what. Log in with the Discord account you host with."
      area="Attendance"
    >
      {(host) => <AttendanceApp host={host} />}
    </HostGate>
  );
}
