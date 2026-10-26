"use client";

import CalendarApp from "./CalendarApp";
import HostGate from "./HostGate";

export default function ScheduleCalendarPage() {
  return <HostGate returnPath="/schedule">{(host) => <CalendarApp host={host} />}</HostGate>;
}
