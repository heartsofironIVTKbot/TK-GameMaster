// Run from web\:  node --test tests/ticketAccess.test.mjs
// Checks the website's ticket permissions against the Discord rules
// (docs/audit-and-tickets-on-web-plan.md §2.6).
import assert from "node:assert/strict";
import { test } from "node:test";
import { TICKET_KINDS, canViewTicket } from "../src/lib/ticketAccess.ts";

const ROLE = { support: "11", management: "22", developer: "33", assistant: "41", full: "42", senior: "43", histFull: "52", other: "99" };

function settings({ assistantOn = true, seniorOn = true, histEnabled = true } = {}) {
  const branch = (assistant, full, senior, enabled = true) => ({
    enabled,
    ranks: { Assistant: assistant, Full: full, Senior: senior },
    ranks_on: { Assistant: assistantOn, Senior: seniorOn },
    full_takes_senior: true,
  });
  return {
    access: {
      senior_staff_roles: [ROLE.management],
      staff_can_edit_settings: true,
      ticket_support_roles: [ROLE.support],
      developer_roles: [ROLE.developer],
    },
    branches: { RP: branch(ROLE.assistant, ROLE.full, ROLE.senior), HIST: branch(null, ROLE.histFull, null, histEnabled) },
  };
}

const viewer = (id, roles = [], isAdmin = false) => ({ id, isAdmin, roleIds: new Set(roles) });
const ticket = (kind, extra = {}) => ({ kind, opener_id: "1000", host_id: null, target_id: null, ...extra });

// Who sees each kind (besides the opener and admins), per §2.6.
const EXPECTED = {
  Verification: ["support", "management"],
  "Hist-Verification": ["support", "management"],
  "Host-App": ["management"],
  "Hist-Host-App": ["management"],
  "Report-Host": ["management"],
  Appeal: ["host", "management"],
  Behavior: ["host", "management"],
  Commend: ["host", "management"],
  Question: ["host", "management"],
  Bug: ["developer", "management"],
};
const PEOPLE = {
  support: viewer("2001", [ROLE.support]),
  management: viewer("2002", [ROLE.management]),
  developer: viewer("2003", [ROLE.developer]),
  host: viewer("2004", [ROLE.full]),
  player: viewer("2005", [ROLE.other]),
};

test("every bot ticket kind is covered", () => {
  assert.deepEqual(Object.keys(TICKET_KINDS).sort(), Object.keys(EXPECTED).sort());
});

for (const [kind, allowed] of Object.entries(EXPECTED)) {
  test(`${kind}: the right groups, the opener and admins`, () => {
    for (const [who, person] of Object.entries(PEOPLE)) {
      assert.equal(canViewTicket(person, ticket(kind), settings()), allowed.includes(who), `${who} on ${kind}`);
    }
    assert.equal(canViewTicket(viewer("1000"), ticket(kind), settings()), true, "opener");
    assert.equal(canViewTicket(viewer("3000", [], true), ticket(kind), settings()), true, "admin");
  });
}

test("the reported host never sees the report — even as Host Management or admin", () => {
  const report = ticket("Report-Host", { target_id: "2002" });
  assert.equal(canViewTicket(viewer("2002", [ROLE.management]), report, settings()), false);
  assert.equal(canViewTicket(viewer("2002", [ROLE.management], true), report, settings()), false);
  assert.equal(canViewTicket(viewer("2009", [ROLE.management]), report, settings()), true, "other managers still do");
});

test("the pinged game host sees a game-support ticket", () => {
  assert.equal(canViewTicket(viewer("2010"), ticket("Behavior", { host_id: "2010" }), settings()), true);
});

test("hosts group: every switched-on rank in an enabled branch", () => {
  const appeal = ticket("Appeal");
  assert.equal(canViewTicket(viewer("1", [ROLE.assistant]), appeal, settings()), true);
  assert.equal(canViewTicket(viewer("1", [ROLE.senior]), appeal, settings()), true);
  assert.equal(canViewTicket(viewer("1", [ROLE.assistant]), appeal, settings({ assistantOn: false })), false, "Assistant switched off");
  assert.equal(canViewTicket(viewer("1", [ROLE.senior]), appeal, settings({ seniorOn: false })), false, "Senior switched off");
  assert.equal(canViewTicket(viewer("1", [ROLE.histFull]), appeal, settings()), true);
  assert.equal(canViewTicket(viewer("1", [ROLE.histFull]), appeal, settings({ histEnabled: false })), false, "branch off");
  assert.equal(canViewTicket(viewer("1", [ROLE.full]), ticket("Host-App"), settings()), false, "hosts don't see applications");
});

test("unknown kinds: Host Management only", () => {
  assert.equal(canViewTicket(PEOPLE.management, ticket("Mystery"), settings()), true);
  assert.equal(canViewTicket(PEOPLE.host, ticket("Mystery"), settings()), false);
  assert.equal(canViewTicket(PEOPLE.support, ticket("Mystery"), settings()), false);
});

test("no settings: only the opener, the game host and admins", () => {
  assert.equal(canViewTicket(PEOPLE.management, ticket("Appeal"), null), false);
  assert.equal(canViewTicket(viewer("1000"), ticket("Appeal"), null), true);
  assert.equal(canViewTicket(viewer("3000", [], true), ticket("Appeal"), null), true);
  assert.equal(canViewTicket(viewer(""), ticket("Appeal", { opener_id: "" }), null), false, "no viewer id");
});
