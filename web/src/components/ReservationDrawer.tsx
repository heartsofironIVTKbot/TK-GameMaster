"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import PlayerProfilePopover, {
  reservationBadges,
  type ProfileBadge,
} from "./PlayerProfilePopover";
import {
  isPlayerDrag,
  playerFromReservation,
  readDragPlayer,
  reservationName,
  writeDragPlayer,
  type DropPoint,
  type HostPlayer,
} from "./live/hostTypes";
import {
  FACTION_CATEGORIES,
  FACTION_ORDER,
  REGION_ORDER,
  boardDisplayName,
  canonicalName,
  majorTagsFor,
  nationMatchKeys,
} from "@/data/nationCategories";
import {
  getCountryData,
  placeholderFlag,
  type ScenarioId,
} from "@/data/scenarioData";
import { reservationLookup } from "@/lib/reservationMatch";
import type {
  AuthUser,
  LobbyGameLock,
  LobbyReservation,
  NationFeatureProps,
  NationRowStatus,
  RosterNation,
} from "@/lib/types";

/**
 * Left slide-out Reservation Board.
 *
 * Vanilla, Road to 56, Kaiserreich and the modern trio group
 * GEOGRAPHICALLY: Majors on top, then Europe, Middle East (modern-day only),
 * Asia, Oceania, North America, South America and Africa. The historical
 * mods group by FACTION (Axis / Allies / Comintern / GEACPS — the bot's
 * NATION_CATEGORIES rosters, flat and alphabetical). Fillers and host-locked
 * nations live in their own sections at the bottom.
 *
 * Each row is a full-width box tinted by its state: available (green),
 * pending claim (yellow + your tag), your claim (green + your tag),
 * reserved (red + their tag), locked (slate + lock icon). Clicking a row
 * selects the nation (right-hand Country Inspector) and pans the map to it;
 * clicking a player tag opens the Discord mini-profile popover.
 */

interface ReservationDrawerProps {
  open: boolean;
  onToggle: () => void;
  /** One entry per nation on the active map (with computed region). */
  nations: RosterNation[];
  /** Live reservations of the selected lobby. */
  reservations: LobbyReservation[];
  /** The nation currently inspected (drives the amber "pending" row). */
  selected: NationFeatureProps | null;
  /** Active lobby thread (rows lock when none is selected). */
  selectedThread: string;
  scenarioId: ScenarioId;
  authUser: AuthUser | null;
  /** Active lobby host id — "Host" badge source for the popover. */
  hostId?: string | number | null;
  /** Host lock state: lockdown + disabled nation/category names. */
  gameLock: LobbyGameLock | null;
  /** Select + focus a nation (row click). */
  onSelectNation: (nation: NationFeatureProps) => void;
  onFocusNation: (tag: string) => void;
  /** Live map host tools: drag/drop players on rows (null when off). */
  hostTools?: DrawerHostTools | null;
  /** The viewer is a host: profile cards offer "View portfolio". */
  viewerIsHost?: boolean;
  /** Draft games: the pool / teams panel shown above the nations. */
  draftPanel?: ReactNode;
  /** Reports the host-locked nations' tags (the map greys them like taken ones). */
  onHostLockedChange?: (tags: string[]) => void;
}

/** What the roster needs from the page's host tools. */
export interface DrawerHostTools {
  heldPlayer: HostPlayer | null;
  /** Slots with a host action waiting for the bot (shown as ⏳). */
  pendingSlots: ReadonlySet<string>;
  onDropPlayer: (nation: NationFeatureProps, player: HostPlayer, point: DropPoint) => void;
  onPlaceHeld: (nation: NationFeatureProps, point: DropPoint) => void;
  onPickUp: (player: HostPlayer | null) => void;
  onRemove: (player: HostPlayer, point: DropPoint) => void;
  /** Full Host Tool (drag / remove reserved players). False = a draft game
   *  where only pool players are dropped on rows. */
  manage: boolean;
}

const STATUS_META: Record<
  NationRowStatus,
  { badge: string; badgeClass: string; boxClass: string }
> = {
  available: {
    badge: "Open",
    badgeClass: "border-emerald-400/60 bg-emerald-400/20 text-emerald-200",
    boxClass: "border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20",
  },
  pending: {
    badge: "Pending",
    badgeClass: "border-yellow-300/60 bg-yellow-300/20 text-yellow-100",
    boxClass: "border-yellow-300/50 bg-yellow-300/10 hover:bg-yellow-300/20",
  },
  self: {
    badge: "Yours",
    badgeClass: "border-emerald-300/70 bg-emerald-400/25 text-emerald-100",
    boxClass: "border-emerald-300/60 bg-emerald-400/15 hover:bg-emerald-400/25",
  },
  reserved: {
    badge: "Taken",
    badgeClass: "border-rose-400/60 bg-rose-400/20 text-rose-200",
    boxClass: "border-rose-400/40 bg-rose-400/10 hover:bg-rose-400/20",
  },
  locked: {
    badge: "Locked",
    badgeClass: "border-slate-500/70 bg-slate-600/30 text-slate-300",
    boxClass: "border-slate-600/60 bg-slate-800/40 hover:bg-slate-700/50",
  },
};

interface RosterRow {
  nation: RosterNation;
  reservation?: LobbyReservation;
  status: NationRowStatus;
  /** Filler rows have no map nation (synthetic `_FILL_` slots). */
  fillerSlot?: string;
}

interface RosterSection {
  title: string;
  rows: RosterRow[];
}

function discordAvatarUrl(user: AuthUser): string | null {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=128`;
}

function discordBannerUrl(user: AuthUser): string | null {
  if (!user.banner) return null;
  return `https://cdn.discordapp.com/banners/${user.discord_id}/${user.banner}.png?size=512`;
}

const byName = (scenarioId: ScenarioId) => (a: RosterRow, b: RosterRow) =>
  boardDisplayName(scenarioId, a.nation.tag, a.nation.name).localeCompare(
    boardDisplayName(scenarioId, b.nation.tag, b.nation.name),
    undefined,
    { sensitivity: "base" },
  );

const isCoopSlot = (slot: string) => slot.includes("_coop");
const isFillerSlot = (slot: string) => slot.startsWith("_FILL_");

export default function ReservationDrawer({
  open,
  onToggle,
  nations,
  reservations,
  selected,
  selectedThread,
  scenarioId,
  authUser,
  hostId,
  gameLock,
  onSelectNation,
  onFocusNation,
  hostTools = null,
  viewerIsHost = false,
  draftPanel = null,
  onHostLockedChange,
}: ReservationDrawerProps) {
  // Whose profile popover is open: "self", a reservation's Discord id, or
  // "coop:<id>" for a co-op chip under its major.
  const [popoverKey, setPopoverKey] = useState<string | null>(null);
  // Host tools: the row a dragged player hovers (drop target highlight).
  const [dropRow, setDropRow] = useState<string | null>(null);

  // A nation's reservation and its co-op players (listed under the major) —
  // also when the bot names it differently ("Germany" from a draft pick vs
  // the map's "German Reich").
  const reservationsOf = useMemo(() => reservationLookup(reservations), [reservations]);

  const statusOf = (nation: RosterNation): NationRowStatus => {
    const reservation = nation.slot_key
      ? reservationsOf.main(nation)
      : undefined;
    if (reservation) {
      return authUser &&
        String(reservation.user_id) === String(authUser.discord_id)
        ? "self"
        : "reserved";
    }
    if (selected?.tag === nation.tag) return "pending";
    if (!selectedThread || gameLock?.lockdown) return "locked";
    return "available";
  };

  const rowFor = (nation: RosterNation): RosterRow => ({
    nation,
    reservation: nation.slot_key
      ? reservationsOf.main(nation)
      : undefined,
    status: statusOf(nation),
  });

  // --- Host-locked nation detection ----------------------------------------
  const lockKeys = useMemo(() => {
    const raw = gameLock?.locked_regions ?? [];
    return new Set(raw.map((entry) => canonicalName(entry)));
  }, [gameLock]);

  const isHostLocked = (
    nation: RosterNation,
    sectionTitle: string,
  ): boolean => {
    if (lockKeys.size === 0) return false;
    if (lockKeys.has(canonicalName(sectionTitle))) return true;
    const keys = nationMatchKeys(
      nation.tag,
      nation.slot_key ?? "",
      nation.name,
    );
    for (const key of keys) if (lockKeys.has(key)) return true;
    return false;
  };

  // --- Sections -------------------------------------------------------------
  const { sections, lockedRows } = useMemo(() => {
    const factionGroups = FACTION_CATEGORIES[scenarioId];
    const lockedRows: RosterRow[] = [];

    const pushLocked = (nation: RosterNation, title: string): boolean => {
      if (!isHostLocked(nation, title)) return false;
      const row = rowFor(nation);
      if (row.status === "available" || row.status === "pending") {
        row.status = "locked";
      }
      lockedRows.push(row);
      return true;
    };

    // Preset games: only the preset's own groups, in its order. Nations it
    // leaves out — and map nations that aren't on the bot's list — aren't
    // listed at all (they're not playable in this game).
    const layout = gameLock?.nation_layout;
    if (layout && layout.length > 0) {
      const keysOf = (nation: RosterNation) =>
        nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name);
      const claimed = new Set<string>();
      const ordered: RosterSection[] = [];
      for (const group of layout) {
        const rows: RosterRow[] = [];
        for (const botName of group.tiers.flatMap((tier) => tier.nations)) {
          const key = canonicalName(botName);
          const nation = nations.find(
            (candidate) => !claimed.has(candidate.tag) && keysOf(candidate).has(key),
          );
          if (!nation) continue;
          claimed.add(nation.tag);
          if (!pushLocked(nation, group.name)) rows.push(rowFor(nation));
        }
        if (rows.length > 0) ordered.push({ title: group.name, rows });
      }
      return { sections: ordered, lockedRows };
    }

    if (factionGroups) {
      // Faction mode (historical mods): factions ordered Axis / Allies /
      // Comintern / GEACPS, MAJORS OF THE FACTION FIRST (alphabetical), then
      // the remaining nations (alphabetical), then leftovers.
      const ordered: RosterSection[] = [];
      const groups = [...factionGroups].sort((a, b) => {
        const ia = FACTION_ORDER.indexOf(a.name);
        const ib = FACTION_ORDER.indexOf(b.name);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      const claimed = new Set<string>();
      const findNation = (botName: string) => {
        const key = canonicalName(botName);
        return nations.find((candidate) =>
          nationMatchKeys(
            candidate.tag,
            candidate.slot_key ?? "",
            candidate.name,
          ).has(key),
        );
      };
      for (const group of groups) {
        const majorsTier = group.tiers.find(
          (tier) => tier.label === "Majors",
        );
        const majorNames = majorsTier?.names ?? [];
        const minorNames = group.tiers
          .filter((tier) => tier.label !== "Majors")
          .flatMap((tier) => tier.names);
        const addRow = (botName: string): RosterRow | null => {
          const nation = findNation(botName);
          if (!nation || claimed.has(nation.tag)) return null;
          claimed.add(nation.tag);
          if (pushLocked(nation, group.name)) return null;
          return rowFor(nation);
        };
        const sortByName = byName(scenarioId);
        // Majors of the faction first (alphabetical), then the rest.
        const majorRows = majorNames
          .map(addRow)
          .filter((row): row is RosterRow => row !== null)
          .sort(sortByName);
        const minorRows = minorNames
          .map(addRow)
          .filter((row): row is RosterRow => row !== null)
          .sort(sortByName);
        const rows = [...majorRows, ...minorRows];
        if (rows.length > 0) {
          ordered.push({ title: group.name, rows });
        }
      }
      const leftovers = nations
        .filter((nation) => !claimed.has(nation.tag))
        .filter((nation) => !pushLocked(nation, "Unaligned"))
        .map(rowFor)
        .sort(byName(scenarioId));
      if (leftovers.length > 0) {
        ordered.push({ title: "Unaligned", rows: leftovers });
      }
      return { sections: ordered, lockedRows };
    }

    // Geographic mode: Majors first, then regions, then Other.
    const majorTags = majorTagsFor(scenarioId);
    const ordered: RosterSection[] = [];
    const claimed = new Set<string>();
    const majors = nations
      .filter((nation) => majorTags.has(nation.tag))
      .filter((nation) => !pushLocked(nation, "Majors"))
      .map(rowFor)
      .sort(byName(scenarioId));
    majors.forEach((row) => claimed.add(row.nation.tag));
    if (majors.length > 0) {
      ordered.push({ title: "Majors", rows: majors });
    }
    for (const region of REGION_ORDER) {
      const rows = nations
        .filter(
          (nation) => !claimed.has(nation.tag) && nation.region === region,
        )
        .filter((nation) => !pushLocked(nation, region))
        .map(rowFor)
        .sort(byName(scenarioId));
      if (rows.length > 0) {
        ordered.push({ title: region, rows });
      }
    }
    return { sections: ordered, lockedRows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nations, reservationsOf, selected, authUser, selectedThread, gameLock, scenarioId]);

  // Tell the map which nations the host locked (same list as "Locked Nations").
  const lockedTagKey = lockedRows.map((row) => row.nation.tag).join(",");
  useEffect(() => {
    onHostLockedChange?.(lockedTagKey ? lockedTagKey.split(",") : []);
  }, [lockedTagKey, onHostLockedChange]);

  // Fillers + host-locked sections appended at the bottom.
  const fillerRows = useMemo<RosterRow[]>(() => {
    const fillers = reservations.filter((reservation) =>
      isFillerSlot(reservation.slot_key),
    );
    return fillers.map((reservation) => {
      const label = reservation.slot_key
        .replace("_FILL_", "")
        .replace(/_/g, " ")
        .trim();
      return {
        nation: {
          tag: `FILLER:${reservation.slot_key}`,
          name: label || "Filler",
          slot_key: reservation.slot_key,
        } as RosterNation,
        reservation,
        status: "reserved" as const,
        fillerSlot: reservation.slot_key,
      };
    });
  }, [reservations]);

  // --- Board stats ----------------------------------------------------------
  const stats = useMemo(() => {
    const majorTags = majorTagsFor(scenarioId);
    // Preset games count only the nations they list.
    const listed = gameLock?.nation_layout?.length
      ? [...sections.flatMap((section) => section.rows), ...lockedRows].map((row) => row.nation)
      : nations;
    const majorNations = listed.filter((nation) => majorTags.has(nation.tag) && nation.slot_key);
    const majorSlots = new Set(majorNations.map((nation) => nation.slot_key as string));
    // The bot may name a major differently from the map ("Germany" / "German Reich").
    const majorKeys = new Set(
      majorNations.flatMap((nation) => [...nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name)]),
    );
    const main = reservations.filter(
      (reservation) =>
        !isCoopSlot(reservation.slot_key) &&
        !isFillerSlot(reservation.slot_key),
    );
    const majorsClaimed = main.filter(
      (reservation) => majorSlots.has(reservation.slot_key) || majorKeys.has(canonicalName(reservation.slot_key)),
    ).length;
    const minorsClaimed = main.length - majorsClaimed;
    return {
      majorsClaimed,
      majorsTotal: majorSlots.size,
      minorsClaimed,
      minorsTotal: Math.max(0, listed.length - majorSlots.size),
      totalClaimed: main.length,
      totalNations: listed.length,
      coopCount: reservations.filter((reservation) =>
        isCoopSlot(reservation.slot_key),
      ).length,
      fillerCount: reservations.filter((reservation) =>
        isFillerSlot(reservation.slot_key),
      ).length,
    };
  }, [nations, reservations, scenarioId, gameLock, sections, lockedRows]);

  // Popover display info for a clicked tag (the card then loads the full
  // Discord profile itself). Anyone can open other players' cards.
  const popoverInfo = useMemo(() => {
    if (!popoverKey) return null;
    if (popoverKey === "self") {
      if (!authUser) return null;
      return {
        userId: authUser.discord_id,
        username: authUser.username,
        ingameNickname: authUser.ingame_nickname ?? null,
        avatarUrl: discordAvatarUrl(authUser),
        bannerUrl: discordBannerUrl(authUser),
        accentColor: authUser.accent_color ?? null,
        badges: [] as ProfileBadge[],
      };
    }
    const userId = popoverKey.replace(/^coop:/, "");
    const reservation = reservations.find(
      (item) => String(item.user_id) === userId,
    );
    if (!reservation) return null;
    const isViewer = authUser !== null && userId === String(authUser.discord_id);
    return {
      userId,
      username: reservation.username ?? null,
      ingameNickname: reservation.ingame_nickname ?? null,
      avatarUrl: reservation.avatar_url ?? (isViewer ? discordAvatarUrl(authUser) : null),
      bannerUrl: isViewer ? discordBannerUrl(authUser) : null,
      accentColor: isViewer ? (authUser.accent_color ?? null) : null,
      badges: reservationBadges(reservation, hostId),
    };
  }, [popoverKey, authUser, reservations, hostId]);

  // Hosts get the portfolio button while the Host Tool is off.
  const canViewPortfolio = viewerIsHost && !hostTools?.manage;
  // Reserved players become draggable chips only with the full Host Tool.
  const manageTools = hostTools?.manage ? hostTools : null;

  // Collapsed: a slim toggle tab on the left edge.
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open reservation roaster"
        className="absolute left-0 top-1/2 z-[950] -translate-y-1/2 rounded-r-lg border border-l-0 border-slate-700 bg-slate-900/90 px-1.5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-lg backdrop-blur-md transition-colors hover:bg-slate-800"
        style={{ writingMode: "vertical-rl" }}
      >
        Roaster ▸
      </button>
    );
  }

  const renderRow = (row: RosterRow) => {
    const { nation, reservation, status } = row;
    const meta = STATUS_META[status];
    const isFiller = Boolean(row.fillerSlot);
    const data = isFiller
      ? null
      : getCountryData(nation.tag, nation.name, scenarioId);
    const isSelf =
      authUser &&
      reservation &&
      String(reservation.user_id) === String(authUser.discord_id);
    const tag =
      reservation && (isSelf || status === "reserved")
        ? reservationName(reservation)
        : status === "pending" && authUser
          ? (authUser.ingame_nickname?.trim() || `#${authUser.discord_id}`).slice(0, 32)
          : null;
    const tagKey =
      isSelf || status === "pending"
        ? "self"
        : reservation
          ? String(reservation.user_id)
          : null;
    const popoverOpen = tagKey !== null && popoverKey === tagKey;
    const rowKey = isFiller ? `filler:${row.fillerSlot}` : nation.tag;
    const slot = nation.slot_key ?? "";
    const coops = !isFiller && slot ? reservationsOf.coops(nation) : [];
    const pending =
      hostTools !== null &&
      (hostTools.pendingSlots.has(slot) ||
        coops.some((coop) => hostTools.pendingSlots.has(coop.slot_key)));
    const isDropRow = dropRow === rowKey;

    return (
      <div key={rowKey}>
        <div
          role="button"
          tabIndex={isFiller ? -1 : 0}
          aria-label={`${nation.name} — ${meta.badge}`}
          onClick={(event) => {
            if (isFiller) return;
            if (hostTools?.heldPlayer) {
              hostTools.onPlaceHeld(nation, { x: event.clientX, y: event.clientY });
              return;
            }
            onSelectNation(nation);
            onFocusNation(nation.tag);
          }}
          onKeyDown={(event) => {
            if (isFiller) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectNation(nation);
              onFocusNation(nation.tag);
            }
          }}
          {...(hostTools && !isFiller
            ? {
                onDragOver: (event: React.DragEvent) => {
                  if (!isPlayerDrag(event)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (dropRow !== rowKey) setDropRow(rowKey);
                },
                onDragLeave: (event: React.DragEvent) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDropRow((current) => (current === rowKey ? null : current));
                  }
                },
                onDrop: (event: React.DragEvent) => {
                  setDropRow(null);
                  const player = readDragPlayer(event);
                  if (!player) return;
                  event.preventDefault();
                  hostTools.onDropPlayer(nation, player, { x: event.clientX, y: event.clientY });
                },
              }
            : {})}
          className={`relative flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left shadow-sm transition-colors ${
            isFiller ? "cursor-default" : hostTools?.heldPlayer ? "cursor-copy" : "cursor-pointer"
          } ${meta.boxClass} ${
            isDropRow
              ? "ring-2 ring-yellow-300"
              : !isFiller && selected?.tag === nation.tag
                ? "ring-1 ring-yellow-300/60"
                : ""
          }`}
        >
          {/* Flag */}
          {isFiller ? (
            <div className="h-5 w-8 shrink-0 rounded-[3px] border border-slate-600 bg-slate-700/60" />
          ) : (
            <img
              src={data?.flagUrl || `/assets/flags/${nation.tag}.png`}
              alt=""
              className="h-5 w-8 shrink-0 rounded-[3px] border border-slate-700 object-cover"
              onError={(event) => {
                event.currentTarget.src = placeholderFlag(nation.tag);
              }}
            />
          )}

          {/* Nation name (simplified: no Kingdom/Republic prefixes) */}
          <span
            className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100"
            title={isFiller ? nation.name : boardDisplayName(scenarioId, nation.tag, nation.name)}
          >
            {isFiller
              ? nation.name
              : boardDisplayName(scenarioId, nation.tag, nation.name)}
          </span>

          {/* Status badge: fixed width so every row's badge lines up. */}
          <span
            className={`w-16 shrink-0 whitespace-nowrap rounded border py-0.5 text-center text-[10px] font-bold uppercase tracking-wide ${meta.badgeClass}`}
          >
            {status === "locked" && <span aria-hidden>🔒 </span>}
            {meta.badge}
          </span>

          {/* Player column: fixed width, right-aligned, so a long tag
              truncates here instead of pushing the badge around. */}
          <div className="flex w-[92px] shrink-0 items-center justify-end gap-1">
            {pending && (
              <span
                className="gm-spin inline-block h-3 w-3 shrink-0 rounded-full border-2 border-yellow-300 border-t-transparent"
                title="Waiting for the bot"
              />
            )}

            {/* Host tools: draggable player tag + remove. */}
            {manageTools && reservation && tag && (
              <HostPlayerTag
                reservation={reservation}
                label={tag}
                held={manageTools.heldPlayer?.user_id === String(reservation.user_id)}
                hostTools={manageTools}
              />
            )}

            {/* Player tag (click opens the popover) */}
            {!(manageTools && reservation) && tag && tagKey && (
              <button
                type="button"
                aria-label={`Open ${tag}'s Discord profile`}
                title={tag}
                onClick={(event) => {
                  event.stopPropagation();
                  setPopoverKey((current) => (current === tagKey ? null : tagKey));
                }}
                className="min-w-0 max-w-full truncate rounded bg-slate-950/80 px-2 py-0.5 text-[11px] font-bold text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
              >
                {isSelf || status === "pending" ? `${tag} (You)` : `@${tag}`}
              </button>
            )}
          </div>

          {/* Profile popover anchored to this row */}
          {popoverOpen && popoverInfo && (
            <PlayerProfilePopover
              userId={popoverInfo.userId}
              username={popoverInfo.username}
              ingameNickname={popoverInfo.ingameNickname}
              avatarUrl={popoverInfo.avatarUrl}
              bannerUrl={popoverInfo.bannerUrl}
              accentColor={popoverInfo.accentColor}
              badges={popoverInfo.badges}
              onClose={() => setPopoverKey(null)}
              canViewPortfolio={canViewPortfolio}
            />
          )}
        </div>
        {/* Co-op players of this nation. */}
        {coops.length > 0 && (
          <div className="relative ml-10 mt-1 flex flex-wrap gap-1">
            {coops.map((coop) => {
              const coopKey = `coop:${String(coop.user_id)}`;
              return manageTools ? (
                <HostPlayerTag
                  key={coop.slot_key}
                  reservation={coop}
                  label={`🤝 ${reservationName(coop)}`}
                  held={manageTools.heldPlayer?.user_id === String(coop.user_id)}
                  hostTools={manageTools}
                />
              ) : (
                <button
                  key={coop.slot_key}
                  type="button"
                  aria-label={`Open ${reservationName(coop)}'s Discord profile`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPopoverKey((current) => (current === coopKey ? null : coopKey));
                  }}
                  className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-200 transition-colors hover:bg-sky-500/30 hover:text-white"
                >
                  🤝 Co-op @{reservationName(coop)}
                </button>
              );
            })}
            {popoverInfo &&
              coops.some((coop) => popoverKey === `coop:${String(coop.user_id)}`) && (
                <PlayerProfilePopover
                  userId={popoverInfo.userId}
                  username={popoverInfo.username}
                  ingameNickname={popoverInfo.ingameNickname}
                  avatarUrl={popoverInfo.avatarUrl}
                  bannerUrl={popoverInfo.bannerUrl}
                  accentColor={popoverInfo.accentColor}
                  badges={popoverInfo.badges}
                  onClose={() => setPopoverKey(null)}
                  canViewPortfolio={canViewPortfolio}
                />
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="Reservation roaster"
      className="absolute bottom-0 left-0 top-20 z-[950] flex w-[400px] flex-col border-r border-slate-800 bg-slate-950/70 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-base font-black uppercase tracking-wide text-slate-100">
            Reservation Roaster
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            Majors {stats.majorsClaimed}/{stats.majorsTotal} · Minors{" "}
            {stats.minorsClaimed}/{stats.minorsTotal} · Total{" "}
            {stats.totalClaimed}/{stats.totalNations}
            {(stats.coopCount > 0 || stats.fillerCount > 0) && (
              <span className="text-slate-500">
                {" "}
                + Co-Op {stats.coopCount} · Fillers {stats.fillerCount}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse reservation roaster"
          title="Collapse roaster"
          className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          ◀
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-800/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Open
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-yellow-300" /> Pending
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-400" /> Taken
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-500" /> Locked
        </span>
      </div>

      {/* Sections + rows */}
      <div className="roster-scroll flex-1 overflow-y-auto px-2 pb-3">
        {/* Draft games: the shared pool, teams and whose pick it is. */}
        {draftPanel && <div className="-mx-2 pt-3">{draftPanel}</div>}
        {gameLock?.ironlegion && (
          <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-100">
            🛡️ <b>Steam verification required.</b> This game needs IronLegion&apos;s verified role to reserve.{" "}
            {gameLock.ironlegion.verify_url ? (
              <a href={gameLock.ironlegion.verify_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200">
                Verify in Discord ↗
              </a>
            ) : (
              <>Press Verify on the server&apos;s IronLegion panel in Discord.</>
            )}
          </div>
        )}
        {sections.map((section, sectionIndex) => (
          <div key={`${section.title}-${sectionIndex}`}>
            <h3 className="px-1.5 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-amber-300/90">
              {section.title}
            </h3>
            <div className="flex flex-col gap-1.5">
              {section.rows.map(renderRow)}
            </div>
          </div>
        ))}

        {fillerRows.length > 0 && (
          <div>
            <h3 className="px-1.5 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-amber-300/90">
              Fillers
            </h3>
            <div className="flex flex-col gap-1.5">{fillerRows.map(renderRow)}</div>
          </div>
        )}

        {lockedRows.length > 0 && (
          <div>
            <h3 className="px-1.5 pb-1 pt-3 text-[11px] font-black uppercase tracking-widest text-slate-500">
              Locked Nations
            </h3>
            <div className="flex flex-col gap-1.5">{lockedRows.map(renderRow)}</div>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Host tools: a reserved player as a draggable chip with a remove button. */
function HostPlayerTag({
  reservation,
  label,
  held,
  hostTools,
}: {
  reservation: LobbyReservation;
  label: string;
  held: boolean;
  hostTools: DrawerHostTools;
}) {
  const player = playerFromReservation(reservation);
  return (
    <span className="flex min-w-0 max-w-full items-center overflow-hidden rounded bg-slate-950/80">
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          writeDragPlayer(event, player);
        }}
        onClick={(event) => {
          event.stopPropagation();
          hostTools.onPickUp(held ? null : player);
        }}
        title="Drag to another nation or the bin — or click to pick up"
        className={`min-w-0 cursor-grab truncate px-2 py-0.5 text-[11px] font-bold transition-colors active:cursor-grabbing ${
          held ? "bg-yellow-300/25 text-yellow-100" : "text-slate-200 hover:bg-slate-800 hover:text-white"
        }`}
      >
        ⠿ {label}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          hostTools.onRemove(player, { x: event.clientX, y: event.clientY });
        }}
        aria-label={`Remove ${label}`}
        title="Remove from the game"
        className="shrink-0 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-rose-500/20 hover:text-rose-200"
      >
        ✕
      </button>
    </span>
  );
}
