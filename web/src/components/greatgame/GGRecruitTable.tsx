"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GGPerson, GGState, GGTeam } from "@/lib/greatGame/model";
import * as sound from "./ggSound";
import { Avatar, person } from "./ggUi";

/**
 * Step 4's card table. Seven team columns, each with a Round 1 and a Round 2
 * slot; below them the recruits still in the pool lie face-down in a fan.
 * The captain on the clock (or an organizer) points at a card (it lifts on
 * every page) and picks it: it flies up to the middle of the table, hovers,
 * turns over slowly, then settles into the team's slot. The recruit is drawn
 * on the server; the pick only says which face-down card carries it.
 *
 * Everything is in container units of the table (cqh), so it scales with the
 * stage. Timed from the server's draw time, so every page plays the same
 * flight and a page opened mid-flip joins it.
 */

/** The flight of a picked card (ms after the draw). */
export const FLIGHT = { center: 700, flip: 1600, shown: 2500, settle: 3400, landed: 4200 } as const;
/** The last recruit's card, handed over by the same pick, flies after the first lands. */
export const LAST_FLIGHT = { start: 4200, shown: 5300, landed: 6400 } as const;
export const RECRUIT_MS = LAST_FLIGHT.landed;

// Geometry, in cqh of the table.
const CARD_W = 13.5;
const CARD_H = 19.5;
const COL_GAP = 2.2;
const HEAD_H = 4.4;
const ROW_GAP = 1.6;
const TABLE_TOP = 0.5;
const FAN_TOP = 58;
const PIVOT = 90; // from a fan card's top down to the pivot
const STEP_DEG = 5.2;
const CENTER_Y = 31; // the middle of the table, where a picked card turns

const cq = (n: number) => `${n.toFixed(3)}cqh`;

/** The fan card that carries the last recruit (handed over by the same pick): the middle one, unless that was picked. */
function lastCardOf(n: number, picked: number) {
  const mid = Math.floor(n / 2);
  return mid !== picked ? mid : mid + 1 < n ? mid + 1 : Math.max(0, mid - 1);
}

function fanAngle(i: number, n: number) {
  const spread = Math.min(70, (n - 1) * STEP_DEG);
  return n > 1 ? -spread / 2 + (i * spread) / (n - 1) : 0;
}

/** Where fan card i of n sits, relative to the fan's centre card (its centre): x, y in cqh and the angle. */
function fanSpot(i: number, n: number) {
  const a = fanAngle(i, n);
  const r = PIVOT - CARD_H / 2;
  const rad = (a * Math.PI) / 180;
  return { x: r * Math.sin(rad), y: r * (1 - Math.cos(rad)), a };
}

/** A slot's centre relative to the fan's centre card, in cqh. */
function slotSpot(col: number, row: number) {
  const x = (col - 3) * (CARD_W + COL_GAP);
  const top = TABLE_TOP + HEAD_H + row * (CARD_H + ROW_GAP);
  return { x, y: top + CARD_H / 2 - (FAN_TOP + CARD_H / 2) };
}

function CardFront({ who, team, round }: { who: GGPerson | null; team: GGTeam; round: number }) {
  return (
    <div className="gg-rcard-front" style={{ ["--team" as string]: team.color }}>
      <span className="gg-rcard-round">R{round}</span>
      <Avatar id={who?.id} name={who?.name ?? "?"} color={team.color} size={44} />
      <span className="gg-rcard-name">{who?.name ?? "?"}</span>
      <span className="gg-rcard-team">{team.name}</span>
    </div>
  );
}

export default function GGRecruitTable({
  state,
  order,
  now,
  hidden,
  fanCount,
  pickedCard,
  canPick,
  hover,
  onHover,
  onPick,
}: {
  state: GGState;
  /** Teams in pick order (the columns). */
  order: GGTeam[];
  now: number;
  /** Recruits drawn but not landed yet: their slots stay empty. */
  hidden: Set<string>;
  /** Face-down cards in the fan (the pool, counting cards still in flight). */
  fanCount: number;
  /** The card the playing draw came from (it's in flight, not in the fan). */
  pickedCard: number | null;
  canPick: boolean;
  /** The card pointed at (live, from the captain). */
  hover: number | null;
  onHover: (card: number | null) => void;
  onPick: (card: number) => void;
}) {
  const draw = state.last_draw?.kind === "recruit" ? state.last_draw : null;
  const elapsed = draw ? now - draw.at : Infinity;
  const flyRef = useRef<HTMLDivElement | null>(null);
  const flyInnerRef = useRef<HTMLDivElement | null>(null);
  const lastRef = useRef<HTMLDivElement | null>(null);
  const lastInnerRef = useRef<HTMLDivElement | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  // Your own pointer, else the captain's (live).
  const shownHover = mine ?? hover;
  const flying = draw !== null && elapsed < RECRUIT_MS;
  const drawTeam = draw ? state.teams.find((team) => team.id === draw.team) ?? null : null;
  const lastTeam = draw?.then ? state.teams.find((team) => team.id === draw.then?.team) ?? null : null;

  // A tick as the pointed card changes.
  const lastHover = useRef<number | null>(null);
  useEffect(() => {
    if (shownHover !== null && shownHover !== lastHover.current) sound.tick(0.5);
    lastHover.current = shownHover;
  }, [shownHover]);

  // The flight, played from the draw's time (joins mid-way on a late page).
  useLayoutEffect(() => {
    if (!draw || !flying) return undefined;
    const n = fanCount;
    const picked = Math.min(Math.max(0, draw.card ?? Math.floor(n / 2)), Math.max(0, n - 1));
    const from = fanSpot(picked, n);
    const col = Math.max(0, order.findIndex((team) => team.id === draw.team));
    const to = slotSpot(col, (draw.slot ?? 1) - 1);
    const lift = CENTER_Y - (FAN_TOP + CARD_H / 2);
    const big = 2.15;
    const elapsedNow = Math.max(0, elapsed);
    const anims: Animation[] = [];
    const T = FLIGHT.landed;
    anims.push(
      flyRef.current!.animate(
        [
          { offset: 0, transform: `translate(${cq(from.x)}, ${cq(from.y)}) rotate(${from.a}deg) scale(1)`, easing: "cubic-bezier(.3,.7,.3,1)" },
          { offset: FLIGHT.center / T, transform: `translate(0cqh, ${cq(lift)}) rotate(0deg) scale(${big})`, easing: "ease-in-out" },
          { offset: 1150 / T, transform: `translate(0cqh, ${cq(lift - 0.8)}) rotate(-2.5deg) scale(${big})`, easing: "ease-in-out" },
          { offset: FLIGHT.flip / T, transform: `translate(0cqh, ${cq(lift)}) rotate(2deg) scale(${big})`, easing: "ease-in-out" },
          { offset: FLIGHT.shown / T, transform: `translate(0cqh, ${cq(lift)}) rotate(0deg) scale(${big * 1.06})` },
          { offset: FLIGHT.settle / T, transform: `translate(0cqh, ${cq(lift)}) rotate(0deg) scale(${big})`, easing: "cubic-bezier(.5,0,.3,1)" },
          { offset: 1, transform: `translate(${cq(to.x)}, ${cq(to.y)}) rotate(0deg) scale(1)` },
        ],
        { duration: T, fill: "both" },
      ),
    );
    anims.push(
      flyInnerRef.current!.animate(
        [
          { offset: 0, transform: "rotateY(0deg)" },
          { offset: FLIGHT.flip / T, transform: "rotateY(0deg)", easing: "cubic-bezier(.45,0,.2,1)" },
          { offset: FLIGHT.shown / T, transform: "rotateY(180deg)" },
          { offset: 1, transform: "rotateY(180deg)" },
        ],
        { duration: T, fill: "both" },
      ),
    );
    if (draw.then && lastRef.current && lastInnerRef.current) {
      const fromLast = fanSpot(lastCardOf(n, picked), n);
      const lastCol = Math.max(0, order.findIndex((team) => team.id === draw.then?.team));
      const toLast = slotSpot(lastCol, (draw.then.slot ?? 1) - 1);
      const D = LAST_FLIGHT.landed - LAST_FLIGHT.start;
      anims.push(
        lastRef.current.animate(
          [
            { offset: 0, transform: `translate(${cq(fromLast.x)}, ${cq(fromLast.y)}) rotate(${fromLast.a}deg) scale(1)`, opacity: 1, easing: "cubic-bezier(.3,.7,.3,1)" },
            { offset: 0.3, transform: `translate(0cqh, ${cq(lift)}) rotate(0deg) scale(1.7)` },
            { offset: 0.78, transform: `translate(0cqh, ${cq(lift)}) rotate(0deg) scale(1.7)`, easing: "cubic-bezier(.5,0,.3,1)" },
            { offset: 1, transform: `translate(${cq(toLast.x)}, ${cq(toLast.y)}) rotate(0deg) scale(1)`, opacity: 1 },
          ],
          { duration: D, delay: LAST_FLIGHT.start, fill: "both" },
        ),
      );
      anims.push(
        lastInnerRef.current.animate(
          [
            { offset: 0, transform: "rotateY(0deg)" },
            { offset: 0.32, transform: "rotateY(0deg)", easing: "cubic-bezier(.45,0,.2,1)" },
            { offset: 0.5, transform: "rotateY(180deg)" },
            { offset: 1, transform: "rotateY(180deg)" },
          ],
          { duration: D, delay: LAST_FLIGHT.start, fill: "both" },
        ),
      );
    }
    for (const anim of anims) anim.currentTime = elapsedNow;
    // Sounds for a flight that starts while we watch.
    const timers: number[] = [];
    const at = (ms: number, play: () => void) => {
      if (ms >= elapsedNow) timers.push(window.setTimeout(play, ms - elapsedNow));
    };
    at(0, () => sound.whoosh(0.5));
    at(FLIGHT.flip, () => sound.whoosh(0.35));
    at(FLIGHT.shown, () => sound.bell());
    at(FLIGHT.landed - 80, () => sound.thunk());
    if (draw.then) {
      at(LAST_FLIGHT.start, () => sound.whoosh(0.45));
      at(LAST_FLIGHT.shown, () => sound.bell());
      at(LAST_FLIGHT.landed - 80, () => sound.thunk());
    }
    return () => {
      for (const anim of anims) anim.cancel();
      for (const id of timers) window.clearTimeout(id);
    };
    // Restart only for a new draw (or a new deck size).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw?.seq, flying, fanCount]);

  const recruitOf = (team: GGTeam, row: number) => {
    const id = team.recruits[row];
    return id && !hidden.has(id) ? person(state, id) : null;
  };
  const turnTeam = state.turn.team;
  const turnSlot = (state.turn.slot ?? 1) - 1;

  return (
    <div className="gg-rtable" onPointerLeave={() => canPick && (setMine(null), onHover(null))}>
      {/* The slots: a column per team, Round 1 over Round 2. */}
      {/* With the deck gone, the finished table sits in the middle. */}
      <div className={`gg-rtable-cols ${fanCount === 0 && !flying ? "is-done" : ""}`}>
        {order.map((team) => (
          <div key={team.id} className="gg-rtable-col" style={{ ["--team" as string]: team.color }}>
            <div className="gg-rtable-head">{team.name}</div>
            {[0, 1].map((row) => {
              const who = recruitOf(team, row);
              const next = !flying && turnTeam === team.id && turnSlot === row;
              return (
                <div key={row} className={`gg-rslot ${next ? "is-next" : ""} ${who ? "is-filled" : ""}`}>
                  {who ? (
                    <CardFront who={who} team={team} round={row + 1} />
                  ) : (
                    <span className="gg-rslot-empty">
                      R{row + 1}
                      {next && <b>Picks next</b>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* The deck: face-down cards in a fan. */}
      <div className="gg-rfan">
        {Array.from({ length: fanCount }, (_, i) => {
          const spot = fanSpot(i, fanCount);
          const inFlight = flying && (i === pickedCard || (Boolean(draw?.then) && elapsed >= LAST_FLIGHT.start && pickedCard !== null && i === lastCardOf(fanCount, pickedCard)));
          const lifted = !flying && shownHover === i;
          return (
            <button
              key={i}
              type="button"
              disabled={!canPick || flying}
              aria-label={canPick ? `Pick card ${i + 1}` : undefined}
              tabIndex={canPick && !flying ? 0 : -1}
              className={`gg-rcard gg-rcard-back ${lifted ? "is-lifted" : ""} ${canPick && !flying ? "is-pickable" : ""}`}
              style={{
                transform: `rotate(${spot.a}deg) translateY(${lifted ? "-3.6cqh" : "0cqh"})`,
                opacity: inFlight ? 0 : 1,
              }}
              onPointerEnter={() => {
                if (!canPick || flying) return;
                setMine(i);
                onHover(i);
              }}
              onFocus={() => {
                if (!canPick || flying) return;
                setMine(i);
                onHover(i);
              }}
              onClick={() => {
                if (!canPick || flying) return;
                setMine(null);
                onPick(i);
              }}
            />
          );
        })}
      </div>

      {/* The picked card in flight (and the last one, handed over). */}
      {flying && draw && drawTeam && (
        <div ref={flyRef} className="gg-rfly">
          <div ref={flyInnerRef} className="gg-rfly-inner">
            <div className="gg-rcard gg-rcard-back gg-rfly-face" />
            <div className="gg-rfly-face gg-rfly-front">
              <CardFront who={person(state, draw.value)} team={drawTeam} round={draw.slot ?? 1} />
              {elapsed >= FLIGHT.shown - 100 && elapsed < FLIGHT.settle && <span className="gg-rfly-flash" />}
            </div>
          </div>
        </div>
      )}
      {flying && draw?.then && lastTeam && (
        <div ref={lastRef} className="gg-rfly">
          <div ref={lastInnerRef} className="gg-rfly-inner">
            <div className="gg-rcard gg-rcard-back gg-rfly-face" />
            <div className="gg-rfly-face gg-rfly-front">
              <CardFront who={person(state, draw.then.value)} team={lastTeam} round={draw.then.slot ?? 1} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const RECRUIT_GEOMETRY = { CARD_W, CARD_H, FAN_TOP, PIVOT };
