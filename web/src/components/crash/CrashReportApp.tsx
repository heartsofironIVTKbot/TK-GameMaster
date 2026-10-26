"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DiscordGlyph, GateMessage } from "@/components/schedule/HostGate";
import { GLASS, Spinner } from "@/components/schedule/ui";
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

const NAV_LINK =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-amber-300/40 hover:text-white";
const FIELD =
  "w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-300/50 focus:outline-none";

async function fetchPage(id: string): Promise<Load> {
  const response = await fetch(`/api/crash-reports?game=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as (CrashPageData & { error?: string }) | null;
  if (!response) return { kind: "error", message: "Network error — check your connection and reload." };
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

  if (load.kind !== "ok") {
    return (
      <main className="gm-backdrop flex min-h-screen w-full items-center justify-center p-4">
        {load.kind === "loading" ? (
          <div className="flex items-center gap-3 text-slate-300">
            <Spinner className="h-5 w-5 text-rose-400" />
            <span className="text-sm font-semibold">Loading…</span>
          </div>
        ) : load.kind === "login" ? (
          <GateMessage icon="🚨" title="Report a crash" text="Log in with your Discord account to send your crash logs to the mod developers.">
            <a
              href={`/api/auth/login?next=${encodeURIComponent(`/crash?game=${gameId}`)}`}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-[#4752c4]"
            >
              <DiscordGlyph />
              Log in with Discord
            </a>
          </GateMessage>
        ) : (
          <GateMessage icon="🛠️" title="Report a crash" text={load.message} />
        )}
      </main>
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
          ? "That file is too small — zip the whole crash folder (with the minidump and logs)."
          : picked.size > CRASH_ZIP_MAX_BYTES
            ? `That file is too big (the limit is ${CRASH_ZIP_MAX_BYTES / 1024 / 1024} MB) — zip only the logs folder.`
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

  return (
    <div className="gm-backdrop min-h-screen w-full text-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href={game ? `/?game=${game.id}` : "/"} className="flex items-center gap-2.5" title="Back to the map">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-orange-600 text-lg shadow-lg shadow-rose-500/30">
              🚨
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight text-white">Report a crash</span>
              <span className="block text-[11px] font-semibold text-slate-400">GameMaster · {game?.name ?? "Crash logs"}</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            <Link href={game ? `/?game=${game.id}` : "/"} className={NAV_LINK}>
              🗺️ Map
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] space-y-4 px-4 py-5 sm:px-6">
        {!game ? (
          <section className={`rounded-3xl p-5 ${GLASS}`}>
            <p className="text-sm text-slate-300">That game wasn&apos;t found. Open this page from the link in your game DM, or from the map.</p>
          </section>
        ) : (
          <>
            <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">{game.mode}</p>
              <h1 className="mt-0.5 text-xl font-black tracking-tight text-white">{game.name}</h1>
              {!open ? (
                <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {game.finished
                    ? "This game has ended — crash reports are no longer accepted for it."
                    : "This game hasn't started yet — come back if it crashes once you're playing."}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-300">
                    Game crashed? Send your logs to the mod developers. Every accepted report earns Merit:{" "}
                    <b>+{CRASH_MERIT_VERIFIED}</b> if you&apos;re HOI4 Verified, <b>+{CRASH_MERIT_UNVERIFIED}</b> otherwise (one reward
                    every 6 hours).
                  </p>
                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-slate-300">
                    <li>
                      Open <code className="rounded bg-slate-900/80 px-1">Documents\Paradox Interactive\Hearts of Iron IV</code>.
                    </li>
                    <li>
                      Right-click the <b>logs</b> folder → <b>Compress to ZIP file</b> (or <b>Send to → Compressed (zipped) folder</b>).
                    </li>
                    <li>Pick that .zip below and tell the developers what happened.</li>
                  </ol>

                  <div className="mt-4 space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">What happened right before the crash?</span>
                      <textarea
                        value={whatHappened}
                        onChange={(event) => setWhatHappened(event.target.value.slice(0, CRASH_TEXT_MAX))}
                        rows={3}
                        placeholder="What did you click? What in-game date was it?"
                        className={FIELD}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Anything else? (optional)</span>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value.slice(0, CRASH_NOTES_MAX))}
                        rows={2}
                        className={FIELD}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
                      <span className="min-w-0 flex-1 text-slate-300">
                        {file ? (
                          <>
                            📦 <b>{file.name}</b> · {size(file.size)}
                          </>
                        ) : (
                          "No file picked yet (.zip, 500 KB – 15 MB)."
                        )}
                      </span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".zip,application/zip"
                        aria-label="Zipped logs folder"
                        className="hidden"
                        onChange={(event) => pick(event.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        disabled={request.busy}
                        onClick={() => fileRef.current?.click()}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-rose-300/40 hover:text-white disabled:opacity-50"
                      >
                        📁 {file ? "Pick another" : "Pick the .zip"}
                      </button>
                    </div>
                    {fileError && <p className="text-xs text-rose-300">{fileError}</p>}
                    <button
                      type="button"
                      disabled={!file || !whatHappened.trim() || request.busy}
                      onClick={send}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {request.busy && <Spinner className="h-4 w-4" />}
                      {request.state.phase === "sending" ? "Uploading…" : request.busy ? "The bot is checking your logs…" : "🚨 Send to the developers"}
                    </button>
                    {request.state.phase === "error" && (
                      <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{request.state.message}</p>
                    )}
                    {delivered && (
                      <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50">
                        ✅ Delivered to the mod developers — thank you!
                        {delivered.merit
                          ? ` You earned +${delivered.merit} Merit.`
                          : delivered.cooldown
                            ? " No Merit this time (one reward every 6 hours)."
                            : ""}
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
            {reports.length > 0 && <MyReports reports={reports} />}
          </>
        )}
      </main>
    </div>
  );
}

function MyReports({ reports }: { reports: CrashReportView[] }) {
  return (
    <section className={`rounded-2xl p-4 ${GLASS}`}>
      <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Your reports for this game</h2>
      <ul className="mt-2 space-y-1.5">
        {reports.map((report) => (
          <li key={report.id} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-bold text-slate-100">
                {report.filename} <span className="font-normal text-slate-500">· {size(report.bytes)}</span>
              </span>
              <span
                className={`shrink-0 font-black ${
                  report.status === "delivered" ? "text-emerald-300" : report.status === "rejected" ? "text-rose-300" : "text-amber-300"
                }`}
              >
                {report.status === "delivered" ? "Delivered" : report.status === "rejected" ? "Not accepted" : "Being checked"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {new Date(report.created_at * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {report.note ? ` · ${report.note.replace(/^❌\s*/, "")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
