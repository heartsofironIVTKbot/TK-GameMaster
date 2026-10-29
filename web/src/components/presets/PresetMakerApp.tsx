"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GLASS, HostAvatar, Spinner } from "@/components/schedule/ui";
import { canonicalName, nationMatchKeys } from "@/data/nationCategories";
import { PRESET_LIMITS, notPlayableNations, type GamePreset } from "@/lib/presetTypes";
import { validateLayout, validatePresetInput, validateResourceList } from "@/lib/presetValidation";
import { CATEGORY_META, SCHEDULE_MODE_VALUES, modeOption } from "@/lib/scheduleOptions";
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
    <div className="flex h-full w-full items-center justify-center bg-[#16283b] text-sm text-slate-400">Loading map…</div>
  ),
});

/**
 * The preset maker (/presets/new, /presets/edit?id=…): the mode's map fills
 * the screen and a drawer walks through basics, nation groups, nation locks,
 * rules & mods and saving. On the Groups tab a map click puts the nation in
 * the group being edited (or takes it out); on the Locks tab it locks /
 * unlocks it. Presets other hosts made (or from another server) open
 * read-only, with a button to make your own copy.
 */
export default function PresetMakerApp({
  host,
  presetId,
  initialMode,
}: {
  host: HostProfile;
  presetId: string | null;
  initialMode: string | null;
}) {
  const router = useRouter();
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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [mapNations, setMapNations] = useState<RosterNation[]>([]);
  const [hovered, setHovered] = useState<NationFeatureProps | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

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
        setPreset(body.preset);
        setState(next);
        setSnapshot(JSON.stringify(makerToInput(next)));
        setLoad({ state: "ready" });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "error", message: "Network error — reload to try again." });
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

  const readOnly = Boolean(preset && !preset.can_edit);
  const modeDefaults = defaults?.modes[state.mode];
  const allNations = useMemo(() => (modeDefaults ? [...modeDefaults.majors, ...modeDefaults.minors] : []), [modeDefaults]);
  const majors = useMemo(() => new Set(modeDefaults?.majors ?? []), [modeDefaults]);
  const hiddenList = useMemo(() => notPlayableNations(state.layout, allNations), [state.layout, allNations]);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  const input = useMemo(() => makerToInput(state), [state]);
  const current = JSON.stringify(input);
  const dirty = !readOnly && current !== snapshot;

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
      list.push({ tab: "basics", message: "The bot hasn't published this mode's nations yet — restart the bot, then reload." });
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

  // Map nations ↔ the bot's names (the map sometimes says "Spanish Republic"
  // where the bot says "Spain") — the same matching the reservation map uses.
  const { botByTag, tagsByBot } = useMemo(() => {
    const byKey = new Map(allNations.map((name) => [canonicalName(name), name]));
    const botByTag = new Map<string, string>();
    const tagsByBot = new Map<string, string[]>();
    for (const nation of mapNations) {
      for (const key of nationMatchKeys(nation.tag, nation.slot_key ?? "", nation.name)) {
        const bot = byKey.get(key);
        if (!bot) continue;
        botByTag.set(nation.tag, bot);
        tagsByBot.set(bot, [...(tagsByBot.get(bot) ?? []), nation.tag]);
        break;
      }
    }
    return { botByTag, tagsByBot };
  }, [mapNations, allNations]);

  // Map highlights: red = what's being edited, blue = the rest.
  const activeGroup = state.layout?.find((group) => group.id === state.activeGroupId) ?? state.layout?.[0] ?? null;
  const activeLock = state.locks.find((group) => group.id === state.activeLockId) ?? state.locks[0];
  const { activeTags, otherTags } = useMemo(() => {
    const tags = (names: string[]) => names.flatMap((name) => tagsByBot.get(name) ?? []);
    if (tab === "locks") {
      return {
        activeTags: tags(activeLock.nations),
        otherTags: tags(state.locks.filter((group) => group.id !== activeLock.id).flatMap((group) => group.nations)),
      };
    }
    if (!state.layout) return { activeTags: [], otherTags: [] };
    if (tab === "groups" && activeGroup) {
      return {
        activeTags: tags(activeGroup.tiers.flatMap((tier) => tier.nations)),
        otherTags: tags(
          state.layout
            .filter((group) => group.enabled && group.id !== activeGroup.id)
            .flatMap((group) => group.tiers.flatMap((tier) => tier.nations)),
        ),
      };
    }
    return { activeTags: [], otherTags: tags(allNations.filter((nation) => !hidden.has(nation))) };
  }, [tagsByBot, tab, state.locks, state.layout, activeLock, activeGroup, allNations, hidden]);

  const owners = useMemo(() => nationOwners(state.layout), [state.layout]);

  const handleMapClick = useCallback(
    (nation: NationFeatureProps) => {
      if (!nation.slot_key) return;
      if (readOnly) {
        setToast("This preset is read-only — make your own copy to change it.");
        return;
      }
      const slot = botByTag.get(nation.tag);
      if (!slot) {
        setToast(`${nation.slot_key} isn't on the bot's ${modeOption(state.mode)?.label ?? state.mode} list.`);
        return;
      }
      if (tab === "locks") {
        if (hidden.has(slot)) {
          setToast(`${slot} isn't playable in this preset — it's locked anyway.`);
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
        setDrawerOpen(true);
      }
      if (!state.layout) {
        setToast("Pick “Custom groups” first to move nations between groups.");
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
    [readOnly, botByTag, state.mode, state.layout, tab, hidden],
  );

  const handleModeChange = (mode: string) => {
    if (mode === state.mode || preset) return;
    const hadContent =
      state.layout !== null || state.locks.some((group) => group.nations.length > 0) || state.rules !== null || state.mods !== null;
    setState((now) => ({
      ...emptyMaker(mode),
      name: now.name,
      description: now.description,
      shared: now.shared,
      majorLevel: now.majorLevel,
      minorLevel: now.minorLevel,
      ironlegion: now.ironlegion,
    }));
    setMapNations([]);
    setHovered(null);
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
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(savedId ? `/api/presets/${savedId}` : "/api/presets", {
        method: savedId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.value),
      });
      const body = (await response.json().catch(() => null)) as { preset?: GamePreset; error?: string } | null;
      if (!response.ok || !body?.preset) {
        setSaveError(body?.error ?? `Couldn't save (HTTP ${response.status}).`);
        return;
      }
      setPreset(body.preset);
      setSnapshot(current);
      if (!savedId) window.history.replaceState(null, "", `/presets/edit?id=${body.preset.preset_id}`);
      setSavedId(body.preset.preset_id);
      setToast(savedId ? "Changes saved ✓" : "Preset saved ✓");
      setTab("save");
    } catch {
      setSaveError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  };

  const copyToOurs = async () => {
    if (!preset) return;
    setCopying(true);
    try {
      const response = await fetch(`/api/presets/${preset.preset_id}/copy`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { preset?: GamePreset; error?: string } | null;
      if (!response.ok || !body?.preset) {
        setToast(body?.error ?? "Couldn't copy the preset.");
        return;
      }
      router.push(`/presets/edit?id=${body.preset.preset_id}`);
    } catch {
      setToast("Network error — try again.");
    } finally {
      setCopying(false);
    }
  };

  const mode = modeOption(state.mode);
  const scenarioId = mode?.scenarioId ?? null;
  const category = mode ? CATEGORY_META[mode.category] : null;
  const tabIndex = MAKER_TABS.findIndex((entry) => entry.id === tab);

  if (load.state !== "ready") {
    return (
      <main className="gm-backdrop flex min-h-screen w-full items-center justify-center p-4 text-slate-100">
        {load.state === "loading" ? (
          <p className="flex items-center gap-3 text-sm font-semibold text-slate-300">
            <Spinner className="h-5 w-5 text-amber-400" /> Loading the preset…
          </p>
        ) : (
          <div className={`gm-fade-up w-full max-w-md rounded-3xl p-8 text-center ${GLASS}`}>
            <div className="text-5xl">🧩</div>
            <h1 className="mt-4 text-xl font-black text-white">Can&apos;t open this preset</h1>
            <p className="mt-2 text-sm text-slate-400">{load.message}</p>
            <Link href="/presets" className="mt-6 inline-block rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950">
              Back to presets
            </Link>
          </div>
        )}
      </main>
    );
  }

  const hoveredBot = hovered ? (botByTag.get(hovered.tag) ?? null) : null;
  const hoverStatus = (() => {
    if (!hovered) return "";
    const slot = hoveredBot;
    if (!slot) return "not on the bot's list";
    if (tab === "locks") {
      if (hidden.has(slot)) return "not playable";
      const lock = state.locks.find((group) => group.nations.includes(slot));
      return lock ? (lock.id === activeLock.id ? "click to unlock" : `in ${lock.label} — click to move here`) : `click to lock in “${activeLock.label}”`;
    }
    if (!state.layout) return "standard groups";
    const owner = owners.get(slot);
    const where = owner ? `${owner.group.name}${owner.group.enabled ? "" : " (off)"}` : "not playable";
    if (tab !== "groups" || !activeGroup) return where;
    return owner?.group.id === activeGroup.id ? `${where} — click to take out` : `${where} — click to put in “${activeGroup.name}”`;
  })();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b1322] text-slate-100">
      <div className="absolute inset-0 z-0">
        {scenarioId ? (
          <HostLockMap
            key={scenarioId}
            scenarioId={scenarioId}
            activeTags={activeTags}
            otherTags={otherTags}
            onNationClick={handleMapClick}
            onNationsChange={setMapNations}
            onHoverChange={setHovered}
          />
        ) : (
          <div className="gm-backdrop h-full w-full" />
        )}
      </div>

      <header className="absolute inset-x-0 top-0 z-[1000] border-b border-white/10 bg-slate-950/55 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
          <Link
            href="/presets"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-amber-300/40"
          >
            ← Presets
          </Link>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-black text-white">
              {savedId ? (readOnly ? "View preset" : "Edit preset") : "New preset"} · {state.name.trim() || "Unnamed"}
              {dirty && <span className="ml-2 text-[11px] font-bold text-amber-300">● unsaved</span>}
            </p>
            <p className="truncate text-[11px] font-semibold text-slate-400">
              <span className={category?.text}>
                {category?.emoji} {mode?.label ?? state.mode}
              </span>
              {state.shared ? " · 🌐 shared" : ""}
            </p>
          </div>
          {host.demo && (
            <span className="hidden rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-bold text-fuchsia-200 md:inline">
              PREVIEW MODE
            </span>
          )}
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <HostAvatar host={host} />
          </div>
        </div>
      </header>

      {scenarioId && hovered && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-[950] -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/80 px-4 py-1.5 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md lg:left-[calc(50%-240px)]">
          {hoveredBot ?? (hovered.slot_key || hovered.name)}
          {hoverStatus && <span className="ml-2 text-slate-400">{hoverStatus}</span>}
        </div>
      )}

      {scenarioId && (
        <div className="absolute bottom-4 left-4 z-[950] rounded-2xl border border-white/10 bg-slate-950/75 px-3.5 py-2.5 text-[11px] font-semibold text-slate-300 shadow-xl backdrop-blur-md">
          {tab === "locks" ? (
            <>
              <Legend color="#ff5266" label={`Editing: ${activeLock.label || "Locked nations"} (${activeLock.nations.length})`} />
              <Legend color="#3cc4ff" label="Other lock groups" />
              <p className="mt-1 text-slate-500">Click a nation to lock / unlock it</p>
            </>
          ) : state.layout && tab === "groups" && activeGroup ? (
            <>
              <Legend color="#ff5266" label={`Editing: ${activeGroup.name || "Unnamed"}`} />
              <Legend color="#3cc4ff" label="Other playable groups" />
              <Legend color="#374151" label={`Not playable (${hiddenList.length})`} />
              <p className="mt-1 text-slate-500">Click a nation to put it in / take it out</p>
            </>
          ) : state.layout ? (
            <>
              <Legend color="#3cc4ff" label="Playable" />
              <Legend color="#374151" label={`Not playable (${hiddenList.length})`} />
            </>
          ) : (
            <p>Standard groups — every nation is playable</p>
          )}
        </div>
      )}

      <aside
        className={`absolute bottom-3 right-3 top-[76px] z-[1000] flex w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl transition-transform duration-300 ${GLASS} ${
          drawerOpen ? "translate-x-0" : "translate-x-[calc(100%+16px)]"
        }`}
      >
        <nav className="flex items-center gap-1 border-b border-white/10 p-2">
          {MAKER_TABS.map((entry) => {
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
                {entry.id !== "save" && issueTabs.has(entry.id) && (
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
          {preset && readOnly && (
            <div className="mb-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-100">
              <p>
                {preset.own_server
                  ? `🔒 Only ${preset.created_by_name ?? "its creator"} or staff can change this preset.`
                  : `🌐 From the public library — made by ${preset.created_by_name ?? "a host"} on ${preset.server_name ?? "another server"}.`}
              </p>
              <button
                type="button"
                onClick={() => void copyToOurs()}
                disabled={copying}
                className="mt-2 flex items-center gap-2 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-sky-300 disabled:opacity-60"
              >
                {copying && <Spinner className="h-3 w-3" />}
                {preset.own_server ? "Duplicate to edit" : "Copy to our server"}
              </button>
            </div>
          )}
          {defaultsError && (
            <p className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{defaultsError}</p>
          )}
          {defaults && !defaults.ready && (
            <p className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              The bot hasn&apos;t published its nation lists yet — restart the bot with the latest code, then reload.
            </p>
          )}

          {tab === "basics" && (
            <BasicsTab
              state={state}
              update={update}
              onModeChange={handleModeChange}
              modeLocked={preset !== null}
              serverName={defaults?.server.name ?? null}
              disabled={readOnly}
            />
          )}
          {tab !== "basics" && !defaults && !defaultsError && (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Spinner className="h-3.5 w-3.5 text-amber-300" /> Loading the mode&apos;s nations…
            </p>
          )}
          {tab === "groups" && defaults && (
            <GroupsTab
              state={state}
              update={update}
              defaults={modeDefaults}
              allNations={allNations}
              majors={majors}
              disabled={readOnly}
            />
          )}
          {tab === "locks" && defaults && (
            <LocksTab state={state} update={update} allNations={allNations} majors={majors} hidden={hidden} disabled={readOnly} />
          )}
          {tab === "resources" && defaults && (
            <div className="space-y-4">
              <ResourceListEditor
                kind="rules"
                entries={state.rules}
                standard={modeDefaults?.rules ?? []}
                limit={PRESET_LIMITS.rules}
                onChange={(rules) => update({ rules })}
                disabled={readOnly}
                note="Casino and All Add-ons games add the casino rules automatically."
              />
              <ResourceListEditor
                kind="mods"
                entries={state.mods}
                standard={modeDefaults?.mods ?? []}
                limit={PRESET_LIMITS.mods}
                onChange={(mods) => update({ mods })}
                disabled={readOnly}
              />
            </div>
          )}
          {tab === "save" && (
            <SaveTab
              state={state}
              defaults={modeDefaults}
              hiddenCount={hiddenList.length}
              issues={readOnly ? [] : issues}
              savedId={savedId}
              dirty={dirty}
              onGoTo={setTab}
            />
          )}
        </div>

        <footer className="border-t border-white/10 bg-slate-950/40 p-3">
          {saveError && (
            <p className="mb-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100">{saveError}</p>
          )}
          <div className="flex items-center gap-2">
            {readOnly ? (
              <span className="flex-1 text-xs font-semibold text-slate-400">Read-only</span>
            ) : issues.length > 0 ? (
              <button
                type="button"
                onClick={() => setTab(issues[0].tab)}
                className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-rose-300 hover:text-rose-200"
                title={issues.map((issue) => issue.message).join("\n")}
              >
                ● {issues.length} to fix<span className="hidden sm:inline"> — {issues[0].message}</span>
              </button>
            ) : (
              <span className="flex-1 text-xs font-semibold text-emerald-300">
                {dirty ? "✓ Ready to save" : savedId ? "✓ Saved" : "✓ Ready"}
              </span>
            )}
            {tabIndex < MAKER_TABS.length - 1 && (
              <button
                type="button"
                onClick={() => setTab(MAKER_TABS[tabIndex + 1].id)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-slate-200 hover:border-white/25"
              >
                Next ›
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || (!dirty && savedId !== null)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${
                  issues.length === 0 && (dirty || !savedId)
                    ? "reserve-cta-glow bg-amber-400 text-slate-950 hover:bg-amber-300"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                {saving && <Spinner className="h-3.5 w-3.5" />}
                {savedId ? "Save changes" : "Save preset"}
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
          ◂ Preset
        </button>
      )}

      {toast && (
        <div className="gm-fade-up absolute bottom-6 left-1/2 z-[1500] -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/90 px-4 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <p className="mt-1 flex items-center gap-2 first:mt-0">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </p>
  );
}
