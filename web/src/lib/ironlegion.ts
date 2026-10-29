/**
 * IronLegion Steam verification (optional). A server can require it for every
 * game (Server settings → Features), and a preset, a calendar slot or a game
 * can override that: true = required, false = not required, null = follow the
 * server. The bot checks players hold the verified role IronLegion gives on
 * that server (GameMaster Bot/bot.py.py, "IRONLEGION STEAM VERIFICATION").
 */

export type IronLegionRule = "server" | "on" | "off";

export const IRONLEGION_RULE_LABELS: Record<IronLegionRule, string> = {
  server: "Server setting",
  on: "Required",
  off: "Not required",
};

export const ironLegionRule = (value: boolean | null | undefined): IronLegionRule =>
  value === true ? "on" : value === false ? "off" : "server";

export const ironLegionValue = (rule: IronLegionRule): boolean | null => (rule === "on" ? true : rule === "off" ? false : null);

/** A stored value: a boolean, or null (anything else) for the server's setting. */
export const parseRequireIronLegion = (raw: unknown): boolean | null => (typeof raw === "boolean" ? raw : null);

/** Where to press Verify: the server's IronLegion verify channel in Discord. */
export const ironLegionVerifyUrl = (guildId: string, channelId: string | null | undefined): string | null =>
  channelId ? `https://discord.com/channels/${guildId}/${channelId}` : null;

/** Whether a game requires it: its own switch, else the server's. */
export const ironLegionRequired = (game: boolean | null | undefined, server: boolean): boolean =>
  typeof game === "boolean" ? game : server;
