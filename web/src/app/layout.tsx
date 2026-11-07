import type { Metadata } from "next";
import { Big_Shoulders, Big_Shoulders_Stencil, Geist_Mono, Public_Sans } from "next/font/google";
import { Suspense } from "react";
import SkyBackground from "@/components/site/SkyBackground";
import TutorialProvider from "@/components/tutorial/TutorialProvider";
import "./globals.css";

// Public Sans for everything you read; Big Shoulders (condensed) for page
// titles; its stencil cut for the logo only. See docs/branding.md.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
});

const bigShouldersStencil = Big_Shoulders_Stencil({
  variable: "--font-big-shoulders-stencil",
  subsets: ["latin"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GameMaster",
  description: "Hearts of Iron IV multiplayer, run on Discord: calendar, live reservation map, attendance, player records and a game archive.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${bigShoulders.variable} ${bigShouldersStencil.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-night">
        {/* It reads the page's address, so it streams in after prerendering (a build error otherwise). */}
        <Suspense fallback={null}>
          <SkyBackground />
        </Suspense>
        <TutorialProvider>{children}</TutorialProvider>
      </body>
    </html>
  );
}
