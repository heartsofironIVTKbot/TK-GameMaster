"use client";

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

  // Spawn just below the top bar, under its Host Tool button, never over the roster.
  useLayoutEffect(() => {
    const buttonEl = document.querySelector("[data-host-tool-button]");
    const button = buttonEl?.getBoundingClientRect();
    const roster = document.querySelector('aside[aria-label="Reservation roaster"]')?.getBoundingClientRect();
    const minLeft = roster ? roster.right + PANEL_GAP : PANEL_GAP;
    const left = Math.max(button?.left ?? minLeft, minLeft);
    setPosition(clampToViewport(left, topBarBottom() + SPAWN_GAP, panelRef.current));
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
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        width: PANEL_WIDTH,
        maxHeight: `calc(100vh - ${(position?.top ?? 0) + PANEL_GAP}px)`,
        visibility: position ? "visible" : "hidden",
      }}
      className="fixed z-[960] flex flex-col overflow-hidden rounded-2xl border border-amber-400/30 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <header
        onPointerDown={startDrag}
        title="Drag to move"
        className="flex cursor-move select-none items-center gap-2 border-b border-white/10 px-3 py-2.5"
      >
        <span className="text-lg">🛠️</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-xs font-black uppercase tracking-wider text-amber-300">Host Tool</p>
          <p className="truncate text-[11px] text-slate-400">{lobbyName}{demo ? " · preview" : ""}</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-white"
          aria-label={collapsed ? "Expand Host Tool" : "Collapse Host Tool"}
        >
          {collapsed ? "▾" : "▴"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-rose-300"
          aria-label="Turn off Host Tool"
          title="Turn off Host Tool"
        >
          ✕
        </button>
      </header>

      {!collapsed && (
        <div className="roster-scroll flex-1 space-y-3 overflow-y-auto p-3">
          {games.length > 1 && (
            <select
              value={selectedThread}
              onChange={(event) => onSelectThread(event.target.value)}
              aria-label="Game to manage"
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-100 [color-scheme:dark] focus:border-amber-300/50 focus:outline-none"
            >
              {games.map((game) => (
                <option key={game.thread_id} value={game.thread_id}>
                  {game.game_started ? "🔴 In progress · " : ""}
                  {game.thread_name ?? game.mode ?? game.thread_id}
                </option>
              ))}
            </select>
          )}

          {heldPlayer && (
            <div className="flex items-center gap-2 rounded-xl border border-yellow-300/50 bg-yellow-300/10 px-3 py-2 text-xs text-yellow-100">
              <span className="text-base">✋</span>
              <span className="min-w-0 flex-1">
                Placing <b>{heldPlayer.name}</b> — click a nation on the map or roster.
              </span>
              <button type="button" onClick={() => onPickUp(null)} className="font-bold text-yellow-200 hover:text-white">
                Esc
              </button>
            </div>
          )}

          <div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="🔎 Find a player (name, nickname or ID)"
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Drag a player onto a nation — or click them, then click the nation.
            </p>
          </div>

          {searchable && searching && <p className="text-xs text-slate-400">Searching…</p>}
          {searchable && searchError && <p className="text-xs text-rose-300">{searchError}</p>}
          {searchable && !searching && results.length === 0 && !searchError && (
            <p className="text-xs text-slate-500">No members match “{needle}”.</p>
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
                      className={`flex w-full cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition active:cursor-grabbing ${
                        held
                          ? "border-yellow-300/70 bg-yellow-300/15"
                          : "border-white/5 bg-white/[0.03] hover:border-amber-300/40 hover:bg-white/[0.06]"
                      }`}
                      title="Drag onto a nation, or click to pick up"
                    >
                      <Avatar url={member.avatar_url} name={player.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-100">
                          {player.name}
                          {member.is_vip && <span className="ml-1 text-amber-300" title="VIP">★</span>}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">
                          {member.username ? `@${member.username}` : member.discord_id}
                          {player.from_slot && <span className="text-sky-300"> · on {slotLabel(player.from_slot)}</span>}
                        </span>
                      </span>
                      {member.verified ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300" title="Steam verified">
                          ✓
                        </span>
                      ) : (
                        <span
                          className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-300"
                          title="Not Steam verified via LegionMaster — the bot will refuse"
                        >
                          Unverified
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2">
            <DropZone
              icon="＋"
              label="Add as filler"
              tone="sky"
              heldPlayer={heldPlayer}
              onPlayer={(player, point) => onFiller(player, point)}
              pointOf={pointOf}
            />
            <DropZone
              icon="🗑"
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
            onClick={() => onNotifyChange(!notify)}
            className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
              notify ? "border-emerald-400/20 bg-emerald-500/5" : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <span className="text-base">{notify ? "🔔" : "🔕"}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-xs font-bold text-slate-100">Notify players</span>
              <span className="block text-[10px] text-slate-400">
                {notify
                  ? "Players get a DM when you add, move, swap or remove them."
                  : "Off: players aren't told about your changes."}
              </span>
            </span>
            {/* Same switch as the settings toggles (components/schedule/ui.tsx). */}
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                notify ? "border-amber-300/60 bg-amber-400" : "border-white/15 bg-slate-700/70"
              }`}
            >
              <span
                className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
                  notify ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          {actions.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Activity</p>
              <ul className="space-y-1.5">
                {actions.map((action) => (
                  <li
                    key={action.id}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                      action.state === "error"
                        ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                        : action.state === "confirm"
                          ? "border-amber-300/40 bg-amber-400/10 text-amber-100"
                          : action.state === "done"
                            ? "border-emerald-400/20 bg-emerald-500/5 text-emerald-100"
                            : "border-white/10 bg-white/[0.03] text-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-px">
                        {action.state === "pending" ? (
                          <span className="gm-spin inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent" />
                        ) : action.state === "done" ? "✓" : action.state === "confirm" ? "⚠️" : "✕"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{action.label}</span>
                        {action.message && <span className="block opacity-80">{action.message}</span>}
                        {action.state === "confirm" &&
                          action.warnings.map((warning) => (
                            <span key={warning} className="mt-0.5 block opacity-90">• {warning}</span>
                          ))}
                      </span>
                      {action.state !== "pending" && action.state !== "confirm" && (
                        <button type="button" onClick={() => onDismiss(action.id)} className="opacity-50 hover:opacity-100" aria-label="Dismiss">
                          ✕
                        </button>
                      )}
                    </div>
                    {action.state === "confirm" && (
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onConfirm(action)}
                          className="rounded-md bg-amber-400 px-2.5 py-1 text-[11px] font-black text-slate-950 hover:bg-amber-300"
                        >
                          Add anyway
                        </button>
                        <button
                          type="button"
                          onClick={() => onDismiss(action.id)}
                          className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-slate-200"
                        >
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
  icon,
  label,
  tone,
  heldPlayer,
  onPlayer,
  pointOf,
}: {
  icon: string;
  label: string;
  tone: "sky" | "rose";
  heldPlayer: HostPlayer | null;
  onPlayer: (player: HostPlayer, point: DropPoint) => void;
  pointOf: (event: React.MouseEvent | React.DragEvent) => DropPoint;
}) {
  const [over, setOver] = useState(false);
  const colors =
    tone === "rose"
      ? over ? "border-rose-300 bg-rose-500/25 text-rose-100" : "border-rose-400/30 text-rose-200/80"
      : over ? "border-sky-300 bg-sky-500/25 text-sky-100" : "border-sky-400/30 text-sky-200/80";
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
      className={`flex flex-col items-center gap-0.5 rounded-xl border border-dashed px-2 py-3 text-[11px] font-bold transition ${colors} ${
        heldPlayer ? "cursor-pointer" : "cursor-default"
      }`}
      title={heldPlayer ? `Click to use ${heldPlayer.name} here` : "Drop a player here"}
    >
      <span className="text-lg leading-none">{icon}</span>
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
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-[11px] font-black text-slate-200"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
