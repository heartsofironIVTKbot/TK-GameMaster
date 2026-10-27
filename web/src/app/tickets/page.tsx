import type { Metadata } from "next";
import TicketsApp from "@/components/tickets/TicketsApp";

export const metadata: Metadata = {
  title: "Tickets · GameMaster",
  description: "Read your closed tickets, and the ones your role handles.",
};

export default function Page() {
  return <TicketsApp />;
}
