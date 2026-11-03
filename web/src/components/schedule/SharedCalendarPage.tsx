"use client";

import HostGate from "./HostGate";
import SharedCalendarApp from "./SharedCalendarApp";

export default function SharedCalendarPage() {
  return <HostGate returnPath="/schedule/shared">{(host) => <SharedCalendarApp host={host} />}</HostGate>;
}
