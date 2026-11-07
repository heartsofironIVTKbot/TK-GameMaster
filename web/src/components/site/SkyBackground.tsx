"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Sky, type SkyOptions } from "./skyEngine";

/**
 * The night sky behind every page (Niko's pick, 2026-11-07: stars, a faint
 * green haze, a shooting star now and then; compare the rest at
 * /lab/background). Pages leave their background clear so it shows in the
 * margins and gaps; panels stay solid. The full-screen map and the two map
 * editors cover the screen, so the sky doesn't run there at all. Like the
 * front page's globe, it keeps moving even with reduced motion on.
 */

const SITE_SKY: Partial<SkyOptions> = {
  stars: true,
  haze: true,
  shooting: true,
  drift: false,
  satellites: false,
  grid: false,
  aurora: false,
};

const COVERED = [/^\/map(\/|$)/, /^\/schedule\/(new|edit)(\/|$)/, /^\/presets\/(new|edit)(\/|$)/, /^\/lab\//];

export default function SkyBackground() {
  const pathname = usePathname() ?? "/";
  const off = COVERED.some((pattern) => pattern.test(pathname));
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (off || !element) return undefined;
    const sky = new Sky(element, SITE_SKY);
    const fit = () => sky.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    sky.start();
    return () => {
      window.removeEventListener("resize", fit);
      sky.destroy();
    };
  }, [off]);

  if (off) return null;
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
