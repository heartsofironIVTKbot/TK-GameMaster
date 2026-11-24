import type { GGConfig, GGPerson } from "./model";
import { R56_MAJORS, R56_NAMES, R56_POOL } from "./road56";

/**
 * Preview mode's sample event ("demo"): made-up people with made-up ids, so
 * the whole night can be clicked through locally without a database or
 * Discord. "Act as" (preview only) switches who you are.
 */

/** 18-digit ids built as text (Discord ids are too big for a JS number). */
const id = (n: number) => `9000000000000${String(n).padStart(5, "0")}`;

export const DEMO_ORGANIZER = id(1);

export function demoConfig(): GGConfig {
  const people: GGPerson[] = [
    { id: DEMO_ORGANIZER, name: "Demo Organizer", role: "organizer" },
    { id: id(2), name: "Demo Caster", role: "caster" },
  ];
  const captains = ["Kodiak", "Maverick", "Steelhelm", "Valmy", "Tidewater", "Kaiten", "Underdog"];
  const vices = ["StreamCzar", "ByteBaron", "PixelPanzer", "CafeCommand", "TeaTimeTV", "ZeroHour"];
  const recruits = ["Ironsides", "Volga", "Halftrack", "Doughboy", "Feldgrau", "Oberst", "Maginot", "Verdun", "Dreadnought", "Spitfire", "Shogun", "Ronin", "Bersagliere", "Garibaldi"];
  captains.forEach((name, i) => people.push({ id: id(10 + i), name, role: "captain" }));
  vices.forEach((name, i) => people.push({ id: id(20 + i), name, role: "vice", channel: `https://www.youtube.com/@${name}` }));
  people.push({ id: "filler:vice7", name: "Vice-captain TBA", role: "vice", filler: true });
  // The first recruit also helps organize (like a real organizer who plays).
  recruits.forEach((name, i) => people.push({ id: id(30 + i), name, role: "recruit", ...(i === 0 ? { organizer: true } : {}) }));
  return {
    title: "Great Game 2026",
    majors: [...R56_MAJORS],
    pool: [...R56_POOL],
    names: { ...R56_NAMES },
    people,
    teams: captains.map((_, i) => ({ id: `t${i + 1}`, captain_id: id(10 + i) })),
    timers: { ban: 90, pick: 90, assign: 600 },
    on_timeout: { ban: "wait", pick: "wait", assign: "random" },
  };
}
