"use client";

import Link from "next/link";
import ServerSwitcher from "@/components/ServerSwitcher";
import { useCallback, useEffect, useState } from "react";
import { useNow } from "@/components/attendance/labels";
import { GLASS, HostAvatar, Segmented, Spinner } from "@/components/schedule/ui";
import { presetSummary, type GamePreset } from "@/lib/presetTypes";
import { CATEGORY_META, SCHEDULE_MODES, lockLevelLabel, modeOption } from "@/lib/scheduleOptions";
import type { HostProfile } from "@/lib/scheduleTypes";
import { formatRelative } from "@/lib/timeEngine";

/**
 * /presets — this server's game mode presets and the public library.
 *
 * Our presets: any host can use them on the calendar; the creator (or
 * staff) can edit or delete. Public library: presets every server chose to
 * share — copy one to get your own editable version.
 */

type View = "ours" | "library";

const NAV_LINK =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white";

function readView(): View {
  return new URLSearchParams(window.location.search).get("view") === "library" ? "library" : "ours";
}

export default function PresetsApp({ host }: { host: HostProfile }) {
  const [view, setView] = useState<View>(() => readView());
  const [modeFilter, setModeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [nonce, setNonce] = useState(0);
  const [ours, setOurs] = useState<{ nonce: number; presets: GamePreset[] | null; error: string | null } | null>(null);
  const [library, setLibrary] = useState<{ key: string; presets: GamePreset[] | null; error: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow(60_000);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/presets", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { presets?: GamePreset[]; error?: string } | null;
        if (cancelled) return;
        setOurs({ nonce, presets: body?.presets ?? null, error: response.ok ? null : (body?.error ?? "Couldn't load the presets.") });
      })
      .catch(() => {
        if (!cancelled) setOurs({ nonce, presets: null, error: "Network error — reload to try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Library search waits for a pause in typing.
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
    fetch(`/api/presets/library?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { presets?: GamePreset[]; error?: string } | null;
        if (cancelled) return;
        setLibrary({ key: libraryKey, presets: body?.presets ?? null, error: response.ok ? null : (body?.error ?? "Couldn't load the library.") });
      })
      .catch(() => {
        if (!cancelled) setLibrary({ key: libraryKey, presets: null, error: "Network error — try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [view, modeFilter, query, nonce, libraryKey]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const switchView = useCallback((next: View) => {
    setView(next);
    window.history.replaceState(null, "", next === "library" ? "/presets?view=library" : "/presets");
  }, []);

  const copy = async (preset: GamePreset) => {
    setBusy(preset.preset_id);
    try {
      const response = await fetch(`/api/presets/${preset.preset_id}/copy`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { preset?: GamePreset; error?: string } | null;
      if (!response.ok || !body?.preset) {
        setToast(body?.error ?? "Couldn't copy the preset.");
        return;
      }
      setToast(`Copied “${body.preset.name}” — it's in Our presets now.`);
      setNonce((value) => value + 1);
      if (view === "library") switchView("ours");
    } catch {
      setToast("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (preset: GamePreset) => {
    setBusy(preset.preset_id);
    try {
      const response = await fetch(`/api/presets/${preset.preset_id}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setToast(body?.error ?? "Couldn't delete the preset.");
        return;
      }
      setToast(`Deleted “${preset.name}”.`);
      setNonce((value) => value + 1);
    } catch {
      setToast("Network error — try again.");
    } finally {
      setBusy(null);
    }
  };

  const ourList = (ours?.presets ?? []).filter((preset) => !modeFilter || preset.mode === modeFilter);
  const libraryList = library?.presets ?? [];
  const shown = view === "ours" ? ourList : libraryList;
  const loading = view === "ours" ? !ours : !library || library.key !== libraryKey;
  const error = view === "ours" ? ours?.error : library?.error;

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 to-emerald-600 text-lg shadow-lg shadow-emerald-500/30">
              🧩
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Presets</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · Game mode presets</span>
            </span>
          </Link>
          {host.demo && (
            <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-bold text-fuchsia-200">
              PREVIEW MODE · sample data
            </span>
          )}
          <ServerSwitcher host={host} />
          <nav className="ml-auto flex flex-wrap items-center gap-2">
            <Link href="/" className={NAV_LINK}>🗺️ Map</Link>
            <Link href="/schedule" className={NAV_LINK}>🗓️ Calendar</Link>
            <Link href="/games" className={NAV_LINK}>🎮 Games</Link>
            <Link href="/attendance" className={NAV_LINK}>🎯 Attendance</Link>
            <Link href="/database" className={NAV_LINK}>🗂️ Database</Link>
            <div className="hidden items-center gap-2 pl-1 sm:flex">
              <HostAvatar host={host} />
              <span className="text-xs font-semibold text-slate-300">{host.display_name || host.username}</span>
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <section className={`rounded-3xl p-4 sm:p-5 ${GLASS}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-[380px]">
              <Segmented<View>
                ariaLabel="Which presets"
                value={view}
                onChange={switchView}
                options={[
                  { value: "ours", label: `📁 Our presets${ours?.presets ? ` (${ours.presets.length})` : ""}` },
                  { value: "library", label: "🌐 Public library" },
                ]}
              />
            </div>
            {view === "library" && (
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="🔎 Search by name, description or server…"
                className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
              />
            )}
            <Link
              href={`/presets/new${modeFilter ? `?mode=${encodeURIComponent(modeFilter)}` : ""}`}
              className="ml-auto rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-300"
            >
              ＋ New preset
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <FilterChip active={!modeFilter} onClick={() => setModeFilter("")} label="All modes" />
            {SCHEDULE_MODES.map((mode) => (
              <FilterChip
                key={mode.value}
                active={modeFilter === mode.value}
                onClick={() => setModeFilter(mode.value)}
                label={`${CATEGORY_META[mode.category].emoji} ${mode.label}`}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {view === "ours"
              ? "Every host of this server can load these when scheduling a game. Only a preset's creator (or staff) can change or delete it."
              : "Presets every server chose to share. Copy one to get your own version — changing it never touches the original."}
          </p>
        </section>

        {error && (
          <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>
        )}
        {loading && !error && (
          <p className="mt-6 flex items-center gap-2 px-2 text-sm text-slate-400">
            <Spinner className="h-4 w-4 text-amber-300" /> Loading…
          </p>
        )}
        {!loading && !error && shown.length === 0 && (
          <div className={`mt-4 rounded-3xl p-10 text-center ${GLASS}`}>
            <p className="text-4xl">{view === "ours" ? "🧩" : "🌐"}</p>
            <p className="mt-3 text-sm font-semibold text-slate-300">
              {view === "ours"
                ? modeFilter
                  ? `No presets for ${modeOption(modeFilter)?.label ?? modeFilter} yet.`
                  : "No presets yet."
                : query
                  ? `Nothing in the library matches “${query}”.`
                  : "Nobody has shared a preset for this mode yet."}
            </p>
            {view === "ours" && (
              <p className="mt-1 text-xs text-slate-500">
                Make one with <b>＋ New preset</b>, or copy one from the public library.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((preset) => (
            <PresetCard
              key={`${view}-${preset.preset_id}`}
              preset={preset}
              view={view}
              now={now}
              busy={busy === preset.preset_id}
              onCopy={() => void copy(preset)}
              onDelete={() => void remove(preset)}
            />
          ))}
        </div>
      </main>

      {toast && (
        <div className="gm-fade-up fixed bottom-6 left-1/2 z-[1500] -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/90 px-4 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
        active ? "border-amber-300/70 bg-amber-400/15 text-amber-100" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
      }`}
    >
      {label}
    </button>
  );
}

function PresetCard({
  preset,
  view,
  now,
  busy,
  onCopy,
  onDelete,
}: {
  preset: GamePreset;
  view: View;
  now: number;
  busy: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mode = modeOption(preset.mode);
  const meta = mode ? CATEGORY_META[mode.category] : null;
  const data = preset.data;
  const locks = data.nation_locks;
  const button =
    "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-white/25 disabled:opacity-50";

  return (
    <article className={`flex flex-col rounded-3xl p-4 ${GLASS}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta?.chip ?? "border-white/10 text-slate-300"}`}>
          {meta?.emoji} {mode?.label ?? preset.mode}
        </span>
        {preset.shared && preset.own_server && (
          <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-100">🌐 Shared</span>
        )}
        {!preset.own_server && (
          <span className="rounded-full border border-teal-400/40 bg-teal-500/15 px-2 py-0.5 text-[11px] font-bold text-teal-100">
            🏰 {preset.server_name ?? "Another server"}
          </span>
        )}
        {view === "library" && preset.own_server && (
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold text-amber-100">Ours</span>
        )}
        {preset.uses > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-slate-400" title="Games scheduled with it">
            🗓️ used {preset.uses}×
          </span>
        )}
      </div>
      <h2 className="mt-2 text-lg font-black leading-tight text-white">{preset.name}</h2>
      {preset.description && <p className="mt-1 line-clamp-3 text-sm text-slate-300">{preset.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {presetSummary(data).map((part) => (
          <span key={part} className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
            {part}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        by {preset.created_by_name ?? "a host"} · updated {formatRelative(preset.updated_at * 1000, now)}
        {preset.copied_from ? " · copied from the library" : ""}
      </p>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-2 self-start text-xs font-semibold text-slate-400 hover:text-white"
      >
        {open ? "Hide details ▴" : "Details ▾"}
      </button>
      {open && (
        <dl className="gm-fade-up mt-2 space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs">
          <div>
            <dt className="font-semibold text-slate-500">Nation groups</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {data.layout ? (
                data.layout.map((group) => (
                  <span
                    key={group.id}
                    className={`rounded-md px-1.5 py-0.5 ${group.enabled ? "bg-white/5 text-slate-200" : "bg-rose-500/10 text-rose-200 line-through"}`}
                    title={group.tiers.flatMap((tier) => tier.nations).join(", ")}
                  >
                    {group.name} ({group.tiers.reduce((sum, tier) => sum + tier.nations.length, 0)})
                  </span>
                ))
              ) : (
                <span className="text-slate-300">The mode&apos;s standard groups</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Who can reserve</dt>
            <dd className="mt-0.5 text-slate-200">
              Majors {lockLevelLabel(data.major_lock_level)} · Minors {lockLevelLabel(data.minor_lock_level)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Nation locks</dt>
            <dd className="mt-0.5 text-slate-200">
              {locks.length === 0
                ? "None"
                : locks.map((group) => (
                    <span key={group.label} className="block">
                      {group.label}: {group.nations.join(", ")}
                      <span className="text-slate-500">
                        {group.release_hours_before ? ` — opens ${group.release_hours_before}h before` : " — all game"}
                      </span>
                    </span>
                  ))}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Rules</dt>
            <dd className="mt-0.5 text-slate-200">
              {data.rules ? (data.rules.length ? data.rules.map((entry) => entry.name).join(", ") : "None") : "Standard"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Mods</dt>
            <dd className="mt-0.5 text-slate-200">
              {data.mods ? (data.mods.length ? data.mods.map((entry) => entry.name).join(", ") : "None") : "Standard"}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {preset.own_server ? (
          <>
            <Link
              href={`/schedule/new?preset=${preset.preset_id}`}
              className="rounded-lg bg-sky-500/25 px-3 py-1.5 text-xs font-black text-sky-100 hover:bg-sky-500/35"
            >
              🗓️ Use in a game
            </Link>
            <Link href={`/presets/edit?id=${preset.preset_id}`} className={button}>
              {preset.can_edit ? "✏️ Edit" : "👁️ View"}
            </Link>
            <button type="button" onClick={onCopy} disabled={busy} className={button}>
              ⧉ Duplicate
            </button>
            {preset.can_edit &&
              (confirmDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  onBlur={() => setConfirmDelete(false)}
                  className="ml-auto rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-400"
                >
                  {busy ? "Deleting…" : "Click again to delete"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="ml-auto rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:text-rose-300"
                >
                  🗑️ Delete
                </button>
              ))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onCopy}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {busy && <Spinner className="h-3 w-3" />}⧉ Copy to our server
            </button>
            <Link href={`/presets/edit?id=${preset.preset_id}`} className={button}>
              🗺️ Preview
            </Link>
          </>
        )}
      </div>
    </article>
  );
}
