"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// The draft room runs on live clocks and the map: browser only, like the live map.
const GGApp = dynamic(() => import("./GGApp"), {
  ssr: false,
  loading: () => <div className="min-h-screen w-full" style={{ background: "#0b0618" }} />,
});

export default function GGClient() {
  const params = useParams<{ slug: string }>();
  return <GGApp slug={params.slug} />;
}
