"use client";

import { ArrowLeft, ArrowRight, Bot, Check, ChevronDown, HeartPulse, History, LayoutDashboard, List, Lock } from "lucide-react";
import SiteHeader from "@/components/site/SiteHeader";
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
import { Spinner } from "@/components/schedule/ui";
import { Callout, STEP_ICON, inviteUrl, type IconComponent, type StepContext } from "./shared";
import { BasicsStep, BranchesStep, StaffStep, WelcomeStep } from "./stepsStart";
import { ChannelsStep, FeaturesStep, ModesStep, RolesStep, TicketsStep } from "./stepsMore";
import { HistoryPanel, ReviewStep } from "./stepsEnd";
import { ServerIcon, StatusChip } from "./ServerList";
import { DashboardPanel, HealthLive } from "./DashboardPanel";

/**
 * One server's setup (a step-by-step wizard until it's finished) and, after
 * that, its dashboard and settings with Health and History. A list on the
 * left holds every step (setup) or section (settings); on phones it folds
 * into "All steps". Changes are kept as a
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
  /** Phones: the step list, folded until opened. */
  const [listOpen, setListOpen] = useState(false);

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
        <div className="flex items-center gap-3 text-ink-300">
          <Spinner className="h-5 w-5 text-brand-400" />
          <span className="text-sm font-semibold">Loading the server…</span>
        </div>
      </Shell>
    );
  }

  const server = detail.server;
  if (!server.bot_present) {
    return (
      <Shell server={server}>
        <div className="gm-plate mx-auto mt-6 flex max-w-xl flex-col items-center p-8 text-center">
          <Bot aria-hidden className="h-9 w-9 text-brand-400" strokeWidth={1.5} />
          <h2 className="gm-title mt-4 text-[30px]">GameMaster isn&apos;t in {server.name}</h2>
          <p className="mt-2 text-sm text-ink-300">
            Add it first. Discord shows the permissions it needs, then brings you straight back here to set it up.
          </p>
          <a href={inviteUrl(server.id)} className="gm-btn mt-5 h-10 bg-[#5865F2] px-5 text-white hover:bg-[#4752c4]">
            <Bot aria-hidden strokeWidth={1.75} /> Add GameMaster to {server.name}
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
        return setupDone ? (
          <DashboardPanel ctx={ctx} history={detail.history} reinvite={reinvite} />
        ) : (
          <WelcomeStep ctx={ctx} added={added} reinviteUrl={reinvite} />
        );
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
      : entry === "dashboard" || (entry === "home" && setupDone)
        ? "Dashboard"
        : entry === "home"
          ? "Settings"
          : setupDone && entry === "welcome"
            ? "Health"
            : setupDone && entry === "review"
              ? "Overview"
              : (STEPS.find((step) => step.id === entry)?.label ?? entry);
  const viewIcon = (entry: View): IconComponent =>
    entry === "history"
      ? History
      : entry === "dashboard" || entry === "home"
        ? LayoutDashboard
        : setupDone && entry === "welcome"
          ? HeartPulse
          : STEP_ICON[entry];
  const viewBlurb = (entry: View) =>
    entry === "history"
      ? "Every change, who made it and when"
      : entry === "dashboard" || (entry === "home" && setupDone)
        ? "Usage, games, problems and staff activity"
        : setupDone && entry === "welcome"
          ? "Live checks, uptime, permissions and role position"
          : setupDone && entry === "review"
            ? "Everything at a glance"
            : (STEPS.find((step) => step.id === entry)?.blurb ?? "");
  const showSaveBar = view !== "history" && view !== "dashboard" && (view !== "home" || (!setupDone && dirty));

  const saveBar = showSaveBar && (
    <div
      data-tour="server.save"
      className="sticky bottom-0 z-20 -mx-3 mt-4 flex flex-wrap items-center gap-2 border-t border-ink-800 bg-ink-950 py-3 pl-3 pr-[160px] sm:-mx-6 sm:pl-6"
    >
      {saveError ? (
        <span className="flex-1 text-xs font-semibold text-rose-300">
          {saveError}{" "}
          {saveError.includes("Someone else") && (
            <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
              Reload
            </button>
          )}
        </span>
      ) : (
        <span className="flex-1 text-xs text-ink-500">
          {dirty ? "You have unsaved changes." : savedAt ? "All changes saved." : setupDone ? "No changes." : "Your progress is saved at every step."}
        </span>
      )}
      {dirty && (
        <button type="button" onClick={() => saved && setDraft(saved)} className="gm-btn gm-btn-quiet">
          Discard
        </button>
      )}
      {!setupDone && stepIndex > 0 && (
        <button type="button" onClick={() => goTo(STEPS[stepIndex - 1].id)} className="gm-btn gm-btn-secondary">
          <ArrowLeft aria-hidden strokeWidth={1.75} /> Back
        </button>
      )}
      {setupDone ? (
        <button type="button" disabled={!dirty || saving} onClick={() => void save({})} className="gm-btn gm-btn-primary">
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
            className="gm-btn gm-btn-primary"
          >
            {saving && <Spinner className="h-3.5 w-3.5" />}Save and continue <ArrowRight aria-hidden strokeWidth={1.75} />
          </button>
        )
      )}
    </div>
  );

  // The list on the left: every setup step, or (set up) every settings section.
  const entries: (View | "sep")[] = setupDone
    ? ["home", "sep", ...STEPS.map((step) => step.id), "sep", "history"]
    : STEPS.map((step) => step.id);
  const activeEntry: View = setupDone && view === "dashboard" ? "home" : view;
  const list = (
    <nav aria-label={setupDone ? "Settings" : "Setup steps"} className="space-y-0.5">
      <div className="px-2.5 pb-2.5 pt-1 text-xs text-ink-500">
        <b className="block text-[13px] font-semibold text-ink-100">
          {setupDone ? "Settings" : `Setup, step ${Math.max(1, stepIndex + 1)} of ${STEPS.length}`}
        </b>
        {setupDone ? "Every part of GameMaster on this server" : "Your progress is saved at every step."}
        {!setupDone && (
          <span className="mt-2 block h-1 bg-ink-800">
            <span className="block h-full bg-brand-400" style={{ width: `${(Math.max(0, stepIndex) / STEPS.length) * 100}%` }} />
          </span>
        )}
      </div>
      {entries.map((entry, position) => {
        if (entry === "sep") return <div key={`sep-${position}`} className="mx-1.5 my-2 h-px bg-ink-800" />;
        const index = STEPS.findIndex((step) => step.id === entry);
        const locked = !setupDone && index > reached;
        const state = tileState(entry);
        const done = !setupDone && index >= 0 && index < reached && !blocking.has(entry as StepId);
        const active = entry === activeEntry;
        return (
          <button
            key={entry}
            type="button"
            disabled={locked}
            onClick={() => {
              goTo(entry);
              setListOpen(false);
            }}
            aria-current={active ? "page" : undefined}
            title={locked ? "Press Save and continue to get here" : viewBlurb(entry)}
            className={`gm-cut flex h-10 w-full items-center gap-2.5 px-2.5 text-left text-[13px] font-semibold [--cut:7px] disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? "bg-ink-800 text-ink-100 shadow-[inset_3px_0_0_var(--color-brand-400)]" : "text-ink-300 enabled:hover:bg-ink-900"
            }`}
          >
            <ShowIcon icon={viewIcon(entry)} className={`h-4 w-4 shrink-0 ${active ? "text-brand-400" : "text-ink-500"}`} />
            <span className="min-w-0 flex-1 truncate">{viewLabel(entry)}</span>
            {locked ? (
              <Lock aria-label="Not reached yet" className="h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
            ) : state && state.errors > 0 ? (
              <span className="gm-cut grid h-[18px] min-w-[18px] place-items-center bg-rose-400 px-1 text-[11px] font-bold text-ink-950 [--cut:4px]" title={`${state.errors} problem(s)`}>
                {state.errors}
              </span>
            ) : state && state.warnings > 0 ? (
              <span className="gm-cut grid h-[18px] min-w-[18px] place-items-center bg-yellow-300 px-1 text-[11px] font-bold text-ink-950 [--cut:4px]" title={`${state.warnings} warning(s)`}>
                {state.warnings}
              </span>
            ) : done || (setupDone && state) ? (
              <Check aria-label="Done" className="h-[15px] w-[15px] shrink-0 text-emerald-300" strokeWidth={2} />
            ) : null}
          </button>
        );
      })}
    </nav>
  );

  return (
    <Shell server={server} dirty={dirty} saving={saving} savedAt={savedAt}>
      <div className="flex min-h-[calc(100vh-57px)]">
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-[272px] shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-950 px-2.5 py-3.5 lg:block">
          {setupDone ? <div data-tour="server.tiles">{list}</div> : <div data-tour="server.steps">{list}</div>}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col px-3 pt-4 sm:px-6 sm:pt-5">
          <div className="mx-auto w-full max-w-5xl flex-1">
            {/* Phones: the list folds into "All steps". */}
            <div className="mb-3 lg:hidden">
              <button
                type="button"
                onClick={() => setListOpen((value) => !value)}
                aria-expanded={listOpen}
                className="gm-cut flex w-full items-center gap-3 bg-ink-900 px-3 py-2.5 text-left [--cut:9px]"
              >
                <List aria-hidden className="h-4 w-4 shrink-0 text-brand-400" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink-100">
                    {setupDone ? viewLabel(view) : `Step ${Math.max(1, stepIndex + 1)} of ${STEPS.length}: ${viewLabel(view)}`}
                  </span>
                  {!setupDone && (
                    <span className="mt-1.5 block h-1 bg-ink-800">
                      <span className="block h-full bg-brand-400" style={{ width: `${(Math.max(0, stepIndex) / STEPS.length) * 100}%` }} />
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-400">
                  {setupDone ? "All settings" : "All steps"}
                  <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${listOpen ? "rotate-180" : ""}`} strokeWidth={2} />
                </span>
              </button>
              {listOpen && <div className="gm-cut gm-fade-up mt-1 bg-ink-950 p-2 shadow-[inset_0_0_0_1px_var(--color-ink-800)] [--cut:9px]">{list}</div>}
            </div>

            <div data-tour="server.step" className="gm-plate p-4 sm:p-5">
              <div className="mb-5 flex items-start gap-3">
                <span className="gm-cut grid h-10 w-10 shrink-0 place-items-center bg-ink-800 text-brand-400">
                  <ShowIcon icon={viewIcon(view)} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="gm-title text-[28px]">{viewLabel(view)}</h1>
                  <p className="mt-0.5 text-[13px] text-ink-400">{viewBlurb(view)}</p>
                  {stepIssues.length > 0 && view !== "review" && view !== "welcome" && (
                    <p className="mt-1.5 text-xs text-ink-400">
                      {stepIssues.filter((issue) => issue.level === "error").length} problem(s) and{" "}
                      {stepIssues.filter((issue) => issue.level === "warning").length} warning(s) on this step, shown under each field.
                    </p>
                  )}
                </div>
              </div>
              {body}
            </div>
          </div>
          {saveBar}
          {!saveBar && <div className="h-6" />}
        </main>
      </div>
    </Shell>
  );
}

/** A step's or section's line icon, picked at render time. */
function ShowIcon({ icon: Icon, className }: { icon: IconComponent; className: string }) {
  return <Icon aria-hidden className={className} strokeWidth={1.75} />;
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
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <SiteHeader page="servers" title={server?.name ?? "Server setup"} subtitle="Server settings" wide>
        <Link href="/servers" className="gm-btn gm-btn-quiet h-8 px-2.5 text-xs [--cut:6px]">
          <ArrowLeft aria-hidden strokeWidth={1.75} /> Your servers
        </Link>
        {server && (
          <>
            <ServerIcon name={server.name} url={server.icon_url} size={24} />
            <StatusChip setup={server.setup} />
            <span className="hidden text-xs capitalize text-ink-400 sm:inline">You: {server.access}</span>
            <span className={`text-xs ${dirty ? "font-semibold text-yellow-300" : "text-ink-400"}`}>
              {saving ? "Saving…" : dirty ? "Not saved" : savedAt ? "Saved" : ""}
            </span>
          </>
        )}
      </SiteHeader>
      {server ? children : <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{children}</div>}
    </div>
  );
}
