"use client";

import { Coins, Medal, Search, Swords } from "lucide-react";
import { useEffect, useState } from "react";
import type { DirectoryMember } from "@/lib/scheduleTypes";
import { SectionCard, Segmented, Spinner, Toggle } from "../ui";
import { defaultDraftForm, type DraftForm, type DraftTeamForm } from "./model";

/** Team 1 blue, team 2 red (the map's draft colours). */
const TEAM_TONES = ["shadow-[inset_3px_0_0_var(--color-sky-300)]", "shadow-[inset_3px_0_0_var(--color-rose-300)]"];
const CHIP_TONES = ["bg-sky-300 text-ink-950", "bg-rose-300 text-ink-950"];

/**
 * Game setup → Draft game: players join a shared pool from the map as a Major
 * or a Minor, then two captains take turns placing them on their team's
 * nations (the host can place anyone too). The host picks each team's name,
 * captain and nation groups — the loaded preset's groups, else the mode's.
 */
export default function DraftSection({
  draft,
  groups,
  blocked,
  onChange,
}: {
  draft: DraftForm | null;
  /** The game's nation groups (playable preset groups, or the mode's standard ones). */
  groups: string[];
  /** Why this game can't be a draft (casino add-ons), or null. */
  blocked: string | null;
  onChange: (draft: DraftForm | null) => void;
}) {
  const setTeam = (index: 0 | 1, patch: Partial<DraftTeamForm>) => {
    if (!draft) return;
    const teams = [...draft.teams] as DraftForm["teams"];
    teams[index] = { ...teams[index], ...patch };
    onChange({ ...draft, teams });
  };
  /** Click a group: put it in this team (taking it from the other), or take it out. */
  const toggleGroup = (index: 0 | 1, group: string) => {
    if (!draft) return;
    const other = (1 - index) as 0 | 1;
    const inThis = draft.teams[index].groups.includes(group);
    const teams = [...draft.teams] as DraftForm["teams"];
    teams[index] = { ...teams[index], groups: inThis ? teams[index].groups.filter((g) => g !== group) : [...teams[index].groups, group] };
    teams[other] = { ...teams[other], groups: teams[other].groups.filter((g) => g !== group) };
    onChange({ ...draft, teams });
  };
  const unassigned = draft ? groups.filter((group) => !draft.teams.some((team) => team.groups.includes(group))) : [];
  const stale = draft ? draft.teams.flatMap((team) => team.groups).filter((group) => !groups.includes(group)) : [];

  return (
    <SectionCard icon={Swords} title="Draft game" subtitle="Players sign up as a Major or a Minor; two captains draft them onto their team's nations.">
      <Toggle
        checked={draft !== null}
        disabled={Boolean(blocked) && draft === null}
        onChange={(on) => onChange(on ? defaultDraftForm(groups) : null)}
        label={draft ? "Draft game" : "Normal game"}
        description={
          blocked && draft === null
            ? blocked
            : draft
              ? "The map link opens a sign-up pop-up; you start the draft from the Games page or the map."
              : "Turn on to let captains draft players instead of first come, first served."
        }
      />
      {blocked && draft && <p className="mt-2 text-xs text-rose-300">{blocked}</p>}

      {draft && (
        <div className="gm-fade-up mt-3 space-y-2">
          {draft.teams.map((team, rawIndex) => {
            const index = rawIndex as 0 | 1;
            return (
              <div key={index} className={`gm-cut bg-ink-950 p-3 [--cut:8px] ${TEAM_TONES[index]}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink-400">Team {index + 1}</span>
                  <input
                    value={team.name}
                    maxLength={30}
                    onChange={(event) => setTeam(index, { name: event.target.value })}
                    placeholder={index === 0 ? "e.g. Allies" : "e.g. Axis"}
                    className={`gm-input min-h-8 min-w-0 flex-1 bg-ink-900 py-1 text-sm font-semibold [--cut:6px] ${
                      team.name.trim() ? "" : "shadow-[inset_0_0_0_1px_var(--color-rose-400)]"
                    }`}
                    aria-label={`Team ${index + 1} name`}
                  />
                </div>
                <p className="mb-1 mt-3 text-xs font-semibold text-ink-500">Captain</p>
                <CaptainPicker
                  captainId={team.captainId}
                  captainName={team.captainName}
                  otherCaptainId={draft.teams[1 - index].captainId}
                  onPick={(member) =>
                    setTeam(index, {
                      captainId: member?.discord_id ?? null,
                      captainName: member ? member.display_name || member.username || member.discord_id : null,
                    })
                  }
                />
                <p className="mb-1.5 mt-3 text-xs font-semibold text-ink-500">Nation groups (click to add or remove)</p>
                <div className="flex flex-wrap gap-1">
                  {groups.map((group) => {
                    const mine = team.groups.includes(group);
                    const theirs = draft.teams[1 - index].groups.includes(group);
                    return (
                      <button
                        key={group}
                        type="button"
                        onClick={() => toggleGroup(index, group)}
                        className={`gm-cut h-[26px] px-2.5 text-xs font-semibold [--cut:6px] ${
                          mine
                            ? CHIP_TONES[index]
                            : theirs
                              ? "bg-ink-900 text-ink-500 line-through hover:text-ink-300"
                              : "bg-ink-900 text-ink-300 hover:text-ink-100"
                        }`}
                        title={theirs ? `In ${draft.teams[1 - index].name || "the other team"}. Click to move it here` : undefined}
                      >
                        {group}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {unassigned.length > 0 && (
            <p className="text-xs text-ink-400">
              In no team: <b className="font-semibold text-ink-200">{unassigned.join(", ")}</b>. Captains can&apos;t pick these
              nations, but you can place players there yourself.
            </p>
          )}
          {stale.length > 0 && (
            <p className="text-xs text-rose-300">
              {stale.join(", ")} {stale.length === 1 ? "isn't" : "aren't"} one of this game&apos;s nation groups any more.
              Click the team&apos;s groups again or{" "}
              <button type="button" className="font-bold underline" onClick={() => onChange(defaultDraftForm(groups))}>
                reset the teams
              </button>
              .
            </p>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-500">Pick order</p>
            <Segmented<"coin" | "0" | "1">
              ariaLabel="Pick order"
              size="sm"
              value={draft.coinFlip ? "coin" : (String(draft.firstPicker) as "0" | "1")}
              onChange={(value) =>
                onChange(value === "coin" ? { ...draft, coinFlip: true } : { ...draft, coinFlip: false, firstPicker: value === "1" ? 1 : 0 })
              }
              options={[
                { value: "coin", label: <span className="inline-flex items-center gap-1.5"><Coins aria-hidden className="h-3.5 w-3.5" />Coin toss</span> },
                { value: "0", label: `${draft.teams[0].name || "Team 1"} first` },
                { value: "1", label: `${draft.teams[1].name || "Team 2"} first` },
              ]}
            />
            <p className="mt-1 text-xs text-ink-500">
              {draft.coinFlip
                ? "The winner of the coin toss opens with 3 picks, then the captains alternate one by one."
                : "That team picks first, then the captains alternate one by one."}
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/** Search the server's members for a captain (GET /api/live/players). */
export function CaptainPicker({
  captainId,
  captainName,
  otherCaptainId,
  onPick,
}: {
  captainId: string | null;
  captainName: string | null;
  otherCaptainId: string | null;
  onPick: (member: DirectoryMember | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; players: DirectoryMember[] } | null>(null);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/live/players?q=${encodeURIComponent(needle)}`, { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { players?: DirectoryMember[] } | null;
          if (!cancelled) setResults({ query: needle, players: body?.players ?? [] });
        })
        .catch(() => {
          if (!cancelled) setResults({ query: needle, players: [] });
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (captainId) {
    return (
      <div className="gm-cut flex items-center gap-2 bg-ink-900 px-2.5 py-1.5 [--cut:6px]">
        <Medal aria-hidden className="h-4 w-4 shrink-0 text-yellow-300" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-100">{captainName ?? `#${captainId}`}</span>
        <button type="button" onClick={() => onPick(null)} className="text-xs font-semibold text-ink-400 hover:text-ink-100">
          Change
        </button>
      </div>
    );
  }
  const needle = query.trim();
  const shown = results && results.query === needle ? results.players : null;
  return (
    <div>
      <label className="gm-field h-8 bg-ink-900">
        <Search aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <input maxLength={64}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a member (name, @handle or ID)"
          aria-label="Captain"
        />
      </label>
      {needle.length >= 2 && !shown && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500">
          <Spinner className="h-3 w-3" /> Searching…
        </p>
      )}
      {shown && (
        <ul className="roster-scroll mt-1 max-h-40 space-y-1 overflow-y-auto">
          {shown.length === 0 && <li className="text-[11px] text-ink-500">Nobody matches “{needle}”.</li>}
          {shown.slice(0, 12).map((member) => (
            <li key={member.discord_id}>
              <button
                type="button"
                disabled={member.discord_id === otherCaptainId}
                onClick={() => {
                  onPick(member);
                  setQuery("");
                }}
                className="gm-cut flex w-full items-center gap-2 bg-ink-900 px-2.5 py-1.5 text-left text-xs [--cut:6px] hover:bg-ink-800 disabled:opacity-40"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-100">{member.display_name || member.username}</span>
                {member.username && <span className="truncate text-[10px] text-ink-500">@{member.username}</span>}
                {member.discord_id === otherCaptainId && <span className="text-[10px] text-ink-500">other captain</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
