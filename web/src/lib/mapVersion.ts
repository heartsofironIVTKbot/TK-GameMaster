/**
 * The URL to fetch a map file from. Map files are cached for a year
 * (next.config.ts); the version is a hash of all of them, so an updated map
 * gets a new URL and nobody keeps an old one.
 */
export function versionedMapUrl(url: string): string {
  const version = process.env.NEXT_PUBLIC_MAP_VERSION;
  return version ? `${url}?v=${version}` : url;
}
