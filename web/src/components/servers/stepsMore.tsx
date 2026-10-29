"use client";

import { useState } from "react";
import {
  BRANCHES,
  BRANCH_INFO,
  CHANNEL_FIELDS,
  MODE_CATALOG,
  MODE_CHANNEL_FIELDS,
  TICKET_CHANNEL_FIELDS,
  hasCasino,
  type Branch,
  type LinkEntry,
  type ModeChannelField,
  type ModeSettings,
} from "@/lib/serverSettingsTypes";
import { Spinner, Toggle } from "@/components/schedule/ui";
import { useFixAction } from "./DashboardPanel";
import { ChannelMultiPicker, ChannelPicker, RoleMultiPicker, RolePicker } from "./pickers";
import { Callout, Card, Field, inputClass, issuesAt, type StepContext } from "./shared";
import { RuleNumber } from "./stepsStart";

const enabledBranches = (ctx: StepContext) => BRANCHES.filter((branch) => ctx.draft.branches[branch].enabled);

// ————— 5. Player roles —————

const BRANCH_ROLE_FIELDS = [
  {
    key: "verified",
    label: "Verified",
    hint: (b: Branch) => `Players checked for ${BRANCH_INFO[b].games}. Needed for the Verified+ reservation level and for Trusted.`,
    suggested: (b: Branch) => `${b} Verified`,
  },
  {
    key: "trusted",
    label: "Trusted",
    hint: (b: Branch) => `Given automatically at enough ${b} commends (VIPs always have it).`,
    suggested: (b: Branch) => `${b} Trusted`,
  },
  {
    key: "game_ban",
    label: "Game ban",
    hint: (b: Branch) => `Given automatically at enough ${b} warnings. Banned players can't reserve ${BRANCH_INFO[b].games}.`,
    suggested: (b: Branch) => `${b} Banned`,
  },
  {
    key: "dishonored",
    label: "Dishonored",
    hint: (b: Branch) => `Shown while a player has an active ${b} Dishonored restriction (given on the Database page). Optional.`,
    suggested: (b: Branch) => `${b} Dishonored`,
  },
  {
    key: "ping",
    label: "Notification ping",
    hint: (b: Branch) => `Pinged when a ${BRANCH_INFO[b].games.replace(/s$/, "")} is announced. A game mode can use its own (Game modes step).`,
    suggested: (b: Branch) => `${b} Games`,
  },
] as const;

const OPTIONAL_BRANCH_ROLES = new Set(["dishonored"]);

export function RolesStep({ ctx }: { ctx: StepContext }) {
  const { draft } = ctx;
  return (
    <div className="space-y-4">
      {enabledBranches(ctx).map((branch) => (
        <Card key={branch} icon={BRANCH_INFO[branch].emoji} title={`${BRANCH_INFO[branch].long} players`}>
          <div className="grid gap-4 md:grid-cols-3">
            {BRANCH_ROLE_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={`${branch} ${field.label}`}
                hint={field.hint(branch)}
                required={!OPTIONAL_BRANCH_ROLES.has(field.key)}
                issues={issuesAt(ctx.issues, `roles.${field.key}.${branch}`)}
              >
                <RolePicker
                  ctx={ctx}
                  value={draft.roles[field.key][branch]}
                  onChange={(id) => ctx.update((s) => void (s.roles[field.key][branch] = id))}
                  purpose={field.key === "ping" ? "ping" : "give"}
                  suggestedName={field.suggested(branch)}
                  label={`${branch} ${field.label} role`}
                />
              </Field>
            ))}
          </div>
        </Card>
      ))}
      <Card icon="⚖️" title="Moderation numbers" subtitle="Counted separately for each branch.">
        <div className="grid gap-4 sm:grid-cols-2">
          <RuleNumber ctx={ctx} rule="trusted_commends" />
          <RuleNumber ctx={ctx} rule="warnings_for_ban" />
        </div>
      </Card>
      <Card icon="🌟" title="VIP" subtitle="Given on the Database page. VIP comes with every Verified and Trusted role.">
        <Field
          label="VIP roles"
          hint="Anyone with any of these roles counts as VIP. Giving VIP adds the first role; taking VIP away removes all of them."
          issues={issuesAt(ctx.issues, "roles.vip")}
        >
          <RoleMultiPicker
            ctx={ctx}
            value={draft.roles.vip}
            onChange={(ids) => ctx.update((s) => void (s.roles.vip = ids))}
            purpose="give"
            suggestedName="VIP"
            label="Add a VIP role"
          />
        </Field>
        <Toggle
          checked={draft.features.vip_auto_carry_over}
          onChange={(checked) => ctx.update((s) => void (s.features.vip_auto_carry_over = checked))}
          label="Accept Content Creator and PDX Staff VIPs from other servers automatically"
          description="Off: every VIP from another server waits for your staff to approve it. Highly Trusted VIPs always wait for approval."
        />
      </Card>
    </div>
  );
}

// ————— 6. Channels —————

export function ChannelsStep({ ctx }: { ctx: StepContext }) {
  const { draft } = ctx;
  const fix = useFixAction(ctx.serverId, ctx.refreshSnapshot);
  return (
    <div className="space-y-4">
      <Card icon="📺" title="GameMaster's channels">
        <div className="grid gap-4 md:grid-cols-2">
          {CHANNEL_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} required={field.required} issues={issuesAt(ctx.issues, `channels.${field.key}`)}>
              <ChannelPicker
                ctx={ctx}
                value={draft.channels[field.key]}
                onChange={(id) => ctx.update((s) => void (s.channels[field.key] = id))}
                kind={field.kind}
                suggestedName={field.key === "host_log" ? "audit-log" : field.key.replace(/_/g, "-")}
                label={field.label}
              />
              {field.key === "schedule_panel" && ctx.setupDone && (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={fix.op !== null || !draft.channels.schedule_panel}
                    onClick={() => void fix.run("schedule_panel")}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-amber-300/40 hover:text-white disabled:opacity-50"
                  >
                    {fix.op === "schedule_panel" ? <Spinner className="h-3 w-3 text-amber-300" /> : "📅"} Post / re-post the panel
                  </button>
                  <p className="text-[11px] text-slate-500">Save a new channel first. The old panel is removed and the new one pinned.</p>
                  {fix.message && <Callout tone={fix.message.tone === "ok" ? "ok" : "error"}>{fix.message.text}</Callout>}
                </div>
              )}
            </Field>
          ))}
        </div>
      </Card>
      <Card icon="🛋️" title="Game lobby voice channels">
        <Field
          label="Lobby voice channels"
          required
          hint="Where players wait before and between games. You can pick several."
          issues={issuesAt(ctx.issues, "lobby_voices")}
        >
          <ChannelMultiPicker
            ctx={ctx}
            value={draft.lobby_voices}
            onChange={(ids) => ctx.update((s) => void (s.lobby_voices = ids))}
            kind="voice"
            suggestedName="Game Lobby"
            label="Add a lobby voice channel"
          />
        </Field>
        <Callout tone="warn" title="This must be set up">
          People sitting in these voice channels are <b>never counted as present</b> in a game&apos;s attendance snapshots — they
          aren&apos;t logged as playing. Pick every waiting-room / lobby channel your server uses.
        </Callout>
      </Card>
      <Card
        icon="🔊"
        title="Game voice channels"
        subtitle="When a game starts, GameMaster makes a voice channel for every nation, grouped into categories. Choose where they go."
      >
        {enabledBranches(ctx).map((branch) => (
          <div key={branch} className="grid gap-4 md:grid-cols-2">
            <Field
              label={`${BRANCH_INFO[branch].emoji} ${branch}: put them right after`}
              hint="New game categories go directly below this category."
              issues={issuesAt(ctx.issues, `voice.${branch}.after_category`)}
            >
              <ChannelPicker
                ctx={ctx}
                value={draft.voice[branch].after_category}
                onChange={(id) => ctx.update((s) => void (s.voice[branch].after_category = id))}
                kind="category"
                suggestedName={`${branch} GAME VOICE`}
                label={`${branch} game voice: after category`}
              />
            </Field>
            <Field
              label={`${branch}: and keep them above`}
              hint="Optional: they never go below this category."
              issues={issuesAt(ctx.issues, `voice.${branch}.before_category`)}
            >
              <ChannelPicker
                ctx={ctx}
                value={draft.voice[branch].before_category}
                onChange={(id) => ctx.update((s) => void (s.voice[branch].before_category = id))}
                kind="category"
                label={`${branch} game voice: before category`}
              />
            </Field>
          </div>
        ))}
      </Card>
      {hasCasino(ctx.serverId) && (
        <Card icon="🎰" title="Casino" subtitle="Only on this server.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Casino panel" hint="The casino access panel lives here.">
              <ChannelPicker
                ctx={ctx}
                value={draft.addons.casino_panel_channel}
                onChange={(id) => ctx.update((s) => void (s.addons.casino_panel_channel = id))}
                kind="text"
                label="Casino panel"
              />
            </Field>
          </div>
        </Card>
      )}
    </div>
  );
}

// ————— 7. Game modes —————

function LinkList({ title, value, onChange }: { title: string; value: LinkEntry[]; onChange: (links: LinkEntry[]) => void }) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const valid = name.trim() && /^https?:\/\/[^\s()[\]]+$/.test(link.trim());
  return (
    <Field label={title} hint="Used when a game has no preset. Presets and each game's Rules & mods card can change them.">
      <ul className="space-y-1">
        {value.length === 0 && <li className="text-xs text-slate-500">None.</li>}
        {value.map((entry, index) => (
          <li key={`${entry.link}-${index}`} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1 text-xs">
            <a href={entry.link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-sky-300 hover:underline">
              {entry.name}
            </a>
            <button
              type="button"
              aria-label={`Move ${entry.name} up`}
              disabled={index === 0}
              onClick={() => {
                const next = [...value];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
              className="rounded px-1 text-slate-400 hover:text-white disabled:opacity-20"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Remove ${entry.name}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="rounded px-1 text-slate-400 hover:text-rose-300"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {value.length < 20 && (
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <input value={name} onChange={(event) => setName(event.target.value.slice(0, 100))} placeholder="Name" aria-label={`${title}: name`} className={`${inputClass} py-1.5 text-xs sm:w-40`} />
          <input value={link} onChange={(event) => setLink(event.target.value.slice(0, 500))} placeholder="https://…" aria-label={`${title}: link`} className={`${inputClass} py-1.5 text-xs`} />
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              onChange([...value, { name: name.trim(), link: link.trim() }]);
              setName("");
              setLink("");
            }}
            className="rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10 disabled:opacity-30"
          >
            Add
          </button>
        </div>
      )}
    </Field>
  );
}

const modesOf = (branch: Branch) => MODE_CATALOG.filter((mode) => mode.branch === branch);

function ModeFields({
  ctx,
  values,
  issuePath,
  slug,
  title,
  onChange,
}: {
  ctx: StepContext;
  values: Pick<ModeSettings, ModeChannelField | "ping_role">;
  issuePath: string | null;
  slug: string;
  title: string;
  onChange: (mutate: (m: ModeSettings) => void) => void;
}) {
  const issues = (field: string) => (issuePath ? issuesAt(ctx.issues, `${issuePath}.${field}`) : []);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {MODE_CHANNEL_FIELDS.map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint} required={field.required} issues={issues(field.key)}>
          <ChannelPicker
            ctx={ctx}
            value={values[field.key]}
            onChange={(id) => onChange((m) => void (m[field.key] = id))}
            kind="text"
            suggestedName={`${slug}-${field.key.replace(/_channel$/, "").replace(/_/g, "-")}`}
            label={`${title}: ${field.label}`}
          />
        </Field>
      ))}
      <Field
        label="Own ping role (optional)"
        hint="Leave empty to ping the branch's notification ping role (Player roles step)."
        issues={issues("ping_role")}
      >
        <RolePicker
          ctx={ctx}
          value={values.ping_role}
          onChange={(id) => onChange((m) => void (m.ping_role = id))}
          purpose="ping"
          suggestedName={`${title} Ping`}
          label={`${title}: ping role`}
        />
      </Field>
    </div>
  );
}

/** One set of channels and ping role for every mode of a branch, or each mode its own. */
function BranchSharing({ ctx, branch }: { ctx: StepContext; branch: Branch }) {
  const shared = ctx.draft.mode_sharing[branch];
  const modes = modesOf(branch);
  const first = ctx.draft.modes[modes[0].key];
  const firstEnabled = modes.find((mode) => ctx.draft.modes[mode.key]?.enabled);
  const setAll = (mutate: (m: ModeSettings) => void) =>
    ctx.update((s) => {
      for (const mode of modesOf(branch)) mutate(s.modes[mode.key]);
    });
  const choose = (next: boolean) =>
    ctx.update((s) => {
      s.mode_sharing[branch] = next;
      if (!next) return;
      const keys = modesOf(branch).map((mode) => mode.key);
      const source =
        keys.find((key) => s.modes[key].enabled && s.modes[key].announcement_channel) ?? keys.find((key) => s.modes[key].enabled) ?? keys[0];
      const from = s.modes[source];
      for (const key of keys) {
        for (const field of MODE_CHANNEL_FIELDS) s.modes[key][field.key] = from[field.key];
        s.modes[key].ping_role = from.ping_role;
      }
    });
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={shared === value}
      onClick={() => choose(value)}
      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
        shared === value ? "border-amber-300/60 bg-amber-400/15 text-amber-100" : "border-white/10 text-slate-300 hover:border-white/25"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
      <div className="flex flex-col gap-1.5 sm:flex-row">
        {option(true, `One set for all ${branch} modes`)}
        {option(false, "Set up each mode separately")}
      </div>
      {shared && (
        <>
          <p className="text-[11px] text-slate-500">
            Every {branch} mode uses these channels and this ping role. Each mode&apos;s mods and rules are still set below.
          </p>
          <ModeFields
            ctx={ctx}
            values={first}
            issuePath={firstEnabled ? `modes.${firstEnabled.key}` : null}
            slug={branch.toLowerCase()}
            title={`${branch} modes`}
            onChange={setAll}
          />
        </>
      )}
    </div>
  );
}

function ModeCard({ ctx, modeKey }: { ctx: StepContext; modeKey: string }) {
  const mode = MODE_CATALOG.find((entry) => entry.key === modeKey)!;
  const settings = ctx.draft.modes[modeKey];
  const shared = ctx.draft.mode_sharing[mode.branch];
  const issues = issuesAt(ctx.issues, `modes.${modeKey}`);
  const errors = issues.filter((issue) => issue.level === "error").length;
  const [open, setOpen] = useState(settings.enabled && errors > 0 && !shared);
  const siblings = MODE_CATALOG.filter((entry) => entry.branch === mode.branch && entry.key !== modeKey && ctx.draft.modes[entry.key]?.enabled);
  const set = (mutate: (m: ModeSettings) => void) => ctx.update((s) => mutate(s.modes[modeKey]));
  return (
    <div className={`rounded-2xl border ${settings.enabled ? "border-white/10 bg-slate-950/40" : "border-white/5 bg-slate-950/20"}`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Toggle checked={settings.enabled} onChange={(checked) => set((m) => void (m.enabled = checked))} label={mode.label} description={`Mod: ${mode.mod}`} />
        <span className="ml-auto flex items-center gap-2">
          {settings.enabled &&
            (errors > 0 ? (
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-200">{errors} to fix</span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">Ready</span>
            ))}
          {settings.enabled && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300 hover:border-white/25 hover:text-white"
            >
              {open ? "Close" : "Edit"}
            </button>
          )}
        </span>
      </div>
      {settings.enabled && open && (
        <div className="space-y-4 border-t border-white/10 p-3">
          {shared && (
            <p className="text-xs text-slate-400">Uses the shared {mode.branch} channels and ping role above.</p>
          )}
          {!shared && siblings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              Same channels and ping role as:
              {siblings.map((sibling) => (
                <button
                  key={sibling.key}
                  type="button"
                  onClick={() =>
                    ctx.update((s) => {
                      const from = s.modes[sibling.key];
                      for (const field of MODE_CHANNEL_FIELDS) s.modes[modeKey][field.key] = from[field.key];
                      s.modes[modeKey].ping_role = from.ping_role;
                    })
                  }
                  className="rounded-md border border-white/10 px-2 py-0.5 font-bold text-slate-200 hover:border-amber-300/40"
                >
                  {sibling.label}
                </button>
              ))}
            </div>
          )}
          {!shared && (
            <ModeFields
              ctx={ctx}
              values={settings}
              issuePath={`modes.${modeKey}`}
              slug={mode.key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}
              title={mode.label}
              onChange={set}
            />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <LinkList title="Standard mods" value={settings.mod_links} onChange={(links) => set((m) => void (m.mod_links = links))} />
            <LinkList title="Standard rules" value={settings.rule_links} onChange={(links) => set((m) => void (m.rule_links = links))} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ModesStep({ ctx }: { ctx: StepContext }) {
  const branches = enabledBranches(ctx);
  return (
    <div className="space-y-5">
      {issuesAt(ctx.issues, "modes")
        .filter((issue) => issue.path === "modes")
        .map((issue) => (
          <Callout key={issue.message} tone="error">
            {issue.message}
          </Callout>
        ))}
      {branches.map((branch) => (
        <div key={branch} className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
            {BRANCH_INFO[branch].emoji} {BRANCH_INFO[branch].long}
          </p>
          <BranchSharing ctx={ctx} branch={branch} />
          {modesOf(branch).map((mode) => (
            <ModeCard key={mode.key} ctx={ctx} modeKey={mode.key} />
          ))}
        </div>
      ))}
      <p className="text-[11px] text-slate-500">
        Modes that are off don&apos;t show up on the calendar and can&apos;t be scheduled. Games already scheduled still go ahead.
      </p>
    </div>
  );
}

// ————— 9. Tickets —————

const TICKET_ACCESS = [
  ["✅ Verification (RP and Historical)", "Ticket Support, Host Management"],
  ["🎤 Host application · ⚠️ Report host", "Host Management only (a reported host never sees the report)"],
  ["⚖️ Appeal · 😠 Player report · ⭐ Commend · ❓ Question", "Every host and Host Management; the game's host is pinged"],
  ["🐞 Bug report / suggestion", "Developers, Host Management"],
] as const;

export function TicketsStep({ ctx }: { ctx: StepContext }) {
  const { draft } = ctx;
  return (
    <div className="space-y-4">
      <Card
        icon="🎫"
        title="How tickets work"
        subtitle="Players press a button on the ticket panel; GameMaster makes a private channel for them and the staff who handle that kind of ticket."
      >
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 text-xs">
          {TICKET_ACCESS.map(([kind, who]) => (
            <li key={kind} className="flex flex-wrap gap-x-3 gap-y-0.5 bg-white/[0.02] px-3 py-2">
              <span className="min-w-[220px] flex-1 font-bold text-slate-100">{kind}</span>
              <span className="text-slate-400">{who}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500">
          Server admins can open and close every ticket. Resolving a verification ticket gives the player that branch&apos;s Verified role;
          resolving a host application gives the Assistant host role of the branch they applied for. Staff post the panel with{" "}
          <code className="rounded bg-slate-900/80 px-1">/spawn</code> in the ticket panel channel.
        </p>
      </Card>
      <Card icon="🧑‍💼" title="Ticket staff">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Ticket Support roles"
            hint="Handle HOI4 verification tickets only (not IronLegion), and can close them — resolving one gives the Verified role."
            issues={issuesAt(ctx.issues, "access.ticket_support_roles")}
          >
            <RoleMultiPicker
              ctx={ctx}
              value={draft.access.ticket_support_roles}
              onChange={(ids) => ctx.update((s) => void (s.access.ticket_support_roles = ids))}
              purpose="check"
              suggestedName="Ticket Support"
              label="Add a Ticket Support role"
            />
          </Field>
          <Field
            label="Developer roles"
            hint="See and close bug report and suggestion tickets (for example your bot or mod developers)."
            issues={issuesAt(ctx.issues, "access.developer_roles")}
          >
            <RoleMultiPicker
              ctx={ctx}
              value={draft.access.developer_roles}
              onChange={(ids) => ctx.update((s) => void (s.access.developer_roles = ids))}
              purpose="check"
              suggestedName="Developer"
              label="Add a Developer role"
            />
          </Field>
        </div>
      </Card>
      <Card icon="📂" title="Ticket channels">
        <div className="grid gap-4 md:grid-cols-2">
          {TICKET_CHANNEL_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} required={field.required} issues={issuesAt(ctx.issues, `channels.${field.key}`)}>
              <ChannelPicker
                ctx={ctx}
                value={draft.channels[field.key]}
                onChange={(id) => ctx.update((s) => void (s.channels[field.key] = id))}
                kind={field.kind}
                suggestedName={field.key === "ticket_category" ? "TICKETS" : field.key.replace(/_/g, "-")}
                label={field.label}
              />
            </Field>
          ))}
        </div>
      </Card>
      <Card icon="⏰" title="Inactive tickets">
        <Toggle
          checked={draft.features.ticket_inactivity_close}
          onChange={(checked) => ctx.update((s) => void (s.features.ticket_inactivity_close = checked))}
          label="Remind and close inactive tickets"
          description="After 24 hours with no messages, GameMaster pings the game's host (or the ticket's staff) to resolve or close it. After 48 hours with still no messages, it closes the ticket as unresolved and saves the transcript."
        />
      </Card>
    </div>
  );
}

// ————— 8. Features —————

export function FeaturesStep({ ctx }: { ctx: StepContext }) {
  const { draft } = ctx;
  return (
    <div className="space-y-4">
      <Card icon="🎖️" title="Hearts of Valor & Merit">
        <Toggle
          checked={draft.features.valor_merit}
          onChange={(checked) => ctx.update((s) => void (s.features.valor_merit = checked))}
          label="Give out Hearts of Valor"
          description="Players earn Merit (crash reports, rating games, staff awards). With enough Merit and attended games and no warnings, they get Hearts of Valor and pick a Trusted role. Off: nobody gets the title, but Merit is still counted."
        />
        {draft.features.valor_merit && (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Hearts of Valor role" required issues={issuesAt(ctx.issues, "roles.valor")}>
              <RolePicker
                ctx={ctx}
                value={draft.roles.valor}
                onChange={(id) => ctx.update((s) => void (s.roles.valor = id))}
                purpose="give"
                suggestedName="Hearts of Valor"
                label="Hearts of Valor role"
              />
            </Field>
            <RuleNumber ctx={ctx} rule="valor_merit" />
            <RuleNumber ctx={ctx} rule="valor_games" />
          </div>
        )}
      </Card>
      <Card icon="🛡️" title="Automation">
        <Toggle
          checked={draft.features.daily_role_check}
          onChange={(checked) => ctx.update((s) => void (s.features.daily_role_check = checked))}
          label="Daily role check (04:00 UTC)"
          description="Fixes Trusted, Hearts of Valor and Dishonored roles that drifted from the records. Host Management can always run it by hand on the Database page."
        />
        <div className="max-w-xs">
          <RuleNumber ctx={ctx} rule="hosting_success_avg" />
        </div>
      </Card>
      <Card icon="🚨" title="Other servers">
        <Toggle
          checked={draft.features.cross_server_ban_alerts}
          onChange={(checked) => ctx.update((s) => void (s.features.cross_server_ban_alerts = checked))}
          label="Alerts for players banned on other servers"
          description="When someone joins who is game-banned on another server that uses GameMaster, staff get a notice in the staff notices channel (or the audit log). Records stay separate: nothing changes here automatically."
        />
      </Card>
      <Card icon="🛡️" title="IronLegion Steam authentication">
        <Toggle
          checked={draft.features.ironlegion}
          onChange={(checked) => ctx.update((s) => void (s.features.ironlegion = checked))}
          label="Require IronLegion for every game"
          description="Players need the authenticated role IronLegion gives on this server before they reserve (hosts, staff and VIPs never need it). Add IronLegion to the server and set it up there first; until then nobody is locked out. A preset, the calendar or the Games page can switch it on or off for one game."
        />
      </Card>
    </div>
  );
}
