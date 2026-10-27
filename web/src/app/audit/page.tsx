import type { Metadata } from "next";
import AuditPage from "@/components/audit/AuditPage";

export const metadata: Metadata = {
  title: "Audit log · GameMaster",
  description: "Every recorded action on the server — who did what, and when.",
};

export default function Page() {
  return <AuditPage />;
}
