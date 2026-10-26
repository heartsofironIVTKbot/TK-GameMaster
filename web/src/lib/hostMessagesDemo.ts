import { demoDirectory } from "@/lib/liveDemo";
import type { HostMessageEntry } from "@/lib/messageTypes";

/**
 * Preview mode (SCHEDULER_DEMO=1) for host messages: Erwin already got an
 * anonymous message, Rookie has DMs closed. Simulates the bot's
 * _process_web_host_dm.
 */

interface DemoMessage extends HostMessageEntry {
  recipient_id: string;
}

const DEMO_CLOSED_DMS = "500000000000000012";

function demoState(): { messages: DemoMessage[]; next: number } {
  const holder = globalThis as { __gmHostMessagesDemoV1?: { messages: DemoMessage[]; next: number } };
  if (!holder.__gmHostMessagesDemoV1) {
    const now = Math.floor(Date.now() / 1000);
    holder.__gmHostMessagesDemoV1 = {
      next: 2,
      messages: [
        {
          id: "1",
          recipient_id: "500000000000000003",
          sender_id: "200000000000000002",
          sender_name: "Senior Host",
          message: "Hey — please read the new Roleplay rules before Saturday's game, there were a few complaints last time.",
          signed: false,
          delivered: true,
          created_at: now - 2 * 86_400,
        },
      ],
    };
  }
  return holder.__gmHostMessagesDemoV1;
}

export function demoHostMessages(userId: string): HostMessageEntry[] {
  return demoState()
    .messages.filter((entry) => entry.recipient_id === userId)
    .map((entry) => ({
      id: entry.id,
      sender_id: entry.sender_id,
      sender_name: entry.sender_name,
      message: entry.message,
      signed: entry.signed,
      delivered: entry.delivered,
      created_at: entry.created_at,
    }));
}

type DemoOutcome = {
  status: "done" | "error";
  result: Record<string, unknown> | null;
  error: string | null;
};

export function applyDemoHostDm(payload: Record<string, unknown>, hostId: string, hostName: string): DemoOutcome {
  const refuse = (error: string): DemoOutcome => ({ status: "error", result: null, error });
  const userId = String(payload.user_id ?? "");
  const text = String(payload.message ?? "").trim();
  if (!text) return refuse("❌ Write a message first.");
  if (userId === hostId) return refuse("❌ You can't message yourself.");
  const member = demoDirectory().find((entry) => entry.discord_id === userId);
  if (!member) return refuse("❌ They're not in the server — the bot can't DM them.");
  const signed = payload.signed === true;
  const delivered = userId !== DEMO_CLOSED_DMS;
  const state = demoState();
  state.messages.unshift({
    id: String(state.next++),
    recipient_id: userId,
    sender_id: hostId,
    sender_name: hostName,
    message: text,
    signed,
    delivered,
    created_at: Math.floor(Date.now() / 1000),
  });
  const name = member.display_name || member.username;
  if (!delivered) return refuse(`❌ Couldn't DM ${name} — their DMs are probably closed. (It's in the audit log.)`);
  return {
    status: "done",
    result: {
      message: {
        title: "📩 Message sent",
        summary: `${name} got your message ${signed ? "with your name on it." : 'from "a Game Host".'}`,
        notes: ["It's in the audit log."],
        stats: {},
        log_url: null,
      },
    },
    error: null,
  };
}
