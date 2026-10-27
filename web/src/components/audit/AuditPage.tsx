"use client";

import Link from "next/link";
import HostGate from "@/components/schedule/HostGate";
import { GLASS } from "@/components/schedule/ui";
import AuditApp from "./AuditApp";

export default function AuditPage() {
  return (
    <HostGate
      returnPath="/audit"
      icon="📜"
      title="Audit log"
      intro="Every action on this server — reservations, roster moves, moderation, games and settings — in one searchable list. For Host Management and server admins."
      area="the Audit log"
    >
      {(host) =>
        host.is_staff ? (
          <AuditApp host={host} />
        ) : (
          <div className="gm-backdrop flex min-h-screen items-center justify-center p-6 text-slate-100">
            <div className={`max-w-md rounded-3xl p-6 text-center ${GLASS}`}>
              <p className="text-3xl">📜</p>
              <h1 className="mt-2 text-lg font-black">Audit log</h1>
              <p className="mt-2 text-sm text-slate-300">Only Host Management can see the audit log.</p>
              <Link href="/" className="mt-4 inline-block text-xs font-bold text-amber-300 hover:underline">
                ← Back to the map
              </Link>
            </div>
          </div>
        )
      }
    </HostGate>
  );
}
