import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { playerRecords } from "@/lib/currentGuild";
import { memberRoleIds } from "@/lib/memberRoles";
import { isSchedulerDemo } from "@/lib/scheduleStore";

/** Locked nations VIPs may still reserve (only those still locked count). */
export function vipOpenNations(data: Record<string, unknown>): string[] {
  const locked = new Set(Array.isArray(data.locked_regions) ? data.locked_regions.map(String) : []);
  return Array.isArray(data.vip_open_regions) ? data.vip_open_regions.map(String).filter((name) => locked.has(name)) : [];
}

/**
 * Is this member a VIP on this server: one of the server's VIP roles (the
 * bot's member directory) or the player record's VIP flag. Used by the
 * reserve route and the map for nations locked "except VIPs"
 * (game_data.vip_open_regions).
 */
export async function memberIsVip(guildId: string, userId: string, recordVip?: boolean): Promise<boolean> {
  if (isSchedulerDemo()) return false;
  const [roleIds, [directory]] = await Promise.all([
    memberRoleIds(guildId),
    getPool().query<(RowDataPacket & { role_ids: string | null })[]>(
      "SELECT role_ids FROM web_member_directory WHERE guild_id = ? AND user_id = ? LIMIT 1",
      [guildId, userId],
    ),
  ]);
  // Role ids as digit strings: JSON.parse would round 19-digit snowflakes.
  const raw = directory[0]?.role_ids;
  const roles = new Set(typeof raw === "string" ? (raw.match(/\d{5,25}/g) ?? []) : []);
  if (roleIds.vip_all.some((id) => roles.has(id))) return true;
  if (recordVip !== undefined) return recordVip;
  const records = playerRecords(guildId);
  const [rows] = await getPool().query<(RowDataPacket & { vip: number | null })[]>(
    `SELECT vip FROM ${records.table} WHERE ${records.where}`,
    [...records.whereParams, userId],
  );
  return Boolean(rows[0]?.vip);
}
