"use client";

import { ChevronLeft, ChevronRight, CircleAlert, Info, Lock, LockOpen, Map as MapIcon, Megaphone, PanelRightOpen, TriangleAlert } from "lucide-react";
import { MenuButton } from "@/components/site/SiteMenu";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTutorialFacts } from "@/components/tutorial/TutorialProvider";
import { boardDisplayName, canonicalName, nationMatchKeys } from "@/data/nationCategories";
import { usePresetDefaults } from "@/components/presets/usePresetDefaults";
import { notPlayableNations, type GamePreset } from "@/lib/presetTypes";
import { lockLevelLabel, modeOption } from "@/lib/scheduleOptions";
import { lastBookableDay } from "@/lib/bookingWindow";
import type {
  CalendarDayLock,
  CalendarResponse,
  CalendarSlot,
  HostOption,
  HostProfile,
  SlotDetails,
} from "@/lib/scheduleTypes";
import type { NationFeatureProps, RosterNation } from "@/lib/types";
import { addDays, dateInZone, formatDateLong, isIsoDate, todayInZone } from "@/lib/timeEngine";
import AccessTab from "./setup/AccessTab";
import ModeIcon from "./ModeIcon";
import AnnounceTab from "./setup/AnnounceTab";
import ExtrasTab from "./setup/ExtrasTab";
import GameTab from "./setup/GameTab";
import NationsTab from "./setup/NationsTab";
import ReviewTab from "./setup/ReviewTab";
import SubmitOverlay from "./setup/SubmitOverlay";
import type { TimelineMarker } from "./setup/Timeline";
import Timeline from "./setup/Timeline";
import {
  TABS,
  TIME_HOST_TABS,
  applyPreset,
  clearPreset,
  deriveSetup,
  formFromSettings,
  initialForm,
  tabOfSection,
  type EditTarget,
  type SetupForm,
  type TabId,
} from "./setup/model";
import TimeZonePicker, { useHostTimeZone } from "./TimeZonePicker";
import { HostAvatar, Spinner } from "./ui";
import { submitScheduleRequest } from "./useRequestPoller";

// Leaflet touches `window` on import — load the map in the browser only.
const HostLockMap = dynamic(() => import("./HostLockMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0f1d21] text-sm text-ink-400">
      Loading map…
    </div>
  ),
});

/**
 * Game setup: the scenario map beside a panel on the right that walks
 * through the /schedule options in five steps: game and time,
 * announcement, players (who can reserve and nation locks: click nations on
 * the map to lock them), extras, review.
 *
 * With `editSlotId` it edits an existing game instead: every setting before
 * the announcement, only the day/time/host after it.
 */
export default function GameSetupApp({
  host,
  initialDate,
  editSlotId,
  initialPresetId = null,
}: {
  host: HostProfile;
  initialDate: string | null;
  editSlotId: string | null;
  /** /schedule/new?preset=<id>: start from this preset. */
  initialPresetId?: string | null;
}) {
  const [timeZone, setTimeZone] = useHostTimeZone();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const nowSec = Math.floor(nowMs / 1000);
  const today = todayInZone(timeZone, nowMs);
  const [form, setForm] = useState<SetupForm>(() =>
    initialForm(initialDate && isIsoDate(initialDate) ? initialDate : todayInZone(timeZone)),
  );
  const [tab, setTab] = useState<TabId>("game");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [nations, setNations] = useState<RosterNation[]>([]);
  // Hover goes straight to the name pill: re-rendering the whole panel on
  // every mouse move made the map stutter.
  const hoverListenerRef = useRef<((nation: NationFeatureProps | null) => void) | null>(null);
  const handleHover = useCallback((nation: NationFeatureProps | null) => hoverListenerRef.current?.(nation), []);
  /** Red borders on the preset's not-playable nations (players see them greyed out). */
  const [showExcluded, setShowExcluded] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ tag: string; nonce: number } | null>(null);
  const [board, setBoard] = useState<{ slots: CalendarSlot[]; locks: CalendarDayLock[] }>({
    slots: [],
    locks: [],
  });
  const [toast, setToast] = useState<string | null>(null);
  const [askConflict, setAskConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editLoad, setEditLoad] = useState<{ state: "loading" | "ready" | "error"; message?: string }>(
    () => ({ state: editSlotId ? "loading" : "ready" }),
  );
  const [hosts, setHosts] = useState<HostOption[]>([]);
  // Zone at load time: the edit form is prefilled once, not on zone changes.
  const loadZoneRef = useRef(timeZone);

  useTutorialFacts({ isHost: true, isStaff: host.is_staff, helpInBar: true });

  const update = useCallback((patch: Partial<SetupForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);
  const { defaults: presetDefaults } = usePresetDefaults();

  const loadPreset = useCallback((preset: GamePreset) => {
    setForm((current) => applyPreset(current, preset));
    setToast(`Loaded preset “${preset.name}”.`);
  }, []);

  // /schedule/new?preset=<id> (the Presets page's "Use in a game").
  useEffect(() => {
    if (!initialPresetId || editSlotId) return undefined;
    let cancelled = false;
    fetch(`/api/presets/${encodeURIComponent(initialPresetId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { preset?: GamePreset; error?: string } | null;
        if (cancelled) return;
        if (response.ok && body?.preset) loadPreset(body.preset);
        else setToast(body?.error ?? "Couldn't load that preset.");
      })
      .catch(() => {
        if (!cancelled) setToast("Couldn't load that preset.");
      });
    return () => {
      cancelled = true;
    };
  }, [initialPresetId, editSlotId, loadPreset]);

  // A new game starts from its mode's default preset (the star on the Presets
  // page), looked up once per mode; without one it lists the whole map.
  const [defaultCheckedFor, setDefaultCheckedFor] = useState<string | null>(null);
  useEffect(() => {
    if (editSlotId || initialPresetId || defaultCheckedFor === form.mode) return undefined;
    let cancelled = false;
    const mode = form.mode;
    fetch(`/api/presets?mode=${encodeURIComponent(mode)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { presets?: GamePreset[] } | null;
        if (cancelled) return;
        setDefaultCheckedFor(mode);
        const preset = body?.presets?.find((entry) => entry.is_default);
        if (!preset) return;
        setForm((current) => (current.mode === mode && !current.presetName ? applyPreset(current, preset) : current));
        setToast(`Started from “${preset.name}”, this mode's default preset.`);
      })
      .catch(() => {
        if (!cancelled) setDefaultCheckedFor(mode);
      });
    return () => {
      cancelled = true;
    };
  }, [form.mode, defaultCheckedFor, editSlotId, initialPresetId]);

  // Editing: load the game's stored settings.
  useEffect(() => {
    if (!editSlotId) return undefined;
    let cancelled = false;
    const zone = loadZoneRef.current;
    fetch(`/api/schedule/slots/${encodeURIComponent(editSlotId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as (SlotDetails & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !result?.slot) {
          setEditLoad({ state: "error", message: result?.error ?? `Could not load the game (HTTP ${response.status})` });
          return;
        }
        if (result.editable === "locked") {
          setEditLoad({ state: "error", message: result.reason ?? "This game can't be edited any more." });
          return;
        }
        setForm(formFromSettings(result.settings, zone));
        setEditing({
          slotId: result.slot.slot_id,
          editable: result.editable,
          originalDate: dateInZone(result.slot.game_timestamp * 1000, zone),
          originalGameSec: result.slot.game_timestamp,
          hostId: result.slot.host_id,
          hostName: result.slot.host_username,
        });
        setEditLoad({ state: "ready", message: result.reason ?? undefined });
      })
      .catch(() => {
        if (!cancelled) setEditLoad({ state: "error", message: "Network error — reload to try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [editSlotId]);

  // The server's hosts: who a game can be handed to, and its co-hosts (Casino games).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/schedule/hosts", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ hosts: HostOption[] }>) : null))
      .then((result) => {
        if (!cancelled && result) setHosts(result.hosts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Board context for the bookable window: same-day games + staff locks.
  useEffect(() => {
    let cancelled = false;
    const from = Math.floor(Date.parse(`${addDays(today, -1)}T00:00:00Z`) / 1000);
    // No limit (staff): the next 60 days (the calendar API serves 70 at most).
    const last = lastBookableDay(host.booking_days, today, Date.now(), timeZone) ?? addDays(today, 60);
    const to = Math.floor(Date.parse(`${addDays(last, 1)}T23:59:59Z`) / 1000);
    const load = async () => {
      try {
        const response = await fetch(`/api/schedule/calendar?from=${from}&to=${to}`, { cache: "no-store" });
        if (!response.ok) return;
        const result = (await response.json()) as CalendarResponse;
        if (!cancelled) setBoard({ slots: result.slots, locks: result.locks });
      } catch {
        // Context only — the bot re-checks day locks itself.
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [today, timeZone, host.booking_days]);

  const mode = modeOption(form.mode);
  const scenarioId = mode?.scenarioId ?? null;
  const derived = useMemo(
    () =>
      deriveSetup(form, {
        timeZone,
        nowSec,
        today,
        slots: board.slots,
        locks: board.locks,
        editing,
        booking: host.booking_days,
      }),
    [form, timeZone, nowSec, today, board, editing, host.booking_days],
  );
  const timeOnly = editing?.editable === "time_host";
  const tabs = timeOnly ? TABS.filter((entry) => TIME_HOST_TABS.includes(entry.id)) : TABS;

  const activeGroup =
    form.lockGroups.find((group) => group.id === form.activeGroupId) ?? form.lockGroups[0];
  const { editingTags, groupTags } = useMemo(() => {
    // Locks hold the bot's nation names; the map sometimes names them differently.
    const activeKeys = new Set(activeGroup.nations.map(canonicalName));
    const otherKeys = new Set(
      form.lockGroups.filter((group) => group.id !== activeGroup.id).flatMap((group) => group.nations).map(canonicalName),
    );
    const matches = (nation: RosterNation, keys: Set<string>) =>
      [...nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name)].some((key) => keys.has(key));
    return {
      editingTags: nations.filter((nation) => matches(nation, activeKeys)).map((nation) => nation.tag),
      groupTags: nations.filter((nation) => matches(nation, otherKeys)).map((nation) => nation.tag),
    };
  }, [nations, form.lockGroups, activeGroup]);

  // The mode's nations as the bot names them (map names are translated to these).
  const modeDefaults = presetDefaults?.modes[form.mode];
  const botNations = useMemo(
    () => (modeDefaults ? [...modeDefaults.majors, ...modeDefaults.minors] : []),
    [modeDefaults],
  );
  const notPlayable = useMemo(() => notPlayableNations(form.layout, botNations), [form.layout, botNations]);
  // Map nations outside the preset's playable groups (players see them greyed out).
  const excludedTags = useMemo(() => {
    if (!form.layout) return [];
    const playable = new Set(
      form.layout.filter((group) => group.enabled).flatMap((group) => group.tiers.flatMap((tier) => tier.nations)).map(canonicalName),
    );
    return nations
      .filter((nation) => ![...nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name)].some((key) => playable.has(key)))
      .map((nation) => nation.tag);
  }, [form.layout, nations]);
  const toBotName = useCallback(
    (slot: string) => {
      const nation = nations.find((entry) => entry.slot_key === slot);
      if (!nation || botNations.length === 0) return slot;
      const keys = nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name);
      return botNations.find((name) => keys.has(canonicalName(name))) ?? slot;
    },
    [nations, botNations],
  );

  /** Toggle slot names in the group being edited (all in → remove them). */
  const toggleNations = useCallback((mapSlots: string[]) => {
    const slots = mapSlots.map(toBotName);
    setForm((current) => {
      const active =
        current.lockGroups.find((group) => group.id === current.activeGroupId) ?? current.lockGroups[0];
      const allIn = slots.every((slot) => active.nations.includes(slot));
      const slotSet = new Set(slots);
      return {
        ...current,
        lockGroups: current.lockGroups.map((group) => {
          if (group.id === active.id) {
            return {
              ...group,
              nations: allIn
                ? group.nations.filter((slot) => !slotSet.has(slot))
                : [...group.nations, ...slots.filter((slot) => !group.nations.includes(slot))],
            };
          }
          // A nation lives in one group only: moving it here removes it there.
          return allIn ? group : { ...group, nations: group.nations.filter((slot) => !slotSet.has(slot)) };
        }),
      };
    });
  }, [toBotName]);

  const handleMapClick = useCallback(
    (nation: NationFeatureProps) => {
      if (!nation.slot_key) return;
      if (timeOnly) {
        setToast("Nation locks are fixed after the announcement — change them on the Games page.");
        return;
      }
      toggleNations([nation.slot_key]);
      setTab("players");
      setDrawerOpen(true);
    },
    [toggleNations, timeOnly],
  );

  const handleModeChange = (next: string) => {
    const nextScenario = modeOption(next)?.scenarioId ?? null;
    const changedMap = nextScenario !== scenarioId;
    const hadLocks = form.lockGroups.some((group) => group.nations.length > 0);
    const hadPreset = form.presetName !== null && next !== form.mode;
    setForm((current) => {
      const changed = {
        ...current,
        mode: next,
        lockGroups:
          changedMap && hadLocks
            ? current.lockGroups.map((group) => ({ ...group, nations: [] }))
            : current.lockGroups,
      };
      // A preset belongs to one mode.
      return hadPreset ? clearPreset(changed) : changed;
    });
    if (hadPreset) setToast("Preset removed — it was made for another mode.");
    if (changedMap) {
      setNations([]);
      handleHover(null);
      if (hadLocks) setToast("Nation locks cleared — this mode uses a different map.");
    }
  };

  const markers = useMemo<TimelineMarker[]>(() => {
    const list: TimelineMarker[] = [];
    if (derived.announceSec !== null) {
      list.push({ key: "announce", unixSec: derived.announceSec, icon: Megaphone, label: "Announced", color: "oklch(86% 0.15 95)" });
    }
    if (!derived.casino) {
      for (const scope of ["major", "minor"] as const) {
        const level = scope === "major" ? form.majorLevel : form.minorLevel;
        const unlock = form.unlocks[scope];
        if (unlock.enabled && level !== "All Users") {
          list.push({
            key: `unlock-${scope}`,
            unixSec: derived.unlockSec[scope],
            icon: LockOpen,
            label: `${scope === "major" ? "Majors" : "Minors"} open to ${lockLevelLabel(unlock.target)}`,
            color: scope === "major" ? "oklch(72% 0.13 300)" : "oklch(79.4% 0.118 174)",
          });
        }
      }
    }
    for (const group of form.lockGroups) {
      if (group.releaseEnabled && group.nations.length > 0) {
        list.push({
          key: `release-${group.id}`,
          unixSec: derived.releaseSec[group.id],
          icon: Lock,
          label: `${group.label} unlocks`,
          color: "oklch(70% 0.17 22)",
        });
      }
    }
    return list;
  }, [derived, form]);

  const issueSections = new Set(derived.issues.map((issue) => tabOfSection(issue.section)));

  const send = async () => {
    if (!derived.payload) return;
    setAskConflict(false);
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitScheduleRequest(
      editing
        ? {
            action: "update",
            slot_id: editing.slotId,
            payload: { ...derived.payload, new_host_id: form.handoverTo },
          }
        : { action: "create", payload: derived.payload },
    );
    setSubmitting(false);
    if (result.ok) setRequestId(result.requestId);
    else setSubmitError(result.error);
  };

  const handleSchedule = () => {
    if (!derived.payload) {
      setTab(derived.issues[0] ? tabOfSection(derived.issues[0].section) : "review");
      return;
    }
    if (derived.conflicts.length > 0) {
      setAskConflict(true);
      return;
    }
    void send();
  };

  const tabIndex = tabs.findIndex((entry) => entry.id === tab);
  const nextTab = tabs[tabIndex + 1] ?? null;

  if (editLoad.state !== "ready") {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-ink-950 p-4 text-ink-100">
        {editLoad.state === "loading" ? (
          <p className="flex items-center gap-3 text-sm font-semibold text-ink-300">
            <Spinner className="h-5 w-5 text-brand-400" /> Loading the game…
          </p>
        ) : (
          <div className="gm-plate gm-fade-up flex w-full max-w-md flex-col items-center p-8 text-center">
            <Lock aria-hidden className="h-9 w-9 text-ink-500" strokeWidth={1.5} />
            <h1 className="gm-title mt-4 text-[28px]">Can&apos;t edit this game</h1>
            <p className="mt-2 text-sm text-ink-400">{editLoad.message}</p>
            <Link href="/schedule" className="gm-btn gm-btn-primary mt-6">
              Back to the calendar
            </Link>
          </div>
        )}
      </main>
    );
  }

  const describeHover = (nation: NationFeatureProps) => ({
    name: scenarioId ? boardDisplayName(scenarioId, nation.tag, nation.name) : nation.name,
    status: activeGroup.nations.includes(nation.slot_key ?? "")
      ? "click to unlock"
      : form.lockGroups.some((group) => group.nations.includes(nation.slot_key ?? ""))
        ? `click to move into ${activeGroup.label}`
        : `click to lock in ${activeGroup.label}`,
  });

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink-950 text-ink-100">
      {/* Map (the WebGL switch rebuilds it; it keeps today's look until then) */}
      <div data-tour="setup.map" className="absolute inset-x-0 bottom-0 top-14 z-0 lg:right-[420px]">
        {scenarioId ? (
          <HostLockMap
            scenarioId={scenarioId}
            editingTags={editingTags}
            groupTags={groupTags}
            excludedTags={showExcluded ? excludedTags : NO_TAGS}
            onNationClick={handleMapClick}
            onNationsChange={setNations}
            onHoverChange={handleHover}
            focusRequest={focusRequest}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#0f1d21] p-8">
            <div className="max-w-md text-center">
              {mode ? <ModeIcon mode={mode.value} className="mx-auto h-10 w-10 text-ink-500" strokeWidth={1.5} /> : <MapIcon aria-hidden className="mx-auto h-10 w-10 text-ink-500" strokeWidth={1.5} />}
              <p className="gm-title mt-4 text-[28px]">{mode ? mode.label : "Pick a game mode"}</p>
              <p className="mt-2 text-sm text-ink-400">
                {mode
                  ? "This mode has no map yet. Nation locks can still be added by name."
                  : "Its map shows here, and you can click nations to lock them."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-[1000] flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-950 px-3 sm:px-4">
        <Link href="/schedule" className="gm-btn gm-btn-quiet h-9 w-9 p-0" aria-label="Back to the calendar">
          <ChevronLeft aria-hidden strokeWidth={1.75} />
        </Link>
        <span className="gm-cut hidden h-9 w-9 shrink-0 place-items-center bg-ink-800 text-ink-100 sm:grid">
          {mode ? <ModeIcon mode={mode.value} className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <MapIcon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs text-ink-400">
            {editing ? "Edit game" : "New game"}
            {mode ? `, ${mode.label}` : ""}
          </p>
          <p className="gm-title truncate text-[22px]">
            {formatDateLong(form.date)}, {form.time}
          </p>
        </div>
        {host.demo && <span className="gm-tag hidden bg-fuchsia-500/15 text-fuchsia-200 md:inline-flex">Preview: sample data</span>}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:block">
            <TimeZonePicker value={timeZone} onChange={setTimeZone} />
          </span>
          {/* Room for the Help button (it sits here, see useTutorialFacts). */}
          <span aria-hidden className="w-[92px] shrink-0" />
          <span className="hidden sm:block">
            <HostAvatar host={host} />
          </span>
          <MenuButton current="calendar" label={false} />
        </div>
      </header>

      {scenarioId && <HoverPill listenerRef={hoverListenerRef} describe={describeHover} />}

      {/* What the map's colours mean */}
      {scenarioId && (
        <div className="absolute left-3 right-3 top-[68px] z-[950] hidden flex-wrap items-center gap-2 lg:right-[436px] lg:flex">
          <div className="gm-cut flex flex-wrap items-center gap-x-4 gap-y-1 bg-ink-950 px-3 py-2 text-xs text-ink-300 shadow-[inset_0_0_0_1px_var(--color-ink-800)] [--cut:8px]">
            <Legend color={EDITING} label={`Editing: ${activeGroup.label} (${activeGroup.nations.length})`} />
            {form.lockGroups.length > 1 && <Legend color={GROUP} label="Other lock groups" />}
            {showExcluded && excludedTags.length > 0 && <Legend color={EXCLUDED} label={`Not playable (${notPlayable.length})`} />}
          </div>
          {excludedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExcluded((value) => !value)}
              aria-pressed={showExcluded}
              className={`gm-btn h-8 bg-ink-950 px-3 text-xs [--cut:7px] ${showExcluded ? "gm-btn-danger" : "gm-btn-secondary"}`}
              title="Players see not-playable nations greyed out and locked. The red borders are only here, to make them easy to spot."
            >
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${showExcluded ? "bg-rose-400" : "border border-rose-400"}`} />
              {showExcluded ? "Hide" : "Show"} not playable ({notPlayable.length})
            </button>
          )}
        </div>
      )}

      {/* Panel */}
      <aside
        className={`absolute bottom-0 right-0 top-14 z-[1000] flex w-full flex-col border-l border-ink-800 bg-ink-950 transition-transform duration-300 lg:w-[420px] lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <nav className="flex shrink-0 border-b border-ink-800 px-2" aria-label="Steps">
          {tabs.map((entry, index) => {
            const active = entry.id === tab;
            const Icon = entry.icon;
            const flagged = entry.id !== "review" && issueSections.has(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                data-tour={`setup.tab.${entry.id} setup.tabs`}
                onClick={() => setTab(entry.id)}
                aria-current={active ? "step" : undefined}
                className={`relative flex h-[54px] flex-1 flex-col items-center justify-center gap-[3px] text-xs font-semibold transition-colors ${
                  active ? "text-ink-100 shadow-[inset_0_-2px_0_var(--color-brand-400)]" : "text-ink-400 hover:text-ink-100"
                }`}
              >
                <Icon
                  aria-hidden
                  className={`h-[17px] w-[17px] ${active ? "text-brand-400" : index < tabIndex && !flagged ? "text-emerald-300" : ""}`}
                  strokeWidth={1.75}
                />
                <span className="hidden sm:block">{entry.label}</span>
                {flagged && <span className="absolute right-[calc(50%-18px)] top-2 h-2 w-2 rounded-full bg-rose-400" aria-label="Needs a fix" />}
              </button>
            );
          })}
        </nav>

        <div key={tab} className="roster-scroll gm-fade-up min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
          {editing && editLoad.message && (
            <p className="gm-cut flex gap-2.5 bg-sky-950/60 px-3 py-2.5 text-[12.5px] text-ink-300 shadow-[inset_3px_0_0_var(--color-sky-300)] [--cut:10px]">
              <Info aria-hidden className="mt-px h-4 w-4 shrink-0 text-sky-300" strokeWidth={1.75} />
              <span>{editLoad.message}</span>
            </p>
          )}
          {tab === "game" && (
            <GameTab
              form={form}
              update={update}
              derived={derived}
              timeZone={timeZone}
              today={today}
              locks={board.locks}
              onModeChange={handleModeChange}
              onApplyPreset={loadPreset}
              editing={editing}
              hosts={hosts}
              branches={host.branches}
              disabledModes={host.disabled_modes}
              booking={host.booking_days}
              nowMs={nowMs}
            />
          )}
          {tab === "announce" && (
            <AnnounceTab form={form} update={update} derived={derived} timeZone={timeZone} nowSec={nowSec} host={host} />
          )}
          {tab === "players" && (
            <>
              <AccessTab form={form} update={update} derived={derived} timeZone={timeZone} nowSec={nowSec} />
              <NationsTab
                form={form}
                update={update}
                derived={derived}
                timeZone={timeZone}
                nowSec={nowSec}
                scenarioId={scenarioId}
                nations={nations}
                onToggleNations={toggleNations}
                onFocusNation={(tag) => setFocusRequest({ tag, nonce: Date.now() })}
                notPlayable={notPlayable}
                presetName={form.presetName}
              />
            </>
          )}
          {tab === "extras" && (
            <ExtrasTab
              form={form}
              update={update}
              modeDefaults={modeDefaults}
              homeServer={host.home_server}
              isStaff={host.is_staff}
              hosts={hosts}
              hostId={editing ? (form.handoverTo ?? editing.hostId) : host.discord_id}
              gameSec={derived.gameSec}
            />
          )}
          {tab === "review" && (
            <ReviewTab
              form={form}
              derived={derived}
              timeZone={timeZone}
              nowSec={nowSec}
              markers={markers}
              onGoTo={setTab}
              editing={editing}
              hosts={hosts}
            />
          )}
        </div>

        {tab !== "review" && (
          <div className="shrink-0 px-3.5 pb-2.5">
            <Timeline nowSec={nowSec} gameSec={derived.gameSec} markers={markers} timeZone={timeZone} compact />
          </div>
        )}

        <footer data-tour="setup.footer" className="shrink-0 border-t border-ink-800 px-3.5 py-3">
          {submitError && <p className="gm-cut mb-2 bg-rose-950/60 px-3 py-1.5 text-xs text-rose-200">{submitError}</p>}
          <div className="flex items-center gap-2">
            {derived.issues.length > 0 ? (
              <button
                type="button"
                onClick={() => setTab(tabOfSection(derived.issues[0].section))}
                className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-xs font-semibold text-rose-300 hover:text-rose-200"
                title={derived.issues.map((issue) => issue.message).join("\n")}
              >
                <CircleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span className="truncate">
                  {derived.issues.length} to fix<span className="hidden sm:inline">: {derived.issues[0].message}</span>
                </span>
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
                <span className="hidden sm:inline">Ready to {editing ? "save" : "schedule"}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="gm-btn gm-btn-quiet h-9 px-2.5 lg:hidden"
              aria-label="Show the map"
            >
              <MapIcon aria-hidden strokeWidth={1.75} /> Map
            </button>
            {nextTab && (
              <button type="button" onClick={() => setTab(nextTab.id)} className="gm-btn gm-btn-secondary h-9 px-3">
                <span className="hidden sm:inline">Next: {nextTab.label}</span>
                <span className="sm:hidden">Next</span>
                <ChevronRight aria-hidden strokeWidth={1.75} />
              </button>
            )}
            <button
              type="button"
              onClick={handleSchedule}
              disabled={submitting}
              className="gm-btn gm-btn-primary h-10 px-[18px] font-display text-[17px] font-extrabold uppercase tracking-[0.02em] [--cut:9px]"
            >
              {submitting && <Spinner className="h-3.5 w-3.5" />}
              {editing ? "Save" : "Schedule"}
            </button>
          </div>
        </footer>
      </aside>

      {!drawerOpen && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="gm-btn gm-btn-primary absolute bottom-4 left-1/2 z-[1000] h-11 -translate-x-1/2 px-5 lg:hidden"
        >
          <PanelRightOpen aria-hidden strokeWidth={1.75} /> Back to the game
        </button>
      )}

      {toast && (
        <div
          role="status"
          className="gm-cut gm-fade-up absolute bottom-20 left-1/2 z-[1500] max-w-[calc(100vw-32px)] -translate-x-1/2 bg-ink-800 px-4 py-2.5 text-[13px] font-semibold text-ink-100 lg:left-[calc(50%-210px)]"
        >
          {toast}
        </div>
      )}

      {askConflict && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-950/75 p-4">
          <div role="dialog" aria-modal="true" className="gm-plate gm-fade-up w-full max-w-sm bg-ink-950 p-6 [--cut:16px]">
            <TriangleAlert aria-hidden className="h-7 w-7 text-yellow-300" strokeWidth={1.75} />
            <h2 className="gm-title mt-3 text-[26px]">Another host has that day</h2>
            <p className="mt-2 text-sm text-ink-300">
              {derived.conflicts
                .map((slot) => `${slot.host_username ? `@${slot.host_username}` : "A host"}, ${modeOption(slot.mode)?.label ?? slot.mode}`)
                .join("; ")}
              . Several hosts can run the same kind of game on one day, so this won&apos;t block you or change their game.
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => void send()} className="gm-btn gm-btn-primary flex-1">
                Continue anyway
              </button>
              <button type="button" onClick={() => setAskConflict(false)} className="gm-btn gm-btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {requestId && (
        <SubmitOverlay
          requestId={requestId}
          modeLabel={mode ? mode.label : form.mode}
          gameSec={derived.gameSec}
          timeZone={timeZone}
          demo={host.demo}
          editing={editing !== null}
          onClose={() => setRequestId(null)}
          onScheduleAnother={() => {
            setRequestId(null);
            setForm(initialForm(form.date));
            setTab("game");
          }}
        />
      )}
    </div>
  );
}

const NO_TAGS: readonly string[] = [];
// The map overlays' colours (components/nationHighlights.ts).
const EDITING = "#c07dff";
const GROUP = "#3cc4ff";
const EXCLUDED = "#ff2442";

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="gm-cut h-3 w-3 shrink-0 [--cut:3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

/** The hovered nation's name and what a click does, kept apart so hovering never re-renders the panel. */
function HoverPill({
  listenerRef,
  describe,
}: {
  listenerRef: RefObject<((nation: NationFeatureProps | null) => void) | null>;
  describe: (nation: NationFeatureProps) => { name: string; status: string };
}) {
  const [hovered, setHovered] = useState<NationFeatureProps | null>(null);
  useEffect(() => {
    listenerRef.current = setHovered;
    return () => {
      listenerRef.current = null;
    };
  }, [listenerRef]);
  if (!hovered) return null;
  const { name, status } = describe(hovered);
  return (
    <div className="gm-cut pointer-events-none absolute bottom-20 left-1/2 z-[950] -translate-x-1/2 whitespace-nowrap bg-ink-950 px-3.5 py-1.5 text-xs font-semibold text-ink-100 shadow-[inset_0_0_0_1px_var(--color-ink-700)] lg:bottom-6 lg:left-[calc(50%-210px)]">
      {name}
      {status && <span className="ml-2 font-normal text-ink-400">{status}</span>}
    </div>
  );
}
