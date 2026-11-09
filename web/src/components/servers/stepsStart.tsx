"use client";

import { Bot, Check, KeyRound, Leaf, ShieldCheck, Tag, TrendingUp, X } from "lucide-react";
import {
  BRANCHES,
  BRANCH_INFO,
  MODE_CATALOG,
  RANKS,
  RANK_INFO,
  REQUIRED_PERMISSIONS,
  RULE_FIELDS,
  hasPermission,
  type OptionalRank,
  type RuleKey,
} from "@/lib/serverSettingsTypes";
import { Toggle } from "@/components/schedule/ui";
import { RoleMultiPicker, RolePicker } from "./pickers";
import { BRANCH_ICON, Callout, Card, Field, NumberField, Rich, inputClass, issuesAt, roleById, type StepContext } from "./shared";

function ago(epochSec: number): string {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - epochSec) / 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

export function RuleNumber({ ctx, rule }: { ctx: StepContext; rule: RuleKey }) {
  const field = RULE_FIELDS.find((entry) => entry.key === rule)!;
  return (
    <NumberField
      label={field.label}
      hint={field.hint}
      value={ctx.draft.rules[rule]}
      min={field.min}
      max={field.max}
      step={field.step}
      onChange={(value) => ctx.update((s) => void (s.rules[rule] = value))}
    />
  );
}

// ————— 1. Bot check —————

export function WelcomeStep({ ctx, added, reinviteUrl }: { ctx: StepContext; added: boolean; reinviteUrl: string }) {
  const snap = ctx.snapshot;
  if (!snap) {
    return (
      <Callout tone="warn" title="Waiting for GameMaster">
        GameMaster hasn&apos;t reported this server&apos;s roles and channels yet. That happens within a minute of it joining. Reload
        this page shortly. If it stays like this, check that the bot is online.
      </Callout>
    );
  }
  const missing = REQUIRED_PERMISSIONS.filter((perm) => !hasPermission(snap.bot.permissions, perm.bit));
  const botRole = roleById(snap, snap.bot.top_role_id);
  const hierarchy = ctx.issues.filter((issue) => issue.message.includes("above GameMaster"));
  return (
    <div className="space-y-4">
      {added && (
        <Callout tone="ok" title={`GameMaster joined ${snap.guild.name}`}>
          Next: tell it which roles and channels to use. It takes about five minutes, and your progress is saved at every step.
        </Callout>
      )}
      {!ctx.isHome && (
        <Callout tone="info" title="Rolling out in stages">
          You can finish the whole setup now. GameMaster stays quiet in your server (no commands, no posts) until multi-server
          hosting is switched on. It then uses exactly what you set here.
        </Callout>
      )}
      <Card icon={Bot} title="GameMaster in your server" subtitle={`Last reported ${ago(snap.updated_at)} · ${snap.guild.member_count} members`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="gm-cut [--cut:9px] border border-ink-800 bg-ink-950 p-3">
            <p className="text-xs font-semibold text-ink-400">Its highest role</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-bold text-ink-100">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: botRole?.color ?? "#99aab5" }} />
              {botRole?.name ?? "Unknown"}
              <span className="text-xs font-normal text-ink-400">· position {snap.bot.top_role_position}</span>
            </p>
            <p className="mt-1 text-[11px] text-ink-500">GameMaster can only give out roles that are below this one.</p>
          </div>
          <div className="gm-cut [--cut:9px] border border-ink-800 bg-ink-950 p-3">
            <p className="text-xs font-semibold text-ink-400">Permissions</p>
            <p className={`mt-1 text-sm font-bold ${missing.length ? "text-rose-300" : "text-emerald-300"}`}>
              {missing.length ? `${missing.length} missing` : `All ${REQUIRED_PERMISSIONS.length} granted`}
            </p>
            {missing.length > 0 && (
              <a
                href={reinviteUrl}
                className="mt-2 inline-flex gm-cut [--cut:7px] bg-[#5865F2] px-3 py-1.5 text-xs font-bold text-ink-100 hover:bg-[#4752c4]"
              >
                Fix permissions on Discord
              </a>
            )}
          </div>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {REQUIRED_PERMISSIONS.map((perm) => {
            const ok = hasPermission(snap.bot.permissions, perm.bit);
            return (
              <li key={perm.bit} className="flex items-start gap-2 gm-cut [--cut:7px] px-2 py-1 text-xs">
                {ok ? (
                  <Check aria-label="Has it" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" strokeWidth={2} />
                ) : (
                  <X aria-label="Missing" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" strokeWidth={2} />
                )}
                <span>
                  <span className={`font-bold ${ok ? "text-ink-200" : "text-rose-200"}`}>{perm.name}</span>
                  <span className="block text-[11px] text-ink-500">{perm.why}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      {hierarchy.length > 0 && (
        <Callout tone="error" title="Some roles are above GameMaster">
          <ul className="mt-1 space-y-0.5">
            {hierarchy.map((issue) => (
              <li key={issue.path}>
                • <Rich text={issue.message} />
              </li>
            ))}
          </ul>
        </Callout>
      )}
      <p className="text-xs text-ink-500">
        GameMaster asks only for the permissions it uses, never Administrator. If a check above fails, fix it in Discord. This page
        updates within a minute.
      </p>
    </div>
  );
}

// ————— 2. Basics —————

export function BasicsStep({ ctx }: { ctx: StepContext }) {
  const { draft } = ctx;
  return (
    <div className="space-y-4">
      <Card icon={Tag} title="Your community">
        <Field label="Community name" hint="Shown on the website and in GameMaster's messages." issues={issuesAt(ctx.issues, "general.community_name")}>
          <input
            value={draft.general.community_name}
            maxLength={60}
            onChange={(event) => ctx.update((s) => void (s.general.community_name = event.target.value))}
            aria-label="Community name"
            className={inputClass}
          />
        </Field>
      </Card>
      <Card icon={Leaf} title="Host branches" subtitle="Each branch has its own hosts, ranks, Verified / Trusted / ban roles and game modes.">
        <div className="grid gap-3 sm:grid-cols-2">
          {BRANCHES.map((branch) => {
            const on = draft.branches[branch].enabled;
            const other = branch === "RP" ? "HIST" : "RP";
            const modes = MODE_CATALOG.filter((mode) => mode.branch === branch);
            return (
              <div key={branch} className={`gm-cut [--cut:9px] border p-3 ${on ? "border-brand-300/40 bg-brand-400/[0.06]" : "border-ink-800 bg-ink-950"}`}>
                <Toggle
                  checked={on}
                  disabled={on && !draft.branches[other].enabled}
                  onChange={(checked) => ctx.update((s) => void (s.branches[branch].enabled = checked))}
                  label={BRANCH_INFO[branch].long}
                  description={`${BRANCH_INFO[branch].games}: ${modes.map((mode) => mode.label.replace("Historical — ", "")).join(", ")}.`}
                />
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-500">
          At least one branch stays on. Turning a branch off hides its roles, ranks and game modes, and its games can&apos;t be scheduled.
          What you set for it is kept, so turning it back on restores everything.
        </p>
      </Card>
    </div>
  );
}

// ————— 3. Staff & access —————

export function StaffStep({ ctx }: { ctx: StepContext }) {
  const { draft } = ctx;
  const staffCount = ctx.snapshot?.staff_user_ids.length ?? 0;
  const canDelegate = ctx.access !== "staff";
  return (
    <div className="space-y-4">
      <Card
        icon={ShieldCheck}
        title="Host Management"
        subtitle="The rank above Senior hosts that oversees everything. Server admins always count as Host Management."
      >
        <Field
          label="Host Management roles"
          hint="Everything a Senior host can do, and more: lock calendar days, manage every host's games, give VIP, verification and host ranks, run the role check, rate hosts in both branches, and handle host applications and host reports. They also manage the voice channels GameMaster makes for each game (rename, move people, fix permissions). This can be a moderation role, a team lead role, or a dedicated Host Management role."
          issues={issuesAt(ctx.issues, "access.senior_staff_roles")}
        >
          <RoleMultiPicker
            ctx={ctx}
            value={draft.access.senior_staff_roles}
            onChange={(ids) => ctx.update((s) => void (s.access.senior_staff_roles = ids))}
            purpose="check"
            suggestedName="Host Management"
            label="Add a Host Management role"
          />
        </Field>
      </Card>
      <Card icon={KeyRound} title="Who can change these settings">
        <ul className="space-y-1 text-xs text-ink-300">
          <li className="flex items-center gap-1.5">
            <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2} /> The server owner
          </li>
          <li className="flex items-center gap-1.5">
            <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2} /> Anyone with Discord&apos;s Administrator permission
          </li>
          <li className={`flex items-center gap-1.5 ${draft.access.staff_can_edit_settings ? "" : "text-ink-500"}`}>
            {draft.access.staff_can_edit_settings ? (
              <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2} />
            ) : (
              <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
            )}{" "}
            Host Management ({staffCount} member{staffCount === 1 ? "" : "s"} right now)
          </li>
        </ul>
        <Toggle
          checked={draft.access.staff_can_edit_settings}
          disabled={!canDelegate}
          onChange={(checked) => ctx.update((s) => void (s.access.staff_can_edit_settings = checked))}
          label="Let Host Management change these settings"
          description={
            canDelegate
              ? "Every change is logged with who made it (History) and posted to the audit log."
              : "Only the owner or an admin can change this."
          }
        />
      </Card>
    </div>
  );
}

// ————— 4. Host ranks —————

export function BranchesStep({ ctx }: { ctx: StepContext }) {
  const { draft } = ctx;
  return (
    <div className="space-y-4">
      {BRANCHES.filter((branch) => draft.branches[branch].enabled).map((branch) => (
        <Card
          key={branch}
          icon={BRANCH_ICON[branch]}
          title={`${BRANCH_INFO[branch].long} hosts`}
          subtitle={`They host ${BRANCH_INFO[branch].games}. Each rank is one Discord role.`}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {RANKS.map((rank) => {
              const ranksOn = draft.branches[branch].ranks_on;
              const on = ranksOn[rank as OptionalRank];
              // Full or Senior stays on: the last of the two can't be switched off.
              const lastTop = (rank === "Full" && !ranksOn.Senior) || (rank === "Senior" && !ranksOn.Full);
              return (
                <Field
                  key={rank}
                  label={RANK_INFO[rank].label}
                  hint={on ? RANK_INFO[rank].hint : RANK_INFO[rank].off}
                  required={on}
                  issues={on ? issuesAt(ctx.issues, `branches.${branch}.ranks.${rank}`) : []}
                >
                  <Toggle
                    checked={on}
                    disabled={on && lastTop}
                    onChange={(checked) => ctx.update((s) => void (s.branches[branch].ranks_on[rank as OptionalRank] = checked))}
                    label={`Use ${RANK_INFO[rank].label.toLowerCase()}s`}
                    description={
                      on && lastTop
                        ? `Keep Full or Senior hosts: switch on ${rank === "Full" ? "Senior" : "Full"} hosts first to switch this off.`
                        : rank === "Full" && on && !ranksOn.Senior
                          ? `Senior hosts are off, so Full ${branch} hosts give Acclamations and Violations, like Senior hosts.`
                          : undefined
                    }
                  />
                  {on && (
                    <RolePicker
                      ctx={ctx}
                      value={draft.branches[branch].ranks[rank]}
                      onChange={(id) => ctx.update((s) => void (s.branches[branch].ranks[rank] = id))}
                      purpose="give"
                      suggestedName={RANK_INFO[rank].suggested(branch)}
                      label={`${branch} ${RANK_INFO[rank].label} role`}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </Card>
      ))}
      <Card icon={TrendingUp} title="Acclamations and Violations" subtitle="The same numbers apply in each branch, counted separately per branch.">
        <div className="grid gap-4 sm:grid-cols-3">
          {BRANCHES.some((branch) => draft.branches[branch].enabled && draft.branches[branch].ranks_on.Assistant && draft.branches[branch].ranks_on.Full) && (
            <RuleNumber ctx={ctx} rule="host_full_at" />
          )}
          {BRANCHES.some((branch) => draft.branches[branch].enabled && draft.branches[branch].ranks_on.Senior) && (
            <RuleNumber ctx={ctx} rule="host_senior_at" />
          )}
          <RuleNumber ctx={ctx} rule="host_strip_at" />
        </div>
        <p className="text-[11px] text-ink-500">
          They work exactly like commends and warnings. Senior hosts of a branch (or its Full hosts, when Senior hosts are off) and Host Management give them on the Database page;
          Acclamations promote a host, Violations strip their rank. A Violation never removes an Acclamation (or the other way round) —
          only Host Management can take either back, and a host whose rank was stripped by Violations gets it back when they drop
          below the number again.
        </p>
      </Card>
    </div>
  );
}
