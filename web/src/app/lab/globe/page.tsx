import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GlobeLab from "@/components/landing/GlobeLab";

// Front-page globe prototype: dev only, not linked from any menu.
export const metadata: Metadata = {
  title: "Globe lab · GameMaster",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GlobeLab />;
}
