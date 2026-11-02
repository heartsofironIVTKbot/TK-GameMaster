/**
 * Guided tours (docs/tutorial.md). A tour is plain data: the engine in
 * TutorialProvider / TutorialOverlay runs it. Pages mark controls with
 * `data-tour="name"` (several names separated by spaces are fine) and report
 * facts with `useTutorialFacts`.
 */

/** What pages report: is this viewer a host, is a draft game open, … */
export type TutorialFacts = Record<string, boolean | undefined>;

export type Placement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** `data-tour` name to light up. Several matching elements are lit as one box. None = a card in the middle. */
  target?: string;
  title: string;
  /** Paragraphs separated by a blank line; **bold** works. */
  body: string;
  /** Preferred side for the card (it moves if there's no room). */
  placement?: Placement;
  /** Show this step only when it returns true. */
  when?: (facts: TutorialFacts) => boolean;
  /**
   * The target isn't on the page (after a short wait): "skip" the step
   * (default) or show it in the "center" with `missingBody` instead.
   */
  missing?: "skip" | "center";
  missingBody?: string;
  /**
   * A try-it step: the tour moves on when the viewer does it. Clicks inside
   * the lit area reach the page. Next still works.
   *   click    — clicking the target
   *   fact     — a page fact turning true (e.g. "nationSelected")
   *   selector — an element appearing (e.g. the day panel)
   */
  waitFor?: { click: true } | { fact: string } | { selector: string };
  /** Let clicks through to the lit control without waiting for anything. */
  interactive?: boolean;
  /** Extra space around the lit box, in pixels (default 8). */
  padding?: number;
}

export interface Tour {
  id: string;
  /** Raise to show the tour again to everyone who finished an older version. */
  version: number;
  title: string;
  /** One line for the ❓ menu. */
  summary: string;
  /** Pages it runs on: exact pathnames, or "/section/*" for any page under /section/. */
  paths: string[];
  /** Offer and auto-start only when this is true (e.g. hosts only). */
  when?: (facts: TutorialFacts) => boolean;
  /**
   * When it starts by itself: "visit" = the first time its page is open;
   * { fact } = the first time that fact is true on its page; "manual" = never.
   */
  auto: "visit" | { fact: string } | "manual";
  /** Start by itself only after these tours were finished or skipped. */
  after?: string[];
  /** Higher starts first when several are due. */
  priority?: number;
  /** `data-tour` name that must be on the page before the tour starts (default: the first step's target). */
  anchor?: string;
  /** After the last step: open another page and carry on with this tour there. */
  next?: { tour: string; href: string; label: string };
  steps: TourStep[];
}

export type TourStatus = "done" | "skipped";

export interface TourRecord {
  status: TourStatus;
  version: number;
  /** Epoch seconds. */
  at: number;
}

export interface TutorialProgress {
  /** Start tours by themselves (the ❓ menu switch). */
  autoStart: boolean;
  tours: Record<string, TourRecord>;
}
