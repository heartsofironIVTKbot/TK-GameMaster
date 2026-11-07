"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * The front page's motion kit: binary glitches, text that decodes out of 0s
 * and 1s, and typed terminal lines.
 *
 * A glitch never moves or shakes the element itself (that read as lag): thin
 * strips of it tear sideways with a red / cyan split, rows of flickering 0s
 * and 1s cross it, and texts corrupt into binary for a moment. Pieces glitch once when they
 * come into view, then now and then while they're on screen.
 * Everything keeps moving with "reduce motion" on (Niko's call, 2026-11-06).
 */

type Trigger = () => void;

interface FxContext {
  /** A visible piece that random glitches can hit; returns the unregister. */
  register: (trigger: Trigger) => () => void;
}

const Context = createContext<FxContext>({ register: () => () => {} });

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function FxProvider({ children }: { children: ReactNode }) {
  const triggers = useRef(new Set<Trigger>());
  const register = useCallback((trigger: Trigger) => {
    triggers.current.add(trigger);
    return () => {
      triggers.current.delete(trigger);
    };
  }, []);

  // Every few seconds, glitch something that's on screen.
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const list = [...triggers.current];
        if (list.length > 0 && document.visibilityState === "visible") list[Math.floor(Math.random() * list.length)]();
        schedule();
      }, random(2000, 4000));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const value = useMemo(() => ({ register }), [register]);
  return (
    <Context.Provider value={value}>
      <div className="fx-root">{children}</div>
    </Context.Provider>
  );
}

/** Seen at least once (or, with once: false, on screen now). */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { once = true, threshold = 0, margin = "0px 0px -12% 0px" }: { once?: boolean; threshold?: number; margin?: string } = {},
): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setSeen(false);
        }
      },
      { rootMargin: margin, threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, once, threshold, margin]);
  return seen;
}

/** A string of 0s and 1s in groups of four, like a dump. */
export function bits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += Math.random() < 0.5 ? "0" : "1";
    if (i % 4 === 3) out += " ";
  }
  return out;
}

/** The first solid background behind an element (a torn strip needs one). */
function solidBackground(element: HTMLElement): string {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return "#040604";
}

/**
 * Tearing: copies of the element drawn over it, each cut to a thin strip and
 * torn sideways with a red / cyan split; the strips jump about for ~0.35s.
 * The element itself stays where it is.
 */
export function tear(element: HTMLElement | null, ms = 360): void {
  if (!element || element.querySelector(":scope > .fx-tear")) return;
  if (getComputedStyle(element).position === "static") element.style.position = "relative";
  const style = getComputedStyle(element);
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width < 4 || height < 4) return;
  const layer = document.createElement("div");
  layer.className = "fx-tear";
  layer.setAttribute("aria-hidden", "true");
  // Heavy pieces (the map) get fewer copies.
  const strips = element.getElementsByTagName("*").length > 1500 ? 2 : 3;
  const background = solidBackground(element);
  const copies: HTMLElement[] = [];
  for (let i = 0; i < strips; i++) {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".fx-bits, .fx-tear").forEach((node) => node.remove());
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    Object.assign(copy.style, {
      position: "absolute",
      left: `-${style.borderLeftWidth}`,
      top: `-${style.borderTopWidth}`,
      width: `${width}px`,
      height: `${height}px`,
      margin: "0",
      background,
      pointerEvents: "none",
    });
    copies.push(copy);
    layer.appendChild(copy);
  }
  element.appendChild(layer);
  const reach = Math.max(10, Math.min(70, width * 0.07));
  const shuffle = () => {
    for (const copy of copies) {
      const top = random(0, 88);
      const size = random(3, 14);
      const shift = (Math.random() < 0.5 ? -1 : 1) * random(reach * 0.35, reach);
      copy.style.clipPath = `inset(${top}% 0 ${Math.max(0, 100 - top - size)}% 0)`;
      copy.style.transform = `translateX(${shift}px)`;
      copy.style.filter = `drop-shadow(${shift > 0 ? 4 : -4}px 0 0 rgb(255 52 94 / 0.85)) drop-shadow(${shift > 0 ? -4 : 4}px 0 0 rgb(56 255 214 / 0.85))`;
    }
  };
  shuffle();
  const jump = window.setInterval(shuffle, 60);
  window.setTimeout(() => {
    window.clearInterval(jump);
    layer.remove();
  }, ms);
}

/**
 * A glitch over an element: torn strips (see tear) plus 2-5 rows of
 * flickering 0s and 1s, for about 0.45s. The element itself never moves.
 */
export function burst(element: HTMLElement | null, ms = 460, tearing = true): void {
  if (!element || element.querySelector(":scope > .fx-bits")) return;
  if (tearing) tear(element, Math.min(ms, 380));
  if (getComputedStyle(element).position === "static") element.style.position = "relative";
  const layer = document.createElement("div");
  layer.className = "fx-bits";
  layer.setAttribute("aria-hidden", "true");
  const rows = 2 + Math.floor(Math.random() * 4);
  const band = random(8, 82);
  const spans: HTMLSpanElement[] = [];
  for (let i = 0; i < rows; i++) {
    const span = document.createElement("span");
    span.className = "fx-bits-row";
    span.style.top = `${Math.min(94, band + i * random(2.5, 6))}%`;
    span.style.left = `${random(0, 35)}%`;
    span.style.width = `${random(30, 95)}%`;
    if (Math.random() < 0.18) span.dataset.tone = Math.random() < 0.5 ? "red" : "cyan";
    spans.push(span);
    layer.appendChild(span);
  }
  element.appendChild(layer);
  const fill = () => {
    for (const span of spans) span.textContent = bits(220);
  };
  fill();
  const flicker = window.setInterval(fill, 55);
  window.setTimeout(() => {
    window.clearInterval(flicker);
    layer.remove();
  }, ms);
}

/** Hook: a binary glitch when the element first comes into view, then random ones while it's on screen. */
export function useGlitch<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { enter = true, tearing = true }: { enter?: boolean; tearing?: boolean } = {},
): void {
  const { register } = useContext(Context);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let unregister = () => {};
    let entered = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!entered && enter) window.setTimeout(() => burst(element, 460, tearing), 160);
          entered = true;
          unregister = register(() => burst(element, 460, tearing));
        } else {
          unregister();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      unregister();
    };
  }, [ref, register, enter, tearing]);
}

/** Any element that takes glitches (`tearing={false}`: 0s and 1s only). */
export function Glitch({
  as: Tag = "div",
  className = "",
  children,
  enter = true,
  tearing = true,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  enter?: boolean;
  tearing?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useGlitch(ref, { enter, tearing });
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const binary = () => (Math.random() < 0.5 ? "0" : "1");

/**
 * Text that decodes out of 0s and 1s (left to right) when it comes into view,
 * and corrupts into binary for a moment when a random glitch hits it. The real
 * text is in the page from the start (search engines, screen readers, no-JS).
 */
export function Scramble({
  text,
  className = "",
  as: Tag = "span",
  duration = 900,
  delay = 0,
  start,
  tearing = true,
}: {
  text: string;
  className?: string;
  as?: ElementType;
  duration?: number;
  delay?: number;
  /** false: glitches corrupt the letters into 0s and 1s, without tearing. */
  tearing?: boolean;
  /** Decode when this turns true (default: when it comes into view). */
  start?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  // The letters live in an inner span React never re-renders (set as HTML),
  // so writing binary into it can't upset React.
  const letters = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref);
  const go = start ?? seen;
  const { register } = useContext(Context);
  const frame = useRef(0);

  const run = useCallback(
    (length: number, partial: boolean) => {
      const element = letters.current;
      if (!element) return;
      cancelAnimationFrame(frame.current);
      const began = performance.now() + (partial ? 0 : delay);
      // A corruption hits one stretch of the text, not the whole of it.
      const from = Math.floor(Math.random() * text.length * 0.6);
      const to = from + Math.max(3, Math.floor(text.length * random(0.25, 0.5)));
      const tick = (now: number) => {
        const k = Math.max(0, Math.min(1, (now - began) / length));
        let out = "";
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const settled = partial ? i < from || i >= to || k >= 1 || Math.random() < k : i / text.length < k * 1.15 - 0.15 * Math.random();
          out += char === " " || char === "\n" || settled ? char : binary();
        }
        element.textContent = out;
        if (k < 1) frame.current = requestAnimationFrame(tick);
        else element.textContent = text;
      };
      if (!partial) element.textContent = text.replace(/\S/g, binary);
      frame.current = requestAnimationFrame(tick);
    },
    [text, delay],
  );

  useEffect(() => {
    if (!go) return undefined;
    run(duration, false);
    return () => cancelAnimationFrame(frame.current);
  }, [go, run, duration]);

  useEffect(() => {
    if (!go) return undefined;
    return register(() => {
      run(420, true);
      if (tearing) tear(ref.current, 300);
    });
  }, [go, register, run, tearing]);

  return (
    <Tag ref={ref} className={className} aria-label={text}>
      <span ref={letters} aria-hidden dangerouslySetInnerHTML={{ __html: escapeHtml(text) }} />
    </Tag>
  );
}

/**
 * Lines typed one after another (a terminal). Starts when `start` turns true
 * (default: when in view); `onDone` fires after the last line.
 */
export function TypeLines({
  lines,
  className = "",
  lineClassName = "",
  speed = 18,
  pause = 220,
  onDone,
  start,
}: {
  lines: { text: string; className?: string }[];
  className?: string;
  lineClassName?: string;
  /** Milliseconds per character. */
  speed?: number;
  /** Milliseconds between lines. */
  pause?: number;
  onDone?: () => void;
  start?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const go = start ?? seen;
  const [shown, setShown] = useState<{ line: number; chars: number }>({ line: 0, chars: 0 });
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!go) return undefined;
    let line = 0;
    let chars = 0;
    let timer = 0;
    const step = () => {
      if (line >= lines.length) {
        doneRef.current?.();
        return;
      }
      chars += 1;
      if (chars > lines[line].text.length) {
        line += 1;
        chars = 0;
        setShown({ line, chars });
        timer = window.setTimeout(step, pause);
        return;
      }
      setShown({ line, chars });
      timer = window.setTimeout(step, speed);
    };
    timer = window.setTimeout(step, 200);
    return () => window.clearTimeout(timer);
  }, [go, lines, speed, pause]);

  return (
    <div ref={ref} className={className} aria-label={lines.map((line) => line.text).join("\n")}>
      {lines.map((line, index) => {
        if (index > shown.line) return null;
        // An empty line still takes its height.
        const text = (index < shown.line ? line.text : line.text.slice(0, shown.chars)) || " ";
        return (
          <div key={index} aria-hidden className={`${lineClassName} ${line.className ?? ""}`}>
            {text}
            {index === shown.line && <span className="fx-caret" />}
          </div>
        );
      })}
    </div>
  );
}
