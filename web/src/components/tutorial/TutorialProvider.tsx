"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import HelpButton from "./HelpButton";
import TutorialOverlay from "./TutorialOverlay";
import { TOURS, TOURS_BY_ID, TOUR_IDS } from "./tours";
import {
  EMPTY_PROGRESS,
  fetchAccountProgress,
  hasSeen,
  mergeProgress,
  readLocal,
  sameProgress,
  saveAccountProgress,
  writeLocal,
} from "./progress";
import { anchorOf, foreignDialogOpen, targetVisible } from "./dom";
import type { Tour, TourStatus, TutorialFacts, TutorialProgress } from "./types";

/**
 * Runs the guided tours (docs/tutorial.md): loads who has seen what, starts a
 * due tour once its page is ready and nothing else is open, and saves the
 * result. Sits in the root layout, so every page has it.
 */

interface ActiveTour {
  tourId: string;
  index: number;
  /** Direction of travel, so a step that can't show is passed the right way. */
  dir: 1 | -1;
  /** Steps actually shown so far (the step counter). */
  seen: number[];
}

interface TutorialActions {
  setFacts: (owner: string, facts: TutorialFacts | null) => void;
  start: (tourId: string) => void;
  setAutoStart: (on: boolean) => void;
  resetAll: () => void;
}

interface TutorialState {
  facts: TutorialFacts;
  progress: TutorialProgress | null;
  loggedIn: boolean;
  activeTourId: string | null;
  /** Tours that belong on this page for this viewer (the ❓ menu). */
  pageTours: Tour[];
}

const ActionsContext = createContext<TutorialActions | null>(null);
const StateContext = createContext<TutorialState | null>(null);

/** sessionStorage: a tour to start when its page opens (chained tours, menu picks). */
const PENDING_KEY = "gm_tutorial_pending";
const PENDING_TTL_MS = 30_000;
/** A page must have been open this long before a tour starts by itself. */
const SETTLE_MS = 1200;
/** Quiet time after a tour ends before another may start. */
const GAP_MS = 1500;

function readPending(): { tour: string; at: number } | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { tour?: unknown; at?: unknown };
    return typeof value.tour === "string" && typeof value.at === "number" ? { tour: value.tour, at: value.at } : null;
  } catch {
    return null;
  }
}

function writePending(tour: string | null): void {
  try {
    if (tour) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ tour, at: Date.now() }));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the chained tour just won't start by itself.
  }
}

function factOk(tour: Tour, facts: TutorialFacts): boolean {
  return tour.when ? tour.when(facts) : true;
}

/** Tours of this page the viewer can use now (menu list and auto-start pool). */
function toursFor(path: string, facts: TutorialFacts): Tour[] {
  return TOURS.filter(
    (tour) =>
      tour.paths.includes(path) &&
      factOk(tour, facts) &&
      (typeof tour.auto === "object" ? Boolean(facts[tour.auto.fact]) : true),
  );
}

export default function TutorialProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const [factsByOwner, setFactsByOwner] = useState<Record<string, TutorialFacts>>({});
  const facts = useMemo<TutorialFacts>(() => Object.assign({}, ...Object.values(factsByOwner)), [factsByOwner]);
  const [progress, setProgress] = useState<TutorialProgress | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [active, setActive] = useState<ActiveTour | null>(null);

  const progressRef = useRef<TutorialProgress | null>(null);
  const loggedInRef = useRef(false);
  const factsRef = useRef<TutorialFacts>({});
  const pathRef = useRef(pathname);
  const quietUntilRef = useRef(0);

  useEffect(() => {
    factsRef.current = facts;
  }, [facts]);

  useEffect(() => {
    pathRef.current = pathname;
    quietUntilRef.current = Math.max(quietUntilRef.current, Date.now() + SETTLE_MS);
  }, [pathname]);

  // Load: the account's record (merged with this browser's) or this browser's.
  useEffect(() => {
    let cancelled = false;
    const local = readLocal(TOUR_IDS);
    void fetchAccountProgress(TOUR_IDS).then(({ loggedIn: isLoggedIn, progress: account }) => {
      if (cancelled) return;
      let next: TutorialProgress = local ?? { ...EMPTY_PROGRESS, tours: {} };
      if (isLoggedIn) {
        next = account ? mergeProgress(account, next) : next;
        if (!account || !sameProgress(account, next)) saveAccountProgress(next);
      }
      writeLocal(next);
      progressRef.current = next;
      loggedInRef.current = isLoggedIn;
      setLoggedIn(isLoggedIn);
      setProgress(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback((update: (current: TutorialProgress) => TutorialProgress) => {
    const current = progressRef.current;
    if (!current) return;
    const next = update(current);
    progressRef.current = next;
    setProgress(next);
    writeLocal(next);
    if (loggedInRef.current) saveAccountProgress(next);
  }, []);

  const mark = useCallback(
    (tour: Tour, status: TourStatus) => {
      commit((current) => ({
        ...current,
        tours: { ...current.tours, [tour.id]: { status, version: tour.version, at: Math.floor(Date.now() / 1000) } },
      }));
    },
    [commit],
  );

  const setFacts = useCallback((owner: string, next: TutorialFacts | null) => {
    setFactsByOwner((current) => {
      if (next === null) {
        if (!(owner in current)) return current;
        const rest = { ...current };
        delete rest[owner];
        return rest;
      }
      if (JSON.stringify(current[owner]) === JSON.stringify(next)) return current;
      return { ...current, [owner]: next };
    });
  }, []);

  const start = useCallback(
    (tourId: string) => {
      const tour = TOURS_BY_ID.get(tourId);
      if (!tour) return;
      if (tour.paths.includes(pathRef.current)) {
        writePending(null);
        setActive({ tourId, index: 0, dir: 1, seen: [] });
      } else {
        writePending(tourId);
        router.push(tour.paths[0]);
      }
    },
    [router],
  );

  const setAutoStart = useCallback((on: boolean) => commit((current) => ({ ...current, autoStart: on })), [commit]);
  const resetAll = useCallback(() => commit((current) => ({ ...current, tours: {} })), [commit]);

  // Start a due tour once its page is settled, its controls are there and no
  // pop-up is open. Polled: pages fill in after loading.
  useEffect(() => {
    if (!progress || active) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() < quietUntilRef.current) return;
      if (foreignDialogOpen()) return;
      const path = pathRef.current;
      const currentFacts = factsRef.current;

      const pending = readPending();
      if (pending) {
        const tour = TOURS_BY_ID.get(pending.tour);
        if (!tour || Date.now() - pending.at > PENDING_TTL_MS) {
          writePending(null);
        } else if (tour.paths.includes(path) && targetVisible(anchorOf(tour))) {
          writePending(null);
          setActive({ tourId: tour.id, index: 0, dir: 1, seen: [] });
          return;
        } else {
          return;
        }
      }

      const current = progressRef.current;
      if (!current?.autoStart) return;
      const due = toursFor(path, currentFacts)
        .filter(
          (tour) =>
            tour.auto !== "manual" &&
            !hasSeen(current, tour) &&
            (tour.after ?? []).every((id) => {
              const before = TOURS_BY_ID.get(id);
              return !before || hasSeen(current, before);
            }),
        )
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      const tour = due.find((candidate) => targetVisible(anchorOf(candidate)));
      if (tour) setActive({ tourId: tour.id, index: 0, dir: 1, seen: [] });
    }, 700);
    return () => window.clearInterval(timer);
  }, [progress, active]);

  // Leaving the page ends the tour (it isn't marked, so it can come back).
  const activeTour = active ? (TOURS_BY_ID.get(active.tourId) ?? null) : null;
  const [activePath, setActivePath] = useState(pathname);
  if (activePath !== pathname) {
    setActivePath(pathname);
    if (activeTour && !activeTour.paths.includes(pathname)) setActive(null);
  }

  const finish = useCallback(
    (status: TourStatus) => {
      if (!activeTour) return;
      mark(activeTour, status);
      setActive(null);
      quietUntilRef.current = Date.now() + GAP_MS;
      if (status === "done" && activeTour.next) {
        writePending(activeTour.next.tour);
        router.push(activeTour.next.href);
      }
    },
    [activeTour, mark, router],
  );

  const go = useCallback(
    (index: number, dir: 1 | -1) => {
      if (!activeTour) return;
      if (index < 0) {
        setActive((current) => (current ? { ...current, index: 0, dir: 1 } : current));
      } else if (index >= activeTour.steps.length) {
        finish("done");
      } else {
        setActive((current) => (current ? { ...current, index, dir } : current));
      }
    },
    [activeTour, finish],
  );

  const markShown = useCallback((index: number) => {
    setActive((current) =>
      current && !current.seen.includes(index) ? { ...current, seen: [...current.seen, index] } : current,
    );
  }, []);

  const actions = useMemo<TutorialActions>(
    () => ({ setFacts, start, setAutoStart, resetAll }),
    [setFacts, start, setAutoStart, resetAll],
  );
  const pageTours = useMemo(() => toursFor(pathname, facts), [pathname, facts]);
  const state = useMemo<TutorialState>(
    () => ({ facts, progress, loggedIn, activeTourId: active?.tourId ?? null, pageTours }),
    [facts, progress, loggedIn, active, pageTours],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        {children}
        {progress && <HelpButton />}
        {active && activeTour && (
          <TutorialOverlay
            key={`${active.tourId}:${active.index}`}
            tour={activeTour}
            index={active.index}
            dir={active.dir}
            seenBefore={active.seen.filter((step) => step < active.index).length}
            facts={facts}
            onGo={go}
            onShown={markShown}
            onClose={() => finish("skipped")}
            onTurnOff={() => {
              setAutoStart(false);
              finish("skipped");
            }}
          />
        )}
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useTutorialActions(): TutorialActions | null {
  return useContext(ActionsContext);
}

export function useTutorialState(): TutorialState | null {
  return useContext(StateContext);
}

/**
 * Tell the tours about this page: `useTutorialFacts({ isHost, draftOpen })`.
 * Facts drop when the component unmounts.
 */
export function useTutorialFacts(facts: TutorialFacts): void {
  const actions = useContext(ActionsContext);
  const owner = useId();
  const key = JSON.stringify(facts);
  useEffect(() => {
    actions?.setFacts(owner, JSON.parse(key) as TutorialFacts);
  }, [actions, owner, key]);
  useEffect(() => () => actions?.setFacts(owner, null), [actions, owner]);
}
