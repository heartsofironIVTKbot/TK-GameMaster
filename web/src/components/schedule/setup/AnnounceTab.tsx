"use client";

import { HOURS_BEFORE_PRESETS, addOnOption, modeOption } from "@/lib/scheduleOptions";
import type { HostProfile } from "@/lib/scheduleTypes";
import {
  formatDurationMinutes,
  formatInZone,
  formatRelative,
  isHHMM,
  isIsoDate,
} from "@/lib/timeEngine";
import { SectionCard, Slider } from "../ui";
import type { AnnounceMode, DerivedSetup, SetupForm } from "./model";

const MODES: { value: AnnounceMode; icon: string; title: string; text: string }[] = [
  { value: "before", icon: "⏱️", title: "Before the game", text: "The bot posts it a set time before the start." },
  { value: "custom", icon: "🗓️", title: "Exact time", text: "Pick the exact date and time to post it." },
  { value: "now", icon: "⚡", title: "Right away", text: "Posted as soon as the bot saves the game." },
];

export default function AnnounceTab({
  form,
  update,
  derived,
  timeZone,
  nowSec,
  host,
}: {
  form: SetupForm;
  update: (patch: Partial<SetupForm>) => void;
  derived: DerivedSetup;
  timeZone: string;
  nowSec: number;
  host: HostProfile;
}) {
  const maxHours = Math.max(1, Math.min(72, Math.floor((derived.gameSec - nowSec) / 3600)));
  return (
    <div className="space-y-4">
      <SectionCard icon="📣" title="Announcement" subtitle="When should the game be announced in Discord?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODES.map((mode) => {
            const active = form.announceMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => update({ announceMode: mode.value })}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-amber-300/80 bg-amber-400/15"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25"
                }`}
              >
                <span className="text-lg">{mode.icon}</span>
                <span className={`mt-1 block text-sm font-bold ${active ? "text-amber-100" : "text-slate-100"}`}>{mode.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{mode.text}</span>
              </button>
            );
          })}
        </div>

        {form.announceMode === "before" && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-400">Hours before the game</span>
              <span className="text-lg font-black text-amber-200">
                {formatDurationMinutes(form.announceHoursBefore * 60)}
              </span>
            </div>
            <Slider
              min={1}
              max={maxHours}
              value={Math.min(form.announceHoursBefore, maxHours)}
              onChange={(value) => update({ announceHoursBefore: value })}
              ariaLabel="Hours before the game"
              marks={HOURS_BEFORE_PRESETS.filter((hours) => hours <= maxHours).map((hours) => ({
                value: hours,
                label: `${hours}h`,
              }))}
            />
          </div>
        )}

        {form.announceMode === "custom" && (
          <div className="mt-4 flex gap-2">
            <input
              type="date"
              value={form.announceDate}
              onChange={(event) => {
                if (isIsoDate(event.target.value)) update({ announceDate: event.target.value });
              }}
              className="flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 [color-scheme:dark] focus:border-amber-300/50 focus:outline-none"
              aria-label="Announcement date"
            />
            <input
              type="time"
              value={form.announceTime}
              onChange={(event) => {
                if (isHHMM(event.target.value)) update({ announceTime: event.target.value });
              }}
              className="w-32 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 [color-scheme:dark] focus:border-amber-300/50 focus:outline-none"
              aria-label="Announcement time"
            />
          </div>
        )}

        <p className="mt-3 text-xs text-slate-300">
          {derived.announceSec === null ? (
            <>Pick when the bot should announce the game.</>
          ) : form.announceMode === "now" ? (
            <>Posts within a minute of the bot saving the game.</>
          ) : (
            <>
              Posts <b className="text-white">{formatInZone(derived.announceSec * 1000, timeZone)}</b> ·{" "}
              {formatRelative(derived.announceSec * 1000)}
            </>
          )}
        </p>
      </SectionCard>

      <DiscordPreview form={form} derived={derived} timeZone={timeZone} host={host} />
    </div>
  );
}

/** The animated yellow bell the bot puts either side of "Game Announcement"
 *  (bot.py.py ANNOUNCE_BELL_EMOJI). */
const BELL_EMOJI_URL = "https://cdn.discordapp.com/emojis/1480537685478084781.gif?size=48";

function Bell() {
  return (
    // Discord's own emoji image; plain <img> keeps next/image config untouched.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={BELL_EMOJI_URL} alt="🔔" width={22} height={22} className="inline-block h-[22px] w-[22px] align-[-4px]" />
  );
}

/** Mock of the bot's announcement post, rendered in the host's zone (the
 *  same lines as the bot's scheduled announcement). */
function DiscordPreview({
  form,
  derived,
  timeZone,
  host,
}: {
  form: SetupForm;
  derived: DerivedSetup;
  timeZone: string;
  host: HostProfile;
}) {
  const mode = modeOption(form.mode);
  const addOn = addOnOption(form.addOn);
  const gameMs = derived.gameSec * 1000;
  return (
    <SectionCard icon="👀" title="Preview" subtitle="Roughly what players will see in Discord">
      <div className="rounded-xl bg-[#313338] p-3 font-sans text-[13px] leading-relaxed text-[#dbdee1]">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-sm">🤖</span>
          <span className="font-semibold text-white">GameMaster</span>
          <span className="rounded bg-[#5865F2] px-1 text-[10px] font-bold text-white">APP</span>
        </div>
        <div className="mt-2 pl-10">
          <p className="text-xl font-bold text-white">
            <Bell /> Game Announcement <Bell />
          </p>
          <p>
            <span className="rounded bg-[#1e1f22] px-1 text-[#1e1f22]" title="Ping (hidden behind a spoiler)">
              @ping
            </span>
          </p>
          {form.addOn && <p className="font-bold">{addOn.emoji} {addOn.label.toUpperCase()}</p>}
          {form.draft && <p className="font-bold">🎯 DRAFT GAME</p>}
          <p className="font-bold">
            🕓{" "}
            <span className="rounded bg-[#3f4147] px-1">
              {formatInZone(gameMs, timeZone, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              })}
            </span>{" "}
            ({formatRelative(gameMs)})
          </p>
          <p className="font-bold">
            🎮 Host - <span className="rounded bg-[#5865F2]/30 px-1 text-[#c9cdfb]">@{host.display_name || host.username}</span>
          </p>
          <p className="font-bold">
            📝 {form.draft ? "Join the Draft Here" : "Reserve Here"} -{" "}
            <span className="text-[#00a8fc] underline decoration-[#00a8fc]/40" title="The game's map link, made when the bot posts">
              map link
            </span>
          </p>
          {!mode && <p className="mt-1 text-[#949ba4]">Pick a game mode</p>}
        </div>
      </div>
    </SectionCard>
  );
}
