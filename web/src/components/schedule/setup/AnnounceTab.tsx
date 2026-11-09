"use client";

import { CalendarClock, Eye, Info, Megaphone, Timer, Zap, type LucideIcon } from "lucide-react";
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

const MODES: { value: AnnounceMode; icon: LucideIcon; title: string; text: string }[] = [
  { value: "before", icon: Timer, title: "Before the game", text: "A set time before the start." },
  { value: "custom", icon: CalendarClock, title: "At an exact time", text: "Pick the date and time." },
  { value: "now", icon: Zap, title: "Right away", text: "As soon as the game is saved." },
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
    <div className="space-y-3">
      <SectionCard icon={Megaphone} title="Announcement" subtitle="When the bot posts the game in Discord.">
        <div className="grid gap-1">
          {MODES.map((mode) => {
            const active = form.announceMode === mode.value;
            const Icon = mode.icon;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => update({ announceMode: mode.value })}
                aria-pressed={active}
                className={`gm-cut grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 bg-ink-950 px-2.5 py-2 text-left [--cut:8px] ${
                  active ? "shadow-[inset_0_0_0_1px_var(--color-brand-400)]" : "hover:bg-ink-800/60"
                }`}
              >
                <span className={`gm-cut grid h-[30px] w-[30px] place-items-center [--cut:6px] ${active ? "bg-brand-400 text-brand-950" : "bg-ink-800 text-ink-300"}`}>
                  <Icon aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-ink-100">{mode.title}</span>
                  <span className="block text-xs text-ink-400">{mode.text}</span>
                </span>
              </button>
            );
          })}
        </div>

        {form.announceMode === "before" && (
          <div className="gm-cut mt-3 bg-ink-950 p-3 [--cut:8px]">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-ink-400">How long before the game</span>
              <span className="text-sm font-semibold text-brand-300">
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
          <div className="mt-3 flex gap-2">
            <input
              type="date"
              value={form.announceDate}
              onChange={(event) => {
                if (isIsoDate(event.target.value)) update({ announceDate: event.target.value });
              }}
              className="gm-input flex-1 text-sm"
              aria-label="Announcement date"
            />
            <input
              type="time"
              value={form.announceTime}
              onChange={(event) => {
                if (isHHMM(event.target.value)) update({ announceTime: event.target.value });
              }}
              className="gm-input w-32 text-sm"
              aria-label="Announcement time"
            />
          </div>
        )}

        <p className="mt-3 flex gap-2 text-xs text-ink-300">
          <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
          <span>
          {derived.announceSec === null ? (
            <>Pick when the bot should announce the game.</>
          ) : form.announceMode === "now" ? (
            <>Posts within a minute of the bot saving the game.</>
          ) : form.announceMode === "before" && derived.announceSec <= nowSec ? (
            <>The game starts sooner than that, so it&apos;s posted right away.</>
          ) : (
            <>
              Posts <b className="font-semibold text-ink-100">{formatInZone(derived.announceSec * 1000, timeZone)}</b>,{" "}
              {formatRelative(derived.announceSec * 1000)}
            </>
          )}
          </span>
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
    <SectionCard icon={Eye} title="Preview" subtitle="Roughly what players see in Discord">
      <div className="gm-cut bg-[#313338] p-3 font-sans text-[13px] leading-relaxed text-[#dbdee1] [--cut:8px]">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-400 font-stencil text-sm text-brand-950">GM</span>
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
            📝{" "}
            <span
              className="text-[#00a8fc] underline decoration-[#00a8fc]/40"
              title={form.addOn === "randomizer" ? "Links to the game's Casino entry (through GameMaster)" : "Links to the game's map"}
            >
              {form.draft ? "Join the Draft Here" : form.addOn === "randomizer" ? "Roll at the Casino" : "Reserve Here"}
            </span>
          </p>
          {!mode && <p className="mt-1 text-[#949ba4]">Pick a game mode</p>}
        </div>
      </div>
    </SectionCard>
  );
}
