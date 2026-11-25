"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// The replay plays the draft room on a virtual clock with the map: browser only, like the room.
const GGReplay = dynamic(() => import("./GGReplay"), {
  ssr: false,
  loading: () => <div className="min-h-screen w-full" style={{ background: "#0b0618" }} />,
});

export default function GGReplayClient() {
  const params = useParams<{ slug: string }>();
  return <GGReplay slug={params.slug} />;
}
