"use client";

import { History, Mic, PenLine } from "lucide-react";
import HostGate from "@/components/schedule/HostGate";
import AttendanceApp from "./AttendanceApp";

export default function AttendancePage() {
  return (
    <HostGate
      returnPath="/attendance"
      page="attendance"
      title="Attendance"
      intro="Follow attendance live while a game runs."
      features={[
        { icon: Mic, title: "Live voice tracking", text: "Who is in voice, who left, and for how long." },
        { icon: PenLine, title: "Fix what the bot got wrong", text: "Change a player's attendance before it's final." },
        { icon: History, title: "See who changed what", text: "Every correction, with the host who made it." },
      ]}
      area="Attendance"
    >
      {(host) => <AttendanceApp host={host} />}
    </HostGate>
  );
}
