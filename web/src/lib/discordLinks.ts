/** discord.com message / channel links → the Discord app (components/site/DiscordAppLinks.tsx). Client-safe. */

const CHANNEL_LINK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/([^?#]+)/i;

/** The app address for a discord.com channel / message link, else null. */
export function discordAppHref(href: string): string | null {
  const match = CHANNEL_LINK.exec(href);
  return match ? `discord://-/channels/${match[1]}` : null;
}
