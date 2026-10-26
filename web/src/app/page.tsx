"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import TopBar from "@/components/TopBar";
import ReservationDrawer from "@/components/ReservationDrawer";
import NicknameModal from "@/components/NicknameModal";
import DraftJoinModal from "@/components/draft/DraftJoinModal";
import DraftPanel from "@/components/draft/DraftPanel";
import DraftPickDialog from "@/components/draft/DraftPickDialog";
import { useDraftRequest, useDraftViewer } from "@/components/draft/useDraft";
import {
  draftDrop,
  type DraftChoice,
  type DraftDropTarget,
  type DraftPlacer,
  type DraftPoolEntry,
  type DraftSlot,
} from "@/lib/draft";
import HostToolsPanel from "@/components/live/HostToolsPanel";
import HostPrompt, {
  type HostPromptChoice,
  type HostPromptRequest,
} from "@/components/live/HostPrompt";
import {
  playerFromReservation,
  prettySlot,
  type DropPoint,
  type HostPlayer,
} from "@/components/live/hostTypes";
import { useHostTools } from "@/components/live/useHostTools";
import { boardDisplayName, canonicalName, majorTagsFor, nationMatchKeys } from "@/data/nationCategories";
import type { RosterAssignPayload } from "@/lib/scheduleTypes";
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  scenarioIdFromMode,
  type ScenarioId,
} from "@/data/scenarioData";
import type {
  AuthUser,
  GameLobby,
  LobbyGameLock,
  LobbyReservation,
  MeProfile,
  NationFeatureProps,
  RosterNation,
  SelectionKind,
} from "@/lib/types";

const MapViewer = dynamic(() => import("@/components/MapViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#16283b] text-zinc-400">
      Loading map…
    </div>
  ),
});

/** Human-readable "Session Start: <weekday> <HH:MM> UTC" from epoch seconds. */
function formatSessionTime(timestamp?: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const weekday = date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `Session Start: ${weekday} ${time} UTC`;
}

/** Minimal selection info the top bar chip needs (reported by the map). */
export interface SelectionSummary {
  nationName: string;
  kind: SelectionKind;
  ownerLabel: string | null;
}

export default function Home() {
  // Hoisted lobby state: shared by the top bar (server/mod/session display)
  // and the map viewer (reservation picker). Falls back gracefully when the
  // database is unreachable or no active lobbies exist.
  const [games, setGames] = useState<GameLobby[]>([]);
  const [selectedThread, setSelectedThread] = useState("");
  // The game named by ?game=<thread> (announcement / reminder links).
  const [linkedGame, setLinkedGame] = useState<string | null>(null);

  // Active scenario (Vanilla / Road to 56). Auto-syncs once from the
  // lobby's mode field when it names a known scenario; otherwise the user
  // picks it in the top bar dropdown.
  const [scenarioId, setScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO);

  // Hoisted nation selection: the map owns the geometry click, but the top
  // bar renders the "Pending claim" chip + drawer minimize/close controls on
  // the same row as the Rules/Mods buttons, above the drawer.
  const [selected, setSelected] = useState<NationFeatureProps | null>(null);
  const [selectionSummary, setSelectionSummary] =
    useState<SelectionSummary | null>(null);
  const [drawerMinimized, setDrawerMinimized] = useState(false);

  // Authenticated user + database profile (hoisted: the map, the roster and
  // the nickname onboarding modal all share it).
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<MeProfile | null | undefined>(
    undefined,
  );

  // Roster data reported up by the map (nations + live reservations).
  const [nations, setNations] = useState<RosterNation[]>([]);
  const [reservations, setReservations] = useState<LobbyReservation[]>([]);
  const [gameLock, setGameLock] = useState<LobbyGameLock | null>(null);
  const [rosterOpen, setRosterOpen] = useState(true);

  // Imperative camera focus for roster row clicks (nonce forces re-focus).
  const [focusRequest, setFocusRequest] = useState<{
    tag: string;
    nonce: number;
  } | null>(null);
  // Host-locked nations (from the roster) — greyed out on the map like taken ones.
  const [hostLockedTags, setHostLockedTags] = useState<string[]>([]);

  // Live map host tools (replace /add, /add_coop, /add_filler, /remove):
  // hosts drag players onto nations; the bot applies each change.
  const [reservationsNonce, setReservationsNonce] = useState(0);
  const refreshReservations = useCallback(
    () => setReservationsNonce((nonce) => nonce + 1),
    [],
  );
  const host = useHostTools(refreshReservations);
  const [heldPlayer, setHeldPlayer] = useState<HostPlayer | null>(null);
  const [hostPrompt, setHostPrompt] = useState<HostPromptRequest | null>(null);

  // Nickname onboarding: shown when authenticated but no in-game name is set.
  const [nicknameDismissed, setNicknameDismissed] = useState(false);
  const [nicknameBusy, setNicknameBusy] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          authenticated: boolean;
          user?: AuthUser;
          profile?: MeProfile | null;
        };
      })
      .then((me) => {
        if (cancelled || !me?.authenticated || !me.user) return;
        setAuthUser(me.user);
        setProfile(me.profile ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // ?game=<thread id> (the bot's announcement / reminder links) opens that
    // game — and lists the games of its server (multi-server).
    const wanted = new URLSearchParams(window.location.search).get("game");
    fetch(wanted ? `/api/games?game=${encodeURIComponent(wanted)}` : "/api/games", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { games: GameLobby[] };
      })
      .then((result) => {
        if (cancelled || !result) return;
        setGames(result.games);
        if (result.games.length > 0) {
          setLinkedGame(wanted);
          const initial = result.games.find((game) => game.thread_id === wanted) ?? result.games[0];
          setSelectedThread((current) => current || initial.thread_id);
          // A lobby running Road to 56 auto-selects that scenario once.
          const detected = scenarioIdFromMode(initial.mode);
          if (detected) setScenarioId(detected);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectNation = useCallback((nation: NationFeatureProps | null) => {
    setSelected(nation);
    // A fresh selection always opens the drawer expanded.
    if (nation) setDrawerMinimized(false);
  }, []);

  const handleSelectionSummaryChange = useCallback(
    (summary: SelectionSummary | null) => setSelectionSummary(summary),
    [],
  );

  const handleToggleDrawer = useCallback(
    () => setDrawerMinimized((current) => !current),
    [],
  );

  const handleCloseDrawer = useCallback(() => setSelected(null), []);

  // The map follows the selected game's mode (there's no mode picker): switching
  // to a game on another map swaps it (render-time adjust, once per game).
  const [scenarioThread, setScenarioThread] = useState<string | null>(null);
  const selectedMode = games.find((game) => game.thread_id === selectedThread)?.mode;
  if (selectedThread && selectedMode !== undefined && scenarioThread !== selectedThread) {
    setScenarioThread(selectedThread);
    const next = scenarioIdFromMode(selectedMode);
    if (next && next !== scenarioId) {
      setScenarioId(next);
      // Nations/slot keys differ between scenarios — drop any stale selection
      // so the drawer never inspects a nation from the previous map.
      setSelected(null);
      setSelectionSummary(null);
      setDrawerMinimized(false);
      setFocusRequest(null);
    }
  }

  const handleNationsChange = useCallback((next: RosterNation[]) => {
    setNations(next);
  }, []);

  const handleReservationsChange = useCallback(
    (next: LobbyReservation[]) => {
      setReservations(next);
    },
    [],
  );

  const handleGameLockChange = useCallback((lock: LobbyGameLock | null) => {
    setGameLock(lock);
  }, []);

  const handleFocusNation = useCallback((tag: string) => {
    setFocusRequest({ tag, nonce: Date.now() });
  }, []);

  const handleSaveNickname = useCallback(
    async (nickname: string) => {
      setNicknameBusy(true);
      setNicknameError(null);
      try {
        const response = await fetch("/api/auth/nickname", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname }),
        });
        const result = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (response.ok && result?.ok) {
          setAuthUser((current) =>
            current ? { ...current, ingame_nickname: nickname } : current,
          );
          setProfile((current) =>
            current ? { ...current, ingame_nickname: nickname } : current,
          );
          setNicknameDismissed(true);
        } else {
          setNicknameError(
            result?.error ?? `Save failed (HTTP ${response.status})`,
          );
        }
      } catch {
        setNicknameError("Network error — try again.");
      } finally {
        setNicknameBusy(false);
      }
    },
    [],
  );

  // --- Draft games: join pop-up, the pool in the drawer, picks --------------
  const draft = gameLock?.draft ?? null;
  const [draftNonce, setDraftNonce] = useState(0);
  const handleDraftChanged = useCallback(() => {
    refreshReservations();
    setDraftNonce((nonce) => nonce + 1);
  }, [refreshReservations]);
  const draftRequest = useDraftRequest(handleDraftChanged);
  const { viewer: draftViewer, loaded: draftViewerLoaded } = useDraftViewer(
    draft ? selectedThread : null,
    draftNonce,
  );
  const myDraftId = draftViewer?.user_id ?? authUser?.discord_id ?? null;
  const myDraftEntry = draft && myDraftId ? (draft.pool.find((entry) => entry.user_id === myDraftId) ?? null) : null;
  const myReservation = myDraftId
    ? (reservations.find((reservation) => String(reservation.user_id) === myDraftId) ?? null)
    : null;
  const [joinOpen, setJoinOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState<DraftPoolEntry | null>(null);
  const [draftThread, setDraftThread] = useState(selectedThread);
  if (draftThread !== selectedThread) {
    setDraftThread(selectedThread);
    setJoinOpen(false);
    setPickTarget(null);
  }
  // Opening a draft game's link shows the join pop-up once (render-time adjust).
  const [autoJoinShown, setAutoJoinShown] = useState<string | null>(null);
  if (draft && draftViewerLoaded && linkedGame === selectedThread && autoJoinShown !== selectedThread) {
    setAutoJoinShown(selectedThread);
    if (draft.phase === "ENLISTING" && !myDraftEntry && !myReservation) setJoinOpen(true);
  }
  const reservedSlots = useMemo(() => new Set(reservations.map((reservation) => reservation.slot_key)), [reservations]);
  const lockedNations = useMemo(() => new Set(gameLock?.locked_regions ?? []), [gameLock]);
  const { submit: submitDraft, fail: failDraft, reset: resetDraft } = draftRequest;
  const sendDraft = useCallback(
    (body: Record<string, unknown>) => {
      // Host placements / removals follow the Host Tool's Notify players switch.
      const notify = body.action === "assign" || body.action === "remove" ? { notify: host.notify } : {};
      void submitDraft({ thread_id: selectedThread, ...body, ...notify });
    },
    [submitDraft, selectedThread, host.notify],
  );
  const openJoin = useCallback(() => {
    resetDraft();
    setJoinOpen(true);
  }, [resetDraft]);
  // Who may place pool players: the captain on the clock and / or the host.
  const pickTeam =
    draft?.phase === "DRAFTING" && draftViewer?.captain_of && draft.current_turn === draftViewer.captain_of
      ? draftViewer.captain_of
      : null;
  const draftCanManage = Boolean(draft && draftViewer?.can_manage);
  const draftPlacer = useMemo<DraftPlacer>(() => ({ pickTeam, canManage: draftCanManage }), [pickTeam, draftCanManage]);
  const gameStarted = Boolean(games.find((game) => game.thread_id === selectedThread)?.game_started);
  // Drag pool players onto nations (map or list) or the filler zone.
  const draftCanDrag = Boolean(draft && draft.pool.length > 0 && !gameStarted && (pickTeam || draftCanManage));
  const isPoolPlayer = useCallback(
    (player: HostPlayer) => Boolean(draft && !player.from_slot && draft.pool.some((entry) => entry.user_id === player.user_id)),
    [draft],
  );
  /** The bot's name for a map nation ("German Reich" on the map is "Germany"), or null if it isn't in this game. */
  const draftBotName = useCallback(
    (nation: NationFeatureProps): string | null => {
      if (!draft) return null;
      const keys = nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name);
      const names = [
        ...draft.playable.majors,
        ...draft.playable.minors,
        ...draft.teams.flatMap((team) => [...team.majors, ...team.minors]),
      ];
      return names.find((name) => keys.has(canonicalName(name))) ?? null;
    },
    [draft],
  );
  const handleDraftDrop = useCallback(
    (player: HostPlayer, target: DraftDropTarget) => {
      if (!draft) return;
      const drop = draftDrop(draft, reservedSlots, lockedNations, draftPlacer, target);
      if (!drop.ok) {
        failDraft(`${player.name}: ${drop.error}`);
        return;
      }
      sendDraft({ action: drop.action, user_id: player.user_id, slot: drop.slot });
    },
    [draft, reservedSlots, lockedNations, draftPlacer, failDraft, sendDraft],
  );

  // --- Host tools -----------------------------------------------------------
  const toolsActive = host.enabled && Boolean(selectedThread);

  useEffect(() => {
    if (!heldPlayer) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHeldPlayer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [heldPlayer]);

  /** Board name for a reservation slot ("German Reich_coop" → "Germany (Co-op)"). */
  const slotLabel = useCallback(
    (slot: string) => {
      if (slot.startsWith("_FILL_")) return prettySlot(slot);
      const coop = slot.match(/^(.*)_coop(?:_(\d+))?$/);
      const base = coop ? coop[1] : slot;
      const nation = nations.find((entry) => entry.slot_key === base);
      const name = nation ? boardDisplayName(scenarioId, nation.tag, nation.name) : base;
      return coop ? `${name} (Co-op${coop[2] ? ` ${coop[2]}` : ""})` : name;
    },
    [nations, scenarioId],
  );

  const sendAssign = useCallback(
    (
      player: HostPlayer,
      fields: Pick<RosterAssignPayload, "kind" | "nation" | "filler_name" | "occupied">,
      label: string,
    ) => {
      void host.send(
        {
          action: "roster_assign",
          payload: { thread_id: selectedThread, user_id: player.user_id, force: false, ...fields },
        },
        label,
        fields.nation,
      );
    },
    [host, selectedThread],
  );

  /** A player dropped (or placed) on a nation: assign it, or ask what to do. */
  const handleDropOnNation = useCallback(
    (nation: NationFeatureProps, player: HostPlayer, point: DropPoint) => {
      setHeldPlayer(null);
      const slot = nation.slot_key;
      if (!slot || !selectedThread) return;
      const nationName = boardDisplayName(scenarioId, nation.tag, nation.name);
      // Draft pool players go through the draft (captain's pick / host placement).
      if (isPoolPlayer(player)) {
        const botName = draftBotName(nation);
        if (!botName) failDraft(`${player.name}: ${nationName} isn't playable in this game.`);
        else handleDraftDrop(player, { kind: "nation", slot: botName, name: nationName });
        return;
      }
      if (!toolsActive) return;
      const occupant = reservations.find((reservation) => reservation.slot_key === slot);
      if (occupant && String(occupant.user_id) === player.user_id) return;
      if (!occupant) {
        sendAssign(
          player,
          { kind: "nation", nation: slot, filler_name: null, occupied: null },
          `${player.name} → ${nationName}`,
        );
        return;
      }
      setHostPrompt({
        type: "occupied",
        point,
        player,
        occupant: playerFromReservation(occupant),
        slot,
        nationName,
        allowCoop: majorTagsFor(scenarioId).has(nation.tag),
      });
    },
    [reservations, scenarioId, selectedThread, sendAssign, isPoolPlayer, handleDraftDrop, toolsActive, draftBotName, failDraft],
  );

  const handlePlaceHeld = useCallback(
    (nation: NationFeatureProps, point: DropPoint) => {
      if (heldPlayer) handleDropOnNation(nation, heldPlayer, point);
    },
    [heldPlayer, handleDropOnNation],
  );

  const handleRemoveRequest = useCallback((player: HostPlayer, point: DropPoint) => {
    setHeldPlayer(null);
    if (player.from_slot) setHostPrompt({ type: "remove", point, player });
  }, []);

  const handleFillerRequest = useCallback(
    (player: HostPlayer, point: DropPoint) => {
      setHeldPlayer(null);
      if (isPoolPlayer(player)) {
        handleDraftDrop(player, { kind: "filler" });
        return;
      }
      setHostPrompt({ type: "filler", point, player });
    },
    [isPoolPlayer, handleDraftDrop],
  );

  const handlePromptChoice = (choice: HostPromptChoice) => {
    const prompt = hostPrompt;
    setHostPrompt(null);
    if (!prompt) return;
    if (prompt.type === "remove") {
      void host.send(
        { action: "roster_remove", payload: { thread_id: selectedThread, user_id: prompt.player.user_id } },
        `Remove ${prompt.player.name}`,
        prompt.player.from_slot,
      );
      return;
    }
    if (prompt.type === "filler" && choice.kind === "filler") {
      sendAssign(
        prompt.player,
        { kind: "filler", nation: null, filler_name: choice.name, occupied: null },
        `${prompt.player.name} → filler “${choice.name}”`,
      );
      return;
    }
    if (prompt.type !== "occupied") return;
    const { player, occupant, slot, nationName } = prompt;
    if (choice.kind === "coop") {
      sendAssign(player, { kind: "coop", nation: slot, filler_name: null, occupied: null }, `${player.name} → ${nationName} co-op`);
    } else if (choice.kind === "swap") {
      sendAssign(player, { kind: "nation", nation: slot, filler_name: null, occupied: "swap" }, `${player.name} ⇄ ${occupant.name}`);
    } else if (choice.kind === "replace") {
      sendAssign(
        player,
        { kind: "nation", nation: slot, filler_name: null, occupied: "replace" },
        `${player.name} replaces ${occupant.name} on ${nationName}`,
      );
    }
  };

  const pendingSlots = useMemo(
    () =>
      new Set(
        host.actions
          .filter((action) => action.state === "pending" && action.targetSlot)
          .map((action) => action.targetSlot as string),
      ),
    [host.actions],
  );

  // Full host tools (Host Tool on), or — in a draft game — only the drop
  // targets for pool players (the captain on the clock or the host).
  const mapHostTools = useMemo(
    () =>
      toolsActive
        ? { heldPlayer, onDropPlayer: handleDropOnNation, onPlaceHeld: handlePlaceHeld, dragAvatars: true }
        : draftCanDrag
          ? { heldPlayer: null, onDropPlayer: handleDropOnNation, onPlaceHeld: () => {}, dragAvatars: false }
          : null,
    [toolsActive, draftCanDrag, heldPlayer, handleDropOnNation, handlePlaceHeld],
  );
  const drawerHostTools = useMemo(
    () =>
      toolsActive
        ? {
            heldPlayer,
            pendingSlots,
            onDropPlayer: handleDropOnNation,
            onPlaceHeld: handlePlaceHeld,
            onPickUp: setHeldPlayer,
            onRemove: handleRemoveRequest,
            manage: true,
          }
        : draftCanDrag
          ? {
              heldPlayer: null,
              pendingSlots: new Set<string>(),
              onDropPlayer: handleDropOnNation,
              onPlaceHeld: () => {},
              onPickUp: () => {},
              onRemove: () => {},
              manage: false,
            }
          : null,
    [toolsActive, draftCanDrag, heldPlayer, pendingSlots, handleDropOnNation, handlePlaceHeld, handleRemoveRequest],
  );

  const activeGame =
    games.find((game) => game.thread_id === selectedThread) ?? null;
  const lobbyName = activeGame?.thread_name?.trim() || "GameMaster · HOI4";
  const sessionTime = `${activeGame?.game_started ? "🔴 In progress · " : ""}${
    formatSessionTime(activeGame?.start_timestamp) || "Session Start: TBA"
  }`;

  // Nickname modal: only when authenticated AND the profile is known (a null
  // profile means the database is unreachable — don't nag in that case).
  const showNicknameModal =
    authUser !== null &&
    profile !== undefined &&
    profile !== null &&
    !profile.ingame_nickname &&
    !nicknameDismissed;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#16283b]">
      {/* Map fills the full viewport edge-to-edge. */}
      <MapViewer
        scenarioId={scenarioId}
        games={games}
        selectedThread={selectedThread}
        onSelectThread={setSelectedThread}
        selected={selected}
        onSelectNation={handleSelectNation}
        drawerMinimized={drawerMinimized}
        onToggleDrawer={handleToggleDrawer}
        onSelectionSummaryChange={handleSelectionSummaryChange}
        authUser={authUser}
        onNationsChange={handleNationsChange}
        onReservationsChange={handleReservationsChange}
        onGameLockChange={handleGameLockChange}
        focusRequest={focusRequest}
        hostTools={mapHostTools}
        reservationsNonce={reservationsNonce}
        viewerIsHost={host.isHost}
        onJoinDraft={openJoin}
        hostLockedTags={hostLockedTags}
      />

      {/* Left slide-out reservation board (below the top bar). */}
      <ReservationDrawer
        open={rosterOpen}
        onToggle={() => setRosterOpen((current) => !current)}
        nations={nations}
        reservations={reservations}
        selected={selected}
        selectedThread={selectedThread}
        scenarioId={scenarioId}
        authUser={authUser}
        hostId={activeGame?.host_id ?? null}
        gameLock={gameLock}
        onSelectNation={handleSelectNation}
        onFocusNation={handleFocusNation}
        hostTools={drawerHostTools}
        viewerIsHost={host.isHost}
        onHostLockedChange={setHostLockedTags}
        draftPanel={
          draft ? (
            <DraftPanel
              draft={draft}
              viewer={draftViewer}
              myUserId={myDraftId}
              reservations={reservations}
              request={draftRequest}
              canDrag={draftCanDrag}
              onJoin={openJoin}
              onPlace={(entry) => {
                resetDraft();
                setPickTarget(entry);
              }}
              onDropFiller={(player) => handleFillerRequest(player, { x: 0, y: 0 })}
              onRemove={(entry) => sendDraft({ action: "remove", user_id: entry.user_id })}
              onStart={() => sendDraft({ action: "start" })}
              onFinish={() => sendDraft({ action: "finish" })}
            />
          ) : null
        }
      />

      {draft && joinOpen && (
        <DraftJoinModal
          key={selectedThread}
          draft={draft}
          lobbyName={lobbyName}
          loggedIn={Boolean(myDraftId)}
          loginHref={`/api/auth/login?next=${encodeURIComponent(`/?game=${selectedThread}`)}`}
          myEntry={myDraftEntry}
          myNote={draftViewer?.my_note ?? null}
          mySlot={myReservation ? slotLabel(myReservation.slot_key) : null}
          request={draftRequest}
          onSubmit={(choice: DraftChoice, note: string) => sendDraft({ action: "join", preference: choice, note })}
          onLeave={() => sendDraft({ action: "leave" })}
          onClose={() => setJoinOpen(false)}
        />
      )}
      {draft && pickTarget && (
        <DraftPickDialog
          draft={draft}
          entry={pickTarget}
          note={draftViewer?.notes?.[pickTarget.user_id] ?? null}
          placer={draftPlacer}
          reserved={reservedSlots}
          locked={lockedNations}
          busy={draftRequest.busy}
          onConfirm={(slot: DraftSlot, action) => {
            const target = pickTarget;
            setPickTarget(null);
            sendDraft({ action, user_id: target.user_id, slot: slot.key });
          }}
          onClose={() => setPickTarget(null)}
        />
      )}

      {toolsActive && (
        <HostToolsPanel
          lobbyName={activeGame?.game_started ? `🔴 In progress · ${lobbyName}` : lobbyName}
          games={games}
          selectedThread={selectedThread}
          onSelectThread={(threadId) => {
            setSelectedThread(threadId);
            setHeldPlayer(null);
          }}
          reservations={reservations}
          heldPlayer={heldPlayer}
          actions={host.actions}
          demo={host.demo}
          notify={host.notify}
          onNotifyChange={host.setNotify}
          onPickUp={setHeldPlayer}
          onFiller={handleFillerRequest}
          onRemove={handleRemoveRequest}
          onConfirm={host.confirm}
          onDismiss={host.dismiss}
          slotLabel={slotLabel}
          onClose={() => {
            host.setEnabled(false);
            setHeldPlayer(null);
          }}
        />
      )}

      {hostPrompt && (
        <HostPrompt
          request={hostPrompt}
          slotLabel={slotLabel}
          notify={host.notify}
          onChoose={handlePromptChoice}
          onCancel={() => setHostPrompt(null)}
        />
      )}

      {/* Nickname onboarding (after Discord login, before first claim). */}
      <NicknameModal
        open={showNicknameModal}
        busy={nicknameBusy}
        error={nicknameError}
        onSave={(nickname) => {
          void handleSaveNickname(nickname);
        }}
        onDismiss={() => setNicknameDismissed(true)}
      />

      {/* Frosted header floats over the top 80px of the map canvas. */}
      <TopBar
        lobbyName={lobbyName}
        scenarioName={SCENARIOS[scenarioId].label}
        sessionTime={sessionTime}
        selection={
          selectionSummary
            ? {
                nationName: selectionSummary.nationName,
                kind: selectionSummary.kind,
              }
            : null
        }
        drawerMinimized={drawerMinimized}
        onToggleDrawer={handleToggleDrawer}
        onCloseDrawer={handleCloseDrawer}
        hostTools={
          host.isHost
            ? {
                enabled: host.enabled,
                onToggle: () => {
                  host.setEnabled(!host.enabled);
                  setHeldPlayer(null);
                },
              }
            : null
        }
      />
    </div>
  );
}
