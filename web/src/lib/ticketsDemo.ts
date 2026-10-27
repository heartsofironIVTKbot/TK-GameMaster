import { DEMO_HOST } from "@/lib/scheduleStore";

/**
 * Preview mode (SCHEDULER_DEMO=1): one closed ticket of each kind. The demo
 * viewer is Host Management, so they see every ticket except the host report
 * about themselves (the reported host is never shown it).
 */

export const DEMO_MANAGEMENT_ROLE = "900000000000000001";

export interface DemoTicket {
  ticket_id: string;
  number: number;
  kind: string;
  opener_id: string;
  opener_name: string;
  host_id: string | null;
  target_id: string | null;
  status: string;
  closed_by_id: string | null;
  closed_by_name: string;
  close_reason: string | null;
  opened_at: number;
  closed_at: number;
  messages: {
    author_id: string;
    author_name: string;
    is_bot: boolean;
    minutes: number;
    content: string | null;
    embeds?: { title: string | null; description: string | null; fields: { name: string; value: string }[] }[];
    files?: { file_id: string; filename: string; content_type: string; content: Buffer | null }[];
  }[];
}

// A 48×48 amber PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAO0lEQVR42u3OoQ0AAAgDsHn+t3yJ5wuCaNIDmul6JUJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCd6EFPiKO02DImnIAAAAASUVORK5CYII=",
  "base64",
);

const PLAYER = { id: "100000000000000006", name: "Zoe" };
const BOT = { id: "100000000000000099", name: "GameMaster" };
const STAFF = { id: "100000000000000005", name: "Kurt (Senior Host)" };

const KINDS: [string, string][] = [
  ["Verification", "Hi! Here is my speed test and specs for RP Verified."],
  ["Hist-Verification", "Applying for Historical Verified — 640 hours in HOI4."],
  ["Host-App", "1. EU  2. Ryzen 7 / 32 GB  3. 300 Mb/s  4. Yes  5. I'd like to help run RP nights."],
  ["Hist-Host-App", "I'd like to host historical games on weekends."],
  ["Report-Host", "The host ended the game early without telling anyone."],
  ["Appeal", "I'd like to appeal my warning from Saturday — I had a power cut."],
  ["Behavior", "Player 'Ivan' kept griefing allies in the last game."],
  ["Commend", "Ben was a great ally, please commend him."],
  ["Question", "How do co-op slots work?"],
  ["Bug", "The map didn't show my nation after I reserved."],
];

function seed(): DemoTicket[] {
  const now = Math.floor(Date.now() / 1000);
  return KINDS.map(([kind, text], index) => {
    const closedAt = now - (index + 1) * 5400;
    const openedAt = closedAt - 3 * 3600;
    const report = kind === "Report-Host";
    return {
      ticket_id: `14000000000000000${10 + index}`,
      number: 120 - index,
      kind,
      opener_id: PLAYER.id,
      opener_name: PLAYER.name,
      host_id: kind === "Behavior" ? STAFF.id : null,
      target_id: report ? DEMO_HOST.discord_id : null,
      status: index % 3 === 2 ? "Unresolved" : "Resolved",
      closed_by_id: index === 8 ? null : STAFF.id,
      closed_by_name: index === 8 ? "GameMaster (automatic)" : STAFF.name,
      close_reason: index === 8 ? "Closed automatically: no messages for 48 hours." : null,
      opened_at: openedAt,
      closed_at: closedAt,
      messages: [
        {
          author_id: BOT.id,
          author_name: BOT.name,
          is_bot: true,
          minutes: 0,
          content: `<@${PLAYER.id}> welcome — staff will be with you shortly.`,
          embeds: [{ title: `🎫 ${kind}`, description: "Tell us what it's about.", fields: [{ name: "Details", value: text }] }],
        },
        {
          author_id: PLAYER.id,
          author_name: PLAYER.name,
          is_bot: false,
          minutes: 2,
          content: text,
          files:
            index < 2
              ? [
                  { file_id: `demo${index}a`, filename: "speedtest.png", content_type: "image/png", content: PNG },
                  { file_id: `demo${index}b`, filename: "dxdiag.txt", content_type: "text/plain", content: Buffer.from("CPU: Ryzen 7\nRAM: 32 GB\n") },
                  { file_id: `demo${index}c`, filename: "gameplay.mp4", content_type: "video/mp4", content: null },
                ]
              : undefined,
        },
        { author_id: STAFF.id, author_name: STAFF.name, is_bot: false, minutes: 40, content: "Thanks — looking into it now." },
        ...(index === 8
          ? []
          : [{ author_id: STAFF.id, author_name: STAFF.name, is_bot: false, minutes: 120, content: "All sorted, closing this. 👍" }]),
      ],
    };
  });
}

export function demoTickets(): DemoTicket[] {
  const holder = globalThis as { __gmTicketsDemoV1?: DemoTicket[] };
  holder.__gmTicketsDemoV1 ??= seed();
  return holder.__gmTicketsDemoV1;
}
