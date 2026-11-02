import type { Tour } from "./types";

/** Page measuring for the tours: which marked controls are on screen, and where. */

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function selectorFor(name: string): string {
  return `[data-tour~="${name.replace(/["\\]/g, "")}"]`;
}

function isShown(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
}

/** Every shown element carrying this `data-tour` name. */
export function visibleTargets(name: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selectorFor(name))).filter(isShown);
}

export function targetVisible(name: string | null): boolean {
  return name === null || visibleTargets(name).length > 0;
}

/** One box around all of them (the host links are lit together, for example). */
export function unionBox(elements: HTMLElement[]): Box | null {
  if (elements.length === 0) return null;
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  return { top, left, width: right - left, height: bottom - top };
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** Scroll the control into view when it's off screen (not when it's just partly cut). */
export function bringIntoView(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const offScreen = rect.bottom < 60 || rect.top > window.innerHeight - 60;
  if (offScreen) element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

/** The control a tour needs before it may start: its anchor, or the first step's target. */
export function anchorOf(tour: Tour): string | null {
  return tour.anchor ?? tour.steps.find((step) => step.target)?.target ?? null;
}

/** A pop-up of the page itself is open (nickname box, draft join, a host prompt…). */
export function foreignDialogOpen(): boolean {
  return Array.from(document.querySelectorAll('[aria-modal="true"], [role="dialog"]')).some(
    (element) => !element.closest("[data-tutorial-root]") && isShown(element),
  );
}
