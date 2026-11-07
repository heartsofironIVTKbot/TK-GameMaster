import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import TrailerStage from "@/components/trailer/TrailerStage";

// The trailer's stage: preview with the track, and what scripts/trailer/render.mjs records. Dev only.
export const metadata: Metadata = {
  title: "Trailer · GameMaster",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <TrailerStage />
    </Suspense>
  );
}
