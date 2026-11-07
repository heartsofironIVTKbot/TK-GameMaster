import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import DiscordLab from "@/components/landing/DiscordLab";

// A Discord channel for the front page's calendar tour: dev only, never linked.
export const metadata: Metadata = {
  title: "Discord lab · GameMaster",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<div className="h-screen w-full bg-[#313338]" />}>
      <DiscordLab />
    </Suspense>
  );
}
