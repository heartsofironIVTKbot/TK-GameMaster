"use client";

import { CalendarCheck, Download, Gavel, Lock } from "lucide-react";
import HostGate, { GateMessage, GateScreen } from "@/components/schedule/HostGate";
import AuditApp from "./AuditApp";

export default function AuditPage() {
  return (
    <HostGate
      returnPath="/audit"
      page="audit"
      title="Audit log"
      intro="Every action on this server, in one searchable list."
      audience="For Host Management and server admins."
      features={[
        { icon: CalendarCheck, title: "Reservations and roster moves", text: "Who reserved, dropped or moved which nation, and when." },
        { icon: Gavel, title: "Moderation and games", text: "Commends, warnings, bans, and every game started, ended or cancelled." },
        { icon: Download, title: "Search and export", text: "Filter by player, game or day, and download what you see." },
      ]}
      area="the Audit log"
    >
      {(host) =>
        host.is_staff ? (
          <AuditApp host={host} />
        ) : (
          <GateScreen page="audit" title="Audit log">
            <GateMessage icon={Lock} title="Host Management only" text="The audit log is for Host Management and server admins." />
          </GateScreen>
        )
      }
    </HostGate>
  );
}
