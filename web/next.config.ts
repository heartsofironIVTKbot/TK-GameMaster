import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/** Changes whenever any map file does, so cached maps never go stale (see versionedMapUrl). */
function mapVersion(): string {
  const dir = path.join(process.cwd(), "public", "maps");
  const hash = createHash("sha256");
  for (const name of readdirSync(dir).sort()) hash.update(name).update(readFileSync(path.join(dir, name)));
  return hash.digest("hex").slice(0, 12);
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    NEXT_PUBLIC_MAP_VERSION: mapVersion(),
  },
  // The map moved from / to /map (the front page took /). Links already
  // posted in Discord (/?game=…) still land on the right game: the query
  // is passed through.
  async redirects() {
    return ["game", "gameId", "token", "offline"].map((key) => ({
      source: "/",
      has: [{ type: "query" as const, key }],
      destination: "/map",
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        // Fetched as /maps/<name>.geojson?v=<map version>: a new version is a new URL.
        source: "/maps/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Flags and portraits keep their names when redrawn, so only a day.
        source: "/:dir(assets|assets_[a-z0-9]+)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
