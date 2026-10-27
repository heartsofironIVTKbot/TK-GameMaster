"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STEPS,
  blockingSteps,
  normalizeSettings,
  settingsIssues,
  type ServerDetail,
  type ServerSettings,
  type StepId,
} from "@/lib/serverSettingsTypes";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { Callout, inviteUrl, type StepContext } from "./shared";
import { BasicsStep, BranchesStep, StaffStep, WelcomeStep } from "./stepsStart";
import { ChannelsStep, FeaturesStep, ModesStep, RolesStep, TicketsStep } from "./stepsMore";
import { HistoryPanel, ReviewStep } from "./stepsEnd";
import { ServerIcon, StatusChip } from "./ServerList";
import { DashboardPanel, HealthLive } from "./DashboardPanel";

/**
 * One server's setup (a step-by-step wizard until it's finished) and, after
 * that, its dashboard and settings page with Health and History. Changes are kept as a
 * draft until saved; saving checks the version so two editors can't
 * overwrite each other (docs/server-setup.md).
 */

type View = StepId | "history" | "dashboard" | "home";
const VIEWS: View[] = ["home", "dashboard", ...STEPS.map((step) => step.id), "history"];

export default function ServerSetupApp({ serverId, initialStep, added }: { serverId: string; initialStep: string | null; added: boolean }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServerSettings | null>(null);
  const [saved, setSaved] = useState<ServerSettings | null>(null);
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<View>(() => (VIEWS.includes(initialStep as View) ? (initialStep as View) : "welcome"));
  /** During setup: the furthest step that can be opened (later ones unlock with Save & continue). */
  const [reached, setReached] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (): Promise<ServerDetail | string> => {
    const response = await fetch(`/api/servers/${serverId}`, { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as (ServerDetail & { error?: string }) | null;
    if (!response?.ok || !body || body.error) return body?.error ?? "Couldn't load this server — try again.";
    return body;
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;
    void fetchDetail().then((result) => {
      if (cancelled) return;
      if (typeof result === "string") {
        setLoadError(result);
        return;
      }
      setDetail(result);
      const settings = normalizeSettings(result.settings, result.server.name);
      setDraft(settings);
      setSaved(settings);
      setVersion(result.version);
      if (result.server.setup !== "active") {
        // Pick up where the setup was left; a link can't skip past it.
        const saved = result.setup_step ? STEPS.findIndex((step) => step.id === result.setup_step) : -1;
        const limit = Math.min(STEPS.length - 1, saved + 1);
        setReached(limit);
        const asked = STEPS.findIndex((step) => step.id === initialStep);
        if (!initialStep || asked > limit) setView(STEPS[limit].id);
      } else if (!initialStep) {
        // A set-up server opens on its settings tiles.
        setView("home");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchDetail, initialStep]);

  /** Re-read the server (snapshot, history, status) — the draft stays. */
  const refreshSnapshot = useCallback(async () => {
    const result = await fetchDetail();
    if (typeof result !== "string") setDetail(result);
  }, [fetchDetail]);
  const dirty = useMemo(() => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)), [draft, saved]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const goTo = useCallback(
    (next: View) => {
      setView(next);
      setSaveError(null);
      router.replace(`/servers?guild=${serverId}&step=${next}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [router, serverId],
  );

  const update = useCallback((mutate: (next: ServerSettings) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  }, []);

  const issues = useMemo(
    () => (draft && detail ? settingsIssues(draft, detail.snapshot, detail.server.bot_present) : []),
    [draft, detail],
  );
  const blocking = useMemo(() => blockingSteps(issues), [issues]);

  const save = useCallback(
    async (opts: { step?: StepId; finish?: boolean } = {}): Promise<boolean> => {
      if (!draft) return false;
      setSaving(true);
      setSaveError(null);
      const response = await fetch(`/api/servers/${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft, version, ...opts }),
      }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { version?: number; setup?: string; error?: string } | null;
      setSaving(false);
      if (!response?.ok || typeof body?.version !== "number") {
        const message = body?.error ?? "Couldn't save — check your connection and try again.";
        if (opts.finish) setFinishError(message);
        else setSaveError(message);
        return false;
      }
      setSaved(draft);
      setVersion(body.version);
      setSavedAt(Date.now());
      await refreshSnapshot();
      return true;
    },
    [draft, version, serverId, refreshSnapshot],
  );

  if (loadError) {
    return (
      <Shell>
        <Callout tone="error" title="Can't open this server">
          {loadError}{" "}
          <Link href="/servers" className="font-bold underline">
            Back to your servers
          </Link>
        </Callout>
      </Shell>
    );
  }
  if (!detail || !draft) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-slate-300">
          <Spinner className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-semibold">Loading the server…</span>
        </div>
      </Shell>
    );
  }

  const server = detail.server;
  if (!server.bot_present) {
    return (
      <Shell server={server}>
        <div className={`mx-auto max-w-xl rounded-3xl p-6 text-center ${GLASS}`}>
          <p className="text-4xl">🤖</p>
          <h2 className="mt-2 text-xl font-black text-white">GameMaster isn&apos;t in {server.name}</h2>
          <p className="mt-2 text-sm text-slate-300">
            Add it first. Discord shows the permissions it needs, then brings you straight back here to set it up.
          </p>
          <a href={inviteUrl(server.id)} className="mt-5 inline-flex rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-bold text-white hover:bg-[#4752c4]">
            Add GameMaster to {server.name}
          </a>
        </div>
      </Shell>
    );
  }

  const setupDone = server.setup === "active";
  const ctx: StepContext = {
    serverId,
    draft,
    update,
    snapshot: detail.snapshot,
    issues,
    isHome: server.is_home,
    access: server.access,
    setupDone,
    refreshSnapshot,
    goTo,
  };
  const stepIndex = STEPS.findIndex((step) => step.id === view);
  const nextStep = STEPS[stepIndex + 1]?.id;
  const reinvite = inviteUrl(server.id);

  const body = (() => {
    switch (view) {
      case "dashboard":
        return <DashboardPanel ctx={ctx} history={detail.history} reinvite={reinvite} />;
      case "home":
      case "welcome":
        return setupDone ? (
          <div className="space-y-4">
            <HealthLive ctx={ctx} reinvite={reinvite} />
            <WelcomeStep ctx={ctx} added={added} reinviteUrl={reinvite} />
          </div>
        ) : (
          <WelcomeStep ctx={ctx} added={added} reinviteUrl={reinvite} />
        );
      case "basics":
        return <BasicsStep ctx={ctx} />;
      case "staff":
        return <StaffStep ctx={ctx} />;
      case "branches":
        return <BranchesStep ctx={ctx} />;
      case "roles":
        return <RolesStep ctx={ctx} />;
      case "channels":
        return <ChannelsStep ctx={ctx} />;
      case "tickets":
        return <TicketsStep ctx={ctx} />;
      case "modes":
        return <ModesStep ctx={ctx} />;
      case "features":
        return <FeaturesStep ctx={ctx} />;
      case "review":
        return (
          <ReviewStep
            ctx={ctx}
            finishing={finishing}
            finishError={finishError}
            onFinish={async () => {
              setFinishing(true);
              setFinishError(null);
              const ok = await save({ step: "review", finish: true });
              setFinishing(false);
              if (ok) window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        );
      default:
        return <HistoryPanel ctx={ctx} history={detail.history} />;
    }
  })();

  const stepIssues = issues.filter((issue) => issue.step === view);
  const tileState = (entry: View) => {
    if (entry === "history" || entry === "dashboard" || entry === "home") return null;
    const errors = issues.filter((issue) => issue.step === entry && issue.level === "error").length;
    const warnings = issues.filter((issue) => issue.step === entry && issue.level === "warning").length;
    return { errors, warnings };
  };
  const viewLabel = (entry: View) =>
    entry === "history"
      ? "History"
      : entry === "dashboard"
        ? "Dashboard"
        : entry === "home"
          ? "Settings"
          : setupDone && entry === "welcome"
            ? "Health"
            : setupDone && entry === "review"
              ? "Overview"
              : (STEPS.find((step) => step.id === entry)?.label ?? entry);
  const viewIcon = (entry: View) =>
    entry === "history" ? "🕘" : entry === "dashboard" ? "📊" : entry === "home" ? "⚙️" : (STEPS.find((step) => step.id === entry)?.icon ?? "•");
  const viewBlurb = (entry: View) =>
    entry === "history"
      ? "Every change, who made it and when"
      : entry === "dashboard"
        ? "Usage, games, problems and staff activity"
        : setupDone && entry === "welcome"
          ? "Live checks, uptime, permissions and role position"
          : setupDone && entry === "review"
            ? "Everything at a glance"
            : (STEPS.find((step) => step.id === entry)?.blurb ?? "");
  const showSaveBar = view !== "history" && view !== "dashboard" && (view !== "home" || dirty);

  const saveBar = showSaveBar && (
    <div className={`sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 ${GLASS}`}>
      {saveError ? (
        <span className="flex-1 text-xs font-semibold text-rose-300">
          {saveError}{" "}
          {saveError.includes("Someone else") && (
            <button type="button" onClick={() => window.location.reload()} className="font-bold underline">
              Reload
            </button>
          )}
        </span>
      ) : (
        <span className="flex-1 text-xs text-slate-400">
          {dirty ? "You have unsaved changes." : savedAt ? "All changes saved ✓" : setupDone ? "No changes." : "Your progress is saved at every step."}
        </span>
      )}
      {dirty && (
        <button
          type="button"
          onClick={() => saved && setDraft(saved)}
          className="rounded-xl px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"
        >
          Discard
        </button>
      )}
      {!setupDone && stepIndex > 0 && (
        <button
          type="button"
          onClick={() => goTo(STEPS[stepIndex - 1].id)}
          className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-200 hover:border-white/25"
        >
          ← Back
        </button>
      )}
      {setupDone ? (
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save({})}
          className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40"
        >
          {saving && <Spinner className="h-3.5 w-3.5" />}Save changes
        </button>
      ) : (
        nextStep && (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (await save({ step: view as StepId })) {
                setReached((current) => Math.max(current, stepIndex + 1));
                goTo(nextStep);
              }
            }}
            className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40"
          >
            {saving && <Spinner className="h-3.5 w-3.5" />}Save & continue →
          </button>
        )
      )}
    </div>
  );

  // Settings home: every section as a tile.
  if (setupDone && view === "home") {
    const tiles: View[] = ["dashboard", "welcome", ...STEPS.map((step) => step.id).filter((id) => id !== "welcome" && id !== "review"), "review", "history"];
    return (
      <Shell server={server} dirty={dirty} saving={saving} savedAt={savedAt}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-5">
            <h1 className="text-2xl font-black text-white">⚙️ Settings</h1>
            <p className="text-sm text-slate-400">Pick a section. Problems show as a red number on its tile.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tiles.map((entry) => {
              const state = tileState(entry);
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => goTo(entry)}
                  className={`group relative flex aspect-square flex-col items-start justify-between rounded-3xl p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300/40 ${GLASS}`}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-2xl transition group-hover:bg-amber-400/15">
                    {viewIcon(entry)}
                  </span>
                  {state && (state.errors > 0 || state.warnings > 0) ? (
                    <span
                      className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-black ${
                        state.errors > 0 ? "bg-rose-500/25 text-rose-100" : "bg-amber-400/20 text-amber-100"
                      }`}
                      title={`${state.errors} problem(s), ${state.warnings} warning(s)`}
                    >
                      {state.errors > 0 ? state.errors : `${state.warnings} ⚠`}
                    </span>
                  ) : state ? (
                    <span className="absolute right-3 top-3 text-sm text-emerald-400">✓</span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-base font-black text-white">{viewLabel(entry)}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-slate-400">{viewBlurb(entry)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {saveBar}
        </div>
      </Shell>
    );
  }

  return (
    <Shell server={server} dirty={dirty} saving={saving} savedAt={savedAt}>
      <div className="mx-auto max-w-5xl">
        {setupDone ? (
          <button
            type="button"
            onClick={() => goTo("home")}
            className="mb-3 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white"
          >
            ← All settings
          </button>
        ) : (
          <nav aria-label="Setup steps" className="mb-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Setup · step {Math.max(1, stepIndex + 1)} of {STEPS.length}
            </p>
            <ol className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
              {STEPS.map((step, index) => {
                const active = step.id === view;
                const locked = index > reached;
                const errors = issues.filter((issue) => issue.step === step.id && issue.level === "error").length;
                const done = index < reached && !blocking.has(step.id);
                return (
                  <li key={step.id} className="shrink-0">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => goTo(step.id)}
                      aria-current={active ? "step" : undefined}
                      title={locked ? "Press Save & continue to get here" : step.blurb}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? "border-amber-300/60 bg-amber-400/15 text-white"
                          : "border-white/10 bg-white/[0.03] text-slate-300 enabled:hover:border-white/25"
                      }`}
                    >
                      <span>{step.icon}</span>
                      <span>
                        {index + 1}. {step.label}
                      </span>
                      {locked ? (
                        <span className="text-[10px]">🔒</span>
                      ) : errors > 0 ? (
                        <span className="rounded-full bg-rose-500/25 px-1.5 text-[10px] font-black text-rose-100">{errors}</span>
                      ) : done ? (
                        <span className="text-emerald-400">✓</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <main className="min-w-0">
          <div className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
            <div className="mb-5">
              <h1 className="text-xl font-black text-white">
                {viewIcon(view)} {viewLabel(view)}
              </h1>
              <p className="text-sm text-slate-400">{viewBlurb(view)}</p>
              {stepIssues.length > 0 && view !== "review" && view !== "welcome" && (
                <p className="mt-2 text-xs text-slate-400">
                  {stepIssues.filter((issue) => issue.level === "error").length} problem(s) and{" "}
                  {stepIssues.filter((issue) => issue.level === "warning").length} warning(s) on this step: shown under each field.
                </p>
              )}
            </div>
            {body}
          </div>
          {saveBar}
        </main>
      </div>
    </Shell>
  );
}

function Shell({
  server,
  dirty,
  saving,
  savedAt,
  children,
}: {
  server?: ServerDetail["server"];
  dirty?: boolean;
  saving?: boolean;
  savedAt?: number | null;
  children: React.ReactNode;
}) {
  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/servers"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white"
          >
            ← Your servers
          </Link>
          {server && (
            <>
              <ServerIcon name={server.name} url={server.icon_url} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-white">{server.name}</p>
                <p className="flex items-center gap-2 text-[11px] text-slate-400">
                  <StatusChip setup={server.setup} />
                  <span className="capitalize">You: {server.access}</span>
                </p>
              </div>
              <span className="hidden text-[11px] text-slate-400 sm:block">
                {saving ? "Saving…" : dirty ? "● Unsaved changes" : savedAt ? "Saved ✓" : ""}
              </span>
            </>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{children}</div>
    </div>
  );
}
