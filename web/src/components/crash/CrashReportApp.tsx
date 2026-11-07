"use client";

import {
  Check,
  CircleAlert,
  CircleCheck,
  FileArchive,
  FolderOpen,
  Info,
  ListChecks,
  Medal,
  Send,
  Siren,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ModeIcon from "@/components/schedule/ModeIcon";
import { GateMessage, GateScreen, LoginScreen } from "@/components/schedule/HostGate";
import { Spinner } from "@/components/schedule/ui";
import SiteHeader from "@/components/site/SiteHeader";
import { modeOption } from "@/lib/scheduleOptions";
import { usePlayerRequest } from "@/components/usePlayerRequest";
import {
  CRASH_MERIT_UNVERIFIED,
  CRASH_MERIT_VERIFIED,
  CRASH_NOTES_MAX,
  CRASH_TEXT_MAX,
  CRASH_ZIP_MAX_BYTES,
  CRASH_ZIP_MIN_BYTES,
  type CrashPageData,
  type CrashReportView,
} from "@/lib/crashReportTypes";

/**
 * /crash?game=<id> — send HOI4 crash logs to the mod developers (replaces the
 * reservation thread's Crash Report panel and its DM upload). The bot checks
 * the zip, posts it to the crash-report channel and gives the Merit reward.
 */

type Load =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: CrashPageData };

const FIELD = "gm-input w-full py-2 text-[13.5px]";

async function fetchPage(id: string): Promise<Load> {
  const response = await fetch(`/api/crash-reports?game=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as (CrashPageData & { error?: string }) | null;
  if (!response) return { kind: "error", message: "Network error. Check your connection and reload." };
  if (response.status === 401) return { kind: "login" };
  if (!response.ok || !body) return { kind: "error", message: body?.error ?? "Couldn't load this page." };
  return { kind: "ok", data: body };
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function CrashReportApp() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [gameId, setGameId] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("game") ?? "";
    let cancelled = false;
    void fetchPage(id).then((result) => {
      if (cancelled) return;
      setGameId(id);
      setLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = usePlayerRequest("/api/crash-reports", () => {
    void fetchPage(gameId).then(setLoad);
  });
  const delivered = request.state.phase === "done" ? request.state.result?.crash : undefined;

  // Clear the form once a report went through (render-time reset).
  const [clearedFor, setClearedFor] = useState<typeof delivered | null>(null);
  if (delivered && delivered !== clearedFor) {
    setClearedFor(delivered);
    setWhatHappened("");
    setNotes("");
    setFile(null);
  }

  if (load.kind === "login") {
    return (
      <LoginScreen
        page="crash"
        title="Report a crash"
        intro="Send your HOI4 logs to the mod developers when a game crashes."
        returnPath={`/crash?game=${gameId}`}
        features={[
          { icon: FileArchive, title: "Straight to the developers", text: "The bot checks your zip and posts it to the crash-report channel." },
          { icon: Medal, title: "Merit for every accepted report", text: `${CRASH_MERIT_VERIFIED} if you're HOI4 Verified, ${CRASH_MERIT_UNVERIFIED} if not.` },
          { icon: ListChecks, title: "See what happened to it", text: "Your reports for each game, delivered or not." },
        ]}
      />
    );
  }
  if (load.kind !== "ok") {
    return (
      <GateScreen page="crash" title="Report a crash">
        {load.kind === "loading" ? (
          <div className="flex items-center gap-3 text-ink-300">
            <Spinner className="h-5 w-5 text-brand-400" />
            <span className="text-sm font-semibold">Loading…</span>
          </div>
        ) : (
          <GateMessage icon={Wrench} title="Report a crash" text={load.message} />
        )}
      </GateScreen>
    );
  }

  const { game, reports } = load.data;
  const open = Boolean(game?.started && !game.finished);

  const pick = (picked: File | null) => {
    const problem = !picked
      ? null
      : !/\.zip$/i.test(picked.name)
        ? "Please compress your logs folder into a .zip file and pick that."
        : picked.size < CRASH_ZIP_MIN_BYTES
          ? "That file is too small. Zip the whole logs folder."
          : picked.size > CRASH_ZIP_MAX_BYTES
            ? `That file is too big (the limit is ${CRASH_ZIP_MAX_BYTES / 1024 / 1024} MB). Zip only the logs folder.`
            : null;
    setFileError(problem);
    setFile(problem ? null : picked);
    if (problem && fileRef.current) fileRef.current.value = "";
  };

  const send = () => {
    if (!game || !file || !whatHappened.trim()) return;
    const form = new FormData();
    form.append("game", game.id);
    form.append("what_happened", whatHappened.trim());
    form.append("notes", notes.trim());
    form.append("file", file);
    void request.submit("POST", form);
  };

  const phase = !game ? "" : game.finished ? "Ended" : game.started ? "On-going" : "Not started";
  const phaseTone = game?.finished ? "bg-ink-800 text-ink-300" : game?.started ? "bg-sky-950 text-sky-300" : "bg-yellow-950 text-yellow-300";

  return (
    <div className="min-h-screen w-full text-ink-100">
      <SiteHeader page="crash" title="Report a crash" subtitle={game?.name ?? "Send your crash logs to the mod developers"} />

      <main className="mx-auto max-w-[860px] space-y-3 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Siren aria-hidden className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
          <h1 className="gm-title text-[30px]">Report a crash</h1>
        </div>
        {!game ? (
          <section className="gm-plate p-5">
            <p className="text-sm text-ink-300">That game wasn&apos;t found. Open this page from the link in your game DM, or from the map.</p>
          </section>
        ) : (
          <>
            <section className="gm-plate flex items-center gap-3 px-4 py-3.5 sm:px-[18px]">
              <span className="gm-cut grid h-10 w-10 shrink-0 place-items-center bg-ink-800 text-brand-400 [--cut:8px]">
                <ModeIcon mode={game.mode} aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink-100">{game.name}</p>
                <p className="text-xs text-ink-400">{modeOption(game.mode)?.label ?? game.mode}</p>
              </div>
              <span className={`gm-tag gm-tag-dot shrink-0 ${phaseTone}`}>{phase}</span>
            </section>

            {!open ? (
              <p className="gm-cut flex gap-2.5 bg-ink-900 px-3.5 py-3 text-[13px] text-ink-300 shadow-[inset_3px_0_0_var(--color-sky-300)] [--cut:9px]">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" strokeWidth={1.75} />
                {game.finished
                  ? "This game has ended, so it doesn't take crash reports any more."
                  : "This game hasn't started yet. Come back if it crashes once you're playing."}
              </p>
            ) : (
              <>
                <p className="gm-cut flex gap-2.5 bg-yellow-950/60 px-3.5 py-3 text-[13px] text-ink-300 shadow-[inset_3px_0_0_var(--color-yellow-300)] [--cut:9px]">
                  <Medal aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" strokeWidth={1.75} />
                  <span>
                    <b className="font-semibold text-ink-100">Merit for every accepted report: </b>
                    {CRASH_MERIT_VERIFIED} if you&apos;re HOI4 Verified, {CRASH_MERIT_UNVERIFIED} if not. One reward every 6 hours.
                  </span>
                </p>

                <section className="gm-plate space-y-5 p-4 sm:p-5">
                  <Step n={1} state={file ? "done" : "open"} title="Zip your logs folder">
                    <p className="text-[13px] text-ink-400">
                      Open <code className="bg-ink-950 px-1 text-ink-200">Documents\Paradox Interactive\Hearts of Iron IV</code>, right-click the{" "}
                      <b className="font-semibold text-ink-200">logs</b> folder and choose <b className="font-semibold text-ink-200">Compress to ZIP file</b> (or{" "}
                      <b className="font-semibold text-ink-200">Send to, Compressed (zipped) folder</b>).
                    </p>
                  </Step>

                  <Step n={2} state={file ? "done" : "on"} title="Add the zip">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".zip,application/zip"
                      aria-label="Zipped logs folder"
                      className="hidden"
                      onChange={(event) => pick(event.target.files?.[0] ?? null)}
                    />
                    <div
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!request.busy) pick(event.dataTransfer.files?.[0] ?? null);
                      }}
                      className="gm-cut flex flex-col items-center gap-1.5 bg-ink-950 px-4 py-6 text-center text-[13px] text-ink-400 shadow-[inset_0_0_0_1px_var(--color-ink-700)] [--cut:12px]"
                    >
                      <FileArchive aria-hidden className="h-7 w-7 text-brand-400" strokeWidth={1.5} />
                      {file ? (
                        <>
                          <b className="text-sm font-semibold text-ink-100">{file.name}</b>
                          {size(file.size)}
                        </>
                      ) : (
                        <>
                          <b className="text-sm font-semibold text-ink-100">Drop the zip here</b>
                          or pick the file. A .zip of {CRASH_ZIP_MIN_BYTES / 1024} KB to {CRASH_ZIP_MAX_BYTES / 1024 / 1024} MB.
                        </>
                      )}
                      <button
                        type="button"
                        disabled={request.busy}
                        onClick={() => fileRef.current?.click()}
                        className="gm-btn gm-btn-secondary mt-1.5 h-[30px] px-3 text-[12.5px] [--cut:7px]"
                      >
                        <FolderOpen aria-hidden strokeWidth={1.75} />
                        {file ? "Pick another" : "Pick a file"}
                      </button>
                    </div>
                    {fileError && (
                      <p className="mt-2 flex gap-1.5 text-xs text-rose-300">
                        <CircleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                        {fileError}
                      </p>
                    )}
                  </Step>

                  <Step n={3} state={file ? "on" : "open"} title="Say what happened">
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-ink-100">What happened right before the crash?</span>
                        <textarea
                          value={whatHappened}
                          onChange={(event) => setWhatHappened(event.target.value.slice(0, CRASH_TEXT_MAX))}
                          rows={3}
                          placeholder="What did you click? What in-game date was it?"
                          className={FIELD}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[13px] font-semibold text-ink-100">
                          Anything else? <span className="font-normal text-ink-500">(optional)</span>
                        </span>
                        <textarea
                          value={notes}
                          onChange={(event) => setNotes(event.target.value.slice(0, CRASH_NOTES_MAX))}
                          rows={2}
                          className={FIELD}
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="min-w-0 flex-1 text-xs text-ink-500">The report goes to the mod developers&apos; crash-report channel.</span>
                        <button
                          type="button"
                          disabled={!file || !whatHappened.trim() || request.busy}
                          onClick={send}
                          className="gm-btn gm-btn-primary"
                        >
                          {request.busy ? <Spinner className="h-4 w-4" /> : <Send aria-hidden strokeWidth={1.75} />}
                          {request.state.phase === "sending" ? "Uploading…" : request.busy ? "The bot is checking your logs…" : "Send crash report"}
                        </button>
                      </div>
                      {request.state.phase === "error" && (
                        <p className="gm-cut bg-rose-950 px-3 py-2 text-[13px] text-rose-200 [--cut:8px]">{request.state.message}</p>
                      )}
                      {delivered && (
                        <p className="gm-cut flex gap-2 bg-emerald-950 px-3 py-2.5 text-[13px] text-emerald-200 [--cut:8px]">
                          <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                          <span>
                            Sent to the mod developers. Thank you!
                            {delivered.merit
                              ? ` You earned ${delivered.merit} Merit.`
                              : delivered.cooldown
                                ? " No Merit this time (one reward every 6 hours)."
                                : ""}
                          </span>
                        </p>
                      )}
                    </div>
                  </Step>
                </section>
              </>
            )}
            {reports.length > 0 && <MyReports reports={reports} />}
          </>
        )}
      </main>
    </div>
  );
}

/** One numbered step: a check once done, green while it's the one to do. */
function Step({ n, state, title, children }: { n: number; state: "done" | "on" | "open"; title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3.5">
      <span
        className={`gm-cut grid h-8 w-8 place-items-center font-display text-lg font-extrabold [--cut:7px] ${
          state === "done" ? "bg-emerald-950 text-emerald-300" : state === "on" ? "bg-brand-400 text-brand-950" : "bg-ink-800 text-ink-100"
        }`}
      >
        {state === "done" ? <Check aria-hidden className="h-4 w-4" strokeWidth={2} /> : n}
      </span>
      <div className="min-w-0">
        <h2 className="mb-2 mt-1 text-[15px] font-semibold text-ink-100">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const REPORT_STATUS: Record<string, { label: string; tone: string }> = {
  delivered: { label: "Delivered", tone: "bg-emerald-950 text-emerald-300" },
  rejected: { label: "Not accepted", tone: "bg-rose-950 text-rose-300" },
};

function MyReports({ reports }: { reports: CrashReportView[] }) {
  return (
    <section className="gm-plate p-4 sm:p-[18px]">
      <h2 className="flex items-center gap-2.5">
        <ListChecks aria-hidden className="h-[18px] w-[18px] text-brand-400" strokeWidth={1.75} />
        <span className="gm-title text-[22px]">Your reports for this game</span>
      </h2>
      <ul className="mt-3 space-y-1">
        {reports.map((report) => {
          const status = REPORT_STATUS[report.status] ?? { label: "Being checked", tone: "bg-yellow-950 text-yellow-300" };
          return (
            <li key={report.id} className="gm-cut bg-ink-950 px-3 py-2 text-[13px] [--cut:7px]">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-100">
                  {report.filename} <span className="font-normal text-ink-500">{size(report.bytes)}</span>
                </span>
                <span className={`gm-tag gm-tag-dot shrink-0 ${status.tone}`}>{status.label}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                {new Date(report.created_at * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {report.note ? `, ${report.note.replace(/^❌\s*/, "")}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
