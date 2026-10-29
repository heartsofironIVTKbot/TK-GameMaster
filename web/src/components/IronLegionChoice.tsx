"use client";

import { IRONLEGION_RULE_LABELS, ironLegionRule, ironLegionValue, type IronLegionRule } from "@/lib/ironlegion";
import { Segmented } from "@/components/schedule/ui";

/** Require IronLegion for a preset / calendar game / game: follow the server, required, or not. */
export default function IronLegionChoice({
  value,
  onChange,
  serverRequires,
  disabled,
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  /** The server's own setting, when known (shown on "Server setting"). */
  serverRequires?: boolean;
  disabled?: boolean;
}) {
  const server =
    serverRequires === undefined
      ? IRONLEGION_RULE_LABELS.server
      : `${IRONLEGION_RULE_LABELS.server} (${serverRequires ? "required" : "not required"})`;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold text-slate-400">🛡️ IronLegion Steam authentication</p>
      <Segmented<IronLegionRule>
        ariaLabel="Require IronLegion Steam authentication"
        size="sm"
        value={ironLegionRule(value)}
        onChange={(rule) => onChange(ironLegionValue(rule))}
        options={[
          { value: "server", label: server, disabled },
          { value: "on", label: IRONLEGION_RULE_LABELS.on, disabled },
          { value: "off", label: IRONLEGION_RULE_LABELS.off, disabled },
        ]}
      />
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
        Required: players need the authenticated role IronLegion gives on this server to reserve. Hosts, staff and VIPs are never locked out.
      </p>
    </div>
  );
}
