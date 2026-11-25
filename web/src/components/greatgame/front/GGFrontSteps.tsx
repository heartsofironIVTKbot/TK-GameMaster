"use client";

import { Ban, Crosshair, Layers, Lock, Orbit, Pause, Play, Rows3, Ticket, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PHASES } from "@/lib/greatGame/model";
import type { GGPublic } from "@/lib/greatGame/public";

/**
 * "The draft, step by step" on the front page: a broadcast monitor plays a
 * short animated demo of each step (the drum catching a ball, the reel
 * landing, a ticket being scratched, a card flipping, a ban stamped, the
 * snake draft filling up, players dragged onto nations, the seed checked),
 * with subtitles, while a playlist on the side moves through the eight steps.
 *
 * Every scene is drawn from `t` (milliseconds into the step) alone, so it can
 * pause, jump and show a still last frame for viewers who asked for reduced
 * motion. The names are an example, not the real draw.
 */

const STEP_MS = 7600;

// ---------- Example data ----------

const TEAMS = [
  { name: "Red Steppe", color: "#ff7a1a", captain: "Kodiak" },
  { name: "Liberty Bells", color: "#3d7bff", captain: "Maverick" },
  { name: "Iron Wolves", color: "#efe7d4", captain: "Steelhelm" },
  { name: "Les Lions", color: "#1fd49a", captain: "Valmy" },
  { name: "Royal Tides", color: "#b4ec3f", captain: "Tidewater" },
  { name: "Kaiten Corps", color: "#9b5de5", captain: "Kaiten" },
  { name: "Underdogs", color: "#e0465a", captain: "Underdog" },
];

const MAJORS: [string, string][] = [
  ["SOV", "Soviet Union"],
  ["USA", "USA"],
  ["GER", "Germany"],
  ["FRA", "France"],
  ["ENG", "United Kingdom"],
  ["JAP", "Japan"],
  ["ITA", "Italy"],
];

const MINORS: [string, string][] = [
  ["POL", "Poland"],
  ["CZE", "Czechoslovakia"],
  ["ROM", "Romania"],
  ["HUN", "Hungary"],
  ["YUG", "Yugoslavia"],
  ["SPR", "Spain"],
  ["TUR", "Turkey"],
  ["SWE", "Sweden"],
  ["CAN", "Canada"],
  ["MEX", "Mexico"],
  ["GRE", "Greece"],
  ["FIN", "Finland"],
  ["BRA", "Brazil"],
  ["ARG", "Argentina"],
  ["CHI", "China"],
  ["IRQ", "Iraq"],
  ["PER", "Iran"],
  ["BUL", "Bulgaria"],
  ["NOR", "Norway"],
  ["HOL", "Netherlands"],
  ["MAN", "Manchuria"],
];

/** The example night: who got which major (by major, strongest first), the drum order, the bans, the picks. */
const TEAM_OF_MAJOR = [0, 1, 3, 2, 5, 4, 6];
const DRUM_ORDER = [0, 1, 3, 2, 5, 4, 6];
const BANNED = ["FIN", "POL", "CAN"];
const DRAFT_POOL: [string, string][] = [
  ...MINORS.filter(([tag]) => !BANNED.includes(tag)),
  ["AUS", "Austria"],
  ["BEL", "Belgium"],
  ["DEN", "Denmark"],
];
/** Draft columns: the majors weakest first (Italy … Soviet Union). */
const DRAFT_ORDER = [6, 5, 4, 3, 2, 1, 0];
const draftCell = (k: number) => {
  const r = Math.floor(k / 7);
  const j = k % 7;
  return { r, j: r % 2 ? 6 - j : j };
};
/** The three minors a team picks in the example draft. */
const picksOf = (team: number) =>
  Array.from({ length: 21 }, (_, k) => k)
    .filter((k) => TEAM_OF_MAJOR[DRAFT_ORDER[draftCell(k).j]] === team)
    .map((k) => DRAFT_POOL[k]);
const majorOf = (team: number) => MAJORS[TEAM_OF_MAJOR.indexOf(team)];

// ---------- Small helpers ----------

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const easeBack = (p: number) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** The point a share `p` of the way along a polyline (by distance). */
function along(points: [number, number][], p: number): [number, number] {
  const lengths = points.slice(1).map((pt, i) => Math.hypot(pt[0] - points[i][0], pt[1] - points[i][1]));
  let left = clamp(p) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? clamp(left / lengths[i]) : 0;
      return [lerp(points[i][0], points[i + 1][0], f), lerp(points[i][1], points[i + 1][1], f)];
    }
    left -= lengths[i];
  }
  return points[points.length - 1];
}

function Flag({ tag, x, y, w, h }: { tag: string; x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <image href={`/assets_rt56/flags/${tag}.png`} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={0.8} />
    </g>
  );
}

/** A slammed stamp (BANNED, LINE-UP SET): drops from big to size with a bounce. */
function Stamp({ x, y, text, color, p, size = 22, angle = -12 }: { x: number; y: number; text: string; color: string; p: number; size?: number; angle?: number }) {
  if (p <= 0) return null;
  const s = lerp(2.2, 1, easeOut(clamp(p * 1.6)));
  const width = text.length * size * 0.62 + 22;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`} opacity={clamp(p * 3)}>
      <rect x={-width / 2} y={-size * 0.85} width={width} height={size * 1.7} rx={5} fill="rgba(20,4,12,.55)" stroke={color} strokeWidth={3} />
      <text x={0} y={size * 0.36} textAnchor="middle" className="ggfs-t" fontSize={size} fill={color} letterSpacing="0.06em">
        {text}
      </text>
    </g>
  );
}

function Cursor({ x, y, press = 0 }: { x: number; y: number; press?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${1 - press * 0.18})`}>
      <path d="M0 0 L0 22 L6 16.5 L10 26 L14 24 L10 15 L18 15 Z" fill="#fff" stroke="#120626" strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );
}

// ---------- The scenes ----------

/** 1 · The lottery drum: balls tumble, one is caught, rises up the tube and takes the next place. */
function DrumScene({ t }: { t: number }) {
  const C = { x: 225, y: 222 };
  const R = 132;
  const draws = [
    { team: DRUM_ORDER[0], at: 1100 },
    { team: DRUM_ORDER[1], at: 3000 },
    { team: DRUM_ORDER[2], at: 4900 },
  ];
  const DUR = 1400;
  const slotY = (k: number) => 64 + k * 44;
  const tumble = (i: number, time: number): [number, number] => {
    const angle = time * 0.0021 * (1 + i * 0.13) + i * 0.9;
    const rho = R * 0.6 * (0.5 + 0.5 * Math.sin(time * 0.0017 * (1 + i * 0.07) + i * 2.1));
    // Rounded: the server and the browser can differ in the last digit of sin/cos (a hydration mismatch).
    return [Math.round((C.x + rho * Math.cos(angle)) * 10) / 10, Math.round((C.y + 12 + rho * Math.sin(angle) * 0.92) * 10) / 10];
  };
  return (
    <g>
      <defs>
        <radialGradient id="ggfs-glass" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="rgba(180,220,255,.28)" />
          <stop offset="0.6" stopColor="rgba(90,60,200,.12)" />
          <stop offset="1" stopColor="rgba(255,43,214,.25)" />
        </radialGradient>
      </defs>
      {/* Stand and tube. */}
      <path d={`M${C.x - 70} ${C.y + R + 40} L${C.x - 40} ${C.y + R - 6} L${C.x + 40} ${C.y + R - 6} L${C.x + 70} ${C.y + R + 40} Z`} fill="#1c1236" stroke="#ff2bd6" strokeOpacity={0.6} />
      <path d={`M${C.x} ${C.y - R} L${C.x} 46 Q${C.x} 30 ${C.x + 16} 30 L432 30 Q450 30 450 48 L450 ${slotY(6) + 16}`} fill="none" stroke="rgba(120,200,255,.28)" strokeWidth={30} strokeLinecap="round" />
      <path d={`M${C.x} ${C.y - R} L${C.x} 46 Q${C.x} 30 ${C.x + 16} 30 L432 30 Q450 30 450 48 L450 ${slotY(6) + 16}`} fill="none" stroke="rgba(160,230,255,.5)" strokeWidth={1.5} />
      <circle cx={C.x} cy={C.y} r={R} fill="url(#ggfs-glass)" stroke="#7ff3ff" strokeWidth={2.5} style={{ filter: "drop-shadow(0 0 10px rgba(34,229,255,.5))" }} />
      {/* The order rail. */}
      <text x={470} y={44} className="ggfs-d" fontSize={11} fill="#22e5ff" letterSpacing="0.16em">
        CAPTAIN ORDER
      </text>
      {TEAMS.map((_, k) => {
        const drawn = draws[k] && t >= draws[k].at + DUR;
        const team = draws[k] ? TEAMS[draws[k].team] : null;
        return (
          <g key={k}>
            <rect x={462} y={slotY(k)} width={228} height={36} rx={8} fill={drawn ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)"} stroke={drawn && team ? team.color : "rgba(255,255,255,.12)"} />
            <text x={478} y={slotY(k) + 23} className="ggfs-d" fontSize={13} fill="#8d80b8">
              {k + 1}
            </text>
            {drawn && team ? (
              <g opacity={seg(t, draws[k].at + DUR, draws[k].at + DUR + 300)}>
                <text x={530} y={slotY(k) + 24} className="ggfs-t" fontSize={19} fill={team.color}>
                  {team.name.toUpperCase()}
                </text>
              </g>
            ) : (
              <text x={530} y={slotY(k) + 23} className="ggfs-b" fontSize={12} fill="#5b5080">
                in the drum
              </text>
            )}
          </g>
        );
      })}
      {/* The balls. */}
      {TEAMS.map((team, i) => {
        const d = draws.findIndex((draw) => draw.team === i);
        let pos = tumble(i, t);
        if (d >= 0 && t >= draws[d].at) {
          const p = seg(t, draws[d].at, draws[d].at + DUR);
          const start = tumble(i, draws[d].at);
          pos = along(
            [start, [C.x, C.y - R + 22], [C.x, 46], [C.x + 16, 30], [432, 30], [450, 48], [450, slotY(d) + 18], [488, slotY(d) + 18]],
            easeInOut(p),
          );
        }
        return (
          <g key={team.name} transform={`translate(${pos[0]} ${pos[1]})`}>
            <circle r={15} fill={team.color} stroke="rgba(0,0,0,.35)" />
            <circle r={6} cx={-5} cy={-5} fill="rgba(255,255,255,.45)" />
            <text y={5} textAnchor="middle" className="ggfs-t" fontSize={14} fill="#120626">
              {team.captain[0]}
            </text>
          </g>
        );
      })}
      {/* The Draw button, pressed for each catch. */}
      {(() => {
        const press = draws.some((draw) => t > draw.at - 220 && t < draw.at + 80) ? 1 : 0;
        return (
          <g transform={`translate(${C.x} ${C.y + R + 22}) scale(${1 - press * 0.08})`}>
            <rect x={-46} y={-14} width={92} height={28} rx={14} fill="#ff2bd6" style={{ filter: `drop-shadow(0 0 ${press ? 18 : 8}px #ff2bd6)` }} />
            <text y={6} textAnchor="middle" className="ggfs-t" fontSize={16} fill="#fff">
              DRAW
            </text>
          </g>
        );
      })()}
    </g>
  );
}

/** 2 · The reel: majors scroll past and land; the result joins the list. */
function ReelScene({ t }: { t: number }) {
  const left = MAJORS.slice(2);
  const target = 0; // Germany
  const H = 66;
  const loops = 5;
  const p = easeOut(seg(t, 500, 3900));
  const offset = p * (loops * left.length + target) * H;
  const landed = t >= 3950;
  const flash = seg(t, 3900, 4500);
  const items = Array.from({ length: loops * left.length + 4 }, (_, n) => n);
  const centre = 202;
  return (
    <g>
      <defs>
        <clipPath id="ggfs-reel">
          <rect x={250} y={58} width={220} height={288} rx={10} />
        </clipPath>
        <linearGradient id="ggfs-reel-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c0520" stopOpacity="1" />
          <stop offset="0.25" stopColor="#0c0520" stopOpacity="0" />
          <stop offset="0.75" stopColor="#0c0520" stopOpacity="0" />
          <stop offset="1" stopColor="#0c0520" stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* Who spins. */}
      <rect x={34} y={120} width={186} height={170} rx={14} fill="rgba(31,212,154,.1)" stroke="#1fd49a" strokeWidth={2} />
      <text x={127} y={152} textAnchor="middle" className="ggfs-d" fontSize={10.5} fill="#1fd49a" letterSpacing="0.16em">
        NOW SPINNING
      </text>
      <text x={127} y={188} textAnchor="middle" className="ggfs-t" fontSize={26} fill="#fff">
        LES LIONS
      </text>
      <text x={127} y={212} textAnchor="middle" className="ggfs-b" fontSize={13} fill="#c3b6e8">
        Captain Valmy
      </text>
      {landed ? (
        <g opacity={flash}>
          <Flag tag="GER" x={97} y={230} w={60} h={39} />
        </g>
      ) : (
        <text x={127} y={262} textAnchor="middle" className="ggfs-t" fontSize={40} fill="#1fd49a" opacity={0.6 + 0.4 * Math.sin(t / 120)}>
          ?
        </text>
      )}
      {/* The reel. */}
      <rect x={244} y={52} width={232} height={300} rx={14} fill="#0c0520" stroke="#ff2bd6" strokeWidth={2.5} style={{ filter: "drop-shadow(0 0 10px rgba(255,43,214,.5))" }} />
      <g clipPath="url(#ggfs-reel)">
        {items.map((n) => {
          const [tag, name] = left[n % left.length];
          const y = centre - H / 2 - n * H + offset;
          if (y < 0 || y > 405) return null;
          const hit = landed && n === loops * left.length + target;
          return (
            <g key={n} transform={hit ? `translate(360 ${y + H / 2}) scale(${1 + 0.06 * Math.sin(flash * Math.PI)}) translate(-360 ${-(y + H / 2)})` : undefined}>
              <rect x={262} y={y + 6} width={196} height={H - 12} rx={8} fill={hit ? "rgba(255,210,63,.18)" : "rgba(255,255,255,.05)"} stroke={hit ? "#ffd23f" : "rgba(255,255,255,.12)"} />
              <Flag tag={tag} x={276} y={y + 19} w={40} h={26} />
              <text x={328} y={y + 40} className="ggfs-t" fontSize={20} fill="#fff">
                {name.toUpperCase()}
              </text>
            </g>
          );
        })}
        <rect x={250} y={58} width={220} height={288} fill="url(#ggfs-reel-fade)" />
      </g>
      <path d={`M240 ${centre - 12} L254 ${centre} L240 ${centre + 12} Z M480 ${centre - 12} L466 ${centre} L480 ${centre + 12} Z`} fill="#ffd23f" />
      {/* The majors so far. */}
      <text x={500} y={62} className="ggfs-d" fontSize={10.5} fill="#22e5ff" letterSpacing="0.16em">
        MAJORS
      </text>
      {[
        ["Red Steppe", "#ff7a1a", "SOV"],
        ["Liberty Bells", "#3d7bff", "USA"],
        ["Les Lions", "#1fd49a", landed ? "GER" : null],
        ["Iron Wolves", "#efe7d4", null],
      ].map(([name, color, tag], k) => (
        <g key={name}>
          <rect x={496} y={74 + k * 40} width={196} height={32} rx={7} fill="rgba(255,255,255,.04)" stroke={k === 2 && !landed ? "#1fd49a" : "rgba(255,255,255,.1)"} />
          <text x={508} y={95 + k * 40} className="ggfs-t" fontSize={15} fill={color as string}>
            {(name as string).toUpperCase()}
          </text>
          {tag ? <Flag tag={tag as string} x={650} y={81 + k * 40} w={30} h={19} /> : <text x={666} y={95 + k * 40} textAnchor="middle" className="ggfs-b" fontSize={12} fill="#5b5080">{k === 2 ? "…" : "—"}</text>}
        </g>
      ))}
      <text x={500} y={258} className="ggfs-d" fontSize={10.5} fill="#8d80b8" letterSpacing="0.16em">
        STILL ON THE REEL
      </text>
      {left
        .filter(([tag]) => !(landed && tag === "GER"))
        .map(([tag], k) => (
          <Flag key={tag} tag={tag} x={500 + k * 38} y={270} w={32} h={21} />
        ))}
    </g>
  );
}

/** 3 · The scratch ticket: a coin scratches the foil away row by row; the vice-captain shows. */
function ScratchScene({ t }: { t: number }) {
  const zig: [number, number][] = [];
  for (let r = 0; r < 7; r++) {
    const y = 132 + r * 27;
    zig.push(r % 2 ? [474, y] : [246, y], r % 2 ? [246, y + 13] : [474, y + 13]);
  }
  const p = seg(t, 700, 4300);
  const gone = seg(t, 4300, 4800);
  const [cx, cy] = along(zig, p);
  const pts = zig.map(([x, y]) => `${x} ${y}`).join(" L");
  return (
    <g>
      <defs>
        <linearGradient id="ggfs-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8e6f2" />
          <stop offset="0.45" stopColor="#9fa2b6" />
          <stop offset="0.55" stopColor="#d8d9e4" />
          <stop offset="1" stopColor="#8a8ca0" />
        </linearGradient>
        <mask id="ggfs-scratch">
          <rect x={0} y={0} width={720} height={405} fill="#fff" />
          <path d={`M${pts}`} fill="none" stroke="#000" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
        </mask>
      </defs>
      {/* Other teams' tickets, for scale. */}
      {[0, 1, 3].map((k, row) => {
        const team = TEAMS[DRUM_ORDER[k]];
        return (
          <g key={k} opacity={0.55}>
            <rect x={30} y={80 + row * 92} width={130} height={78} rx={10} fill="#1a1030" stroke={team.color} />
            <text x={95} y={108 + row * 92} textAnchor="middle" className="ggfs-t" fontSize={13} fill={team.color}>
              {team.name.toUpperCase()}
            </text>
            <text x={95} y={132 + row * 92} textAnchor="middle" className="ggfs-b" fontSize={12} fill="#c3b6e8">
              {row < 2 ? "✓ revealed" : "scratches next"}
            </text>
          </g>
        );
      })}
      {/* The ticket. */}
      <g>
        <rect x={210} y={52} width={300} height={300} rx={16} fill="#1a1030" stroke="#1fd49a" strokeWidth={2.5} style={{ filter: "drop-shadow(0 0 14px rgba(31,212,154,.45))" }} />
        <text x={360} y={86} textAnchor="middle" className="ggfs-d" fontSize={11} fill="#1fd49a" letterSpacing="0.16em">
          VICE-CAPTAIN · LES LIONS
        </text>
        {/* Under the foil. */}
        <g opacity={0.4 + 0.6 * gone}>
          <circle cx={360} cy={180} r={38} fill="#1fd49a" opacity={0.25} />
          <circle cx={360} cy={180} r={30} fill="#5865f2" />
          <text x={360} y={188} textAnchor="middle" className="ggfs-t" fontSize={22} fill="#fff">
            PP
          </text>
          <text x={360} y={250} textAnchor="middle" className="ggfs-t" fontSize={30} fill="#fff">
            PIXELPANZER
          </text>
          <text x={360} y={274} textAnchor="middle" className="ggfs-b" fontSize={13} fill="#c3b6e8">
            Content creator
          </text>
        </g>
        <g mask="url(#ggfs-scratch)" opacity={1 - gone}>
          <rect x={232} y={112} width={256} height={196} rx={10} fill="url(#ggfs-foil)" />
          <text x={360} y={222} textAnchor="middle" className="ggfs-t" fontSize={40} fill="#6f7186" letterSpacing="0.08em">
            SCRATCH
          </text>
        </g>
        {gone > 0 &&
          Array.from({ length: 10 }, (_, k) => {
            const a = (k / 10) * Math.PI * 2;
            const r = 60 + gone * 70;
            return <circle key={k} cx={360 + Math.cos(a) * r} cy={200 + Math.sin(a) * r * 0.8} r={3 * (1 - gone) + 1} fill={k % 2 ? "#ffd23f" : "#1fd49a"} opacity={1 - gone} />;
          })}
      </g>
      {/* The coin. */}
      {p > 0 && p < 1 && (
        <g transform={`translate(${cx} ${cy})`}>
          <circle r={14} fill="#ffd23f" stroke="#a7781a" strokeWidth={2} style={{ filter: "drop-shadow(0 0 6px rgba(255,210,63,.8))" }} />
          <circle r={8} fill="none" stroke="#a7781a" strokeWidth={1.2} />
        </g>
      )}
      <g transform="translate(560 120)">
        <rect width={130} height={56} rx={10} fill="rgba(255,59,92,.12)" stroke="rgba(255,59,92,.6)" />
        <circle cx={18} cy={28} r={5} fill="#ff3b5c" opacity={0.5 + 0.5 * Math.sin(t / 160)} />
        <text x={32} y={25} className="ggfs-d" fontSize={10.5} fill="#fff" letterSpacing="0.12em">
          LIVE FOR
        </text>
        <text x={32} y={42} className="ggfs-d" fontSize={10.5} fill="#fff" letterSpacing="0.12em">
          EVERYONE
        </text>
      </g>
    </g>
  );
}

/** 4 · The recruit cards: a face-down card is picked from the fan, flies over and flips. */
function CardsScene({ t }: { t: number }) {
  const picks = [
    { card: 7, team: 2, name: "Oberst", at: 700 },
    { card: 3, team: 3, name: "Ironsides", at: 3900 },
  ];
  const slot = (team: number) => ({ x: 44 + team * 93, y: 70 });
  const filled = ["Verdun", "Halftrack"];
  const fan = (k: number) => {
    const a = (-34 + (68 * k) / 13) * (Math.PI / 180);
    return { x: 360 + Math.sin(a) * 250, y: 560 - Math.cos(a) * 250, r: (a * 180) / Math.PI };
  };
  const left = 14 - picks.filter((pick) => t >= pick.at + 1900).length;
  const W = 60;
  const H = 84;
  const back = (x: number, y: number, r: number, glow = 0, key?: string) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={7} fill="#2a1450" stroke={glow ? "#ffd23f" : "#ff2bd6"} strokeWidth={glow ? 2.5 : 1.5} style={glow ? { filter: "drop-shadow(0 0 10px #ffd23f)" } : undefined} />
      <rect x={-W / 2 + 6} y={-H / 2 + 6} width={W - 12} height={H - 12} rx={4} fill="none" stroke="rgba(34,229,255,.35)" />
      <text y={6} textAnchor="middle" className="ggfs-t" fontSize={17} fill="#ff6fd8">
        GG
      </text>
    </g>
  );
  return (
    <g>
      {/* The teams' first-round slots. */}
      {DRUM_ORDER.map((index, i) => {
        const team = TEAMS[index];
        const s = slot(i);
        const done = i < 2 ? filled[i] : picks.find((pick) => pick.team === i && t >= pick.at + 1900)?.name;
        return (
          <g key={team.name}>
            <text x={s.x + W / 2} y={44} textAnchor="middle" className="ggfs-t" fontSize={12} fill={team.color}>
              {team.name.toUpperCase()}
            </text>
            <rect x={s.x} y={s.y - H / 2 + 24} width={W} height={H} rx={7} fill={done ? "rgba(255,255,255,.06)" : "none"} stroke={done ? team.color : "rgba(255,255,255,.18)"} strokeDasharray={done ? undefined : "4 4"} />
            <text x={s.x + W / 2} y={s.y + 30} textAnchor="middle" className="ggfs-b" fontSize={done ? 11 : 10} fill={done ? "#fff" : "#5b5080"} fontWeight={done ? 700 : 400}>
              {done ?? "R1"}
            </text>
          </g>
        );
      })}
      {/* The fan. */}
      {Array.from({ length: 14 }, (_, k) => {
        const pick = picks.find((p) => p.card === k);
        if (pick && t >= pick.at) return null;
        const f = fan(k);
        return back(f.x, f.y, f.r, 0, `fan-${k}`);
      })}
      {/* The picked cards: lift, fly, flip. */}
      {picks.map((pick) => {
        if (t < pick.at) return null;
        const f = fan(pick.card);
        const lift = easeOut(seg(t, pick.at, pick.at + 500));
        const fly = easeInOut(seg(t, pick.at + 600, pick.at + 1900));
        const s = slot(pick.team);
        const x0 = f.x + Math.sin((f.r * Math.PI) / 180) * 26 * lift;
        const y0 = f.y - Math.cos((f.r * Math.PI) / 180) * 26 * lift;
        const x = lerp(x0, s.x + W / 2, fly);
        const y = lerp(y0, s.y + 24, fly) - Math.sin(fly * Math.PI) * 60;
        const r = lerp(f.r, 0, fly);
        const flip = Math.abs(Math.cos(fly * Math.PI));
        const face = fly > 0.5;
        if (t > pick.at + 1900) return null;
        return (
          <g key={pick.name} transform={`translate(${x} ${y}) rotate(${r}) scale(${flip * (1 + 0.15 * Math.sin(fly * Math.PI))} ${1 + 0.15 * Math.sin(fly * Math.PI)})`}>
            {face ? (
              <g>
                <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={7} fill="#f2ecff" stroke={TEAMS[DRUM_ORDER[pick.team]].color} strokeWidth={3} />
                <text y={4} textAnchor="middle" className="ggfs-b" fontSize={10.5} fill="#120626" fontWeight={800}>
                  {pick.name}
                </text>
              </g>
            ) : (
              back(0, 0, 0, lift)
            )}
          </g>
        );
      })}
      <text x={360} y={392} textAnchor="middle" className="ggfs-d" fontSize={12} fill="#c3b6e8" letterSpacing="0.14em">
        {left} CARDS LEFT
      </text>
    </g>
  );
}

/** 5 · Bans: the team on the clock eyes a nation, clicks, and the stamp slams. */
function BansScene({ t }: { t: number }) {
  const tiles = MINORS.slice(0, 12);
  const tile = (k: number) => ({ x: 284 + (k % 4) * 102, y: 70 + Math.floor(k / 4) * 92 });
  const bans = [
    { tile: 0, at: 2200, from: [600, 360] as [number, number], move: [300, 1700] },
    { tile: 8, at: 5600, from: [470, 170] as [number, number], move: [3900, 5200] },
  ];
  const turn = t < 3800 ? 1 : 2;
  const shake = bans.some((ban) => t > ban.at && t < ban.at + 260) ? Math.sin(t / 18) * 3 : 0;
  // Where the cursor is.
  let cursor: [number, number] | null = null;
  let press = 0;
  for (const ban of bans) {
    const centre: [number, number] = [tile(ban.tile).x + 48, tile(ban.tile).y + 40];
    if (t >= ban.move[0] && t <= ban.at + 400) {
      cursor = along([ban.from, centre], easeInOut(seg(t, ban.move[0], ban.move[1])));
      press = t > ban.at - 120 && t < ban.at + 60 ? 1 : 0;
    }
  }
  const eyeing = bans.find((ban) => t >= ban.move[1] && t < ban.at);
  return (
    <g>
      <defs>
        <pattern id="ggfs-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={8} fill="rgba(255,59,59,.12)" />
          <line x1={0} y1={0} x2={0} y2={8} stroke="rgba(255,59,59,.55)" strokeWidth={3} />
        </pattern>
      </defs>
      {/* The ban order. */}
      <text x={30} y={52} className="ggfs-d" fontSize={10.5} fill="#22e5ff" letterSpacing="0.14em">
        BAN ORDER · STRONGEST FIRST
      </text>
      {MAJORS.map(([tag, name], k) => {
        const team = TEAMS[TEAM_OF_MAJOR[k]];
        const banned = k === 0 ? "Finland" : k === 1 && t >= 2300 ? "Poland" : k === 2 && t >= 5700 ? "Canada" : null;
        const now = k === turn && !banned;
        const clock = 90 - Math.floor((t - (turn === 1 ? 0 : 3800)) / 1000) - 8;
        return (
          <g key={tag}>
            <rect x={26} y={64 + k * 46} width={228} height={38} rx={8} fill={now ? "rgba(34,229,255,.1)" : "rgba(255,255,255,.03)"} stroke={now ? "#22e5ff" : "rgba(255,255,255,.1)"} />
            <Flag tag={tag} x={36} y={74 + k * 46} w={28} h={18} />
            <text x={72} y={81 + k * 46} className="ggfs-t" fontSize={13} fill={team.color}>
              {team.name.toUpperCase()}
            </text>
            <text x={72} y={95 + k * 46} className="ggfs-b" fontSize={10} fill="#8d80b8">
              {name}
            </text>
            {banned ? (
              <text x={244} y={88 + k * 46} textAnchor="end" className="ggfs-t" fontSize={12} fill="#ff5a6e">
                ✕ {banned.toUpperCase()}
              </text>
            ) : now ? (
              <text x={244} y={88 + k * 46} textAnchor="end" className="ggfs-d" fontSize={13} fill="#fff">
                {`1:${String(Math.max(0, clock - 60)).padStart(2, "0")}`}
              </text>
            ) : null}
          </g>
        );
      })}
      {/* The nations. */}
      <g transform={`translate(${shake} 0)`}>
        {tiles.map(([tag, name], k) => {
          const { x, y } = tile(k);
          const ban = bans.find((b) => b.tile === k);
          const isBanned = k === 11 || (ban && t >= ban.at);
          const eyed = eyeing && eyeing.tile === k;
          return (
            <g key={tag}>
              <rect x={x} y={y} width={96} height={80} rx={9} fill={isBanned ? "url(#ggfs-hatch)" : "rgba(255,255,255,.05)"} stroke={eyed ? "#ffd23f" : isBanned ? "rgba(255,59,59,.7)" : "rgba(255,255,255,.14)"} strokeWidth={eyed ? 2.5 : 1} style={eyed ? { filter: "drop-shadow(0 0 10px rgba(255,210,63,.7))" } : undefined} />
              <g opacity={isBanned ? 0.45 : 1}>
                <Flag tag={tag} x={x + 26} y={y + 12} w={44} h={29} />
              </g>
              <text x={x + 48} y={y + 63} textAnchor="middle" className="ggfs-b" fontSize={11} fill={isBanned ? "#ff9b9b" : "#e8e0ff"}>
                {name}
              </text>
              {k === 11 && <Stamp x={x + 48} y={y + 34} text="BANNED" color="#ff3b3b" p={1} size={13} />}
              {ban && <Stamp x={x + 48} y={y + 34} text="BANNED" color="#ff3b3b" p={seg(t, ban.at, ban.at + 500)} size={13} />}
            </g>
          );
        })}
      </g>
      {cursor && <Cursor x={cursor[0]} y={cursor[1]} press={press} />}
    </g>
  );
}

/** 6 · The minor draft: the clock snakes across the teams, round by round, and the picks drop in. */
function DraftScene({ t }: { t: number }) {
  const order = DRAFT_ORDER;
  const teamOfMajor = TEAM_OF_MAJOR;
  const colX = (j: number) => 92 + j * 92;
  const rowY = (r: number) => 150 + r * 80;
  const START = 500;
  const EACH = 250;
  const cellOf = draftCell;
  const made = clamp(Math.floor((t - START) / EACH) + 1, 0, 21);
  const live = (t - START) / EACH;
  const head = clamp(live, 0, 20.999);
  const a = cellOf(Math.floor(head));
  const b = cellOf(Math.min(20, Math.floor(head) + 1));
  const f = head - Math.floor(head);
  const hx = lerp(colX(a.j), colX(b.j), Math.floor(head) === 20 ? 0 : f);
  const hy = lerp(rowY(a.r), rowY(b.r), Math.floor(head) === 20 ? 0 : f);
  const snake = `M${colX(0) - 40} ${rowY(0)} L${colX(6)} ${rowY(0)} Q${colX(6) + 46} ${rowY(0)} ${colX(6) + 46} ${(rowY(0) + rowY(1)) / 2} Q${colX(6) + 46} ${rowY(1)} ${colX(6)} ${rowY(1)} L${colX(0)} ${rowY(1)} Q${colX(0) - 46} ${rowY(1)} ${colX(0) - 46} ${(rowY(1) + rowY(2)) / 2} Q${colX(0) - 46} ${rowY(2)} ${colX(0)} ${rowY(2)} L${colX(6) + 40} ${rowY(2)}`;
  return (
    <g>
      <path d={snake} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
      <path d={snake} fill="none" stroke="#ff2bd6" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="6 8" strokeDashoffset={-t / 30} />
      {[0, 1, 2].map((r) => (
        <text key={r} x={18} y={rowY(r) + 5} className="ggfs-d" fontSize={11} fill="#8d80b8">
          {`R${r + 1} ${r % 2 ? "←" : "→"}`}
        </text>
      ))}
      {order.map((major, j) => {
        const team = TEAMS[teamOfMajor[major]];
        const [tag] = MAJORS[major];
        return (
          <g key={tag}>
            <rect x={colX(j) - 40} y={44} width={80} height={60} rx={10} fill="rgba(255,255,255,.04)" stroke={team.color} strokeOpacity={0.7} />
            <Flag tag={tag} x={colX(j) - 15} y={52} w={30} h={20} />
            <text x={colX(j)} y={92} textAnchor="middle" className="ggfs-t" fontSize={11.5} fill={team.color}>
              {team.name.toUpperCase()}
            </text>
          </g>
        );
      })}
      {Array.from({ length: 21 }, (_, k) => {
        const { r, j } = cellOf(k);
        const team = TEAMS[teamOfMajor[order[j]]];
        const pop = easeBack(seg(t, START + k * EACH, START + k * EACH + 260));
        return (
          <g key={k}>
            <rect x={colX(j) - 30} y={rowY(r) - 24} width={60} height={48} rx={8} fill="#130a28" stroke={k < made ? team.color : "rgba(255,255,255,.12)"} strokeWidth={k < made ? 2 : 1} />
            {k < made && (
              <g transform={`translate(${colX(j)} ${rowY(r)}) scale(${pop})`}>
                <Flag tag={DRAFT_POOL[k][0]} x={-20} y={-13} w={40} h={26} />
              </g>
            )}
          </g>
        );
      })}
      {t >= START && made < 21 && (
        <circle cx={hx} cy={hy} r={32} fill="none" stroke="#22e5ff" strokeWidth={3} style={{ filter: "drop-shadow(0 0 10px #22e5ff)" }} />
      )}
      <text x={700} y={392} textAnchor="end" className="ggfs-d" fontSize={12} fill="#c3b6e8" letterSpacing="0.12em">
        {`PICK ${Math.max(1, made)} / 21`}
      </text>
    </g>
  );
}

/** 7 · Assigning players: a shared clock runs; players are dragged onto the team's nations; the line-up locks. */
function AssignScene({ t }: { t: number }) {
  const players = [
    ["Valmy", "Captain"],
    ["PixelPanzer", "Vice-captain"],
    ["Oberst", "Recruit"],
    ["Halberd", "Recruit"],
  ];
  const nations: [string, string][] = [majorOf(3), ...picksOf(3)];
  const goes = [0, 2, 1, 3];
  const chip = (i: number): [number, number] => [52, 112 + i * 62];
  const slot = (n: number): [number, number] => [420, 112 + n * 62];
  const secs = 598 - Math.floor(t / 1000) * 3;
  const done = (i: number) => t >= 1700 + i * 1100;
  return (
    <g>
      <g transform="translate(360 52)">
        <rect x={-120} y={-26} width={240} height={46} rx={10} fill="rgba(34,229,255,.08)" stroke="#22e5ff" />
        <text x={-104} y={2} className="ggfs-d" fontSize={10} fill="#22e5ff" letterSpacing="0.14em">
          ALL TEAMS
        </text>
        <text x={104} y={8} textAnchor="end" className="ggfs-d" fontSize={24} fill="#fff">
          {`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`}
        </text>
      </g>
      <text x={44} y={98} className="ggfs-t" fontSize={15} fill="#1fd49a">
        LES LIONS · PLAYERS
      </text>
      <text x={412} y={98} className="ggfs-t" fontSize={15} fill="#1fd49a">
        NATIONS
      </text>
      {nations.map(([tag, name], n) => {
        const [x, y] = slot(n);
        const who = goes.findIndex((g) => g === n);
        const placed = who >= 0 && done(who);
        return (
          <g key={tag}>
            <rect x={x - 8} y={y} width={276} height={50} rx={10} fill={placed ? "rgba(31,212,154,.12)" : "rgba(255,255,255,.03)"} stroke={placed ? "#1fd49a" : "rgba(255,255,255,.18)"} strokeDasharray={placed ? undefined : "5 5"} />
            <Flag tag={tag} x={x + 6} y={y + 12} w={40} h={26} />
            <text x={x + 56} y={y + 22} className="ggfs-t" fontSize={14} fill="#fff">
              {name.toUpperCase()}
            </text>
            <text x={x + 56} y={y + 39} className="ggfs-b" fontSize={11.5} fill={placed ? "#1fd49a" : "#5b5080"} fontWeight={placed ? 700 : 400}>
              {placed ? players[who][0] : "drop a player here"}
            </text>
          </g>
        );
      })}
      {players.map(([name, role], i) => {
        const start = 900 + i * 1100;
        const p = easeInOut(seg(t, start, start + 800));
        const [x0, y0] = chip(i);
        const [x1, y1] = slot(goes[i]);
        const moving = p > 0 && p < 1;
        const x = lerp(x0, x1 + 140, p);
        const y = lerp(y0, y1, p) - Math.sin(p * Math.PI) * 24;
        return (
          <g key={name}>
            <g opacity={p > 0 ? 0.35 : 1}>
              <rect x={x0 - 8} y={y0} width={250} height={50} rx={10} fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.15)" />
              <text x={x0 + 8} y={y0 + 22} className="ggfs-t" fontSize={15} fill="#fff">
                {name.toUpperCase()}
              </text>
              <text x={x0 + 8} y={y0 + 39} className="ggfs-b" fontSize={11.5} fill="#8d80b8">
                {done(i) ? "✓ placed" : role}
              </text>
            </g>
            {moving && (
              <g transform={`translate(${x} ${y})`}>
                <rect x={-8} y={0} width={150} height={40} rx={9} fill="#1fd49a" style={{ filter: "drop-shadow(0 8px 14px rgba(0,0,0,.5))" }} />
                <text x={6} y={25} className="ggfs-t" fontSize={15} fill="#06130e">
                  {name.toUpperCase()}
                </text>
                <Cursor x={120} y={18} />
              </g>
            )}
          </g>
        );
      })}
      <Stamp x={300} y={360} text="LINE-UP SET" color="#1fd49a" p={seg(t, 5500, 6000)} size={20} angle={-6} />
    </g>
  );
}

/** 8 · Locked: the final lobby fills in, the seed is revealed and checked, every draw re-run. */
function LockedScene({ t }: { t: number }) {
  const lobby: [number, string, string[]][] = MAJORS.map(([tag], m) => [TEAM_OF_MAJOR[m], tag, picksOf(TEAM_OF_MAJOR[m]).map(([minor]) => minor)]);
  const commit = "4eb70f00d9f4a0b1a4faf661ff7d8b0554a68bde877f6083";
  const seed = "e2eaaf94cef48bee51bd0beeaa2a45dfd84b31a083608626";
  const typed = Math.floor(seed.length * seg(t, 2300, 3500));
  const rolling = t >= 3900 && t < 4800;
  const hex = rolling
    ? Array.from({ length: 24 }, (_, k) => "0123456789abcdef"[Math.floor(Math.abs(Math.sin(k * 7.1 + Math.floor(t / 60) * 3.3)) * 16)]).join("")
    : commit.slice(0, 24);
  const checked = Math.floor(33 * seg(t, 5300, 6400));
  return (
    <g>
      <text x={30} y={46} className="ggfs-d" fontSize={10.5} fill="#22e5ff" letterSpacing="0.14em">
        FINAL LOBBY
      </text>
      {lobby.map(([team, major, minors], k) => {
        const p = easeOut(seg(t, 150 + k * 170, 550 + k * 170));
        const T = TEAMS[team];
        return (
          <g key={T.name} opacity={p} transform={`translate(${(1 - p) * -30} 0)`}>
            <rect x={26} y={58 + k * 46} width={330} height={38} rx={8} fill="rgba(255,255,255,.04)" stroke={T.color} strokeOpacity={0.6} />
            <rect x={26} y={58 + k * 46} width={6} height={38} rx={3} fill={T.color} />
            <text x={42} y={82 + k * 46} className="ggfs-t" fontSize={15} fill={T.color}>
              {T.name.toUpperCase()}
            </text>
            <Flag tag={major} x={186} y={67 + k * 46} w={30} h={20} />
            {minors.map((tag, m) => (
              <Flag key={tag} tag={tag} x={226 + m * 42} y={70 + k * 46} w={26} h={17} />
            ))}
          </g>
        );
      })}
      <g transform="translate(384 40)">
        <rect width={312} height={340} rx={14} fill="rgba(34,229,255,.06)" stroke="rgba(34,229,255,.45)" />
        <text x={18} y={30} className="ggfs-d" fontSize={10} fill="#8d80b8" letterSpacing="0.14em">
          FINGERPRINT · POSTED BEFORE THE DRAFT
        </text>
        <text x={18} y={52} className="ggfs-d" fontSize={11.5} fill="#e8e0ff">
          {commit.slice(0, 24)}
        </text>
        <text x={18} y={68} className="ggfs-d" fontSize={11.5} fill="#e8e0ff">
          {commit.slice(24)}…
        </text>
        <text x={18} y={104} className="ggfs-d" fontSize={10} fill="#8d80b8" letterSpacing="0.14em">
          SEED · REVEALED AT THE LOCK
        </text>
        <text x={18} y={126} className="ggfs-d" fontSize={11.5} fill="#ffd23f">
          {seed.slice(0, Math.min(24, typed))}
          {typed < seed.length && t >= 2300 && <tspan opacity={Math.sin(t / 90) > 0 ? 1 : 0}>▌</tspan>}
        </text>
        <text x={18} y={142} className="ggfs-d" fontSize={11.5} fill="#ffd23f">
          {typed > 24 ? `${seed.slice(24, typed)}${typed === seed.length ? "…" : ""}` : ""}
        </text>
        {t >= 3900 && (
          <g>
            <text x={18} y={178} className="ggfs-d" fontSize={10} fill="#8d80b8" letterSpacing="0.14em">
              SHA-256 OF THE SEED
            </text>
            <text x={18} y={200} className="ggfs-d" fontSize={11.5} fill={rolling ? "#8d80b8" : "#7cf0a0"}>
              {hex}
            </text>
            {!rolling && (
              <text x={18} y={226} className="ggfs-t" fontSize={17} fill="#7cf0a0">
                ✓ MATCHES THE FINGERPRINT
              </text>
            )}
          </g>
        )}
        {t >= 5300 && (
          <g>
            <text x={18} y={272} className="ggfs-d" fontSize={10} fill="#8d80b8" letterSpacing="0.14em">
              EVERY DRAW RE-RUN IN THE REPLAY
            </text>
            <text x={18} y={310} className="ggfs-d" fontSize={30} fill="#fff">
              {checked}
              <tspan fontSize={16} fill="#8d80b8">
                {" / 33"}
              </tspan>
              {checked === 33 && (
                <tspan fontSize={20} fill="#7cf0a0">
                  {"  ✓"}
                </tspan>
              )}
            </text>
          </g>
        )}
      </g>
    </g>
  );
}

// ---------- The steps ----------

interface Step {
  title: string;
  blurb: string;
  icon: ReactNode;
  captions: [number, string][];
  Scene: (props: { t: number }) => ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Captain order",
    blurb: "The lottery drum decides who goes first.",
    icon: <Orbit size={18} />,
    captions: [
      [0, "The organizer presses Draw and the drum catches one ball."],
      [2300, "It rises up the tube: that captain takes the next place."],
      [4600, "Seven balls, seven places. This order runs the whole night."],
    ],
    Scene: DrumScene,
  },
  {
    title: "Majors",
    blurb: "A slot reel hands each captain a major.",
    icon: <Rows3 size={18} />,
    captions: [
      [0, "In drum order, each captain spins the reel."],
      [2000, "The reel only holds the majors nobody has yet."],
      [4400, "Les Lions get Germany. The last major goes to the last team, no spin needed."],
    ],
    Scene: ReelScene,
  },
  {
    title: "Vice-captains",
    blurb: "Scratch tickets reveal the content creators.",
    icon: <Ticket size={18} />,
    captions: [
      [0, "Each team scratches its own ticket, by hand."],
      [2300, "Everyone watching sees the same scratches, live."],
      [4500, "Under the foil: the team's content-creator vice-captain."],
    ],
    Scene: ScratchScene,
  },
  {
    title: "Recruits",
    blurb: "Face-down cards deal out the fourteen.",
    icon: <Layers size={18} />,
    captions: [
      [0, "On its turn, a team picks one face-down card."],
      [2500, "The card flies over and flips: that's the recruit."],
      [4700, "Two rounds deal out all fourteen. The last card deals itself."],
    ],
    Scene: CardsScene,
  },
  {
    title: "Bans",
    blurb: "One ban each, strongest major first.",
    icon: <Ban size={18} />,
    captions: [
      [0, "One ban per team, strongest major first, 90 seconds each."],
      [2400, "Banned: nobody can pick that nation now."],
      [4300, "The weakest majors ban last, but they pick first."],
    ],
    Scene: BansScene,
  },
  {
    title: "Minor draft",
    blurb: "Three snake rounds, 21 minors.",
    icon: <Crosshair size={18} />,
    captions: [
      [0, "Three rounds. The weakest major picks first."],
      [2300, "The order snakes back every round."],
      [4500, "21 minors, each locked in the picking team's colour."],
    ],
    Scene: DraftScene,
  },
  {
    title: "Assign players",
    blurb: "Players onto nations, on one shared clock.",
    icon: <Users size={18} />,
    captions: [
      [0, "Ten minutes on one shared clock, for every team at once."],
      [2300, "Captains drag each player onto one of their nations."],
      [4700, "Clock runs out? Anyone still unplaced goes on a free nation at random."],
    ],
    Scene: AssignScene,
  },
  {
    title: "Teams locked",
    blurb: "The final lobby, and the seed checked.",
    icon: <Lock size={18} />,
    captions: [
      [0, "The teams lock and the final lobby is set."],
      [2300, "The secret seed is revealed."],
      [4300, "Anyone can check it, and every single draw, in the replay."],
    ],
    Scene: LockedScene,
  },
];

export default function GGFrontSteps({ event }: { event: GGPublic | null }) {
  const liveStep = event?.started && event.phase !== "locked" ? PHASES.indexOf(event.phase) - 1 : -1;
  const [step, setStep] = useState(() => (liveStep >= 0 ? liveStep : 0));
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const elapsed = useRef(0);
  const pausedRef = useRef(false);
  const visible = useRef(true);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const id = window.setTimeout(() => {
        setStill(true);
        setT(STEP_MS - 200);
      }, 0);
      return () => window.clearTimeout(id);
    }
    const seen = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    });
    if (box.current) seen.observe(box.current);
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      if (pausedRef.current || !visible.current || document.hidden) return;
      elapsed.current += dt;
      if (elapsed.current >= STEP_MS) {
        elapsed.current = 0;
        setStep((s) => (s + 1) % STEPS.length);
      }
      setT(elapsed.current);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
    };
  }, []);

  const pick = (i: number) => {
    elapsed.current = still ? STEP_MS - 200 : 0;
    setStep(i);
    setT(elapsed.current);
  };

  const current = STEPS[step];
  const caption = [...current.captions].reverse().find(([at]) => t >= at) ?? current.captions[0];
  const captionIndex = current.captions.indexOf(caption);
  const Scene = current.Scene;

  return (
    <div className="ggfs" ref={box}>
      <ol className="ggfs-list">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button type="button" className={`ggfs-item ${i === step ? "is-on" : ""}`} onClick={() => pick(i)} aria-current={i === step ? "step" : undefined} aria-label={`Step ${i + 1}: ${s.title}`} title={s.title}>
              <span className="ggfs-item-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="ggfs-item-icon">{s.icon}</span>
              <span className="ggfs-item-text">
                <b>{s.title}</b>
                <small>{s.blurb}</small>
              </span>
              {i === liveStep && <span className="ggfs-live">Live</span>}
              {i === step && <i className="ggfs-progress" style={{ width: `${(t / STEP_MS) * 100}%` }} />}
            </button>
          </li>
        ))}
      </ol>
      <figure className="ggfs-stage" aria-label={`Step ${step + 1}: ${current.title}`}>
        <div className="ggfs-screen">
          <svg viewBox="0 0 720 405" className="ggfs-svg" role="img" aria-label={current.captions.map(([, text]) => text).join(" ")}>
            <Scene t={t} />
          </svg>
          <div className="ggfs-tag">
            <b>Step {String(step + 1).padStart(2, "0")}</b> {current.title}
          </div>
          {!still && (
            <button type="button" className="ggfs-pause" onClick={() => setPaused(!paused)} aria-label={paused ? "Play the demo" : "Pause the demo"}>
              {paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}
            </button>
          )}
        </div>
        <figcaption className="ggfs-caption">
          <span key={`${step}-${captionIndex}`}>{caption[1]}</span>
          <span className="ggfs-dots" aria-hidden>
            {current.captions.map(([at], i) => (
              <i key={at} className={i <= captionIndex ? "is-on" : ""} />
            ))}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
