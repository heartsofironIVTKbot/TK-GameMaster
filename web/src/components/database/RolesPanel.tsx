"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Spinner } from "@/components/schedule/ui";
import {
  HOST_TIERS,
  LINK_RE,
  VIP_CATEGORIES,
  VIP_LINK_MAX_LEN,
  VIP_MAX_LINKS,
  VIP_NOTE_MAX,
  VIP_REASON_MAX,
  VIP_REASON_MIN,
  vipCategoryMeta,
  vipPlatform,
  type HostTier,
  type MemberRoles,
  type MemberRolesPayload,
  type Verification,
  type VipCategory,
  type VipGrant,
} from "@/lib/memberRolesTypes";
import { rankLabel } from "@/lib/hostBranches";
import { MIN_REASON_LENGTH } from "@/lib/moderationTypes";
import { Field, PreviewBox, ResultBox, SubmitButton } from "./ActionPanel";
import { useModerationRequest } from "./useModerationRequest";

/**
 * Verification and VIP on a member's Database record (formerly /verify and
 * /make_vip; the bot's apply_verification / apply_vip_* do the Discord side).
 * Hosts can see who verified someone and their VIP; Host Management change them.
 */

const date = (seconds: number | null) =>
  seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

const QUICK_UNVERIFY = ["Alt account", "Verified by mistake", "Failed the requirements"];
const QUICK_VIP_REMOVE = ["No longer creating content", "Left the Paradox team", "Trust broken", "Given by mistake"];

export default function RolesPanel({
  playerId,
  playerName,
  isSelf,
  onApplied,
}: {
  playerId: string;
  playerName: string;
  isSelf: boolean;
  onApplied: () => void;
}) {
  const [data, setData] = useState<{ nonce: number; roles: MemberRoles | null; error: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [applied, setApplied] = useState(0);
  const { state, submit, reset } = useModerationRequest(() => {
    setNonce((value) => value + 1);
    setApplied((value) => value + 1);
    onApplied();
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/database/players/${playerId}/roles`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { roles?: MemberRoles; error?: string } | null;
        if (cancelled) return;
        setData((current) =>
          response.ok && body?.roles
            ? { nonce, roles: body.roles, error: null }
            : { nonce, roles: current?.roles ?? null, error: body?.error ?? "Couldn't load verification and VIP." },
        );
      })
      .catch(() => {
        if (!cancelled) setData((current) => ({ nonce, roles: current?.roles ?? null, error: "Network error — try again." }));
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, nonce]);

  const send = useCallback(
    (payload: Omit<MemberRolesPayload, "user_id">) => void submit({ action: "member_roles", payload: { user_id: playerId, ...payload } }),
    [submit, playerId],
  );
  const roles = data?.roles ?? null;
  const busy = state.phase === "sending" || state.phase === "waiting";

  return (
    <section className="rounded-2xl border border-violet-400/25 bg-slate-950/70 p-4 shadow-xl shadow-black/30">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-300">🪪 Verification, host branches & VIP</h2>
        {data && data.nonce !== nonce && <Spinner className="h-3 w-3 text-violet-300" />}
      </div>
      {data?.error && <p className="mb-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{data.error}</p>}
      {!roles ? (
        !data?.error && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Spinner className="h-3.5 w-3.5 text-violet-300" /> Loading…
          </p>
        )
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {roles.verification.map((entry) => (
              <VerificationRow
                key={`${entry.track}-${applied}`}
                entry={entry}
                canManage={roles.can_manage}
                busy={busy}
                onVerify={() => send({ op: "verify", track: entry.track })}
                onRemove={(reason) => send({ op: "unverify", track: entry.track, reason })}
              />
            ))}
          </div>
          <HostTierSection
            key={`host-${applied}`}
            roles={roles}
            playerName={playerName}
            isSelf={isSelf}
            busy={busy}
            send={send}
          />
          <VipSection
            key={`vip-${applied}`}
            roles={roles}
            playerName={playerName}
            isSelf={isSelf}
            busy={busy}
            send={send}
          />
          {!roles.can_manage && (
            <p className="text-[11px] text-slate-500">Only Host Management (or admins) can change these.</p>
          )}
        </div>
      )}
      <ResultBox
        state={state}
        playerName={playerName}
        undo={null}
        onUndo={() => {}}
        onDismiss={reset}
        appliedNote="Done — it's in the audit log."
      />
    </section>
  );
}

function VerificationRow({
  entry,
  canManage,
  busy,
  onVerify,
  onRemove,
}: {
  entry: Verification;
  canManage: boolean;
  busy: boolean;
  onVerify: () => void;
  onRemove: (reason: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className={`rounded-xl border px-3 py-2 ${entry.has ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.02]"}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{entry.has ? "✅" : "▫️"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{entry.label}</p>
          <p className="truncate text-[11px] text-slate-400">
            {!entry.role_ready
              ? "The bot creates this role on its next start."
              : entry.has
                ? entry.granted_by
                  ? `By ${entry.granted_by} · ${date(entry.granted_at)}`
                  : "Given before records were kept"
                : entry.removed_by
                  ? `Removed by ${entry.removed_by} · ${date(entry.removed_at)}`
                  : `Not verified for ${entry.track === "Roleplay" ? "Roleplay" : "Historical"} games`}
          </p>
          {!entry.has && entry.removed_reason && <p className="truncate text-[11px] italic text-slate-500">“{entry.removed_reason}”</p>}
        </div>
        {canManage && entry.role_ready && !removing && (
          entry.has ? (
            <button
              type="button"
              onClick={() => setRemoving(true)}
              disabled={busy}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-40"
            >
              Remove…
            </button>
          ) : (
            <button
              type="button"
              onClick={onVerify}
              disabled={busy}
              className="rounded-lg bg-emerald-500/80 px-3 py-1 text-[11px] font-black text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              Verify
            </button>
          )
        )}
      </div>
      {removing && (
        <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          <ReasonBox value={reason} onChange={setReason} quick={QUICK_UNVERIFY} placeholder="Why are you taking it away?" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setRemoving(false)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:text-white">
              Cancel
            </button>
            <div className="flex-1">
              <SubmitButton
                label={`Remove ${entry.label}`}
                busy={busy}
                danger
                disabled={reason.trim().length < MIN_REASON_LENGTH}
                onConfirm={() => onRemove(reason.trim())}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const QUICK_HOST_REMOVE = ["Stepped down", "Inactive", "Three Violations"];

/** Host ranks per branch (formerly /make_host). Stays on this server. */
function HostTierSection({
  roles,
  playerName,
  isSelf,
  busy,
  send,
}: {
  roles: MemberRoles;
  playerName: string;
  isSelf: boolean;
  busy: boolean;
  send: (payload: Omit<MemberRolesPayload, "user_id">) => void;
}) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">🎖️ Host branches</p>
      <p className="text-[11px] text-slate-500">
        RP hosts host Roleplay games, HIST hosts Historical games. Each branch has its own rank and its own Acclamations /
        Violations.
      </p>
      {roles.host.branches.map((entry) => (
        <HostBranchRow
          key={entry.branch}
          entry={entry}
          canManage={roles.can_manage}
          playerName={playerName}
          isSelf={isSelf}
          busy={busy}
          send={send}
        />
      ))}
      {roles.can_manage && isSelf && <p className="text-[11px] text-slate-500">You can&apos;t change your own host role.</p>}
    </div>
  );
}

function HostBranchRow({
  entry,
  canManage,
  playerName,
  isSelf,
  busy,
  send,
}: {
  entry: MemberRoles["host"]["branches"][number];
  canManage: boolean;
  playerName: string;
  isSelf: boolean;
  busy: boolean;
  send: (payload: Omit<MemberRolesPayload, "user_id">) => void;
}) {
  const [picked, setPicked] = useState<HostTier | null>(null);
  const [note, setNote] = useState("");
  const { branch, tier } = entry;
  const label = (value: HostTier) => rankLabel(branch, value);
  const removing = picked === "None";
  const rank = (value: HostTier) => HOST_TIERS.findIndex((option) => option.value === value);
  const demotion = picked !== null && rank(picked) < rank(tier);
  const games = branch === "RP" ? "Roleplay" : "Historical";
  const lines = picked
    ? [
        `${playerName}: ${label(tier)} → ${label(picked)}`,
        removing
          ? `Takes away their ${branch} rank — they can't host ${games} games any more`
          : `Gives the ${label(picked)} role${tier !== "None" ? ` and removes ${label(tier)}` : ` — they can host ${games} games`}`,
        `Only the ${branch} branch changes; their other branch stays as it is`,
        "Only on this server — host roles don't carry over",
      ]
    : [];

  return (
    <div className={`rounded-xl border px-3 py-2 ${tier === "None" ? "border-white/10 bg-white/[0.02]" : "border-sky-400/30 bg-sky-500/[0.06]"}`}>
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-center text-[10px] font-black text-slate-200">{branch}</span>
        <span className={`text-sm font-bold ${tier === "None" ? "text-slate-400" : "text-white"}`}>
          {tier === "None" ? "Not in this branch" : `${tier} ${branch} Host`}
        </span>
        <span className="ml-auto min-w-0 truncate text-[10px] text-slate-500">
          {entry.changed_by ? `${entry.changed_by} · ${date(entry.changed_at)}` : tier !== "None" ? "set before records" : ""}
        </span>
      </div>
      {entry.note && <p className="mt-0.5 text-[11px] italic text-slate-500">“{entry.note}”</p>}
      {!entry.roles_ready && <p className="mt-1 text-[11px] text-amber-300">The bot creates the {branch} host roles on its next start.</p>}

      {canManage && !isSelf && entry.roles_ready && (
        <div className="mt-2 flex gap-1" role="radiogroup" aria-label={`${branch} host rank`}>
          {HOST_TIERS.filter((option) => entry.tiers.includes(option.value) || option.value === tier).map((option) => {
            const active = (picked ?? tier) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy}
                onClick={() => setPicked(option.value === tier ? null : option.value)}
                className={`flex-1 rounded-lg border px-1.5 py-1 text-[11px] font-bold transition disabled:opacity-40 ${
                  active
                    ? option.value === "None"
                      ? "border-rose-300/60 bg-rose-500/15 text-rose-100"
                      : "border-sky-300 bg-sky-400/15 text-sky-100"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
      {picked && (
        <div className="mt-2 space-y-2">
          {removing ? (
            <ReasonBox value={note} onChange={setNote} quick={QUICK_HOST_REMOVE} placeholder={`Why is the ${branch} rank being taken away?`} />
          ) : (
            <input
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 300))}
              placeholder="Note for the log (optional)"
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-300/50 focus:outline-none"
            />
          )}
          <PreviewBox preview={{ lines, error: null, danger: removing || demotion }} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicked(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:text-white">
              Cancel
            </button>
            <div className="flex-1">
              <SubmitButton
                label={removing ? `Remove ${branch} rank` : `Make ${label(picked)}`}
                busy={busy}
                danger={removing || demotion}
                disabled={removing && note.trim().length < MIN_REASON_LENGTH}
                onConfirm={() => send({ op: "host_tier", branch, tier: picked, ...(note.trim() ? { reason: note.trim() } : {}) })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VipSection({
  roles,
  playerName,
  isSelf,
  busy,
  send,
}: {
  roles: MemberRoles;
  playerName: string;
  isSelf: boolean;
  busy: boolean;
  send: (payload: Omit<MemberRolesPayload, "user_id">) => void;
}) {
  const { vip, can_manage: canManage } = roles;
  const [giving, setGiving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const isVip = Boolean(vip.current) || vip.has_role;

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">🌟 VIP</p>
      {vip.current ? (
        <GrantCard grant={vip.current} />
      ) : vip.has_role ? (
        <p className="rounded-xl border border-amber-300/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-50">
          VIP — given before VIP records were kept (no category). Give it again below to record a category.
        </p>
      ) : (
        <p className="text-xs text-slate-400">Not VIP on this server.</p>
      )}

      {vip.pending && (
        <div className="rounded-xl border border-sky-400/40 bg-sky-500/10 p-3">
          <p className="text-xs font-bold text-sky-100">🔔 Needs approval — Highly Trusted VIP from {vip.pending.from_server}</p>
          <GrantDetails grant={vip.pending} />
          {canManage ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SubmitButton label="Approve VIP" busy={busy} danger={false} disabled={false} onConfirm={() => send({ op: "vip_approve" })} />
              <SubmitButton label="Decline" busy={busy} danger disabled={false} onConfirm={() => send({ op: "vip_decline" })} />
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-sky-200/70">Host Management can approve or decline it here or in the management channel.</p>
          )}
        </div>
      )}

      {vip.elsewhere.length > 0 && (
        <p className="text-[11px] text-slate-400">
          Also VIP on:{" "}
          {vip.elsewhere.map((entry, index) => (
            <span key={`${entry.server}-${index}`} className="text-slate-200">
              {index > 0 && ", "}
              {entry.server} ({vipCategoryMeta(entry.category)?.label})
            </span>
          ))}
        </p>
      )}

      {canManage && !isSelf && (
        <div className="flex flex-wrap gap-2 pt-1">
          {!giving && !removing && (
            <button
              type="button"
              onClick={() => setGiving(true)}
              disabled={busy}
              className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-100 hover:bg-amber-400/20 disabled:opacity-40"
            >
              {isVip ? "Change VIP category…" : "🌟 Make VIP…"}
            </button>
          )}
          {isVip && !giving && !removing && (
            <button
              type="button"
              onClick={() => setRemoving(true)}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-40"
            >
              Remove VIP…
            </button>
          )}
        </div>
      )}
      {canManage && isSelf && <p className="text-[11px] text-slate-500">You can&apos;t change your own VIP.</p>}

      {giving && <GiveVipForm playerName={playerName} replacing={vip.current} busy={busy} onCancel={() => setGiving(false)} send={send} />}

      {removing && (
        <div className="space-y-2 rounded-xl border border-rose-400/25 bg-rose-500/[0.05] p-3">
          <ReasonBox value={reason} onChange={setReason} quick={QUICK_VIP_REMOVE} placeholder="Why is VIP being taken away?" />
          <p className="text-[11px] text-slate-400">Only the VIP role goes — their Verified and Trusted roles stay.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRemoving(false)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:text-white">
              Cancel
            </button>
            <div className="flex-1">
              <SubmitButton
                label="Remove VIP"
                busy={busy}
                danger
                disabled={reason.trim().length < MIN_REASON_LENGTH}
                onConfirm={() => send({ op: "vip_remove", reason: reason.trim() })}
              />
            </div>
          </div>
        </div>
      )}

      {vip.history.length > 0 && (
        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer select-none font-semibold text-slate-400 hover:text-slate-200">
            Earlier VIP ({vip.history.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {vip.history.map((grant) => (
              <li key={grant.grant_id} className="rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1">
                {vipCategoryMeta(grant.category)?.icon} {vipCategoryMeta(grant.category)?.label}
                {grant.from_server ? ` (from ${grant.from_server})` : ""} — {grant.status === "declined" ? "declined" : "removed"}
                {grant.decided_by ? ` by ${grant.decided_by}` : ""} · {date(grant.decided_at)}
                {grant.decision_note && <span className="italic text-slate-500"> — “{grant.decision_note}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function GrantCard({ grant }: { grant: VipGrant }) {
  const meta = vipCategoryMeta(grant.category);
  return (
    <div className="rounded-xl border border-amber-300/40 bg-amber-400/[0.08] p-3">
      <p className="text-sm font-black text-amber-50">
        {meta?.icon} {meta?.label} VIP
      </p>
      <p className="text-[11px] text-amber-100/70">
        {grant.from_server
          ? `Carried over from ${grant.from_server}${grant.decided_by ? ` · approved by ${grant.decided_by}` : ""}`
          : grant.granted_by
            ? `Given by ${grant.granted_by}`
            : "Given"}{" "}
        · {date(grant.granted_at)}
      </p>
      <GrantDetails grant={grant} />
    </div>
  );
}

function GrantDetails({ grant }: { grant: VipGrant }) {
  const { links, reason, note } = grant.details;
  if (links?.length) {
    return (
      <ul className="mt-2 space-y-1">
        {links.map((link) => (
          <li key={link.url} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-center text-[10px] font-bold text-slate-200">{link.platform}</span>
            <a href={link.url} target="_blank" rel="noreferrer noopener" className="truncate text-sky-200 underline-offset-2 hover:underline">
              {link.url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          </li>
        ))}
      </ul>
    );
  }
  if (reason) return <p className="mt-1.5 whitespace-pre-line text-xs italic text-slate-200">“{reason}”</p>;
  if (note) return <p className="mt-1.5 text-xs text-slate-300">{note}</p>;
  return null;
}

function GiveVipForm({
  playerName,
  replacing,
  busy,
  onCancel,
  send,
}: {
  playerName: string;
  replacing: VipGrant | null;
  busy: boolean;
  onCancel: () => void;
  send: (payload: Omit<MemberRolesPayload, "user_id">) => void;
}) {
  const [category, setCategory] = useState<VipCategory | null>(null);
  const [links, setLinks] = useState<string[]>([""]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const meta = category ? vipCategoryMeta(category) : null;
  const filled = links.map((link) => link.trim()).filter(Boolean);
  const badLink = filled.find((link) => link.length > VIP_LINK_MAX_LEN || !LINK_RE.test(link)) ?? null;

  const error =
    !category
      ? null
      : category === "content_creator"
        ? filled.length === 0
          ? "Add at least one channel link."
          : badLink
            ? `"${badLink.slice(0, 40)}" isn't a full link — start it with https://`
            : null
        : category === "highly_trusted" && reason.trim().length < VIP_REASON_MIN
          ? `Write at least ${VIP_REASON_MIN} characters about why (${reason.trim().length}/${VIP_REASON_MIN}).`
          : null;

  const lines = category
    ? [
        `${playerName} gets VIP, RP Verified, Hist Verified, HOI4 RP Trusted and HOI4 MP Trusted`,
        ...(replacing ? [`Replaces their ${vipCategoryMeta(replacing.category)?.label} VIP`] : []),
        category === "pdx_staff"
          ? "They get a DM about it, with a \"This isn't me\" button that removes it"
          : "They aren't notified",
        meta?.transferable
          ? "Carries over by itself to other servers running the bot (their staff can remove it)"
          : "Other servers running the bot have to approve it before it counts there",
      ]
    : [];

  return (
    <div className="space-y-3 rounded-xl border border-amber-300/30 bg-amber-400/[0.04] p-3">
      <Field label="Category">
        <div className="grid gap-1.5">
          {VIP_CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={category === option.value}
              onClick={() => setCategory(option.value)}
              className={`rounded-lg border px-3 py-2 text-left transition ${
                category === option.value
                  ? "border-amber-300 bg-amber-400/15"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25"
              }`}
            >
              <span className="text-sm font-bold text-white">
                {option.icon} {option.label}
              </span>
              <span className="block text-[11px] text-slate-400">{option.description}</span>
            </button>
          ))}
        </div>
      </Field>

      {category === "content_creator" && (
        <Field label={`Channel links (up to ${VIP_MAX_LINKS})`}>
          <div className="space-y-1.5">
            {links.map((link, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <span className="w-16 shrink-0 rounded bg-white/10 px-1.5 py-1 text-center text-[10px] font-bold text-slate-300">
                  {link.trim() ? vipPlatform(link.trim()) : "Link"}
                </span>
                <input
                  value={link}
                  onChange={(event) => setLinks((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                  placeholder="https://www.youtube.com/@channel"
                  maxLength={VIP_LINK_MAX_LEN}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
                  aria-label={`Channel link ${index + 1}`}
                />
                {links.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLinks((current) => current.filter((_, i) => i !== index))}
                    className="px-1 text-xs text-slate-500 hover:text-rose-300"
                    aria-label={`Remove link ${index + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {links.length < VIP_MAX_LINKS && (
              <button
                type="button"
                onClick={() => setLinks((current) => [...current, ""])}
                className="text-[11px] font-bold text-amber-200 hover:text-amber-100"
              >
                ＋ Add another link (Twitch, Kick, TikTok…)
              </button>
            )}
          </div>
        </Field>
      )}

      {category === "pdx_staff" && (
        <Field label="Note (optional)" hint="E.g. their role at Paradox. Shown to staff only.">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, VIP_NOTE_MAX))}
            placeholder="Community manager for HOI4"
            className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
          />
        </Field>
      )}

      {category === "highly_trusted" && (
        <Field label="Why are they highly trusted?" hint={`${reason.trim().length}/${VIP_REASON_MAX} · at least ${VIP_REASON_MIN} characters. Other servers' staff see this when they approve it.`}>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, VIP_REASON_MAX))}
            rows={3}
            placeholder="E.g. ran our tournaments for two years, helped moderate…"
            className="w-full resize-y rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
          />
        </Field>
      )}

      <PreviewBox preview={{ lines, error, danger: false }} />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:text-white">
          Cancel
        </button>
        <div className="flex-1">
          <SubmitButton
            label={meta ? `Give VIP — ${meta.label}` : "Pick a category"}
            busy={busy}
            danger={false}
            disabled={!category || Boolean(error)}
            onConfirm={() => {
              if (!category) return;
              if (category === "content_creator") send({ op: "vip_grant", category, links: filled });
              else if (category === "highly_trusted") send({ op: "vip_grant", category, reason: reason.trim() });
              else send({ op: "vip_grant", category, ...(note.trim() ? { note: note.trim() } : {}) });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ReasonBox({
  value,
  onChange,
  quick,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  quick: string[];
  placeholder: string;
}): ReactNode {
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 300))}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
      />
      <div className="flex flex-wrap gap-1">
        {quick.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(text)}
            className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300 hover:border-white/25"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
