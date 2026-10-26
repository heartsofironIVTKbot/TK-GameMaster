"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boardDisplayName, canonicalName, nationMatchKeys } from "@/data/nationCategories";
import { usePresetDefaults } from "@/components/presets/usePresetDefaults";
import { notPlayableNations, type GamePreset } from "@/lib/presetTypes";
import { CATEGORY_META, lastBookableDate, lockLevelLabel, modeOption } from "@/lib/scheduleOptions";
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
  type EditTarget,
  type SetupForm,
  type TabId,
} from "./setup/model";
import TimeZonePicker, { useHostTimeZone } from "./TimeZonePicker";
import { GLASS, HostAvatar, Spinner } from "./ui";
import { submitScheduleRequest } from "./useRequestPoller";

// Leaflet touches `window` on import — load the map in the browser only.
const HostLockMap = dynamic(() => import("./HostLockMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#16283b] text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

/**
 * Game setup: the scenario map fills the screen (click nations to lock
 * them) and a drawer on the right walks through the /schedule options —
 * game & time, announcement, access & unlocks, nation locks, extras, review.
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
  const [hovered, setHovered] = useState<NationFeatureProps | null>(null);
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

  // Editing: load the game's stored settings + the hosts it can go to.
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
    fetch("/api/schedule/hosts", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ hosts: HostOption[] }>) : null))
      .then((result) => {
        if (!cancelled && result) setHosts(result.hosts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editSlotId]);

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
    const to = Math.floor(Date.parse(`${addDays(lastBookableDate(today), 1)}T23:59:59Z`) / 1000);
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
  }, [today]);

  const mode = modeOption(form.mode);
  const scenarioId = mode?.scenarioId ?? null;
  const derived = useMemo(
    () => deriveSetup(form, { timeZone, nowSec, today, slots: board.slots, locks: board.locks, editing }),
    [form, timeZone, nowSec, today, board, editing],
  );
  const timeOnly = editing?.editable === "time_host";
  const tabs = timeOnly ? TABS.filter((entry) => TIME_HOST_TABS.includes(entry.id)) : TABS;

  const activeGroup =
    form.lockGroups.find((group) => group.id === form.activeGroupId) ?? form.lockGroups[0];
  const { activeTags, otherTags } = useMemo(() => {
    // Locks hold the bot's nation names; the map sometimes names them differently.
    const activeKeys = new Set(activeGroup.nations.map(canonicalName));
    const otherKeys = new Set(
      form.lockGroups.filter((group) => group.id !== activeGroup.id).flatMap((group) => group.nations).map(canonicalName),
    );
    const matches = (nation: RosterNation, keys: Set<string>) =>
      [...nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name)].some((key) => keys.has(key));
    return {
      activeTags: nations.filter((nation) => matches(nation, activeKeys)).map((nation) => nation.tag),
      otherTags: nations.filter((nation) => matches(nation, otherKeys)).map((nation) => nation.tag),
    };
  }, [nations, form.lockGroups, activeGroup]);

  // The mode's nations as the bot names them (map names are translated to these).
  const modeDefaults = presetDefaults?.modes[form.mode];
  const botNations = useMemo(
    () => (modeDefaults ? [...modeDefaults.majors, ...modeDefaults.minors] : []),
    [modeDefaults],
  );
  const notPlayable = useMemo(() => notPlayableNations(form.layout, botNations), [form.layout, botNations]);
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
      setTab("nations");
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
      setHovered(null);
      if (hadLocks) setToast("Nation locks cleared — this mode uses a different map.");
    }
  };

  const markers = useMemo<TimelineMarker[]>(() => {
    const list: TimelineMarker[] = [];
    if (derived.announceSec !== null) {
      list.push({ key: "announce", unixSec: derived.announceSec, icon: "📣", label: "Announcement", color: "#38bdf8" });
    }
    if (!derived.casino) {
      for (const scope of ["major", "minor"] as const) {
        const level = scope === "major" ? form.majorLevel : form.minorLevel;
        const unlock = form.unlocks[scope];
        if (unlock.enabled && level !== "All Users") {
          list.push({
            key: `unlock-${scope}`,
            unixSec: derived.unlockSec[scope],
            icon: "🔓",
            label: `${scope === "major" ? "Majors" : "Minors"} open to ${lockLevelLabel(unlock.target)}`,
            color: scope === "major" ? "#a78bfa" : "#34d399",
          });
        }
      }
    }
    for (const group of form.lockGroups) {
      if (group.releaseEnabled && group.nations.length > 0) {
        list.push({
          key: `release-${group.id}`,
          unixSec: derived.releaseSec[group.id],
          icon: "🗺️",
          label: `${group.label} unlocks`,
          color: "#fb7185",
        });
      }
    }
    return list;
  }, [derived, form]);

  const issueSections = new Set(derived.issues.map((issue) => issue.section));

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
      setTab(derived.issues[0]?.section ?? "review");
      return;
    }
    if (derived.conflicts.length > 0) {
      setAskConflict(true);
      return;
    }
    void send();
  };

  const tabIndex = tabs.findIndex((entry) => entry.id === tab);
  const category = mode ? CATEGORY_META[mode.category] : null;

  if (editLoad.state !== "ready") {
    return (
      <main className="gm-backdrop flex min-h-screen w-full items-center justify-center p-4 text-slate-100">
        {editLoad.state === "loading" ? (
          <p className="flex items-center gap-3 text-sm font-semibold text-slate-300">
            <Spinner className="h-5 w-5 text-amber-400" /> Loading the game…
          </p>
        ) : (
          <div className={`gm-fade-up w-full max-w-md rounded-3xl p-8 text-center ${GLASS}`}>
            <div className="text-5xl">🔒</div>
            <h1 className="mt-4 text-xl font-black text-white">Can&apos;t edit this game</h1>
            <p className="mt-2 text-sm text-slate-400">{editLoad.message}</p>
            <Link
              href="/schedule"
              className="mt-6 inline-block rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950"
            >
              Back to the calendar
            </Link>
          </div>
        )}
      </main>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b1322] text-slate-100">
      {/* Map (or a backdrop for modes without one) */}
      <div className="absolute inset-0 z-0">
        {scenarioId ? (
          <HostLockMap
            scenarioId={scenarioId}
            activeTags={activeTags}
            otherTags={otherTags}
            onNationClick={handleMapClick}
            onNationsChange={setNations}
            onHoverChange={setHovered}
            focusRequest={focusRequest}
          />
        ) : (
          <div className="gm-backdrop flex h-full w-full items-center justify-center p-8 lg:pr-[500px]">
            <div className="max-w-md text-center">
              <div className="text-6xl opacity-80">{category?.emoji ?? "🗺️"}</div>
              <p className="mt-4 text-2xl font-black text-white/80">
                {mode ? mode.label : "Pick a game mode"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {mode
                  ? "This mode has no interactive map yet — nation locks can still be added by name."
                  : "Its map appears here, and you can click nations to lock them."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-[1000] border-b border-white/10 bg-slate-950/55 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
          <Link
            href="/schedule"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-amber-300/40"
          >
            ← Calendar
          </Link>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-black text-white">
              {editing ? "Edit game" : "New game"} · {formatDateLong(form.date)}
            </p>
            <p className="truncate text-[11px] font-semibold text-slate-400">
              {mode ? (
                <span className={category?.text}>
                  {category?.emoji} {mode.label}
                </span>
              ) : (
                "No mode picked yet"
              )}{" "}
              · {form.time}
            </p>
          </div>
          {host.demo && (
            <span className="hidden rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-bold text-fuchsia-200 md:inline">
              PREVIEW MODE
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <TimeZonePicker value={timeZone} onChange={setTimeZone} />
            <span className="hidden sm:block">
              <HostAvatar host={host} />
            </span>
          </div>
        </div>
      </header>

      {/* Hovered nation */}
      {scenarioId && hovered && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-[950] -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/80 px-4 py-1.5 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md lg:left-[calc(50%-240px)]">
          {boardDisplayName(scenarioId, hovered.tag, hovered.name)}
          <span className="ml-2 text-slate-400">
            {activeGroup.nations.includes(hovered.slot_key ?? "")
              ? "click to unlock"
              : form.lockGroups.some((group) => group.nations.includes(hovered.slot_key ?? ""))
                ? `click to move into “${activeGroup.label}”`
                : `click to lock in “${activeGroup.label}”`}
          </span>
        </div>
      )}

      {/* Map legend */}
      {scenarioId && (
        <div className="absolute bottom-4 left-4 z-[950] rounded-2xl border border-white/10 bg-slate-950/75 px-3.5 py-2.5 text-[11px] font-semibold text-slate-300 shadow-xl backdrop-blur-md">
          <p className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#ff5266] shadow-[0_0_8px_#ff2442]" />
            Editing: {activeGroup.label} ({activeGroup.nations.length})
          </p>
          {form.lockGroups.length > 1 && (
            <p className="mt-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#3cc4ff] shadow-[0_0_8px_#1f6bff]" />
              Other lock groups
            </p>
          )}
          <p className="mt-1 text-slate-500">Click a nation to lock / unlock it</p>
        </div>
      )}

      {/* Drawer */}
      <aside
        className={`absolute bottom-3 right-3 top-[76px] z-[1000] flex w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl transition-transform duration-300 ${GLASS} ${
          drawerOpen ? "translate-x-0" : "translate-x-[calc(100%+16px)]"
        }`}
      >
        <nav className="flex items-center gap-1 border-b border-white/10 p-2">
          {tabs.map((entry) => {
            const active = entry.id === tab;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${
                  active ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-base leading-none">{entry.icon}</span>
                <span className="hidden sm:block">{entry.label}</span>
                {entry.id !== "review" && issueSections.has(entry.id) && (
                  <span className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-slate-900" />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="ml-1 rounded-lg px-2 py-1 text-slate-500 hover:text-white"
            aria-label="Hide panel"
            title="Hide panel to see the map"
          >
            <span className="text-[10px] font-black sm:hidden">MAP</span>
            <span className="hidden sm:inline">▸</span>
          </button>
        </nav>

        <div key={tab} className="roster-scroll gm-fade-up flex-1 overflow-y-auto p-3 sm:p-4">
          {editing && editLoad.message && (
            <p className="mb-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
              📣 {editLoad.message}
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
            />
          )}
          {tab === "announce" && (
            <div className="space-y-4">
              <AnnounceTab form={form} update={update} derived={derived} timeZone={timeZone} nowSec={nowSec} host={host} />
              <Timeline nowSec={nowSec} gameSec={derived.gameSec} markers={markers} timeZone={timeZone} />
            </div>
          )}
          {tab === "access" && (
            <div className="space-y-4">
              <AccessTab form={form} update={update} derived={derived} timeZone={timeZone} nowSec={nowSec} />
              <Timeline nowSec={nowSec} gameSec={derived.gameSec} markers={markers} timeZone={timeZone} />
            </div>
          )}
          {tab === "nations" && (
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
          )}
          {tab === "extras" && <ExtrasTab form={form} update={update} modeDefaults={modeDefaults} />}
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

        <footer className="border-t border-white/10 bg-slate-950/40 p-3">
          {submitError && (
            <p className="mb-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100">
              {submitError}
            </p>
          )}
          <div className="flex items-center gap-2">
            {derived.issues.length > 0 ? (
              <button
                type="button"
                onClick={() => setTab(derived.issues[0].section)}
                className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-rose-300 hover:text-rose-200"
                title={derived.issues.map((issue) => issue.message).join("\n")}
              >
                ● {derived.issues.length} to fix
                <span className="hidden sm:inline"> — {derived.issues[0].message}</span>
              </button>
            ) : (
              <span className="flex-1 text-xs font-semibold text-emerald-300">
                ✓ Ready to {editing ? "save" : "schedule"}
              </span>
            )}
            {tabIndex < tabs.length - 1 && (
              <button
                type="button"
                onClick={() => setTab(tabs[tabIndex + 1].id)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-slate-200 hover:border-white/25"
              >
                Next ›
              </button>
            )}
            {tab === "review" && (
              <button
                type="button"
                onClick={handleSchedule}
                disabled={submitting}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${
                  derived.payload
                    ? "reserve-cta-glow bg-amber-400 text-slate-950 hover:bg-amber-300"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                {submitting && <Spinner className="h-3.5 w-3.5" />}
                {editing ? "Save changes" : "Schedule game"}
              </button>
            )}
          </div>
        </footer>
      </aside>

      {!drawerOpen && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="absolute right-3 top-[76px] z-[1000] rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 shadow-xl shadow-amber-500/30"
        >
          ◂ {editing ? "Edit game" : "Game setup"}
        </button>
      )}

      {toast && (
        <div className="gm-fade-up absolute bottom-6 left-1/2 z-[1500] -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/90 px-4 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}

      {askConflict && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className={`gm-fade-up w-full max-w-sm rounded-3xl p-6 ${GLASS}`}>
            <p className="text-3xl">⚠️</p>
            <h2 className="mt-2 text-lg font-black text-white">Another host has that day</h2>
            <p className="mt-2 text-sm text-slate-300">
              {derived.conflicts
                .map((slot) => `${slot.host_username ? `@${slot.host_username}` : "A host"} — ${modeOption(slot.mode)?.label ?? slot.mode}`)
                .join(", ")}
              . Multiple hosts can run the same category on one day, so this won&apos;t block you or change their game.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void send()}
                className="flex-1 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300"
              >
                Continue anyway
              </button>
              <button
                type="button"
                onClick={() => setAskConflict(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300"
              >
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
