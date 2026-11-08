import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact, type LegalSection } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service · GameMaster",
  description: "The rules for using GameMaster, the Discord bot and website for Hearts of Iron IV communities.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Using GameMaster",
    body: (
      <p>
        GameMaster is a Discord bot and a website (hoi4gamemaster.online) for running Hearts of Iron IV multiplayer games. By adding the bot to a server, signing
        in on the website or taking part in a game it runs, you agree to these terms and to the{" "}
        <Link href="/privacy" className="text-brand-300 hover:text-brand-200">
          Privacy Policy
        </Link>
        . If you don&apos;t agree, please don&apos;t use GameMaster.
      </p>
    ),
  },
  {
    id: "discord",
    title: "Your Discord account",
    body: (
      <p>
        You sign in with Discord, so Discord&apos;s Terms of Service and Community Guidelines apply too, including its minimum age. You&apos;re responsible for
        what happens through your account; if you think someone else has used it, change your Discord password and log out of GameMaster.
      </p>
    ),
  },
  {
    id: "servers",
    title: "Server owners and staff",
    body: (
      <>
        <p>If you add GameMaster to a server or run games with it, you&apos;re responsible for how your server uses it. In particular:</p>
        <ul>
          <li>
            moderation is yours: warnings, bans and other records are given by your hosts and staff, not by GameMaster, and you&apos;re responsible for them being
            fair;
          </li>
          <li>let your members know GameMaster keeps game records, and point them to the Privacy Policy;</li>
          <li>give staff and host roles only to people you trust with your members&apos; records;</li>
          <li>you can remove the bot at any time.</li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "Fair use",
    body: (
      <>
        <p>Don&apos;t use GameMaster to:</p>
        <ul>
          <li>harass, threaten or impersonate anyone, or post other people&apos;s private information;</li>
          <li>upload anything illegal, harmful or that you don&apos;t have the right to share, including malware;</li>
          <li>spam, flood or overload the bot or the website, or try to break, scrape or get round its limits and permissions;</li>
          <li>get at data you&apos;re not allowed to see, such as another server&apos;s records.</li>
        </ul>
        <p>Accounts or servers that break these rules can lose access to GameMaster.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "What you upload",
    body: (
      <p>
        Chat logs, ticket messages, files and other things you add stay yours. You give GameMaster permission to store, show and process them as far as running
        the service needs: for example, putting a game and its roleplay on the public archives, and sending a chat log to the AI analysis when a host runs it.
      </p>
    ),
  },
  {
    id: "free",
    title: "Free, and what may change",
    body: (
      <>
        <p>
          GameMaster is free: no paid tiers, no ads. The one exception is AI analysis, an optional extra that costs real money for every game it reads; it&apos;s
          switched on only for selected communities, and any paid offer would come with its own terms.
        </p>
        <p>
          GameMaster is provided as it is. Features can change, pause or end, and while it&apos;s run with care, there&apos;s no promise that it will always be
          available or free of mistakes. As far as the law allows, GameMaster isn&apos;t liable for lost games, records or other losses that come from using it.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Ending",
    body: (
      <p>
        You can stop using GameMaster at any time: remove the bot from your server, log out, and if you want your data gone, ask as the Privacy Policy explains.
        GameMaster can suspend access for anyone who breaks these terms.
      </p>
    ),
  },
  {
    id: "trademarks",
    title: "Not affiliated",
    body: (
      <p>
        GameMaster is an independent community project. It isn&apos;t affiliated with, or endorsed by, Paradox Interactive or Discord. Hearts of Iron is a
        trademark of Paradox Interactive.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>
        These terms can change as GameMaster does. The date at the top shows the latest version, and big changes are announced in the servers that use
        GameMaster. Using GameMaster after a change means you accept the new terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        GameMaster is run by {LEGAL.operator}. For questions about these terms, <Contact />.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage
      page="terms"
      title="Terms of Service"
      subtitle="The rules for using GameMaster"
      intro={<p>The short version: GameMaster is free, use it fairly, your server&apos;s moderation is your server&apos;s, and your data is handled as the Privacy Policy says.</p>}
      sections={SECTIONS}
    />
  );
}
