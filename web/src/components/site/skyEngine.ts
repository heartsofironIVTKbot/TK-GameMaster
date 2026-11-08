/**
 * The site's night sky, drawn on one canvas behind the pages. Every layer can
 * be switched on or off (the /lab/background page compares them):
 *   stars      a still field, a share of them twinkling
 *   haze       faint brand-green nebula in two corners
 *   drift      the sky creeps sideways; nearer stars move more as you scroll
 *   shooting   a thin streak every so often
 *   satellites a tiny dot crossing slowly now and then
 *   grid       faint latitude / longitude lines, fading to the edges
 *   aurora     a soft green band near the top, rippling slowly
 * It pauses while the tab is hidden and caps itself at 30 frames a second.
 */

export interface SkyOptions {
  stars: boolean;
  haze: boolean;
  drift: boolean;
  shooting: boolean;
  satellites: boolean;
  grid: boolean;
  aurora: boolean;
  /** Stars per screen, 0.3 (sparse) to 2 (dense). */
  density: number;
  /** How bright everything is, 0.3 to 1.5. */
  brightness: number;
  /** Seconds between shooting stars (on average). */
  shootingEvery: number;
}

export const SKY_DEFAULTS: SkyOptions = {
  stars: true,
  haze: true,
  drift: false,
  shooting: true,
  satellites: false,
  grid: false,
  aurora: false,
  density: 1,
  brightness: 1,
  shootingEvery: 40,
};

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
  depth: number;
  twinkle: number; // 0 = steady, else its speed
  phase: number;
  tint: string;
}

interface Streak {
  x: number;
  y: number;
  dx: number;
  dy: number;
  age: number;
  life: number;
}

interface Satellite {
  x: number;
  y: number;
  dx: number;
  dy: number;
  age: number;
  life: number;
}

const TINTS = ["255,255,255", "255,255,255", "255,255,255", "214,255,224", "255,236,214", "214,232,255"];
/** Brand greens (brand-200/300/400): about one star in five (Niko, 2026-11-08). */
const GREENS = ["172,241,176", "126,227,135", "83,208,100"];
const GREEN_SHARE = 0.2;
const FRAME_MS = 1000 / 30;
/** Phones: fewer frames (the twinkle is slow, so it looks the same). */
const PHONE_FRAME_MS = 1000 / 20;
/** No drawing while the page scrolls, and this long after: scrolling comes first. */
const SCROLL_REST_MS = 160;

export class Sky {
  private readonly context: CanvasRenderingContext2D;
  private options: SkyOptions;
  private width = 1;
  private height = 1;
  private ratio = 1;
  private stars: Star[] = [];
  private streaks: Streak[] = [];
  private satellites: Satellite[] = [];
  private hazeLayer: HTMLCanvasElement | null = null;
  /** The haze and the stars that don't twinkle, drawn once per size. */
  private stillLayer: HTMLCanvasElement | null = null;
  private readonly phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  private scrolledAt = 0;
  private time = 0;
  private last = 0;
  private lastDraw = 0;
  private nextStreak = 4;
  private nextSatellite = 6;
  private frame = 0;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: Partial<SkyOptions> = {},
  ) {
    this.context = canvas.getContext("2d")!;
    this.options = { ...SKY_DEFAULTS, ...options };
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("scroll", this.onScroll, { passive: true });
  }

  setOptions(options: Partial<SkyOptions>): void {
    const reseed = options.density !== undefined && options.density !== this.options.density;
    this.options = { ...this.options, ...options };
    if (reseed) this.seed();
    this.stillLayer = null;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.ratio = Math.min(window.devicePixelRatio || 1, this.phone ? 1.5 : 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.seed();
    this.hazeLayer = null;
    this.stillLayer = null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  destroy(): void {
    this.stop();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("scroll", this.onScroll);
  }

  /** Send a shooting star now (the lab's button). */
  shootNow(): void {
    this.spawnStreak();
  }

  private readonly onScroll = () => {
    this.scrolledAt = performance.now();
  };

  private readonly onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private seed(): void {
    // A field a little bigger than the screen, so drift and scroll can wrap it.
    const count = Math.round(((this.width * this.height) / 5200) * this.options.density);
    this.stars = Array.from({ length: count }, () => {
      const depth = Math.random() ** 2;
      const bright = Math.random() < 0.06;
      return {
        x: Math.random(),
        y: Math.random(),
        r: bright ? 1 + Math.random() * 0.8 : 0.35 + depth * 0.8,
        alpha: bright ? 0.75 + Math.random() * 0.25 : 0.18 + Math.random() * 0.5,
        depth: 0.15 + depth * 0.85,
        twinkle: Math.random() < (bright ? 0.8 : 0.55) ? 1.5 + Math.random() * 3 : 0,
        phase: Math.random() * Math.PI * 2,
        tint: Math.random() < GREEN_SHARE ? GREENS[Math.floor(Math.random() * GREENS.length)] : TINTS[Math.floor(Math.random() * TINTS.length)],
      };
    });
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);
    if (now - this.lastDraw < (this.phone ? PHONE_FRAME_MS : FRAME_MS)) return;
    if (now - this.scrolledAt < SCROLL_REST_MS) {
      this.last = now; // the sky just waits; no jump afterwards
      return;
    }
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.lastDraw = now;
    this.time += dt;
    this.step(dt);
    this.draw();
  };

  private step(dt: number): void {
    const o = this.options;
    if (o.shooting) {
      this.nextStreak -= dt;
      if (this.nextStreak <= 0) {
        this.spawnStreak();
        this.nextStreak = o.shootingEvery * (0.6 + Math.random() * 0.8);
      }
    }
    for (const streak of this.streaks) streak.age += dt;
    this.streaks = this.streaks.filter((streak) => streak.age < streak.life);

    if (o.satellites) {
      this.nextSatellite -= dt;
      if (this.nextSatellite <= 0 && this.satellites.length < 2) {
        const fromLeft = Math.random() < 0.5;
        const life = 28 + Math.random() * 14;
        const y0 = this.height * (0.08 + Math.random() * 0.5);
        const y1 = y0 + this.height * (Math.random() * 0.3 - 0.1);
        this.satellites.push({
          x: fromLeft ? -10 : this.width + 10,
          y: y0,
          dx: ((fromLeft ? 1 : -1) * (this.width + 20)) / life,
          dy: (y1 - y0) / life,
          age: 0,
          life,
        });
        this.nextSatellite = 14 + Math.random() * 16;
      }
    }
    for (const satellite of this.satellites) {
      satellite.age += dt;
      satellite.x += satellite.dx * dt;
      satellite.y += satellite.dy * dt;
    }
    this.satellites = this.satellites.filter((satellite) => satellite.age < satellite.life);
  }

  private spawnStreak(): void {
    const angle = (Math.PI / 180) * (20 + Math.random() * 25) * (Math.random() < 0.5 ? 1 : -1);
    const speed = Math.max(this.width, this.height) * (0.9 + Math.random() * 0.5);
    const x = this.width * (0.15 + Math.random() * 0.7);
    this.streaks.push({
      x,
      y: this.height * Math.random() * 0.45,
      dx: Math.cos(angle) * speed * (x > this.width / 2 ? -1 : 1),
      dy: Math.abs(Math.sin(angle)) * speed,
      age: 0,
      life: 0.7 + Math.random() * 0.4,
    });
  }

  private draw(): void {
    const c = this.context;
    const o = this.options;
    const w = this.width;
    const h = this.height;
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    // Clear: the page's own near-black (body) shows through, the sky adds light.
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = "lighter";

    // Without drift nothing moves but the twinkle: blit the still part, then
    // draw only the twinklers (about half the stars) each frame.
    const still = !o.drift && !o.aurora;
    if (still) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(this.still(), 0, 0);
      c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    } else if (o.haze) c.drawImage(this.haze(), 0, 0, w, h);
    if (o.aurora) this.drawAurora();
    if (o.grid && !still) this.drawGrid();

    if (o.stars) this.drawStars(c, still ? "twinkling" : "all");
    this.drawMoving(c);
  }

  /** The part of the sky that doesn't change from frame to frame. */
  private still(): HTMLCanvasElement {
    if (this.stillLayer) return this.stillLayer;
    const layer = document.createElement("canvas");
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const c = layer.getContext("2d")!;
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    c.globalCompositeOperation = "lighter";
    if (this.options.haze) c.drawImage(this.haze(), 0, 0, this.width, this.height);
    if (this.options.grid) this.drawGrid(c);
    if (this.options.stars) this.drawStars(c, "steady");
    this.stillLayer = layer;
    return layer;
  }

  private drawStars(c: CanvasRenderingContext2D, which: "all" | "steady" | "twinkling"): void {
    const o = this.options;
    const w = this.width;
    const h = this.height;
    {
      const scroll = o.drift ? window.scrollY : 0;
      const drift = o.drift ? this.time * 3 : 0;
      for (const star of this.stars) {
        if (which === "steady" && star.twinkle) continue;
        if (which === "twinkling" && !star.twinkle) continue;
        let x = (star.x * w + drift * star.depth) % w;
        let y = (star.y * h - scroll * 0.06 * star.depth) % h;
        if (x < 0) x += w;
        if (y < 0) y += h;
        let alpha = star.alpha * o.brightness;
        let r = star.r;
        let halo = r > 1 ? 0.18 : 0;
        if (star.twinkle) {
          // Twinklers fade to almost nothing, then flare: brighter than they
          // rest, a little bigger, with a halo at the peak (Niko: the old,
          // gentle twinkle was nearly impossible to see).
          const peak = (0.5 + 0.5 * Math.sin(this.time * star.twinkle + star.phase)) ** 3;
          alpha *= 0.08 + 1.9 * peak;
          r *= 1 + 0.9 * peak;
          halo = Math.max(halo, 0.3 * peak);
        }
        if (alpha <= 0.02) continue;
        c.fillStyle = `rgba(${star.tint},${Math.min(1, alpha)})`;
        if (halo > 0.02) {
          c.globalAlpha = halo;
          c.beginPath();
          c.arc(x, y, Math.max(r, 0.8) * 3.2, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = 1;
        }
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  /** Shooting stars and satellites. */
  private drawMoving(c: CanvasRenderingContext2D): void {
    const o = this.options;
    for (const streak of this.streaks) {
      const k = streak.age / streak.life;
      const x = streak.x + streak.dx * streak.age;
      const y = streak.y + streak.dy * streak.age;
      const tail = 0.12;
      const fade = Math.sin(Math.PI * k) * o.brightness;
      const gradient = c.createLinearGradient(x, y, x - streak.dx * tail, y - streak.dy * tail);
      gradient.addColorStop(0, `rgba(230,255,236,${0.9 * fade})`);
      gradient.addColorStop(1, "rgba(120,220,140,0)");
      c.strokeStyle = gradient;
      c.lineWidth = 1.4;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - streak.dx * tail, y - streak.dy * tail);
      c.stroke();
    }

    for (const satellite of this.satellites) {
      const k = satellite.age / satellite.life;
      const blink = Math.sin(this.time * 3) > 0.92 ? 1 : 0.55;
      c.fillStyle = `rgba(220,255,226,${0.7 * Math.sin(Math.PI * k) * blink * o.brightness})`;
      c.beginPath();
      c.arc(satellite.x, satellite.y, 1.1, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Two faint green glows, drawn once per size. */
  private haze(): HTMLCanvasElement {
    if (this.hazeLayer) return this.hazeLayer;
    const layer = document.createElement("canvas");
    const w = (layer.width = Math.round(this.width / 2));
    const h = (layer.height = Math.round(this.height / 2));
    const c = layer.getContext("2d")!;
    const glow = (x: number, y: number, radius: number, colour: string) => {
      const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, colour);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gradient;
      c.fillRect(0, 0, w, h);
    };
    const size = Math.max(w, h);
    // Half as strong as at first: Niko wanted the background darker.
    glow(w * 0.05, h * 1.0, size * 0.65, "rgba(40,150,70,0.05)");
    glow(w * 0.95, h * 0.05, size * 0.5, "rgba(30,110,60,0.04)");
    glow(w * 0.6, h * 0.55, size * 0.35, "rgba(20,80,40,0.02)");
    this.hazeLayer = layer;
    return layer;
  }

  private drawGrid(c = this.context): void {
    const w = this.width;
    const h = this.height;
    const step = 96;
    const offset = this.options.drift ? (this.time * 2) % step : 0;
    const scroll = this.options.drift ? (window.scrollY * 0.03) % step : 0;
    const fade = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.65);
    fade.addColorStop(0, `rgba(83,208,100,${0.06 * this.options.brightness})`);
    fade.addColorStop(1, "rgba(83,208,100,0)");
    c.strokeStyle = fade;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = -step + offset; x < w + step; x += step) {
      c.moveTo(x, 0);
      c.lineTo(x, h);
    }
    for (let y = -step - scroll; y < h + step; y += step) {
      c.moveTo(0, y);
      c.lineTo(w, y);
    }
    c.stroke();
  }

  private drawAurora(): void {
    const c = this.context;
    const w = this.width;
    const h = this.height;
    const bands = [
      { y: 0.1, amp: 0.05, speed: 0.06, colour: "83,208,100", alpha: 0.09, thick: 0.16 },
      { y: 0.16, amp: 0.04, speed: -0.045, colour: "40,170,120", alpha: 0.07, thick: 0.12 },
      { y: 0.06, amp: 0.03, speed: 0.03, colour: "120,230,150", alpha: 0.05, thick: 0.1 },
    ];
    for (const band of bands) {
      const gradient = c.createLinearGradient(0, 0, 0, h * (band.y + band.thick + band.amp));
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.55, `rgba(${band.colour},${band.alpha * this.options.brightness})`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gradient;
      c.beginPath();
      c.moveTo(0, 0);
      for (let x = 0; x <= w; x += 24) {
        const wave =
          Math.sin(x / w * Math.PI * 2.2 + this.time * band.speed * 6) * 0.6 +
          Math.sin(x / w * Math.PI * 5.3 - this.time * band.speed * 4) * 0.4;
        c.lineTo(x, h * (band.y + band.thick + band.amp * wave));
      }
      c.lineTo(w, 0);
      c.closePath();
      c.fill();
    }
  }
}
