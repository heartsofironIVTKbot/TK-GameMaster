"use client";

import { useState } from "react";
import { ACCESS_LEVELS, type AccessLevel, type GameAccessPayload, type GameControl } from "@/lib/gameControlTypes";
import { SubmitButton } from "@/components/database/ActionPanel";
import { GLASS, Segmented, Spinner, Toggle } from "@/components/schedule/ui";
import { BotText } from "./labels";
import { useBotRequest, type BotRequestState } from "./useBotRequest";

/**
 * Who may reserve in this game (formerly /lock, /unlock, /lockdown,
 * /nation_lock, /nation_unlock and /clear): Major / Minor access levels,
 * lockdown, locked nations and clearing the list (before the start only).
 */

const LEVEL_LABEL: Record<AccessLevel, string> = {
  VIP: "VIP+",
  Trusted: "Trusted+",
  Verified: "Verified+",
  "All Users": "Everyone",
};

export default function AccessCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const request = useBotRequest(onChanged);
  const editable = game.can_manage && !game.in_flight;
  const send = (payload: Omit<GameAccessPayload, "thread_id">) =>
    void request.submit({ action: "game_access", payload: { thread_id: game.id, ...payload } });
  const disabled = !editable || request.busy;
  const started = game.phase !== "announced";

  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-300">Reservation access</p>
          <p className="mt-1 text-sm text-slate-400">
            Who may reserve in this game. {started && "Reservations are closed once the game starts — these apply if it's reopened."}
          </p>
        </div>
        {request.busy && <Spinner className="h-4 w-4 text-sky-300" />}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <LevelsForm
          key={`${game.access.major_level}|${game.access.minor_level}`}
          major={game.access.major_level}
          minor={game.access.minor_level}
          disabled={disabled}
          onSave={(major, minor) => send({ op: "levels", major_level: major, minor_level: minor })}
        />
        <div className="space-y-4">
          <Toggle
            checked={game.access.lockdown}
            disabled={disabled}
            onChange={(checked) => send({ op: "lockdown", enabled: checked })}
            label="Lockdown"
            description="Players can't reserve on the website map. Your host tools still work."
          />
          <NationLocks game={game} disabled={disabled} onLock={(nation) => send({ op: "nation_lock", nation })} onUnlock={(nation) => send({ op: "nation_unlock", nation })} />
        </div>
      </div>

      {game.phase === "announced" && editable && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
          <p className="min-w-0 flex-1 text-[11px] text-slate-400">
            <b className="text-slate-200">Clear the list</b> — removes all {game.players} player(s) from their nations. Only before the
            game starts.
          </p>
          <div className="w-full sm:w-64">
            <SubmitButton
              label="🧹 Clear all reservations"
              danger
              busy={request.busy}
              disabled={disabled || game.players === 0}
              onConfirm={() => send({ op: "clear" })}
            />
          </div>
        </div>
      )}

      <RequestResult state={request.state} onDismiss={request.reset} />
      {!game.can_manage && (
        <p className="mt-3 text-[11px] text-slate-500">Only the game&apos;s host or Host Management can change who may reserve.</p>
      )}
    </section>
  );
}

function LevelsForm({
  major,
  minor,
  disabled,
  onSave,
}: {
  major: AccessLevel;
  minor: AccessLevel;
  disabled: boolean;
  onSave: (major: AccessLevel, minor: AccessLevel) => void;
}) {
  const [draftMajor, setDraftMajor] = useState(major);
  const [draftMinor, setDraftMinor] = useState(minor);
  const changed = draftMajor !== major || draftMinor !== minor;
  const options = ACCESS_LEVELS.map((level) => ({ value: level, label: LEVEL_LABEL[level] }));
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Majors</p>
        <Segmented<AccessLevel> ariaLabel="Who may reserve Majors" size="sm" value={draftMajor} onChange={setDraftMajor} options={options} />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Minors</p>
        <Segmented<AccessLevel> ariaLabel="Who may reserve Minors" size="sm" value={draftMinor} onChange={setDraftMinor} options={options} />
      </div>
      <button
        type="button"
        disabled={disabled || !changed}
        onClick={() => onSave(draftMajor, draftMinor)}
        className="rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save access levels
      </button>
    </div>
  );
}

function NationLocks({
  game,
  disabled,
  onLock,
  onUnlock,
}: {
  game: GameControl;
  disabled: boolean;
  onLock: (nation: string) => void;
  onUnlock: (nation: string) => void;
}) {
  const [nation, setNation] = useState("");
  // Excludes a preset's not-playable nations (locked for good; listed in the header).
  const locked = game.access.locked_nations;
  const known = game.nations ? [...game.nations.majors, ...game.nations.minors] : [];
  const suggestions = known.filter((name) => !locked.includes(name));
  const listId = `lockable-${game.id}`;
  const valid = !game.nations || known.some((name) => name.toLowerCase() === nation.trim().toLowerCase());
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Locked nations</p>
      {locked.length === 0 ? (
        <p className="text-xs text-slate-500">
          {game.preset?.not_playable.length ? "None — every playable nation can be reserved." : "None — every nation can be reserved."}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {locked.map((name) => (
            <li key={name} className="flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-500/10 py-0.5 pl-2 pr-1 text-xs text-rose-100">
              ⚫ {name}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onUnlock(name)}
                className="rounded px-1 text-rose-200/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
                aria-label={`Unlock ${name}`}
                title="Unlock"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!nation.trim() || !valid) return;
          onLock(nation.trim());
          setNation("");
        }}
      >
        <input
          value={nation}
          onChange={(event) => setNation(event.target.value.slice(0, 128))}
          list={listId}
          placeholder="Lock a nation…"
          aria-label="Nation to lock"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-300/50 focus:outline-none"
        />
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={disabled || !nation.trim() || !valid}
          className="rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-200 hover:border-sky-300/50 disabled:opacity-40"
        >
          🔒 Lock
        </button>
      </form>
      {nation.trim() && !valid && <p className="mt-1 text-[11px] text-amber-200">Not a nation in {game.mode}.</p>}
    </div>
  );
}

export function RequestResult({ state, onDismiss }: { state: BotRequestState; onDismiss: () => void }) {
  if (state.phase === "idle" || state.phase === "sending" || state.phase === "waiting") {
    if (state.phase === "idle") return null;
    // Messages to players report how far they've got.
    const progress = state.phase === "waiting" ? state.status?.result?.message : undefined;
    const sending = progress && "state" in progress ? progress : null;
    return (
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <Spinner className="h-3.5 w-3.5 text-sky-300" />{" "}
        {state.phase === "sending"
          ? "Sending…"
          : sending
            ? `DMing players… ${sending.sent + sending.failed} of ${sending.total}`
            : "The bot is applying it…"}
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
        <span className="flex-1">
          <BotText text={state.message} />
        </span>
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }
  const message = state.status.result?.message;
  const outcome =
    state.status.result?.access ??
    state.status.result?.reminder ??
    state.status.result?.resources ??
    (message && "title" in message ? message : undefined);
  if (state.phase === "confirm" || !outcome) return null;
  return (
    <div className="gm-fade-up mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50">
      <div className="min-w-0 flex-1">
        <p className="font-black">
          <BotText text={`${outcome.title} — ${outcome.summary}`} />
        </p>
        {outcome.notes.map((note) => (
          <p key={note} className="opacity-90">
            • <BotText text={note} />
          </p>
        ))}
      </div>
      <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
