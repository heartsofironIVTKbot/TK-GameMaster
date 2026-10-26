# Verification, host branches and VIP — on the Database page

`/verify`, `/make_vip` and `/make_host` are gone from Discord. Senior staff
(admins and Senior Management) give and take **RP Verified**, **Hist
Verified**, **RP / HIST host ranks** and **VIP** on a member's Database record, in
the **🪪 Verification, host branches & VIP** panel
(under Moderate). Any host can open the panel and see who verified someone,
their VIP and why — only senior staff can change it.

## Verification is split in two

| Role | For | Database column |
| --- | --- | --- |
| **RP Verified** — the old "HOI4 Verified" role (rename it in Discord if you like) | Roleplay games | `users.hoi4_verified` |
| **Hist Verified** — new; the bot creates it on its first start | Historical games | `users.hist_verified` |

What each one unlocks for its own game type:

- the **Verified+** reservation level,
- the **Trusted** role (RP Trusted needs RP Verified; MP / Hist Trusted needs
  Hist Verified — the role scan removes a Trusted role whose Verified role is
  missing),
- reserving on the **website map**: Roleplay games need RP Verified,
  Historical games need Hist Verified,
- a Hearts of Valor Trusted pick (Roleplay → RP Verified, Historical → Hist
  Verified).

Crash-report Merit counts either role.

**Existing players:** everyone who had HOI4 Verified keeps it as **RP
Verified only** — they need Hist Verified for Historical games (and to keep
Historical Trusted). Current **VIPs** got Hist Verified once, automatically,
because VIP has always meant verified for every game type.

On the record, each role shows **who gave it and when** (or "Given before
records were kept" for older ones), or who took it away and why. **Verify**
gives it in one click; **Remove…** needs a reason. Every change is in the host
log and the member's moderation history.

Later, the ticket system will give these automatically when a member meets the
requirements — the panel stays as the manual override.

## Host branches (formerly /make_host)

Hosting is split into two **branches**, each with three ranks:

| Branch | Hosts | Ranks (Discord roles) | Database column |
| --- | --- | --- | --- |
| **RP** (roleplay) | Roleplay games (Roleplay, Kaiserreich, TFR, Millennium Dawn, Novum Vexillum) | Assistant / Full / Senior — the old "HOI4 MP Trial / Host / Senior" roles | `users.hoi4_host_tier` |
| **HIST** (historical) | Historical games (Vanilla, Their Finest Bruh, Hearts of Oak, Horstorical, BFFU 2) | **HIST Assistant Host / HIST Host / Senior HIST Host** — the bot creates them on its first start | `users.hist_host_tier` |

A member can be in one branch, both, or neither, with a different rank in
each. The **🎖️ Host branches** section shows one row per branch with the rank
and who set it last. Senior staff pick **None / Assistant / Full / Senior** in
a row: the bot swaps that branch's rank role, updates the column and refreshes
the website's host list straight away. Only that branch changes. Taking a
rank away (**None**) needs a reason; a demotion asks for a second click.
Nobody can change their own rank. Host ranks **stay on this server** — they
never carry over. Logged as `host_tier_set` (with the branch).

**Hosts only host their own branch's games** — on the website (the setup
form greys out the other branch's modes, and a game can only be handed over
to a host of its branch) and in the bot. Senior staff can host anything.

**Acclamations and Violations are per branch** (Host standing card): 2 RP
Acclamations → Full RP Host, 4 → Senior RP Host; 3 RP Violations strip the RP
rank only. Senior Hosts can give them to hosts of their own branch; Host
Management can give them in both and is the only one who can take them back.
Like commends and warnings, giving one kind never removes the other. A server
can switch off the Assistant or Senior rank (Settings → Host ranks): with
Assistant off new hosts start at Full; with Senior off promotions stop at Full
and only Host Management rates hosts. Everyone's existing counts became RP
counts.

## VIP

**🌟 Make VIP…** asks for a category:

| Category | What staff fill in | Notified? | Other servers |
| --- | --- | --- | --- |
| 🎥 **Content Creator** | 1–6 channel links (YouTube, Twitch, Kick, TikTok, X or any https link — the platform is detected) | No | Carries over by itself |
| 🛠️ **PDX Staff** | Optional note | Yes — a DM saying they were marked as Paradox staff, with a **This isn't me** button | Carries over by itself |
| 🤝 **Highly Trusted** | Why they're highly trusted (at least 20 characters) | No | The other server's staff must approve it |

Giving VIP gives **VIP, RP Verified, Hist Verified, HOI4 RP Trusted and HOI4 MP
Trusted** (the same bundle as /make_vip) — also when a VIP is carried over
from another server or approved. The role scan keeps a VIP's Trusted roles
whatever their commend count, as long as they have that game type's Verified
role and no game ban (a game ban in any mode removes every Trusted role, VIP
or not). **Remove VIP…** (reason required)
takes only the VIP role — Verified and Trusted stay. **Change VIP category…**
replaces the current VIP with a new one. Nobody can give themselves VIP.

**PDX Staff "This isn't me":** pressing it takes the VIP role away, marks the
VIP as removed and posts a notice to staff.

The record shows the category, the links / reason / note, who gave it and
when, VIPs the member has **on other servers**, and earlier VIPs (removed or
declined, with the reason).

## VIP across servers

Every server running this bot uses the same database, so a VIP given on one
server is visible to the others. Each server's bot checks when a member
**joins**, and every 30 minutes for members already there:

- **Content Creator / PDX Staff** VIP from another server → VIP is given here
  automatically, and staff get a notice in the **host management channel**
  with a **Remove VIP** button.
- **Highly Trusted** VIP from another server → nothing is given yet; staff get
  a notice with **Approve VIP** / **Decline** buttons (also on the member's
  record on the Database page).

Each VIP carries over once: if this server removes or declines it, it isn't
offered again. Only VIPs given directly on a server carry over (a carried-over
VIP doesn't pass itself on to a third server). Members who already have the
VIP role here are left alone.

## How it works

- `POST /api/schedule/requests` with `action: "member_roles"` (ops: `verify`,
  `unverify`, `host_tier`, `vip_grant`, `vip_remove`, `vip_approve`, `vip_decline`) —
  senior staff only; the bot re-checks everything (`_process_web_member_roles`,
  "MEMBER ROLES" section of `bot.py.py`).
- `GET /api/database/players/<id>/roles` — the panel's data.
- Tables: `vip_grants` (one row per VIP, any server; created by the bot) and
  the new `users.hist_verified` column. Verification history is
  `moderation_events` (`verified_granted` / `verified_removed`, and
  `vip_granted` / `vip_removed` / `vip_declined`).
- The bot publishes the role ids (including the new Hist Verified role) to
  `bot_config` (`web_member_roles`) so the website knows them.
- Restart-proof Discord buttons: `vipn:remove|approve|decline:<grant>` on
  staff notices, `vipnotme:<grant>` on the PDX Staff DM.

**Preview mode** (`SCHEDULER_DEMO=1`): Otto is RP + Hist Verified (with who did
it), Wilhelm is a Content Creator VIP (also VIP on another server), Lena has
a Highly Trusted VIP from another server waiting for approval, and Pieter's
PDX Staff VIP was removed after he said it wasn't him.

## Deploy

1. Restart the bot. It removes `/verify`, `/make_vip` and `/make_host` from Discord, creates
   the **Hist Verified** role (next to RP Verified — it needs Manage Roles),
   adds `users.hist_verified` and the `vip_grants` table, gives current VIPs
   Hist Verified, and starts the VIP carry-over check.
2. Redeploy the website.
3. Optional: rename "HOI4 Verified" to "RP Verified" in Discord, and the old
   host roles to "RP Assistant Host / RP Host / Senior RP Host".
4. The bot also creates the three **HIST host** roles and adds
   `users.hist_host_tier`, `host_stats.hist_acclamations` /
   `hist_violations` and `web_host_roster.branches`.

Heads-up on host branches: right after the restart nobody is a HIST host, so
**only senior staff can host Historical games** until staff give HIST ranks
on the Database page. A member with a host role but no rank (e.g. Retired
Organiser) can no longer schedule games unless they're staff.

Heads-up: from the next role check (Database page, or the daily 04:00 UTC
run), **Historical Trusted needs Hist Verified**,
so non-VIP players with Historical Trusted lose it until staff give them Hist
Verified; and **reserving in Historical games on the website needs Hist
Verified**.
