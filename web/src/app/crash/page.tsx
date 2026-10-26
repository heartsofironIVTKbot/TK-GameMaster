import type { Metadata } from "next";
import CrashReportApp from "@/components/crash/CrashReportApp";

export const metadata: Metadata = {
  title: "Report a crash · GameMaster",
  description: "Send your Hearts of Iron IV crash logs to the mod developers and earn Merit.",
};

export default function Page() {
  return <CrashReportApp />;
}
