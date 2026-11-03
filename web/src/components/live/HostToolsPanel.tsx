"use client";

import {
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  GripVertical,
  Hand,
  Puzzle,
  Search,
  Star,
  TriangleAlert,
  UserMinus,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DirectoryMember } from "@/lib/scheduleTypes";
import type { GameLobby, LobbyReservation } from "@/lib/types";
import { writeDragPlayer, isPlayerDrag, readDragPlayer, type DropPoint, type HostPlayer } from "./hostTypes";
import type { HostAction } from "./useHostTools";

/**
 * Floating host tools panel on the live map: find any server member and
 * drag them onto a nation (map or roster), or click to pick them up and
 * click a nation. Drop zones add fillers and remove players. The activity
 * list shows each queued action until the bot answers — including the
 * warnings a host must accept ("Add anyway").
 */
export default function HostToolsPanel({
  lobbyName,
  games,
  selectedThread,
  onSelectThread,
  reservations,
  heldPlayer,
  actions,
  demo,
  notify,
  onNotifyChange,
  onPickUp,
  onFiller,
  onRemove,
  onConfirm,
  onDismiss,
  onClose,
  slotLabel,
}: {
  lobbyName: string;
  /** Lobbies the host can manage (open + in progress). */
  games: GameLobby[];
  selectedThread: string;
  onSelectThread: (threadId: string) => void;
  reservations: LobbyReservation[];
  heldPlayer: HostPlayer | null;
  actions: HostAction[];
  demo: boolean;
  /** DM players about every change made here (on by default). */
  notify: boolean;
  onNotifyChange: (next: boolean) => void;
  onPickUp: (player: HostPlayer | null) => void;
  onFiller: (player: HostPlayer, point: DropPoint) => void;
  onRemove: (player: HostPlayer, point: DropPoint) => void;
  onConfirm: (action: HostAction) => void;
  onDismiss: (id: number) => void;
  onClose: () => void;
  /** Board name for a reservation slot key. */
  slotLabel: (slot: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Spawn just below the top bar, under its Host Tool button, never over the
  // reservations list, and below the Help button when it's in the way.
  useLayoutEffect(() => {
    const buttonEl = document.querySelector("[data-host-tool-button]");
    const button = buttonEl?.getBoundingClientRect();
    const roster = document.querySelector('aside[aria-label="Reservations"]')?.getBoundingClientRect();
    const minLeft = roster ? roster.right + PANEL_GAP : PANEL_GAP;
    const left = Math.max(button?.left ?? minLeft, minLeft);
    let top = topBarBottom() + SPAWN_GAP;
    const help = document.querySelector('[data-tour="help.button"]')?.getBoundingClientRect();
    if (help && help.width > 0 && help.left < left + PANEL_WIDTH && help.right > left && help.top < top + 48) {
      top = help.bottom + PANEL_GAP;
    }
    setPosition(clampToViewport(left, top, panelRef.current));
  }, []);

  // Keep the panel on screen when the window shrinks.
  useEffect(() => {
    const onResize = () =>
      setPosition((current) => (current ? clampToViewport(current.left, current.top, panelRef.current) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drag by the header (buttons inside it still click normally).
  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button") || !position) return;
    event.preventDefault();
    const offsetX = event.clientX - position.left;
    const offsetY = event.clientY - position.top;
    const onMove = (move: PointerEvent) =>
      setPosition(clampToViewport(move.clientX - offsetX, move.clientY - offsetY, panelRef.current));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const slotByUser = useMemo(
    () => new Map(reservations.map((reservation) => [String(reservation.user_id), reservation.slot_key])),
    [reservations],
  );

  const needle = query.trim();
  const searchable = needle.length >= 2;

  useEffect(() => {
    if (needle.length < 2) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        // The game's own server's members (multi-server).
        const game = selectedThread ? `&thread_id=${encodeURIComponent(selectedThread)}` : "";
        const response = await fetch(`/api/live/players?q=${encodeURIComponent(needle)}${game}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as { players?: DirectoryMember[]; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.players) {
          setSearchError(body?.error ?? "Search failed");
          setResults([]);
        } else {
          setSearchError(null);
          setResults(body.players);
        }
      } catch {
        if (!cancelled) setSearchError("Network error");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [needle, selectedThread]);

  const toPlayer = (member: DirectoryMember): HostPlayer => ({
    user_id: member.discord_id,
    name: (member.ingame_nickname || member.display_name || member.username || member.discord_id).slice(0, 32),
    avatar_url: member.avatar_url,
    from_slot: slotByUser.get(member.discord_id) ?? null,
  });

  const pointOf = (event: React.MouseEvent | React.DragEvent): DropPoint => ({ x: event.clientX, y: event.clientY });

  return (
    <section
      ref={panelRef}
      aria-label="Host Tool"
      data-tour="hosttool.panel"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        width: PANEL_WIDTH,
        maxHeight: `calc(100vh - ${(position?.top ?? 0) + PANEL_GAP}px)`,
        visibility: position ? "visible" : "hidden",
      }}
      className="gm-plate fixed z-[960] flex flex-col bg-ink-950 [--cut:14px]"
    >
      <header
        onPointerDown={startDrag}
        title="Drag to move"
        className="flex cursor-move select-none items-center gap-2.5 border-b border-ink-800 py-2 pl-2.5 pr-2"
      >
        <GripVertical aria-hidden className="h-4 w-4 shrink-0 text-ink-600" />
        <Wrench aria-hidden className="h-4 w-4 shrink-0 text-brand-400" strokeWidth={1.75} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="gm-title text-xl">Host Tool</p>
          <p className="truncate text-[11.5px] text-ink-400">
            {selectedThread ? lobbyName : "No game open"}
            {demo ? " (preview)" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="gm-btn gm-btn-quiet h-[30px] w-[30px] p-0"
          aria-label={collapsed ? "Expand Host Tool" : "Collapse Host Tool"}
        >
          {collapsed ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="gm-btn gm-btn-quiet h-[30px] w-[30px] p-0"
          aria-label="Turn off Host Tool"
          title="Turn off Host Tool"
        >
          <X aria-hidden />
        </button>
      </header>

      {!collapsed && !selectedThread && (
        <div className="p-3">
          <p className="gm-cut bg-ink-900 p-3 text-[13px] leading-snug text-ink-300 [--cut:10px]">
            There&apos;s no game on the map to manage yet. Games show up here once the calendar announces them; then you can
            add, move and remove players.
          </p>
        </div>
      )}

      {!collapsed && selectedThread && (
        <div className="roster-scroll flex-1 space-y-3 overflow-y-auto p-3">
          {games.length > 1 && (
            <label className="gm-field">
              <Gamepad2 aria-hidden className="h-4 w-4 shrink-0" />
              <select
                value={selectedThread}
                onChange={(event) => onSelectThread(event.target.value)}
                aria-label="Game to manage"
                className="[color-scheme:dark]"
              >
                {games.map((game) => (
                  <option key={game.thread_id} value={game.thread_id}>
                    {game.game_started ? "In progress: " : ""}
                    {game.thread_name ?? game.mode ?? game.thread_id}
                  </option>
                ))}
              </select>
            </label>
          )}

          {heldPlayer && (
            <div className="gm-cut flex items-center gap-2.5 bg-yellow-950 py-2 pl-2.5 pr-2 text-[12.5px] text-ink-100 shadow-[inset_3px_0_0_var(--color-yellow-300)] [--cut:8px]">
              <Hand aria-hidden className="h-4 w-4 shrink-0 text-yellow-300" />
              <span className="min-w-0 flex-1">
                Placing <b>{heldPlayer.name}</b>: click a nation on the map or in the list.
              </span>
              <button type="button" onClick={() => onPickUp(null)} className="gm-btn gm-btn-secondary h-[26px] px-2.5 text-[11.5px] [--cut:5px]">
                Esc
              </button>
            </div>
          )}

          <div data-tour="hosttool.search">
            <label className="gm-field">
              <Search aria-hidden className="h-4 w-4 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a player (name, nickname or ID)"
                aria-label="Find a player"
              />
            </label>
            <p className="mt-1.5 px-0.5 text-xs text-ink-400">Drag a player onto a nation, or click them and then the nation.</p>
          </div>

          {searchable && searching && <p className="text-xs text-ink-400">Searching…</p>}
          {searchable && searchError && <p className="text-xs text-rose-300">{searchError}</p>}
          {searchable && !searching && results.length === 0 && !searchError && (
            <p className="text-xs text-ink-500">No members match “{needle}”.</p>
          )}
          {searchable && results.length > 0 && (
            <ul className="space-y-1">
              {results.map((member) => {
                const player = toPlayer(member);
                const held = heldPlayer?.user_id === player.user_id;
                return (
                  <li key={member.discord_id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => writeDragPlayer(event, player)}
                      onClick={() => onPickUp(held ? null : player)}
                      className={`gm-cut grid w-full cursor-grab grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-1.5 text-left transition-colors [--cut:7px] active:cursor-grabbing ${
                        held ? "bg-yellow-950 shadow-[inset_2px_0_0_var(--color-yellow-300)]" : "bg-ink-900 hover:bg-ink-800"
                      }`}
                      title="Drag onto a nation, or click to pick up"
                    >
                      <Avatar url={member.avatar_url} name={player.name} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate text-[13px] font-semibold text-ink-100">
                          <span className="truncate">{player.name}</span>
                          {member.is_vip && (
                            <Star aria-label="VIP" className="h-3 w-3 shrink-0 fill-yellow-300 text-yellow-300" />
                          )}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-500">
                          {member.username ? `@${member.username}` : member.discord_id}
                          {player.from_slot && <span className="text-sky-300"> · on {slotLabel(player.from_slot)}</span>}
                        </span>
                      </span>
                      {member.verified ? (
                        <span className="gm-tag gm-tag-dot h-[19px] bg-emerald-950 px-2 text-[10.5px] text-emerald-300" title="Steam authenticated with IronLegion">
                          Authenticated
                        </span>
                      ) : (
                        <span
                          className="gm-tag gm-tag-dot h-[19px] bg-rose-950 px-2 text-[10.5px] text-rose-300"
                          title="Not Steam authenticated with IronLegion: games that need it will refuse them"
                        >
                          Not authenticated
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div data-tour="hosttool.zones" className="grid grid-cols-2 gap-2">
            <DropZone
              icon={Puzzle}
              label="Add as filler"
              tone="sky"
              heldPlayer={heldPlayer}
              onPlayer={(player, point) => onFiller(player, point)}
              pointOf={pointOf}
            />
            <DropZone
              icon={UserMinus}
              label="Remove from game"
              tone="rose"
              heldPlayer={heldPlayer}
              onPlayer={(player, point) => {
                if (player.from_slot) onRemove(player, point);
              }}
              pointOf={pointOf}
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={notify}
            data-tour="hosttool.notify"
            onClick={() => onNotifyChange(!notify)}
            className="gm-cut flex w-full items-center gap-2.5 bg-ink-900 p-2.5 text-left [--cut:10px]"
          >
            {notify ? (
              <Bell aria-hidden className="h-4 w-4 shrink-0 text-ink-300" />
            ) : (
              <BellOff aria-hidden className="h-4 w-4 shrink-0 text-ink-500" />
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13px] font-semibold text-ink-100">Notify players</span>
              <span className="mt-0.5 block text-[11.5px] text-ink-400">
                {notify
                  ? "Players get a DM when you add, move, swap or remove them."
                  : "Off: players aren't told about your changes."}
              </span>
            </span>
            {/* The cut-plate switch. */}
            <span className={`gm-cut relative h-[22px] w-[38px] shrink-0 transition-colors [--cut:5px] ${notify ? "bg-brand-400" : "bg-ink-700"}`}>
              <span
                className={`gm-cut absolute top-[3px] h-4 w-4 transition-[left] [--cut:4px] ${
                  notify ? "left-[19px] bg-brand-950" : "left-[3px] bg-ink-300"
                }`}
              />
            </span>
          </button>

          {actions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-500">Activity</p>
              <ul className="space-y-1">
                {actions.map((action) => (
                  <li
                    key={action.id}
                    className={`gm-cut py-2 pl-2.5 pr-2 text-xs [--cut:8px] ${
                      action.state === "confirm"
                        ? "bg-yellow-950 text-ink-300 shadow-[inset_3px_0_0_var(--color-yellow-300)]"
                        : action.state === "error"
                          ? "bg-rose-950 text-rose-200"
                          : "bg-ink-900 text-ink-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-px shrink-0">
                        {action.state === "pending" ? (
                          <span className="gm-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-ink-400 border-t-transparent" />
                        ) : action.state === "done" ? (
                          <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2.5} />
                        ) : action.state === "confirm" ? (
                          <TriangleAlert aria-hidden className="h-3.5 w-3.5 text-yellow-300" />
                        ) : (
                          <X aria-hidden className="h-3.5 w-3.5 text-rose-300" strokeWidth={2.5} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-ink-100">{action.label}</span>
                        {action.message && <span className="block">{action.message}</span>}
                        {action.state === "confirm" && (
                          <ul className="mt-1 list-disc pl-4">
                            {action.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        )}
                      </span>
                      {action.state !== "pending" && action.state !== "confirm" && (
                        <button
                          type="button"
                          onClick={() => onDismiss(action.id)}
                          className="shrink-0 text-ink-500 hover:text-ink-100"
                          aria-label="Dismiss"
                        >
                          <X aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {action.state === "confirm" && (
                      <div className="mt-2 flex gap-1.5 pl-[22px]">
                        <button type="button" onClick={() => onConfirm(action)} className="gm-btn gm-btn-primary h-7 px-2.5 text-xs [--cut:6px]">
                          Add anyway
                        </button>
                        <button type="button" onClick={() => onDismiss(action.id)} className="gm-btn gm-btn-quiet h-7 px-2.5 text-xs [--cut:6px]">
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const PANEL_WIDTH = 340;
const PANEL_GAP = 8;
/** Space between the top bar and a freshly opened panel. */
const SPAWN_GAP = 12;

/** Bottom edge of the top bar the Host Tool button lives in (it sits above the panel). */
function topBarBottom(): number {
  const bar = document.querySelector("[data-host-tool-button]")?.closest("header");
  return bar?.getBoundingClientRect().bottom ?? 80;
}

/** Keep the panel's header reachable: fully inside the window horizontally,
 *  and its top edge below the top bar and above the bottom of the screen. */
function clampToViewport(left: number, top: number, panel: HTMLElement | null) {
  const width = panel?.offsetWidth || PANEL_WIDTH;
  const minTop = topBarBottom() + PANEL_GAP;
  const maxLeft = Math.max(PANEL_GAP, window.innerWidth - width - PANEL_GAP);
  const maxTop = Math.max(minTop, window.innerHeight - 48);
  return {
    left: Math.min(Math.max(left, PANEL_GAP), maxLeft),
    top: Math.min(Math.max(top, minTop), maxTop),
  };
}

function DropZone({
  icon: Icon,
  label,
  tone,
  heldPlayer,
  onPlayer,
  pointOf,
}: {
  icon: LucideIcon;
  label: string;
  tone: "sky" | "rose";
  heldPlayer: HostPlayer | null;
  onPlayer: (player: HostPlayer, point: DropPoint) => void;
  pointOf: (event: React.MouseEvent | React.DragEvent) => DropPoint;
}) {
  const [over, setOver] = useState(false);
  const colors =
    tone === "rose"
      ? over ? "bg-rose-950 text-rose-200" : "bg-ink-900 text-rose-300"
      : over ? "bg-sky-950 text-sky-200" : "bg-ink-900 text-sky-300";
  return (
    <button
      type="button"
      onDragOver={(event) => {
        if (!isPlayerDrag(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const player = readDragPlayer(event);
        if (!player) return;
        event.preventDefault();
        onPlayer(player, pointOf(event));
      }}
      onClick={(event) => {
        if (heldPlayer) onPlayer(heldPlayer, pointOf(event));
      }}
      className={`gm-cut gm-hatch-faint flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors [--cut:10px] ${colors} ${
        heldPlayer ? "cursor-pointer" : "cursor-default"
      }`}
      title={heldPlayer ? `Click to use ${heldPlayer.name} here` : "Drop a player here"}
    >
      <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
      {label}
    </button>
  );
}

export function Avatar({ url, name, size = 26 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      // Discord CDN avatar; plain <img> keeps next/image config untouched.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full" />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-bold text-ink-100"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
