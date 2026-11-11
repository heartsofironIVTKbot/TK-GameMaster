"use client";

import SiteHeader from "@/components/site/SiteHeader";
import Link from "next/link";
import { backToGame, safeBack, withBack } from "@/lib/returnTo";
import ServerSwitcher from "@/components/ServerSwitcher";
import {
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  CalendarPlus,
  ChevronLeft,
  Copy,
  CopyPlus,
  Eye,
  Folder,
  Globe,
  Layers,
  Lock,
  Minus,
  Pencil,
  Plus,
  Puzzle,
  ScrollText,
  Search,
  Shapes,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import ModeIcon from "@/components/schedule/ModeIcon";
import { Spinner } from "@/components/schedule/ui";
import { presetSummary, type GamePreset, type PresetChange, type PresetFact, type PresetUpdateCheck } from "@/lib/presetTypes";
import { SCHEDULE_MODES, modeOption } from "@/lib/scheduleOptions";
import type { HostProfile } from "@/lib/scheduleTypes";

/**
 * /presets — this server's game mode presets and the public library.
 *
 * Our presets: any host can use them on the calendar. Editing one you can't
 * change (GameMaster's, another host's) saves your own copy. A star marks
 * each mode's default, the one the calendar loads first (staff pick it).
 * A copy whose original changed says so and shows what updating changes.
 * Public library: presets other servers shared, GameMaster's first; copy
 * one to use it.
 */

type View = "ours" | "library";

function readView(): View {
  return new URLSearchParams(window.location.search).get("view") === "library" ? "library" : "ours";
}

/** Opened from game setup (?back=, lib/returnTo.ts): the way back to that game. */
function readBack(): string | null {
  return safeBack(new URLSearchParams(window.location.search).get("back"));
}

const FACT_ICON: Record<PresetFact["kind"], LucideIcon> = { groups: Layers, locks: Lock, rules: ScrollText, mods: Puzzle };

async function send<T>(url: string, init?: RequestInit): Promise<{ ok: true; body: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || !body) return { ok: false, error: body?.error ?? `Something went wrong (HTTP ${response.status}).` };
    return { ok: true, body };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

export default function PresetsApp({ host }: { host: HostProfile }) {
  const [view, setView] = useState<View>(() => readView());
  const [back] = useState<string | null>(() => readBack());
  const [modeFilter, setModeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [nonce, setNonce] = useState(0);
  const [ours, setOurs] = useState<{ nonce: number; presets: GamePreset[] | null; error: string | null } | null>(null);
  const [library, setLibrary] = useState<{ key: string; presets: GamePreset[] | null; error: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [updating, setUpdating] = useState<GamePreset | null>(null);

  useEffect(() => {
    let cancelled = false;
    void send<{ presets: GamePreset[] }>("/api/presets", { cache: "no-store" }).then((result) => {
      if (cancelled) return;
      setOurs(result.ok ? { nonce, presets: result.body.presets, error: null } : { nonce, presets: null, error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Search waits for a pause in typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const libraryKey = `${modeFilter}|${query}|${nonce}`;
  useEffect(() => {
    if (view !== "library") return undefined;
    let cancelled = false;
    const params = new URLSearchParams();
    if (modeFilter) params.set("mode", modeFilter);
    if (query) params.set("q", query);
    void send<{ presets: GamePreset[] }>(`/api/presets/library?${params.toString()}`, { cache: "no-store" }).then((result) => {
      if (cancelled) return;
      setLibrary(
        result.ok ? { key: libraryKey, presets: result.body.presets, error: null } : { key: libraryKey, presets: null, error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [view, modeFilter, query, libraryKey]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const switchView = useCallback((next: View) => {
    setView(next);
    window.history.replaceState(null, "", next === "library" ? "/presets?view=library" : "/presets");
  }, []);

  const act = async (preset: GamePreset, url: string, init: RequestInit, done: (result: GamePreset) => string) => {
    setBusy(preset.preset_id);
    const result = await send<{ preset: GamePreset }>(url, init);
    setBusy(null);
    if (!result.ok) {
      setToast(result.error);
      return null;
    }
    setToast(done(result.body.preset));
    setNonce((value) => value + 1);
    return result.body.preset;
  };

  const copy = async (preset: GamePreset) => {
    const made = await act(preset, `/api/presets/${preset.preset_id}/copy`, { method: "POST" }, (result) =>
      `Copied “${result.name}”. It's in Our presets now.`,
    );
    if (made && view === "library") switchView("ours");
  };
  const remove = (preset: GamePreset) =>
    act(preset, `/api/presets/${preset.preset_id}`, { method: "DELETE" }, () => `Deleted “${preset.name}”.`);
  const star = (preset: GamePreset) =>
    act(
      preset,
      `/api/presets/${preset.preset_id}/default`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: !preset.is_default }) },
      () =>
        preset.is_default
          ? `${modeOption(preset.mode)?.label ?? preset.mode} games start from the whole map now.`
          : `“${preset.name}” loads first for ${modeOption(preset.mode)?.label ?? preset.mode} games now.`,
    );

  const needle = search.trim().toLowerCase();
  const ourList = (ours?.presets ?? [])
    .filter((preset) => !modeFilter || preset.mode === modeFilter)
    .filter((preset) => !needle || `${preset.name} ${preset.description ?? ""}`.toLowerCase().includes(needle));
  const libraryList = library?.presets ?? [];
  const shown = view === "ours" ? ourList : libraryList;
  const loading = view === "ours" ? !ours : !library || library.key !== libraryKey;
  const error = view === "ours" ? ours?.error : library?.error;
  const serverName = host.servers.find((server) => server.id === host.guild_id)?.name;
  const modeName = modeFilter ? (modeOption(modeFilter)?.label ?? modeFilter) : null;

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="presets" title="Presets" subtitle={serverName}>
        {host.demo && <span className="gm-tag bg-fuchsia-500/15 text-fuchsia-200">Preview: sample data</span>}
        <ServerSwitcher host={host} />
      </SiteHeader>

      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-5">
        {back && (
          <Link href={backToGame(back)} className="gm-btn gm-btn-secondary mb-3 h-9 px-3 text-xs">
            <ChevronLeft aria-hidden strokeWidth={1.75} /> Back to the game
          </Link>
        )}
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <nav data-tour="presets.view" className="flex w-full min-w-0 border-b border-ink-800 sm:w-auto sm:flex-1" aria-label="Which presets">
            <TabButton on={view === "ours"} onClick={() => switchView("ours")} icon={Folder}>
              Our presets {ours?.presets && <span className="font-medium text-ink-500">{ours.presets.length}</span>}
            </TabButton>
            <TabButton on={view === "library"} onClick={() => switchView("library")} icon={Globe}>
              Public library
            </TabButton>
          </nav>
          <label className="gm-field min-w-0 flex-1 sm:w-[240px] sm:flex-none">
            <Search aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <input maxLength={64}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={view === "library" ? "Search presets or servers" : "Search presets"}
              aria-label="Search presets"
            />
          </label>
          <Link
            href={withBack(`/presets/new${modeFilter ? `?mode=${encodeURIComponent(modeFilter)}` : ""}`, back)}
            data-tour="presets.new"
            className="gm-btn gm-btn-primary"
          >
            <Plus aria-hidden strokeWidth={2} />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New preset</span>
          </Link>
        </div>

        {/* Mode chips: one row that scrolls sideways on phones */}
        <div
          data-tour="presets.filters"
          className="-mx-3 mt-3.5 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <ModeChip on={!modeFilter} onClick={() => setModeFilter("")} label="All modes" />
          {SCHEDULE_MODES.map((mode) => (
            <ModeChip key={mode.value} on={modeFilter === mode.value} onClick={() => setModeFilter(mode.value)} label={mode.label} mode={mode.value} />
          ))}
        </div>
        <p className="mb-3.5 mt-1.5 text-[13px] text-ink-400">
          {view === "ours"
            ? "Every host here can use these when setting up a game. A star marks the one the calendar loads first for its mode; without one, a game lists the whole map."
            : "Presets other servers share, and GameMaster's own. Copy one to use it: your copy is yours to change."}
        </p>

        {error && <p className="gm-cut bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>}
        {loading && !error && (
          <p className="flex items-center gap-2 px-1 py-4 text-sm text-ink-400">
            <Spinner className="h-4 w-4 text-brand-400" /> Loading…
          </p>
        )}
        {!loading && !error && shown.length === 0 && (
          <div className="gm-plate flex flex-col items-center px-6 py-10 text-center">
            <Shapes aria-hidden className="h-8 w-8 text-ink-500" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold text-ink-200">
              {view === "ours"
                ? needle
                  ? `No preset here matches “${search.trim()}”.`
                  : modeName
                    ? `No presets for ${modeName} yet. ${modeName} games list the whole map.`
                    : "No presets yet."
                : query
                  ? `Nothing in the library matches “${query}”.`
                  : "Nobody has shared a preset for this mode yet."}
            </p>
            {view === "ours" && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href={`/presets/new${modeFilter ? `?mode=${encodeURIComponent(modeFilter)}` : ""}`} className="gm-btn gm-btn-primary h-8 px-3 text-[13px]">
                  <Plus aria-hidden strokeWidth={2} /> New preset
                </Link>
                <button type="button" onClick={() => switchView("library")} className="gm-btn gm-btn-secondary h-8 px-3 text-[13px]">
                  <Globe aria-hidden strokeWidth={1.75} /> Browse the library
                </button>
              </div>
            )}
          </div>
        )}

        <div data-tour="presets.list" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((preset) => (
            <PresetCard
              key={`${view}-${preset.preset_id}`}
              preset={preset}
              view={view}
              isStaff={host.is_staff}
              busy={busy === preset.preset_id}
              onCopy={() => void copy(preset)}
              onDelete={() => void remove(preset)}
              onStar={() => void star(preset)}
              onUpdate={() => setUpdating(preset)}
              back={back}
            />
          ))}
        </div>
      </main>

      {updating && (
        <UpdateDialog
          preset={updating}
          onClose={() => setUpdating(null)}
          onDone={(message) => {
            setUpdating(null);
            setToast(message);
            setNonce((value) => value + 1);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="gm-cut gm-fade-up fixed bottom-6 left-1/2 z-[1500] max-w-[calc(100vw-32px)] -translate-x-1/2 bg-ink-800 px-4 py-2.5 text-[13px] font-semibold text-ink-100"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function TabButton({ on, onClick, icon: Icon, children }: { on: boolean; onClick: () => void; icon: LucideIcon; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-[13.5px] font-semibold transition-colors sm:px-3.5 ${
        on ? "text-ink-100 shadow-[inset_0_-2px_0_var(--color-brand-400)]" : "text-ink-400 hover:text-ink-100"
      }`}
    >
      <Icon aria-hidden className={`h-4 w-4 ${on ? "text-brand-400" : ""}`} strokeWidth={1.75} />
      {children}
    </button>
  );
}

function ModeChip({ on, onClick, label, mode }: { on: boolean; onClick: () => void; label: string; mode?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`gm-cut flex h-7 flex-none items-center gap-1.5 whitespace-nowrap px-3 text-[12.5px] font-semibold transition-colors [--cut:6px] ${
        on ? "bg-brand-400 text-brand-950" : "bg-ink-900 text-ink-300 shadow-[inset_0_0_0_1px_var(--color-ink-800)] hover:text-ink-100"
      }`}
    >
      {mode && <ModeIcon mode={mode} className="h-3.5 w-3.5" strokeWidth={1.75} />}
      {label}
    </button>
  );
}

function Tag({
  icon: Icon,
  tone = "ink",
  children,
}: {
  icon?: LucideIcon;
  /** brand: green tag; mark: grey tag with a green icon. */
  tone?: "ink" | "brand" | "mark";
  children: ReactNode;
}) {
  const color = tone === "brand" ? "bg-brand-400/15 text-brand-400" : tone === "mark" ? "bg-ink-800 text-ink-100" : "bg-ink-800 text-ink-300";
  return (
    <span className={`gm-tag h-[21px] px-[11px] text-[11.5px] ${color}`}>
      {Icon && <Icon aria-hidden className={`h-3 w-3 ${tone === "mark" ? "text-brand-400" : ""}`} strokeWidth={2} />}
      {children}
    </span>
  );
}

function PresetCard({
  preset,
  view,
  isStaff,
  busy,
  onCopy,
  onDelete,
  onStar,
  onUpdate,
  back = null,
}: {
  preset: GamePreset;
  view: View;
  isStaff: boolean;
  busy: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onStar: () => void;
  onUpdate: () => void;
  /** Opened from game setup: "Use in the game" returns there with this preset. */
  back?: string | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mode = modeOption(preset.mode);
  const library = view === "library";
  const who = preset.official
    ? "GameMaster"
    : `${preset.created_by_name ?? "a host"}${library && !preset.own_server && preset.server_name ? `, ${preset.server_name}` : ""}`;
  const original = preset.update_available ? "The original changed" : null;

  return (
    <article
      className={`gm-plate flex flex-col gap-2 px-4 py-3.5 ${preset.update_available ? "shadow-[inset_3px_0_0_var(--color-yellow-300)]" : ""}`}
    >
      <div className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-[11px]">
        <span className="gm-cut grid h-10 w-10 place-items-center bg-ink-800 text-ink-100">
          <ModeIcon mode={preset.mode} className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <span className="block text-xs text-ink-400">{mode?.label ?? preset.mode}</span>
          <h2 className="gm-title truncate text-[22px]">{preset.name}</h2>
          <div className="mt-[5px] flex flex-wrap gap-[5px]">
            {preset.is_default && (
              <Tag icon={Star} tone="brand">
                Default
              </Tag>
            )}
            {preset.official && (
              <Tag icon={BadgeCheck} tone="mark">
                GameMaster
              </Tag>
            )}
            {!library && !preset.shared && <Tag icon={Lock}>Only our server</Tag>}
            {!library && preset.shared && <Tag icon={Globe}>Shared</Tag>}
            {preset.copied_from && !library && <Tag icon={Copy}>Copy</Tag>}
            {library && preset.own_server && <Tag>Ours</Tag>}
          </div>
        </div>
      </div>

      {preset.description && <p className="line-clamp-3 text-[13px] text-ink-400">{preset.description}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-300">
        {presetSummary(preset.data).map((fact) => {
          const Icon = FACT_ICON[fact.kind];
          return (
            <span key={fact.kind} className="inline-flex items-center gap-[5px]">
              <Icon aria-hidden className="h-[13px] w-[13px] text-ink-500" strokeWidth={1.75} />
              {fact.text}
            </span>
          );
        })}
      </div>

      {original && (
        <div className="gm-cut flex items-center gap-2 bg-yellow-300/10 py-[7px] pl-[9px] pr-[7px] text-[12.5px] text-ink-100">
          <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-yellow-300" strokeWidth={1.75} />
          {original}
          <button type="button" onClick={onUpdate} className="gm-btn gm-btn-secondary ml-auto h-[30px] px-[11px] text-[12.5px] [--cut:7px]">
            See changes
          </button>
        </div>
      )}

      <p className="text-xs text-ink-500">
        by {who}
        {preset.uses > 0 ? `, used ${preset.uses}×` : ""}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-ink-800 pt-2.5">
        {library ? (
          <>
            <button type="button" onClick={onCopy} disabled={busy} className="gm-btn gm-btn-primary h-[30px] px-[11px] text-[12.5px] [--cut:7px]">
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <CopyPlus aria-hidden strokeWidth={1.75} />}
              Copy to our server
            </button>
            <Link href={withBack(`/presets/edit?id=${preset.preset_id}`, back)} className="gm-btn gm-btn-secondary h-[30px] px-[11px] text-[12.5px] [--cut:7px]">
              <Eye aria-hidden strokeWidth={1.75} /> View
            </Link>
          </>
        ) : (
          <>
            <Link
              href={back ? backToGame(back, preset.preset_id) : `/schedule/new?preset=${preset.preset_id}`}
              className="gm-btn gm-btn-primary h-[30px] px-[11px] text-[12.5px] [--cut:7px]"
            >
              <CalendarPlus aria-hidden strokeWidth={1.75} /> {back ? "Use in the game" : "Use in a game"}
            </Link>
            <Link href={withBack(`/presets/edit?id=${preset.preset_id}`, back)} className="gm-btn gm-btn-secondary h-[30px] px-[11px] text-[12.5px] [--cut:7px]">
              <Pencil aria-hidden strokeWidth={1.75} /> Edit
            </Link>
            <span className="ml-auto flex items-center gap-0.5">
              {isStaff && (
                <IconButton
                  label={preset.is_default ? "Stop loading it first" : "Load it first for this mode"}
                  onClick={onStar}
                  disabled={busy}
                  on={preset.is_default}
                  icon={Star}
                />
              )}
              <IconButton label="Duplicate" onClick={onCopy} disabled={busy} icon={CopyPlus} />
              {preset.can_edit &&
                (confirmDelete ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={busy}
                    onBlur={() => setConfirmDelete(false)}
                    className="gm-btn gm-btn-danger h-[30px] px-[11px] text-[12.5px] [--cut:7px]"
                  >
                    {busy ? "Deleting…" : "Delete?"}
                  </button>
                ) : (
                  <IconButton label="Delete" onClick={() => setConfirmDelete(true)} icon={Trash2} />
                ))}
            </span>
          </>
        )}
      </div>
    </article>
  );
}

function IconButton({
  label,
  onClick,
  icon: Icon,
  disabled = false,
  on = false,
}: {
  label: string;
  onClick: () => void;
  icon: LucideIcon;
  disabled?: boolean;
  on?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={on || undefined}
      className={`gm-btn gm-btn-quiet h-[30px] w-[30px] p-0 [--cut:7px] ${on ? "text-brand-400" : ""}`}
    >
      <Icon aria-hidden strokeWidth={1.75} className={on ? "fill-current" : ""} />
    </button>
  );
}

const CHANGE_STYLE: Record<PresetChange["kind"], { icon: LucideIcon; tone: string }> = {
  add: { icon: Plus, tone: "bg-emerald-950 text-emerald-300" },
  remove: { icon: Minus, tone: "bg-rose-950 text-rose-300" },
  change: { icon: ArrowRightLeft, tone: "bg-ink-800 text-ink-300" },
};

/** "See changes": what updating a copy from its original changes, and the three answers. */
function UpdateDialog({ preset, onClose, onDone }: { preset: GamePreset; onClose: () => void; onDone: (message: string) => void }) {
  const [check, setCheck] = useState<PresetUpdateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"update" | "new" | "keep" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void send<PresetUpdateCheck>(`/api/presets/${preset.preset_id}/update`, { cache: "no-store" }).then((result) => {
      if (cancelled) return;
      if (result.ok) setCheck(result.body);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [preset.preset_id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const answer = async (action: "update" | "new" | "keep") => {
    setBusy(action);
    const result = await send<{ preset: GamePreset }>(`/api/presets/${preset.preset_id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone(
      action === "update"
        ? `Updated “${preset.name}”.`
        : action === "new"
          ? `Saved the new version as “${result.body.preset.name}”.`
          : `Kept your “${preset.name}”.`,
    );
  };

  const source = check?.source;
  const changed = useMemo(
    () => (source ? new Date(source.updated_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null),
    [source],
  );

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-ink-950/75 p-2.5 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-update-title"
        onClick={(event) => event.stopPropagation()}
        className="gm-plate gm-fade-up flex max-h-[calc(100vh-20px)] w-full max-w-[600px] flex-col bg-ink-950 [--cut:16px]"
      >
        <div className="relative border-b border-ink-800 px-5 pb-3.5 pt-[18px]">
          <p className="text-xs text-ink-400">{modeOption(preset.mode)?.label ?? preset.mode}</p>
          <h2 id="preset-update-title" className="gm-title pr-10 text-[26px] sm:text-[30px]">
            Update {preset.name}?
          </h2>
          <button type="button" onClick={onClose} className="gm-btn gm-btn-quiet absolute right-3 top-3 h-8 w-8 p-0" aria-label="Close">
            <X aria-hidden strokeWidth={1.75} />
          </button>
          {source && (
            <p className="mt-2 text-xs text-ink-400">
              {source.official ? "GameMaster" : (source.server_name ?? "Its server")} changed the original on {changed}. This is what
              updating changes in your copy:
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-3.5">
          {error && <p className="gm-cut bg-rose-950/60 px-3 py-2 text-[13px] text-rose-200">{error}</p>}
          {!check && !error && (
            <p className="flex items-center gap-2 text-[13px] text-ink-400">
              <Spinner className="h-4 w-4 text-brand-400" /> Comparing…
            </p>
          )}
          {check && check.changes.length === 0 && (
            <p className="text-[13px] text-ink-300">Your copy already matches the original. Nothing would change.</p>
          )}
          {check && check.changes.length > 0 && (
            <ul className="grid gap-1">
              {check.changes.map((change, index) => {
                const style = CHANGE_STYLE[change.kind];
                const Icon = style.icon;
                return (
                  <li key={index} className="gm-cut grid grid-cols-[26px_minmax(0,1fr)] items-start gap-2.5 bg-ink-900 px-[11px] py-[9px] text-[13px] text-ink-300 [--cut:9px]">
                    <span className={`gm-cut grid h-[26px] w-[26px] place-items-center [--cut:5px] ${style.tone}`}>
                      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    {change.kind === "change" ? (
                      <span className="flex flex-wrap items-center gap-1.5 pt-[3px]">
                        <b className="font-semibold text-ink-100">{change.label}:</b>
                        <span className="text-ink-500 line-through">{change.from}</span>
                        <ArrowRight aria-hidden className="h-[13px] w-[13px] text-ink-500" strokeWidth={1.75} />
                        <span className="text-ink-100">{change.to}</span>
                      </span>
                    ) : (
                      <span className="pt-[3px]">
                        <b className="font-semibold text-ink-100">{change.label}:</b> {change.detail}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {check?.own_edits && check.changes.length > 0 && (
            <p className="gm-cut flex gap-2 bg-ink-900 px-[11px] py-[9px] text-[12.5px] text-ink-400">
              <TriangleAlert aria-hidden className="mt-px h-4 w-4 shrink-0 text-yellow-300" strokeWidth={1.75} />
              You changed your copy too. Updating replaces those changes with the original&apos;s.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-ink-800 px-5 py-3.5 sm:flex-row sm:items-center">
          <button type="button" onClick={() => void answer("keep")} disabled={busy !== null || !check} className="gm-btn gm-btn-quiet">
            {busy === "keep" && <Spinner className="h-3.5 w-3.5" />}Keep mine
          </button>
          <span className="hidden flex-1 sm:block" />
          {check && check.changes.length > 0 && (
            <>
              <button type="button" onClick={() => void answer("new")} disabled={busy !== null} className="gm-btn gm-btn-secondary">
                {busy === "new" && <Spinner className="h-3.5 w-3.5" />}Update as a new preset
              </button>
              <button
                type="button"
                onClick={() => void answer("update")}
                disabled={busy !== null}
                className="gm-btn gm-btn-primary h-[42px] px-5 font-display text-lg font-extrabold uppercase tracking-[0.02em] [--cut:9px]"
              >
                {busy === "update" && <Spinner className="h-4 w-4" />}Update
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
