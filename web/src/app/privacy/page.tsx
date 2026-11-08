import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact, type LegalSection } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · GameMaster",
  description: "What GameMaster collects, why, who can see it, where it's kept, and how to have it deleted.",
};

// Every fact here should match what the bot and the website really do; when
// a feature changes what it keeps or shows, change this page and LEGAL.updated.
const SECTIONS: LegalSection[] = [
  {
    id: "collect",
    title: "What GameMaster collects",
    body: (
      <>
        <p>
          <b className="text-ink-100">When you sign in with Discord:</b> your Discord ID, username, display name and avatar. When you connect or add a server, also
          the list of Discord servers you&apos;re in, so the website can show the ones you can set up. GameMaster never sees your Discord password or your email.
        </p>
        <p>
          <b className="text-ink-100">In the Discord servers that use GameMaster:</b>
        </p>
        <ul>
          <li>the games, their settings and the nation each player reserved;</li>
          <li>
            attendance: during a game the bot checks the game&apos;s voice channels a few times, on its own, to see who is there and who took part;
          </li>
          <li>records hosts and staff give or log: commends, Merit, warnings, dishonours, game bans, no-shows and the reasons given;</li>
          <li>ratings you give a game, and requests to join a game that has already started;</li>
          <li>tickets: when a ticket is closed, its messages and files are saved so they can still be read;</li>
          <li>an audit log of changes made through the bot and the website, and who made them.</li>
        </ul>
        <p>
          <b className="text-ink-100">Chat logs and AI analysis:</b> a host can upload a game&apos;s Hearts of Iron IV chat log. GameMaster keeps it, and if the host
          runs the AI analysis, sends it to Google&apos;s Gemini AI, which grades each player&apos;s roleplay and writes a short recap. AI analysis is an optional
          extra, switched on only for selected communities.
        </p>
        <p>
          <b className="text-ink-100">Crash reports:</b> when you send Hearts of Iron IV crash logs, they&apos;re posted in the server&apos;s crash-report channel for
          the mod developers. The file is deleted from GameMaster&apos;s storage once it&apos;s posted; a note that you sent a report is kept.
        </p>
        <p>
          <b className="text-ink-100">On the website:</b> one sign-in cookie keeps you logged in (it lasts 30 days from your last visit). Your browser also keeps a
          few settings of its own, such as which guided tours you&apos;ve seen; those never leave your device. GameMaster uses no analytics, no advertising and
          no tracking cookies. The hosting and network providers below keep short-lived server logs, including IP addresses, for security and to fix problems.
        </p>
      </>
    ),
  },
  {
    id: "why",
    title: "Why",
    body: (
      <>
        <p>
          Only to run the games: the calendar, the live map, attendance, player records, the archive and tickets, for the servers that added GameMaster. The
          servers&apos; staff choose to use it to run their community, and GameMaster processes this data on that basis. Running the AI analysis is the
          host&apos;s choice, game by game.
        </p>
        <p>Your data is never sold, never used for advertising and never shared with anyone for their own purposes.</p>
      </>
    ),
  },
  {
    id: "who-sees",
    title: "Who can see it",
    body: (
      <>
        <ul>
          <li>
            <b className="text-ink-100">Anyone, on the website:</b> the{" "}
            <Link href="/archive" className="text-brand-300 hover:text-brand-200">
              game archive
            </Link>{" "}
            (who played which nation, who came, what was given out and the game&apos;s rating), the{" "}
            <Link href="/roleplay" className="text-brand-300 hover:text-brand-200">
              roleplay archive
            </Link>{" "}
            (the AI&apos;s grades, recap and short quotes from the chat log), the live map&apos;s reservations, and the shared calendar (a server&apos;s name and
            icon, and each game&apos;s day, time and mode; never its players).
          </li>
          <li>
            <b className="text-ink-100">Your server&apos;s hosts and staff:</b> its player records, attendance, tickets and audit log.
          </li>
          <li>
            <b className="text-ink-100">You:</b> your profile and the closed tickets you took part in.
          </li>
        </ul>
        <p>Each server&apos;s records stay with that server; another server&apos;s staff can&apos;t read them.</p>
      </>
    ),
  },
  {
    id: "where",
    title: "Where it's kept",
    body: (
      <>
        <p>GameMaster uses these services to run. Some of them may store or process data outside your country.</p>
        <ul>
          <li>
            <b className="text-ink-100">Render</b>: hosts the website (Frankfurt, Germany).
          </li>
          <li>
            <b className="text-ink-100">Aiven</b>: hosts the database, with encrypted connections.
          </li>
          <li>
            <b className="text-ink-100">A game-server host</b>: runs the Discord bot.
          </li>
          <li>
            <b className="text-ink-100">Cloudflare</b>: delivers the website and protects it from attacks.
          </li>
          <li>
            <b className="text-ink-100">Backblaze</b>: keeps nightly backups of the database in a private storage bucket.
          </li>
          <li>
            <b className="text-ink-100">Google (Gemini)</b>: only for chat logs a host sends to the AI analysis.
          </li>
          <li>
            <b className="text-ink-100">Discord</b>: where the bot works. What you post in Discord itself is governed by Discord&apos;s own privacy policy.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-long",
    title: "How long",
    body: (
      <>
        <p>
          Game records are kept for as long as the community uses GameMaster, so its history stays complete, or until you ask for yours to be deleted. The
          nightly backups roll over: only the newest 14 are kept, so anything deleted is gone from the backups within two weeks. The sign-in cookie ends 30 days
          after your last visit, or when you log out.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    body: (
      <>
        <p>
          You can ask to see the data GameMaster holds about you, to have it corrected, or to have it deleted. To ask, <Contact />. You&apos;ll get an answer
          within 30 days.
        </p>
        <p>
          Deleting removes everything GameMaster holds about you: your reservations, attendance, records, ratings, tickets and the rest, on every server.
          Messages you posted in Discord itself are Discord&apos;s to keep or delete, not GameMaster&apos;s.
        </p>
        <p>Depending on where you live, you may also have the right to complain to your data protection authority.</p>
      </>
    ),
  },
  {
    id: "children",
    title: "Age",
    body: (
      <p>
        GameMaster works through Discord, so it follows Discord&apos;s minimum age: 13, or older where the law of your country says so. It isn&apos;t meant for
        anyone younger.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>
        If what GameMaster collects or shows changes, this page changes with it and the date at the top moves. Big changes are also announced in the servers
        that use GameMaster.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        GameMaster is run by {LEGAL.operator}. For anything about this policy or your data, <Contact />.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      page="privacy"
      title="Privacy Policy"
      subtitle="What GameMaster keeps, and why"
      intro={
        <>
          <p>
            GameMaster is a Discord bot and a website (hoi4gamemaster.online) that run Hearts of Iron IV multiplayer games for Discord communities: the
            calendar, nation reservations, attendance, player records and an archive of every game.
          </p>
          <p>This page says what GameMaster collects, why, who can see it, where it&apos;s kept, and how to have it deleted. In short: only what running the games needs, never sold, no ads, no tracking.</p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
