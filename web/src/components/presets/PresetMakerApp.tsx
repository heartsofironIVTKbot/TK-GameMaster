"use client";

import { BadgeCheck, ChevronLeft, ChevronRight, CircleAlert, Info, Map as MapIcon, PanelLeftOpen, Shapes } from "lucide-react";
import { MenuButton } from "@/components/site/SiteMenu";
import dynamic from "next/dynamic";
import Link from "next/link";
import { backToGame } from "@/lib/returnTo";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import ModeIcon from "@/components/schedule/ModeIcon";
import { HostAvatar, Spinner } from "@/components/schedule/ui";
import { useTutorialFacts } from "@/components/tutorial/TutorialProvider";
import { canonicalName, nationMatchKeys } from "@/data/nationCategories";
import { getCountryData, useScenarioNations } from "@/data/scenarioNations";
import { PRESET_LIMITS, notPlayableNations, type GamePreset } from "@/lib/presetTypes";
import { validateLayout, validatePresetInput, validateResourceList } from "@/lib/presetValidation";
import { SCHEDULE_MODE_VALUES, modeOption } from "@/lib/scheduleOptions";
import type { HostProfile } from "@/lib/scheduleTypes";
import type { NationFeatureProps, RosterNation } from "@/lib/types";
import BasicsTab from "./BasicsTab";
import GroupsTab from "./GroupsTab";
import LocksTab from "./LocksTab";
import ResourceListEditor from "./ResourceListEditor";
import SaveTab, { type MakerIssue } from "./SaveTab";
import {
  MAKER_TABS,
  emptyMaker,
  makerFromInput,
  makerToInput,
  nationOwners,
  placeNations,
  removeNations,
  type MakerState,
  type MakerTab,
} from "./model";
import { usePresetDefaults } from "./usePresetDefaults";

// Leaflet touches `window` on import — load the map in the browser only.
const HostLockMap = dynamic(() => import("@/components/schedule/HostLockMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0f1d21] text-sm text-ink-400">Loading map…</div>
  ),
});

/**
 * The preset editor (/presets/new, /presets/edit?id=…): the mode's map
 * beside a panel that walks through basics, nation groups, nation locks,
 * rules and mods, and saving. On the Groups step a map click puts the
 * nation in the group being edited (or takes it out); on the Locks step it
 * locks / unlocks it.
 *
 * Anything can be edited. A preset you can't change (GameMaster's, another
 * server's, another host's) is saved as your own copy, and the original
 * stays the same.
 */
export default function PresetMakerApp({
  host,
  presetId,
  initialMode,
  backTo = null,
}: {
  host: HostProfile;
  presetId: string | null;
  initialMode: string | null;
  /** Opened from game setup (lib/returnTo.ts): back goes to that game, and a saved preset can be used in it. */
  backTo?: string | null;
}) {
  const exitHref = backTo ? backToGame(backTo) : "/presets";
  const exitLabel = backTo ? "Back to the game" : "Back to presets";
  const { defaults, error: defaultsError } = usePresetDefaults();
  const startMode = initialMode && SCHEDULE_MODE_VALUES.has(initialMode) ? initialMode : "Roleplay";
  const [state, setState] = useState<MakerState>(() => emptyMaker(startMode));
  const [snapshot, setSnapshot] = useState<string>(() => JSON.stringify(makerToInput(emptyMaker(startMode))));
  const [load, setLoad] = useState<{ state: "loading" | "ready" | "error"; message?: string }>(() => ({
    state: presetId ? "loading" : "ready",
  }));
  const [preset, setPreset] = useState<GamePreset | null>(null);
  const [savedId, setSavedId] = useState<string | null>(presetId);
  const [tab, setTab] = useState<MakerTab>(presetId ? "groups" : "basics");
  const [panelOpen, setPanelOpen] = useState(true);
  const [mapNations, setMapNations] = useState<RosterNation[]>([]);
  // Hover goes straight to the little name pill: re-rendering this whole
  // panel on every mouse move is what made the map stutter.
  const hoverListenerRef = useRef<((nation: NationFeatureProps | null) => void) | null>(null);
  const handleHover = useCallback((nation: NationFeatureProps | null) => hoverListenerRef.current?.(nation), []);
  /** Red borders on the not-playable nations (players see them greyed out and locked). */
  const [showExcluded, setShowExcluded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Help sits in the top bar, clear of the panel and its Save button.
  useTutorialFacts({ isHost: true, isStaff: host.is_staff, helpInBar: true });

  const update = useCallback((patch: Partial<MakerState>) => setState((current) => ({ ...current, ...patch })), []);

  useEffect(() => {
    if (!presetId) return undefined;
    let cancelled = false;
    fetch(`/api/presets/${encodeURIComponent(presetId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { preset?: GamePreset; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.preset) {
          setLoad({ state: "error", message: body?.error ?? `Couldn't load the preset (HTTP ${response.status}).` });
          return;
        }
        const next = makerFromInput(body.preset);
        // Your copy starts unshared; you can share it before saving.
        if (!body.preset.can_edit) next.shared = false;
        setPreset(body.preset);
        setState(next);
        setSnapshot(JSON.stringify(makerToInput(next)));
        setLoad({ state: "ready" });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "error", message: "Network error. Reload to try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [presetId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Saving makes a new preset that remembers this one. */
  const savesCopy = Boolean(preset && !preset.can_edit);
  const modeDefaults = defaults?.modes[state.mode];
  const allNations = useMemo(() => (modeDefaults ? [...modeDefaults.majors, ...modeDefaults.minors] : []), [modeDefaults]);
  const majors = useMemo(() => new Set(modeDefaults?.majors ?? []), [modeDefaults]);
  const hiddenList = useMemo(() => notPlayableNations(state.layout, allNations), [state.layout, allNations]);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  const input = useMemo(() => makerToInput(state), [state]);
  const current = JSON.stringify(input);
  const dirty = current !== snapshot;

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const issues = useMemo<MakerIssue[]>(() => {
    const list: MakerIssue[] = [];
    if (!state.name.trim()) list.push({ tab: "basics", message: "Give the preset a name." });
    if (defaults && !modeDefaults) {
      list.push({ tab: "basics", message: "The bot hasn't published this mode's nations yet. Restart the bot, then reload." });
    }
    const nationSet = allNations.length > 0 ? new Set(allNations) : null;
    const layout = validateLayout(state.layout, nationSet);
    if (!layout.ok) list.push({ tab: "groups", message: layout.error });
    const rules = validateResourceList(state.rules, PRESET_LIMITS.rules, "rulesets");
    if (!rules.ok) list.push({ tab: "resources", message: `Rules: ${rules.error}` });
    const mods = validateResourceList(state.mods, PRESET_LIMITS.mods, "mods");
    if (!mods.ok) list.push({ tab: "resources", message: `Mods: ${mods.error}` });
    if (list.length === 0) {
      const full = validatePresetInput(input, allNations.length > 0 ? allNations : null);
      if (!full.ok) list.push({ tab: "save", message: full.error });
    }
    return list;
  }, [state, input, defaults, modeDefaults, allNations]);
  const issueTabs = new Set(issues.map((issue) => issue.tab));

  const mode = modeOption(state.mode);
  const scenarioId = mode?.scenarioId ?? null;
  const nationData = useScenarioNations(scenarioId);

  // Map nations ↔ the bot's names (the map sometimes says "Spanish Republic"
  // where the bot says "Spain") — the same matching the reservation map uses.
  const { botByTag, tagsByBot } = useMemo(() => {
    // Majors come first, so they win a shared loose name (TFR's two Chinas).
    const byKey = new Map<string, string>();
    for (const name of allNations) if (!byKey.has(canonicalName(name))) byKey.set(canonicalName(name), name);
    const exact = new Set(allNations);
    const botByTag = new Map<string, string>();
    const tagsByBot = new Map<string, string[]>();
    const link = (tag: string, bot: string) => {
      botByTag.set(tag, bot);
      tagsByBot.set(bot, [...(tagsByBot.get(bot) ?? []), tag]);
    };
    for (const nation of mapNations) {
      // The same name first (Taiwan and China both match "china" loosely).
      const same = [nation.slot_key ?? "", nation.name].find((name) => exact.has(name));
      if (same) {
        link(nation.tag, same);
        continue;
      }
      for (const key of nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name)) {
        const bot = byKey.get(key);
        if (!bot) continue;
        link(nation.tag, bot);
        break;
      }
    }
    return { botByTag, tagsByBot };
  }, [mapNations, allNations]);

  // Flags from the mode's own game files (Kaiserreich's flags for Kaiserreich…).
  const flags = useMemo(() => {
    const out = new Map<string, string>();
    if (!scenarioId) return out;
    for (const [nation, tags] of tagsByBot) {
      out.set(nation, getCountryData(tags[0], nation, scenarioId, nationData).flagUrl || `/assets/flags/${tags[0]}.png`);
    }
    return out;
  }, [tagsByBot, scenarioId, nationData]);
  const flagOf = useCallback((nation: string) => flags.get(nation) ?? null, [flags]);

  // Map highlights: purple = what you're editing, thin blue = the other
  // groups (or lock groups), and not playable in red or grey.
  const activeGroup = state.layout?.find((group) => group.id === state.activeGroupId) ?? state.layout?.[0] ?? null;
  const activeLock = state.locks.find((group) => group.id === state.activeLockId) ?? state.locks[0];
  const excludedTags = useMemo(() => {
    if (!state.layout) return [];
    const out = hiddenList.flatMap((name) => tagsByBot.get(name) ?? []);
    // Map nations the bot has no name for can't be in a group either.
    for (const nation of mapNations) if (!botByTag.has(nation.tag)) out.push(nation.tag);
    return out;
  }, [state.layout, hiddenList, tagsByBot, botByTag, mapNations]);
  const { editingTags, groupTags } = useMemo(() => {
    const tags = (names: string[]) => names.flatMap((name) => tagsByBot.get(name) ?? []);
    if (tab === "locks") {
      return {
        editingTags: tags(activeLock.nations),
        groupTags: tags(state.locks.filter((group) => group.id !== activeLock.id).flatMap((group) => group.nations)),
      };
    }
    if (!state.layout) return { editingTags: [], groupTags: [] };
    if (tab === "groups" && activeGroup) {
      return {
        editingTags: tags(activeGroup.tiers.flatMap((tier) => tier.nations)),
        groupTags: tags(
          state.layout
            .filter((group) => group.enabled && group.id !== activeGroup.id)
            .flatMap((group) => group.tiers.flatMap((tier) => tier.nations)),
        ),
      };
    }
    return { editingTags: [], groupTags: tags(allNations.filter((nation) => !hidden.has(nation))) };
  }, [tagsByBot, tab, state.locks, state.layout, activeLock, activeGroup, allNations, hidden]);

  const owners = useMemo(() => nationOwners(state.layout), [state.layout]);

  const handleMapClick = useCallback(
    (nation: NationFeatureProps) => {
      if (!nation.slot_key) return;
      const slot = botByTag.get(nation.tag);
      if (!slot) {
        setToast(`${nation.slot_key} isn't on the bot's ${modeOption(state.mode)?.label ?? state.mode} list.`);
        return;
      }
      if (tab === "locks") {
        if (hidden.has(slot)) {
          setToast(`${slot} isn't playable in this preset, so it's locked anyway.`);
          return;
        }
        setState((now) => {
          const target = now.locks.find((group) => group.id === now.activeLockId) ?? now.locks[0];
          const inTarget = target.nations.includes(slot);
          return {
            ...now,
            locks: now.locks.map((group) =>
              group.id === target.id
                ? { ...group, nations: inTarget ? group.nations.filter((n) => n !== slot) : [...group.nations, slot] }
                : inTarget
                  ? group
                  : { ...group, nations: group.nations.filter((n) => n !== slot) },
            ),
          };
        });
        return;
      }
      if (tab !== "groups") {
        setTab("groups");
        setPanelOpen(true);
      }
      if (!state.layout) {
        setToast("Pick “Our own groups” first to move nations between groups.");
        setTab("groups");
        return;
      }
      setState((now) => {
        if (!now.layout) return now;
        const target = now.layout.find((group) => group.id === now.activeGroupId) ?? now.layout[0];
        const inTarget = target.tiers.some((tier) => tier.nations.includes(slot));
        return {
          ...now,
          layout: inTarget ? removeNations(now.layout, [slot]) : placeNations(now.layout, [slot], target.id, now.activeTier),
        };
      });
    },
    [botByTag, state.mode, state.layout, tab, hidden],
  );

  const handleModeChange = (next: string) => {
    if (next === state.mode || preset) return;
    const hadContent =
      state.layout !== null || state.locks.some((group) => group.nations.length > 0) || state.rules !== null || state.mods !== null;
    setState((now) => ({
      ...emptyMaker(next),
      name: now.name,
      description: now.description,
      shared: now.shared,
      majorLevel: now.majorLevel,
      minorLevel: now.minorLevel,
      ironlegion: now.ironlegion,
    }));
    setMapNations([]);
    handleHover(null);
    if (hadContent) setToast("Groups, locks, rules and mods were reset for the new mode.");
  };

  const save = async () => {
    if (issues.length > 0) {
      setTab(issues[0].tab);
      return;
    }
    const validation = validatePresetInput(input, allNations.length > 0 ? allNations : null);
    if (!validation.ok) {
      setSaveError(validation.error);
      return;
    }
    const copyOf = savesCopy && preset ? preset : null;
    const body = copyOf
      ? {
          ...validation.value,
          // A copy on its own server needs a name of its own.
          name:
            copyOf.own_server && validation.value.name === copyOf.name
              ? `${validation.value.name} (copy)`.slice(0, PRESET_LIMITS.name)
              : validation.value.name,
          copied_from: copyOf.preset_id,
        }
      : validation.value;
    const editing = savedId && !copyOf;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(editing ? `/api/presets/${savedId}` : "/api/presets", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { preset?: GamePreset; error?: string } | null;
      if (!response.ok || !result?.preset) {
        setSaveError(result?.error ?? `Couldn't save (HTTP ${response.status}).`);
        return;
      }
      const saved = makerFromInput(result.preset);
      setPreset(result.preset);
      setState((now) => ({ ...now, name: saved.name }));
      setSnapshot(JSON.stringify(makerToInput({ ...state, name: saved.name })));
      if (!editing) window.history.replaceState(null, "", `/presets/edit?id=${result.preset.preset_id}`);
      setSavedId(result.preset.preset_id);
      setToast(copyOf ? `Saved as your own copy, “${result.preset.name}”.` : editing ? "Changes saved." : "Preset saved.");
      setTab("save");
    } catch {
      setSaveError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const tabIndex = MAKER_TABS.findIndex((entry) => entry.id === tab);
  const nextTab = MAKER_TABS[tabIndex + 1] ?? null;

  if (load.state !== "ready") {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-ink-950 p-4 text-ink-100">
        {load.state === "loading" ? (
          <p className="flex items-center gap-3 text-sm font-semibold text-ink-300">
            <Spinner className="h-5 w-5 text-brand-400" /> Loading the preset…
          </p>
        ) : (
          <div className="gm-plate gm-fade-up flex w-full max-w-md flex-col items-center p-8 text-center">
            <Shapes aria-hidden className="h-9 w-9 text-ink-500" strokeWidth={1.5} />
            <h1 className="gm-title mt-4 text-[28px]">Can&apos;t open this preset</h1>
            <p className="mt-2 text-sm text-ink-400">{load.message}</p>
            <Link href={exitHref} className="gm-btn gm-btn-primary mt-6">
              {exitLabel}
            </Link>
          </div>
        )}
      </main>
    );
  }

  const describeHover = (nation: NationFeatureProps): { name: string; status: string } => {
    const slot = botByTag.get(nation.tag) ?? null;
    const name = slot ?? (nation.slot_key || nation.name);
    if (!slot) return { name, status: "not on the bot's list" };
    if (tab === "locks") {
      if (hidden.has(slot)) return { name, status: "not playable" };
      const lock = state.locks.find((group) => group.nations.includes(slot));
      return {
        name,
        status: lock
          ? lock.id === activeLock.id
            ? "click to unlock"
            : `in ${lock.label}, click to move here`
          : `click to lock in ${activeLock.label}`,
      };
    }
    if (!state.layout) return { name, status: "whole map" };
    const owner = owners.get(slot);
    const where = owner ? `${owner.group.name}${owner.group.enabled ? "" : " (off)"}` : "not playable";
    if (tab !== "groups" || !activeGroup) return { name, status: where };
    return {
      name,
      status: owner?.group.id === activeGroup.id ? `${where}, click to take out` : `${where}, click to put in ${activeGroup.name}`,
    };
  };

  const copyNote = savesCopy && preset
    ? preset.official
      ? <>This is <b className="font-semibold text-ink-100">GameMaster&apos;s preset</b>. Change anything you like: saving makes <b className="font-semibold text-ink-100">your own copy</b>, and the original stays the same.</>
      : !preset.own_server
        ? <>This preset belongs to <b className="font-semibold text-ink-100">{preset.server_name ?? "another server"}</b>. Change anything you like: saving makes <b className="font-semibold text-ink-100">your own copy</b>.</>
        : <>Only {preset.created_by_name ?? "its creator"} or staff can change this preset. Saving makes <b className="font-semibold text-ink-100">your own copy</b>.</>
    : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink-950 text-ink-100">
      <div data-tour="presetEditor.map" className="absolute inset-x-0 bottom-0 top-14 z-0 lg:left-[420px]">
        {scenarioId ? (
          <HostLockMap
            key={scenarioId}
            scenarioId={scenarioId}
            editingTags={editingTags}
            groupTags={groupTags}
            excludedTags={showExcluded ? excludedTags : NO_TAGS}
            onNationClick={handleMapClick}
            onNationsChange={setMapNations}
            onHoverChange={handleHover}
          />
        ) : (
          <div className="h-full w-full bg-[#0f1d21]" />
        )}
      </div>

      <header className="absolute inset-x-0 top-0 z-[1000] flex h-14 items-center gap-3 border-b border-ink-800 bg-ink-950 px-3 sm:px-4">
        <Link href={exitHref} className="gm-btn gm-btn-quiet h-9 w-9 p-0" aria-label={exitLabel} title={exitLabel}>
          <ChevronLeft aria-hidden strokeWidth={1.75} />
        </Link>
        <span className="gm-cut hidden h-9 w-9 shrink-0 place-items-center bg-ink-800 text-ink-100 sm:grid">
          <ModeIcon mode={state.mode} className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs text-ink-400">
            {mode?.label ?? state.mode} preset
            {dirty && <span className="ml-2 font-semibold text-yellow-300">Not saved</span>}
          </p>
          <p className="gm-title truncate text-[22px]">{state.name.trim() || (savedId ? "Unnamed" : "New preset")}</p>
        </div>
        {preset?.official && savesCopy && (
          <span className="gm-tag hidden bg-brand-400/15 text-brand-400 sm:inline-flex">
            <BadgeCheck aria-hidden className="h-3 w-3" strokeWidth={2} /> GameMaster
          </span>
        )}
        {host.demo && <span className="gm-tag hidden bg-fuchsia-500/15 text-fuchsia-200 md:inline-flex">Preview: sample data</span>}
        <div className="ml-auto flex items-center gap-2">
          {/* From game setup: once saved, take this preset back into the game. */}
          {backTo && savedId && !dirty && (
            <Link href={backToGame(backTo, savedId)} className="gm-btn gm-btn-primary h-9 px-3 text-xs">
              Use it in the game
            </Link>
          )}
          {/* Room for the Help button (it sits here, see useTutorialFacts above). */}
          <span aria-hidden className="w-[92px] shrink-0" />
          <span className="hidden sm:block">
            <HostAvatar host={host} />
          </span>
          <MenuButton current="presets" label={false} />
        </div>
      </header>

      {scenarioId && <HoverPill listenerRef={hoverListenerRef} describe={describeHover} />}

      {scenarioId && (
        <div className="absolute left-3 right-3 top-[68px] z-[950] flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:left-[432px]">
          <div className="gm-cut flex flex-wrap items-center gap-x-4 gap-y-1 bg-ink-950 px-3 py-2 text-xs text-ink-300 shadow-[inset_0_0_0_1px_var(--color-ink-800)] [--cut:8px]">
            {tab === "locks" ? (
              <>
                <Legend color={EDITING} label={`Editing: ${activeLock.label || "Locked nations"} (${activeLock.nations.length})`} />
                <Legend color={GROUP} label="Other lock groups" />
              </>
            ) : state.layout && tab === "groups" && activeGroup ? (
              <>
                <Legend color={EDITING} label={`Editing: ${activeGroup.name || "Unnamed"}`} />
                <Legend color={GROUP} label="Other groups" />
              </>
            ) : state.layout ? (
              <Legend color={GROUP} label="Playable" />
            ) : (
              <span>Whole map: every nation is playable</span>
            )}
            {excludedTags.length > 0 && showExcluded && <Legend color={EXCLUDED} label={`Not playable (${hiddenList.length})`} />}
          </div>
          {excludedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExcluded((value) => !value)}
              aria-pressed={showExcluded}
              className={`gm-btn h-8 px-3 text-xs [--cut:7px] ${showExcluded ? "gm-btn-danger bg-ink-950" : "gm-btn-secondary bg-ink-950"}`}
              title="Players see not-playable nations greyed out and locked. The red borders are only here, to make them easy to spot."
            >
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${showExcluded ? "bg-rose-400" : "border border-rose-400"}`} />
              {showExcluded ? "Hide" : "Show"} not playable ({hiddenList.length})
            </button>
          )}
        </div>
      )}

      <aside
        className={`absolute bottom-0 left-0 top-14 z-[1000] flex w-full flex-col border-r border-ink-800 bg-ink-950 transition-transform duration-300 lg:w-[420px] lg:translate-x-0 ${
          panelOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav data-tour="presetEditor.steps" className="flex border-b border-ink-800 px-2" aria-label="Steps">
          {MAKER_TABS.map((entry, index) => {
            const active = entry.id === tab;
            const Icon = entry.icon;
            const flagged = entry.id !== "save" && issueTabs.has(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-current={active ? "step" : undefined}
                className={`relative flex h-[54px] flex-1 flex-col items-center justify-center gap-[3px] text-xs font-semibold transition-colors ${
                  active ? "text-ink-100 shadow-[inset_0_-2px_0_var(--color-brand-400)]" : "text-ink-400 hover:text-ink-100"
                }`}
              >
                <Icon aria-hidden className={`h-[17px] w-[17px] ${active ? "text-brand-400" : index < tabIndex && !flagged ? "text-emerald-300" : ""}`} strokeWidth={1.75} />
                <span className="hidden truncate sm:block">{entry.label}</span>
                {flagged && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-400" aria-label="Needs a fix" />}
              </button>
            );
          })}
        </nav>

        <div key={tab} className="roster-scroll gm-fade-up min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
          {copyNote && (
            <p
              data-tour="presetEditor.copy"
              className="gm-cut flex gap-2.5 bg-sky-950/60 px-3 py-2.5 text-[12.5px] text-ink-300 shadow-[inset_3px_0_0_var(--color-sky-300)] [--cut:10px]"
            >
              <Info aria-hidden className="mt-px h-4 w-4 shrink-0 text-sky-300" strokeWidth={1.75} />
              <span>{copyNote}</span>
            </p>
          )}
          {defaultsError && <p className="gm-cut bg-rose-950/60 px-3 py-2 text-xs text-rose-200">{defaultsError}</p>}
          {defaults && !defaults.ready && (
            <p className="gm-cut bg-yellow-950/60 px-3 py-2 text-xs text-yellow-100">
              The bot hasn&apos;t published its nation lists yet. Restart the bot with the latest code, then reload.
            </p>
          )}

          {tab === "basics" && (
            <BasicsTab
              state={state}
              update={update}
              onModeChange={handleModeChange}
              modeLocked={preset !== null}
              serverName={defaults?.server.name ?? null}
              disabled={false}
            />
          )}
          {tab !== "basics" && !defaults && !defaultsError && (
            <p className="flex items-center gap-2 text-xs text-ink-400">
              <Spinner className="h-3.5 w-3.5 text-brand-400" /> Loading the mode&apos;s nations…
            </p>
          )}
          {tab === "groups" && defaults && (
            <>
              <p className="flex items-start gap-2 text-xs text-ink-400">
                <MapIcon aria-hidden className="mt-px h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.75} />
                Click a nation on the map to move it into the group you&apos;re editing. Nations in no group aren&apos;t playable.
              </p>
              <GroupsTab
                state={state}
                update={update}
                defaults={modeDefaults}
                allNations={allNations}
                majors={majors}
                flagOf={flagOf}
                disabled={false}
              />
            </>
          )}
          {tab === "locks" && defaults && (
            <LocksTab state={state} update={update} allNations={allNations} majors={majors} hidden={hidden} flagOf={flagOf} disabled={false} />
          )}
          {tab === "resources" && defaults && (
            <>
              <ResourceListEditor
                kind="rules"
                entries={state.rules}
                standard={modeDefaults?.rules ?? []}
                limit={PRESET_LIMITS.rules}
                onChange={(rules) => update({ rules })}
                note="Casino and All Add-ons games add the casino rules by themselves."
              />
              <ResourceListEditor
                kind="mods"
                entries={state.mods}
                standard={modeDefaults?.mods ?? []}
                limit={PRESET_LIMITS.mods}
                onChange={(mods) => update({ mods })}
              />
            </>
          )}
          {tab === "save" && (
            <SaveTab
              state={state}
              defaults={modeDefaults}
              hiddenCount={hiddenList.length}
              issues={issues}
              savedId={savedId}
              dirty={dirty}
              savesCopy={savesCopy}
              onGoTo={setTab}
            />
          )}
        </div>

        <footer className="border-t border-ink-800 px-3.5 py-3">
          {saveError && <p className="gm-cut mb-2 bg-rose-950/60 px-3 py-1.5 text-xs text-rose-200">{saveError}</p>}
          <div className="flex items-center gap-2">
            {issues.length > 0 ? (
              <button
                type="button"
                onClick={() => setTab(issues[0].tab)}
                className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-xs font-semibold text-rose-300 hover:text-rose-200"
                title={issues.map((issue) => issue.message).join("\n")}
              >
                <CircleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span className="truncate">
                  {issues.length} to fix<span className="hidden sm:inline">: {issues[0].message}</span>
                </span>
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
                <span className="hidden sm:inline">
                  Step {tabIndex + 1} of {MAKER_TABS.length}
                  {!dirty && savedId && !savesCopy ? ", saved" : ""}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
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
              data-tour="presetEditor.save"
              onClick={() => void save()}
              disabled={saving || (!dirty && savedId !== null && !savesCopy)}
              className="gm-btn gm-btn-primary h-9 px-4"
            >
              {saving && <Spinner className="h-3.5 w-3.5" />}
              {savesCopy ? "Save as our copy" : savedId ? "Save changes" : "Save preset"}
            </button>
          </div>
        </footer>
      </aside>

      {!panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="gm-btn gm-btn-primary absolute bottom-4 left-1/2 z-[1000] h-11 -translate-x-1/2 px-5 lg:hidden"
        >
          <PanelLeftOpen aria-hidden strokeWidth={1.75} /> Back to the preset
        </button>
      )}

      {toast && (
        <div
          role="status"
          className="gm-cut gm-fade-up absolute bottom-20 left-1/2 z-[1500] max-w-[calc(100vw-32px)] -translate-x-1/2 bg-ink-800 px-4 py-2.5 text-[13px] font-semibold text-ink-100 lg:left-[calc(50%+210px)]"
        >
          {toast}
        </div>
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
    <div className="gm-cut pointer-events-none absolute bottom-20 left-1/2 z-[950] -translate-x-1/2 whitespace-nowrap bg-ink-950 px-3.5 py-1.5 text-xs font-semibold text-ink-100 shadow-[inset_0_0_0_1px_var(--color-ink-700)] lg:bottom-6 lg:left-[calc(50%+210px)]">
      {name}
      {status && <span className="ml-2 font-normal text-ink-400">{status}</span>}
    </div>
  );
}
