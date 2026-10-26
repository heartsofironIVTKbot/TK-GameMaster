"use client";

import { useCallback, useMemo, useState } from "react";
import type { SnapshotChannel, SnapshotRole } from "@/lib/serverSettingsTypes";
import { Spinner } from "@/components/schedule/ui";
import { CHANNEL_ICON, channelById, inputClass, roleById, useCreateItem, useDismiss, type StepContext } from "./shared";

/**
 * Role and channel pickers for the setup wizard: the server's real roles /
 * channels (as the bot last reported them), with warnings when GameMaster
 * couldn't use the choice, and "Create for me" (the bot makes it).
 */

/** give = GameMaster hands it out (must be below its role); check = only read; ping = mentioned. */
export type RolePurpose = "give" | "check" | "ping";

function RoleDot({ role }: { role: Pick<SnapshotRole, "color"> }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: role.color ?? "#99aab5" }} />;
}

function roleProblem(role: SnapshotRole, purpose: RolePurpose, botTop: number): { block: boolean; text: string } | null {
  if (role.everyone) return { block: true, text: "everyone" };
  if (purpose === "give" && role.managed) return { block: true, text: "bot / integration role" };
  if (purpose === "give" && role.position >= botTop) return { block: false, text: "above GameMaster" };
  if (purpose === "ping" && !role.mentionable) return { block: false, text: "not mentionable" };
  return null;
}

function RoleMenu({
  ctx,
  purpose,
  selected,
  exclude = [],
  suggestedName,
  onPick,
  onClose,
}: {
  ctx: StepContext;
  purpose: RolePurpose;
  selected: string | null;
  exclude?: string[];
  suggestedName?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(suggestedName ?? "");
  const [color, setColor] = useState("#f1c40f");
  const [mentionable, setMentionable] = useState(purpose === "ping");
  const pick = useCallback(
    (id: string) => {
      onPick(id);
      onClose();
    },
    [onPick, onClose],
  );
  const creator = useCreateItem(ctx.serverId, pick, ctx.refreshSnapshot);
  const botTop = ctx.snapshot?.bot.top_role_position ?? 0;
  const roles = (ctx.snapshot?.roles ?? []).filter(
    (role) => !role.everyone && !exclude.includes(role.id) && role.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-72 min-w-full max-w-[85vw] rounded-xl border border-white/15 bg-slate-900 p-2 shadow-2xl shadow-black/60">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search roles…"
        aria-label="Search roles"
        className={`${inputClass} mb-1.5 py-1.5 text-xs`}
      />
      <ul role="listbox" className="roster-scroll max-h-64 space-y-0.5 overflow-y-auto">
        {roles.length === 0 && <li className="px-2 py-3 text-center text-xs text-slate-500">No roles match.</li>}
        {roles.map((role) => {
          const problem = roleProblem(role, purpose, botTop);
          const active = role.id === selected;
          return (
            <li key={role.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                disabled={problem?.block}
                onClick={() => pick(role.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? "bg-amber-400/15 text-amber-100" : "text-slate-200 hover:bg-white/5"
                }`}
              >
                <RoleDot role={role} />
                <span className="min-w-0 flex-1 truncate font-semibold">{role.name}</span>
                {problem && (
                  <span className={`shrink-0 rounded px-1 text-[10px] font-bold ${problem.block ? "text-slate-500" : "bg-amber-400/15 text-amber-300"}`}>
                    {problem.text}
                  </span>
                )}
                <span className="shrink-0 text-[10px] text-slate-500">{role.members}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5 border-t border-white/10 pt-1.5">
        {!creating ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex-1 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-amber-300 hover:bg-amber-400/10"
            >
              ＋ Create a new role…
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  onPick(null);
                  onClose();
                }}
                className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 p-1">
            <div className="flex gap-1.5">
              <input
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 100))}
                placeholder="Role name"
                aria-label="New role name"
                className={`${inputClass} py-1.5 text-xs`}
              />
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                aria-label="Role colour"
                className="h-8 w-9 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-300">
              <input type="checkbox" checked={mentionable} onChange={(event) => setMentionable(event.target.checked)} className="accent-amber-400" />
              Anyone can @mention it
            </label>
            {creator.state.phase === "error" && <p className="text-[11px] font-semibold text-rose-300">{creator.state.message}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={!name.trim() || creator.state.phase === "working"}
                onClick={() => void creator.create({ op: "create_role", name: name.trim(), color, mentionable })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-2 py-1.5 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40"
              >
                {creator.state.phase === "working" && <Spinner className="h-3 w-3" />}
                {creator.state.phase === "working" ? "GameMaster is creating it…" : "Create role"}
              </button>
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-2 text-xs font-bold text-slate-400 hover:text-white">
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-slate-500">New roles go right under GameMaster&apos;s own role, so it can hand them out.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function RolePicker({
  ctx,
  value,
  onChange,
  purpose,
  suggestedName,
  label,
}: {
  ctx: StepContext;
  value: string | null;
  onChange: (id: string | null) => void;
  purpose: RolePurpose;
  suggestedName?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const role = roleById(ctx.snapshot, value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={!ctx.snapshot}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
          open ? "border-amber-300/60 bg-slate-950" : "border-white/10 bg-slate-950/70 hover:border-white/25"
        }`}
      >
        {role ? (
          <>
            <RoleDot role={role} />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{role.name}</span>
          </>
        ) : value ? (
          <span className="flex-1 text-rose-300">Deleted role (#{value})</span>
        ) : (
          <span className="flex-1 text-slate-500">Choose a role…</span>
        )}
        <span className="text-[10px] text-slate-500">▾</span>
      </button>
      {open && <RoleMenu ctx={ctx} purpose={purpose} selected={value} suggestedName={suggestedName} onPick={onChange} onClose={close} />}
    </div>
  );
}

export function RoleMultiPicker({
  ctx,
  value,
  onChange,
  purpose,
  label,
  suggestedName,
}: {
  ctx: StepContext;
  value: string[];
  onChange: (ids: string[]) => void;
  purpose: RolePurpose;
  label: string;
  suggestedName?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/70 p-1.5">
        {value.length === 0 && <span className="px-1.5 text-sm text-slate-500">None yet</span>}
        {value.map((id) => {
          const role = roleById(ctx.snapshot, id);
          return (
            <span key={id} className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 py-0.5 pl-2 pr-1 text-xs font-semibold text-slate-100">
              {role ? <RoleDot role={role} /> : null}
              <span className={role ? "" : "text-rose-300"}>{role?.name ?? `Deleted (#${id})`}</span>
              <button
                type="button"
                aria-label={`Remove ${role?.name ?? id}`}
                onClick={() => onChange(value.filter((entry) => entry !== id))}
                className="rounded px-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </span>
          );
        })}
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          disabled={!ctx.snapshot}
          onClick={() => setOpen((current) => !current)}
          className="rounded-md px-2 py-0.5 text-xs font-bold text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
        >
          ＋ Add role
        </button>
      </div>
      {open && (
        <RoleMenu
          ctx={ctx}
          purpose={purpose}
          selected={null}
          exclude={value}
          suggestedName={suggestedName}
          onPick={(id) => {
            if (id) onChange([...value, id]);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

export type ChannelKind = "text" | "forum_or_text" | "voice" | "category";

/** Several channels of one kind (chips + a picker that adds one). */
export function ChannelMultiPicker({
  ctx,
  value,
  onChange,
  kind,
  label,
  suggestedName,
}: {
  ctx: StepContext;
  value: string[];
  onChange: (ids: string[]) => void;
  kind: ChannelKind;
  label: string;
  suggestedName?: string;
}) {
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const channel = channelById(ctx.snapshot, id);
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 py-0.5 pl-2 pr-1 text-xs font-semibold text-slate-100"
              >
                <span className="text-slate-400">{channel ? (CHANNEL_ICON[channel.type] ?? "#") : "#"}</span>
                <span className={channel ? "" : "text-rose-300"}>{channel?.name ?? `Deleted (#${id})`}</span>
                <button
                  type="button"
                  aria-label={`Remove ${channel?.name ?? id}`}
                  onClick={() => onChange(value.filter((entry) => entry !== id))}
                  className="rounded px-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <ChannelPicker
        ctx={ctx}
        value={null}
        onChange={(id) => {
          if (id && !value.includes(id)) onChange([...value, id]);
        }}
        kind={kind}
        suggestedName={suggestedName}
        label={label}
      />
    </div>
  );
}

function fits(channel: SnapshotChannel, kind: ChannelKind): boolean {
  if (kind === "category") return channel.type === "category";
  if (kind === "voice") return channel.type === "voice" || channel.type === "stage";
  if (kind === "forum_or_text") return channel.type === "text" || channel.type === "news" || channel.type === "forum";
  return channel.type === "text" || channel.type === "news";
}

function channelProblem(channel: SnapshotChannel, kind: ChannelKind): string | null {
  if (!channel.bot.view) return "GameMaster can't see it";
  if (kind === "voice" && !channel.bot.move) return "can't move people";
  if ((kind === "text" || kind === "forum_or_text") && !channel.bot.send) return "can't post";
  return null;
}

export function ChannelPicker({
  ctx,
  value,
  onChange,
  kind,
  suggestedName,
  label,
}: {
  ctx: StepContext;
  value: string | null;
  onChange: (id: string | null) => void;
  kind: ChannelKind;
  suggestedName?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(suggestedName ?? "");
  const [createKind, setCreateKind] = useState<"text" | "forum">("text");
  const [parent, setParent] = useState<string>("");
  const pick = useCallback(
    (id: string | null) => {
      onChange(id);
      setOpen(false);
      setCreating(false);
    },
    [onChange],
  );
  const creator = useCreateItem(ctx.serverId, pick, ctx.refreshSnapshot);
  const channel = channelById(ctx.snapshot, value);
  const all = useMemo(() => ctx.snapshot?.channels ?? [], [ctx.snapshot]);
  const categories = all.filter((entry) => entry.type === "category").sort((a, b) => a.position - b.position);
  const matches = all.filter((entry) => fits(entry, kind) && entry.name.toLowerCase().includes(query.trim().toLowerCase()));
  const groups =
    kind === "category"
      ? [{ id: "", name: "", items: matches.sort((a, b) => a.position - b.position) }]
      : [
          { id: "", name: "No category", items: matches.filter((entry) => !entry.parent_id) },
          ...categories.map((category) => ({ id: category.id, name: category.name, items: matches.filter((entry) => entry.parent_id === category.id) })),
        ].filter((group) => group.items.length > 0);
  const icon = (entry: SnapshotChannel) => CHANNEL_ICON[entry.type] ?? "#";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={!ctx.snapshot}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
          open ? "border-amber-300/60 bg-slate-950" : "border-white/10 bg-slate-950/70 hover:border-white/25"
        }`}
      >
        {channel ? (
          <>
            <span className="w-4 shrink-0 text-center text-slate-400">{icon(channel)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{channel.name}</span>
          </>
        ) : value ? (
          <span className="flex-1 text-rose-300">Deleted channel (#{value})</span>
        ) : (
          <span className="flex-1 text-slate-500">{kind === "category" ? "Choose a category…" : "Choose a channel…"}</span>
        )}
        <span className="text-[10px] text-slate-500">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 min-w-full max-w-[85vw] rounded-xl border border-white/15 bg-slate-900 p-2 shadow-2xl shadow-black/60">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === "category" ? "Search categories…" : "Search channels…"}
            aria-label="Search channels"
            className={`${inputClass} mb-1.5 py-1.5 text-xs`}
          />
          <div role="listbox" className="roster-scroll max-h-64 space-y-1 overflow-y-auto">
            {groups.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-500">Nothing matches.</p>}
            {groups.map((group) => (
              <div key={group.id || "none"}>
                {group.name && <p className="px-2 pb-0.5 pt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{group.name}</p>}
                {group.items.map((entry) => {
                  const problem = channelProblem(entry, kind);
                  const active = entry.id === value;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(entry.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        active ? "bg-amber-400/15 text-amber-100" : "text-slate-200 hover:bg-white/5"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center text-slate-400">{icon(entry)}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{entry.name}</span>
                      {problem && <span className="shrink-0 rounded bg-amber-400/15 px-1 text-[10px] font-bold text-amber-300">{problem}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1.5 border-t border-white/10 pt-1.5">
            {!creating ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex-1 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-amber-300 hover:bg-amber-400/10"
                >
                  ＋ Create a new {kind === "category" ? "category" : kind === "voice" ? "voice channel" : "channel"}…
                </button>
                {value && (
                  <button
                    type="button"
                    onClick={() => pick(null)}
                    className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 p-1">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 100))}
                  placeholder="Name"
                  aria-label="New channel name"
                  className={`${inputClass} py-1.5 text-xs`}
                />
                {kind === "forum_or_text" && (
                  <div className="flex gap-1 text-[11px]">
                    {(["text", "forum"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setCreateKind(option)}
                        className={`flex-1 rounded-md border px-2 py-1 font-bold ${
                          createKind === option ? "border-amber-300/60 bg-amber-400/15 text-amber-100" : "border-white/10 text-slate-300"
                        }`}
                      >
                        {option === "text" ? "# Text" : "💬 Forum"}
                      </button>
                    ))}
                  </div>
                )}
                {kind !== "category" && (
                  <select
                    value={parent}
                    onChange={(event) => setParent(event.target.value)}
                    aria-label="Category for the new channel"
                    className={`${inputClass} py-1.5 text-xs [color-scheme:dark]`}
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        📁 {category.name}
                      </option>
                    ))}
                  </select>
                )}
                {creator.state.phase === "error" && <p className="text-[11px] font-semibold text-rose-300">{creator.state.message}</p>}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={!name.trim() || creator.state.phase === "working"}
                    onClick={() =>
                      void creator.create({
                        op: "create_channel",
                        kind: kind === "forum_or_text" ? createKind : kind === "voice" ? "voice" : kind === "category" ? "category" : "text",
                        name: name.trim(),
                        parent_id: parent || null,
                      })
                    }
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-2 py-1.5 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40"
                  >
                    {creator.state.phase === "working" && <Spinner className="h-3 w-3" />}
                    {creator.state.phase === "working" ? "GameMaster is creating it…" : "Create"}
                  </button>
                  <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-2 text-xs font-bold text-slate-400 hover:text-white">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
