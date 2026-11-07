"use client";

import { useTutorialFacts } from "@/components/tutorial/TutorialProvider";
import LandingFooter from "../LandingFooter";
import FeatureShow from "./FeatureShow";
import FrontHero from "./FrontHero";
import { FxProvider } from "./fx";
import SceneClose from "./SceneClose";
import SceneMap from "./SceneMap";
import ScenePromise from "./ScenePromise";
import SceneTrailer from "./SceneTrailer";
import "./front.css";

/**
 * The front page: the war globe, the trailer, the live map playing itself,
 * a slideshow of everything else (the real pages, clicked through), what
 * GameMaster won't do, then the call to add it. Binary glitches tie the
 * pieces together (fx.tsx).
 */
export default function FrontPage() {
  // No tours here, and the Help button would sit on the map demo.
  useTutorialFacts({ helpHidden: true });
  return (
    <FxProvider>
      <div className="min-h-screen w-full text-ink-100">
        <FrontHero />
        <main id="story">
          <SceneTrailer number={1} />
          <SceneMap number={2} />
          <FeatureShow number={3} />
          <ScenePromise />
          <SceneClose />
        </main>
        <LandingFooter />
      </div>
    </FxProvider>
  );
}
