"use client";

import { ChevronRight, GripVertical, Lock, PanelLeftClose, ShieldCheck, Users, X } from "lucide-react";
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
import { placeholderFlag, type ScenarioId } from "@/data/scenarioData";
import { getCountryData, useScenarioNations } from "@/data/scenarioNations";
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
  /** null: open on wide screens, collapsed on phones (first visit). */
  open: boolean | null;
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

/** Each row's status tag (the right-hand slot). Taken rows show the player's name instead. */
const STATUS_META: Record<NationRowStatus, { badge: string; tagClass: string }> = {
  available: { badge: "Open", tagClass: "gm-tag gm-tag-dot bg-emerald-950/80 text-emerald-300" },
  pending: { badge: "Pending", tagClass: "gm-tag gm-tag-dot bg-yellow-950/80 text-yellow-200" },
  self: { badge: "Yours", tagClass: "gm-tag bg-emerald-950/80 text-emerald-300" },
  reserved: { badge: "Taken", tagClass: "gm-tag bg-rose-950/80 text-rose-300" },
  locked: { badge: "Locked", tagClass: "gm-tag bg-ink-800 text-ink-400" },
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
  // Flags come from the scenario's own nation data, loaded on demand.
  const nationData = useScenarioNations(scenarioId);
  // Whose profile popover is open: "self", a reservation's Discord id, or
  // "coop:<id>" for a co-op chip under its major.
  const [popoverKey, setPopoverKey] = useState<string | null>(null);
  // Host tools: the row a dragged player hovers (drop target highlight).
  const [dropRow, setDropRow] = useState<string | null>(null);
  // IronLegion games: whether the signed-in viewer already holds the
  // authenticated role (then the notice is hidden). Per game.
  const [ironLegion, setIronLegion] = useState<{ thread: string; done: boolean } | null>(null);
  const ironLegionRequired = Boolean(gameLock?.ironlegion);
  useEffect(() => {
    if (!ironLegionRequired || !authUser || !selectedThread) return undefined;
    let cancelled = false;
    fetch(`/api/reserve/ironlegion?thread_id=${encodeURIComponent(selectedThread)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((reply: { needs_authentication?: boolean | null } | null) => {
        if (!cancelled) setIronLegion({ thread: selectedThread, done: reply?.needs_authentication === false });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ironLegionRequired, authUser, selectedThread]);
  const showIronLegion =
    ironLegionRequired && !(authUser && ironLegion?.thread === selectedThread && ironLegion.done);

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
  const { sections, lockedRows, notPlayableTags } = useMemo(() => {
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
      // Which map nation each listed name is: the same name first (Taiwan is
      // "Republic of China" on both), then the looser matching ("Republic of
      // China" and "China" are both "china" to it).
      const claimed = new Set<string>();
      const listed = layout.flatMap((group) => group.tiers.flatMap((tier) => tier.nations));
      const nationOf = new Map<string, RosterNation>();
      for (const botName of listed) {
        const nation = nations.find(
          (candidate) => !claimed.has(candidate.tag) && (candidate.slot_key === botName || candidate.name === botName),
        );
        if (!nation) continue;
        claimed.add(nation.tag);
        nationOf.set(botName, nation);
      }
      for (const botName of listed) {
        if (nationOf.has(botName)) continue;
        const key = canonicalName(botName);
        const nation = nations.find((candidate) => !claimed.has(candidate.tag) && keysOf(candidate).has(key));
        if (!nation) continue;
        claimed.add(nation.tag);
        nationOf.set(botName, nation);
      }
      const ordered: RosterSection[] = [];
      for (const group of layout) {
        const rows: RosterRow[] = [];
        for (const botName of group.tiers.flatMap((tier) => tier.nations)) {
          const nation = nationOf.get(botName);
          if (!nation) continue;
          if (!pushLocked(nation, group.name)) rows.push(rowFor(nation));
        }
        if (rows.length > 0) ordered.push({ title: group.name, rows });
      }
      // The rest of the map isn't playable: greyed out like a locked nation.
      const notPlayableTags = nations.filter((nation) => !claimed.has(nation.tag)).map((nation) => nation.tag);
      return { sections: ordered, lockedRows, notPlayableTags };
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
      return { sections: ordered, lockedRows, notPlayableTags: [] as string[] };
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
    return { sections: ordered, lockedRows, notPlayableTags: [] as string[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nations, reservationsOf, selected, authUser, selectedThread, gameLock, scenarioId]);

  // Tell the map which nations to grey out: the host's locks (same list as
  // "Locked Nations") and a preset's not-playable nations.
  const lockedTagKey = [...lockedRows.map((row) => row.nation.tag), ...notPlayableTags].join(",");
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

  // Collapsed: a tab on the left edge (a bar along the bottom on phones).
  // `open` null = the first visit: open on wide screens, collapsed on phones
  // (CSS decides).
  const tab = (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open the reservations"
        data-tour="map.roster"
        className={`gm-cut absolute left-0 top-1/2 z-[950] hidden -translate-y-1/2 items-center gap-1.5 bg-ink-950 px-2 py-4 text-xs font-semibold text-ink-300 transition-colors [--cut:6px] hover:bg-ink-900 hover:text-ink-100 ${
          open === null ? "" : "sm:flex"
        }`}
        style={{ writingMode: "vertical-rl" }}
      >
        Reservations
        <ChevronRight aria-hidden className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open the reservations"
        data-tour="map.roster"
        className="absolute inset-x-0 bottom-0 z-[950] flex h-16 items-center gap-3 border-t border-ink-800 bg-ink-950 px-4 text-left sm:hidden"
      >
        <span className="gm-title text-xl">Reservations</span>
        <span className="text-xs text-ink-400">
          {stats.totalClaimed} of {stats.totalNations} taken
        </span>
        <span className="gm-btn gm-btn-secondary ml-auto w-9 px-0" aria-hidden>
          <ChevronRight className="-rotate-90" />
        </span>
      </button>
    </>
  );
  if (open === false) return tab;

  const renderRow = (row: RosterRow) => {
    const { nation, reservation, status } = row;
    const meta = STATUS_META[status];
    const isFiller = Boolean(row.fillerSlot);
    const data = isFiller
      ? null
      : getCountryData(nation.tag, nation.name, scenarioId, nationData);
    const isSelf =
      authUser &&
      reservation &&
      String(reservation.user_id) === String(authUser.discord_id);
    const tag = reservation && (isSelf || status === "reserved") ? reservationName(reservation) : null;
    const tagKey = isSelf ? "self" : reservation ? String(reservation.user_id) : null;
    const popoverOpen = tagKey !== null && popoverKey === tagKey;
    const rowKey = isFiller ? `filler:${row.fillerSlot}` : nation.tag;
    const slot = nation.slot_key ?? "";
    const coops = !isFiller && slot ? reservationsOf.coops(nation) : [];
    const pending =
      hostTools !== null &&
      (hostTools.pendingSlots.has(slot) ||
        coops.some((coop) => hostTools.pendingSlots.has(coop.slot_key)));
    const isDropRow = dropRow === rowKey;
    const isSelected = !isFiller && selected?.tag === nation.tag;

    return (
      <div key={rowKey}>
        <div
          role="button"
          tabIndex={isFiller ? -1 : 0}
          aria-label={`${nation.name}: ${tag ?? meta.badge}`}
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
          className={`group relative isolate flex h-[34px] w-full items-center gap-2.5 px-2 text-left ${
            isFiller ? "cursor-default" : hostTools?.heldPlayer ? "cursor-copy" : "cursor-pointer"
          }`}
        >
          {/* The row's background: a cut plate behind it (on the row itself
              the clip would cut off the profile popover). */}
          <span
            aria-hidden
            className={`gm-cut absolute inset-0 -z-10 transition-colors [--cut:6px] ${
              isDropRow
                ? "bg-yellow-300/15"
                : isSelected
                  ? "bg-ink-900"
                  : isFiller
                    ? ""
                    : "group-hover:bg-ink-900"
            }`}
          />
          {isSelected && <span aria-hidden className="absolute bottom-[7px] left-0 top-[7px] w-[3px] bg-brand-400" />}

          {/* Flag */}
          {isFiller ? (
            <div className="h-4 w-6 shrink-0 bg-ink-800 outline outline-1 outline-white/10" />
          ) : (
            <img
              src={data?.flagUrl || `/assets/flags/${nation.tag}.png`}
              alt=""
              className="h-4 w-6 shrink-0 object-cover outline outline-1 outline-white/10"
              onError={(event) => {
                event.currentTarget.src = placeholderFlag(nation.tag);
              }}
            />
          )}

          {/* Nation name (simplified: no Kingdom/Republic prefixes) */}
          <span
            className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink-100"
            title={isFiller ? nation.name : boardDisplayName(scenarioId, nation.tag, nation.name)}
          >
            {isFiller
              ? nation.name
              : boardDisplayName(scenarioId, nation.tag, nation.name)}
          </span>

          {/* One slot on the right: the status, or the player who holds it. */}
          <div className="flex min-w-0 max-w-[128px] shrink-0 items-center justify-end gap-1.5">
            {pending && (
              <span
                className="gm-spin inline-block h-3 w-3 shrink-0 rounded-full border-2 border-yellow-300 border-t-transparent"
                title="Waiting for the bot"
              />
            )}

            {/* Host tools: draggable player tag + remove. */}
            {manageTools && reservation && tag ? (
              <HostPlayerTag
                reservation={reservation}
                label={tag}
                held={manageTools.heldPlayer?.user_id === String(reservation.user_id)}
                hostTools={manageTools}
              />
            ) : tag && tagKey ? (
              <button
                type="button"
                aria-label={`Open ${tag}'s Discord profile`}
                title={isSelf ? `${tag} (you)` : tag}
                onClick={(event) => {
                  event.stopPropagation();
                  setPopoverKey((current) => (current === tagKey ? null : tagKey));
                }}
                className={`${meta.tagClass} min-w-0 max-w-full transition-[filter] hover:brightness-125`}
              >
                <span className="truncate">{isSelf ? "You" : tag}</span>
              </button>
            ) : (
              <span className={meta.tagClass}>
                {status === "locked" && <Lock aria-hidden className="h-3 w-3" />}
                {meta.badge}
              </span>
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
          <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1 py-1 pl-[42px] pr-2 text-xs text-ink-400">
            <Users aria-hidden className="h-3.5 w-3.5 text-sky-300" />
            Co-op
            {coops.map((coop) => {
              const coopKey = `coop:${String(coop.user_id)}`;
              return manageTools ? (
                <HostPlayerTag
                  key={coop.slot_key}
                  reservation={coop}
                  label={reservationName(coop)}
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
                  className="font-semibold text-ink-300 transition-colors hover:text-ink-100"
                >
                  {reservationName(coop)}
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

  const counts: { label: string; value: number; of?: number; lead?: boolean }[] = [
    { label: "Taken", value: stats.totalClaimed, of: stats.totalNations, lead: true },
    { label: "Majors", value: stats.majorsClaimed, of: stats.majorsTotal },
    { label: "Minors", value: stats.minorsClaimed, of: stats.minorsTotal },
    { label: "Co-op", value: stats.coopCount },
    { label: "Filler", value: stats.fillerCount },
  ];

  return (
    <>
    {open === null && tab}
    <aside
      aria-label="Reservations"
      data-tour="map.roster"
      className={`absolute bottom-0 left-0 top-24 z-[950] w-full flex-col border-r border-ink-800 bg-ink-950 sm:top-14 sm:w-[340px] ${
        open === null ? "hidden sm:flex" : "flex"
      }`}
    >
      {/* Header: the title, the counts, and the IronLegion notice when it applies. */}
      <div className="border-b border-ink-800 p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="gm-title text-[26px]">Reservations</h2>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Fold the reservations"
            title="Fold the list"
            className="gm-btn gm-btn-quiet h-8 w-8 p-0"
          >
            <PanelLeftClose aria-hidden />
          </button>
        </div>
        <div className="gm-plate mt-3 grid grid-cols-[1.25fr_1fr_1fr_1fr_1fr] bg-ink-950 [--cut:10px]">
          {counts.map((count, index) => (
            <div key={count.label} className={`px-1 pb-1.5 pt-2 text-center ${index > 0 ? "border-l border-ink-800" : ""}`}>
              <strong className={`block font-display text-xl font-extrabold leading-none ${count.lead ? "text-brand-400" : "text-ink-100"}`}>
                {count.value}
                {count.of !== undefined && <small className="text-sm text-ink-500">/{count.of}</small>}
              </strong>
              <span className="mt-1 block text-[11px] text-ink-400">{count.label}</span>
            </div>
          ))}
        </div>
        {showIronLegion && gameLock?.ironlegion && (
          <details
            data-tour="map.ironlegion"
            className="gm-plate group mt-2.5 bg-sky-950/60 text-[12.5px] text-ink-300 [--cut:8px] [--line:color-mix(in_oklab,var(--color-sky-300)_35%,transparent)]"
          >
            <summary className="flex h-[34px] cursor-pointer list-none items-center gap-2 px-2.5 font-semibold text-ink-100 [&::-webkit-details-marker]:hidden">
              <ShieldCheck aria-hidden className="h-4 w-4 text-sky-300" />
              Steam authentication needed
              <span className="ml-auto text-xs font-semibold text-sky-300 group-open:hidden">How</span>
            </summary>
            <p className="px-2.5 pb-2.5 pl-[34px] leading-relaxed">
              This game needs IronLegion&apos;s authenticated role to reserve.{" "}
              {gameLock.ironlegion.verify_url ? (
                <a
                  href={gameLock.ironlegion.verify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  Authenticate in Discord
                </a>
              ) : (
                <>Press Authenticate on the server&apos;s IronLegion panel in Discord.</>
              )}
            </p>
          </details>
        )}
      </div>

      {/* Sections + rows */}
      <div className="roster-scroll flex-1 overflow-y-auto px-1.5 pb-3">
        {/* Draft games: the shared pool, teams and whose pick it is. */}
        {draftPanel && <div className="-mx-1.5 pt-3">{draftPanel}</div>}
        {sections.map((section, sectionIndex) => (
          <div key={`${section.title}-${sectionIndex}`}>
            <h3 className="px-2 pb-1 pt-3 text-xs font-semibold text-ink-500">{section.title}</h3>
            <div className="flex flex-col">{section.rows.map(renderRow)}</div>
          </div>
        ))}

        {fillerRows.length > 0 && (
          <div>
            <h3 className="px-2 pb-1 pt-3 text-xs font-semibold text-ink-500">Fillers</h3>
            <div className="flex flex-col">{fillerRows.map(renderRow)}</div>
          </div>
        )}

        {lockedRows.length > 0 && (
          <div>
            <h3 className="px-2 pb-1 pt-3 text-xs font-semibold text-ink-500">Locked nations</h3>
            <div className="flex flex-col">{lockedRows.map(renderRow)}</div>
          </div>
        )}
      </div>
    </aside>
    </>
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
    <span className={`gm-tag min-w-0 max-w-full gap-0 px-0 ${held ? "bg-yellow-950/90 text-yellow-100" : "bg-rose-950/80 text-rose-300"}`}>
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
        title="Drag to another nation or the bin, or click to pick up"
        className="flex min-w-0 cursor-grab items-center gap-1 py-0.5 pl-2.5 pr-1 active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="h-3 w-3 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          hostTools.onRemove(player, { x: event.clientX, y: event.clientY });
        }}
        aria-label={`Remove ${label}`}
        title="Remove from the game"
        className="shrink-0 py-0.5 pl-1 pr-2.5 opacity-70 hover:opacity-100"
      >
        <X aria-hidden className="h-3 w-3" />
      </button>
    </span>
  );
}
