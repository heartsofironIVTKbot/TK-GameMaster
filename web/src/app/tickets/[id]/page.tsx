import type { Metadata } from "next";
import { Suspense } from "react";
import TicketView from "@/components/tickets/TicketView";

export const metadata: Metadata = {
  title: "Ticket · GameMaster",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="gm-backdrop min-h-screen w-full" />}>
      <TicketView />
    </Suspense>
  );
}
