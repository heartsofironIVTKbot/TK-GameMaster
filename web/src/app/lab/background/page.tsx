import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SkyLab from "@/components/site/SkyLab";

// The site background's night sky, layer by layer: dev only, never linked.
export const metadata: Metadata = {
  title: "Background lab · GameMaster",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SkyLab />;
}
