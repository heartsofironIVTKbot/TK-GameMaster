import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SavePass } from "three/examples/jsm/postprocessing/SavePass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * The front page's war globe: the HOI4 map wrapped on a dark globe with
 * glowing green coasts and borders, spinning, with missiles, interceptions
 * and explosions going off on the side facing you.
 *
 * Plain three.js, no React: WarGlobe.tsx loads this file only on the page
 * that shows the globe, so the rest of the site never downloads three.js.
 * Map data comes from public/landing/globe-<map>.json (scripts/build-globe-data.py).
 */

export type Intensity = "calm" | "dramatic" | "war";
export type Quality = "high" | "low";

export interface GlobeData {
  coast: number[][];
  border: number[][];
  land: { tag: string; rings: number[][] }[];
  capitals: Record<string, [number, number]>;
}

/**
 * Where the globe sits in the canvas: its centre as a share of the width and
 * height away from the middle (+x right, +y down), and its radius as a share
 * of the height. The canvas can cover a whole hero with the globe off to one side.
 */
export interface GlobeLayout {
  x: number;
  y: number;
  radius: number;
}

/** Whole globe in the middle, narrowed to fit tall (phone) screens. */
export function centredLayout(width: number, height: number): GlobeLayout {
  return { x: 0, y: 0, radius: 0.42 * Math.min(1, width / height / 0.8) };
}

/** What just happened on the globe, by nation tag (for a live readout). */
export interface GlobeEvent {
  kind: "launch" | "impact" | "intercept";
  from?: string;
  to: string;
}

export interface GlobeOptions {
  intensity: Intensity;
  quality: Quality;
  /** false: no spin and no strikes (the viewer asked for reduced motion). */
  motion: boolean;
  /** Where the globe sits for a canvas of this size (called on every resize). */
  layout?: (width: number, height: number) => GlobeLayout;
  /** Every launch, hit and interception. */
  onEvent?: (event: GlobeEvent) => void;
  /** Called about once a second, for the lab's readout and the auto-downgrade. */
  onStats?: (stats: { fps: number; strikes: number; quality: Quality }) => void;
}

// GameMaster's colours (globals.css brand / ink), as hex for WebGL.
const COLORS = {
  brand200: 0xacf1b0,
  brand300: 0x7ee387,
  brand400: 0x53d064,
  brand500: 0x37b14b,
  brand700: 0x1b6a29,
  brand800: 0x164e1e,
  brand900: 0x0e3514,
  brand950: 0x051a07,
  flash: 0xfff4d6,
  fire: 0xffa63d,
  ember: 0xff5a1f,
};

/** Capitals: steady red beacons that breathe, fading out round the back of the globe. */
const CAPITAL_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uScale;
  uniform float uTime;
  attribute float aSeed;
  varying float vLight;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float facing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
    vLight = smoothstep(0.02, 0.3, facing) * (0.78 + 0.22 * sin(uTime * 2.2 + aSeed * 6.2831));
    vec4 view = viewMatrix * world;
    gl_Position = projectionMatrix * view;
    gl_PointSize = uSize * uScale / -view.z;
  }
`;

const CAPITAL_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying float vLight;
  void main() {
    float glow = texture2D(uMap, gl_PointCoord).a;
    // A hot core, red all round it.
    vec3 colour = mix(vec3(1.0, 0.12, 0.08), vec3(1.0, 0.78, 0.7), smoothstep(0.55, 0.95, glow));
    gl_FragColor = vec4(colour, glow * vLight);
    #include <colorspace_fragment>
  }
`;

/**
 * The last pass, for a see-through canvas: the scene's own opacity (saved
 * before the glow, whose blur marks every pixel solid), raised to at least the
 * light's strength so glow over empty space still shows over the sky.
 */
const GLOW_ALPHA = {
  uniforms: { tDiffuse: { value: null }, tScene: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tScene;
    varying vec2 vUv;
    void main() {
      vec3 light = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
      float solid = clamp(texture2D(tScene, vUv).a, 0.0, 1.0);
      gl_FragColor = vec4(light, max(solid, max(light.r, max(light.g, light.b))));
    }
  `,
};

/** How far apart a line's points may be (degrees), so it stays on the curved surface. */
const LINE_STEP = 0.4;

/** How often a strike starts (seconds between launches), and how many at once. */
const INTENSITY: Record<Intensity, { every: number; salvo: [number, number]; intercept: number; max: number }> = {
  calm: { every: 2.6, salvo: [1, 1], intercept: 0, max: 4 },
  dramatic: { every: 1.1, salvo: [1, 3], intercept: 0.18, max: 14 },
  war: { every: 0.32, salvo: [2, 5], intercept: 0.3, max: 40 },
};

const SPIN = 0.07; // radians a second: one turn in about 90 s
const TILT = 0.38; // the north leans toward you (most nations are up there)
const START_LON = 8; // Europe faces you first

/** lon/lat in degrees -> point on the unit sphere (lon 0 faces +z, the camera). */
function toVector(lon: number, lat: number, radius = 1): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(lat);
  const lambda = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda),
  );
}

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** A soft round glow, for missile heads, flashes and fires. */
function glowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.25)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The land as one picture wrapped round the globe (equirectangular):
 * red = land, green = coast glow, blue = a per-nation shade.
 */
function landTexture(data: GlobeData, width: number): THREE.Texture {
  const height = width / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const x = (lon: number) => ((lon + 180) / 360) * width;
  const y = (lat: number) => ((90 - lat) / 180) * height;
  const trace = (ring: number[], shift: number) => {
    context.beginPath();
    for (let i = 0; i < ring.length; i += 2) {
      const px = x(ring[i]) + shift;
      const py = y(ring[i + 1]);
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
  };
  // Each shape is drawn three times (-360, 0, +360), so shapes on the seam wrap.
  const shifts = [-width, 0, width];
  data.land.forEach((nation, index) => {
    const shade = 90 + ((index * 73) % 165);
    context.fillStyle = `rgb(255,0,${shade})`;
    for (const ring of nation.rings) {
      for (const shift of shifts) {
        trace(ring, shift);
        context.closePath();
        context.fill();
      }
    }
  });
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = "rgb(0,150,0)";
  context.shadowColor = "rgb(0,255,0)";
  context.shadowBlur = width / 512;
  context.lineWidth = width / 2048;
  for (const line of data.coast) {
    for (const shift of shifts) {
      trace(line, shift);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false; // no seam line where the picture wraps
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

const GLOBE_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;
  void main() {
    vLocal = normalize(position);
    vViewNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOBE_FRAGMENT = /* glsl */ `
  uniform sampler2D uLand;
  uniform float uTime;
  uniform vec3 uOcean;
  uniform vec3 uLandDeep;
  uniform vec3 uLandLit;
  uniform vec3 uGrid;
  uniform vec3 uGlow;
  varying vec3 vLocal;
  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;
  const float PI = 3.14159265;

  void main() {
    float lat = asin(clamp(vLocal.y, -1.0, 1.0));
    float lon = atan(vLocal.x, vLocal.z);
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    vec4 land = texture2D(uLand, uv);

    // Light from the upper left, so the globe has a lit side.
    float light = 0.45 + 0.55 * max(dot(vWorldNormal, normalize(vec3(-0.55, 0.5, 0.7))), 0.0);
    float rim = pow(1.0 - max(dot(vViewNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);

    // Ocean: near black, with a faint 15-degree grid.
    vec2 deg = vec2(degrees(lon), degrees(lat)) / 15.0;
    vec2 cell = abs(fract(deg) - 0.5);
    vec2 width = fwidth(deg) * 0.9;
    float grid = max(smoothstep(0.5 - width.x, 0.5, cell.x), smoothstep(0.5 - width.y, 0.5, cell.y));
    vec3 color = uOcean + uGrid * grid * 0.07;

    // Land: a dot screen in green, each nation a slightly different shade.
    float rows = 260.0;
    float row = floor((lat / PI + 0.5) * rows);
    float rowLat = ((row + 0.5) / rows - 0.5) * PI;
    float cols = max(8.0, floor(rows * 2.0 * cos(rowLat)));
    vec2 local = vec2(fract((lon / (2.0 * PI) + 0.5) * cols), fract((lat / PI + 0.5) * rows)) - 0.5;
    local.x *= (2.0 * PI * cos(rowLat) / cols) / (PI / rows);
    float dotSize = 0.34;
    float aa = fwidth(length(local)) * 1.2;
    float dots = 1.0 - smoothstep(dotSize - aa, dotSize + aa, length(local));
    vec3 landColor = mix(uLandDeep, uLandLit, land.b) * (0.35 + 0.9 * dots);
    color = mix(color, landColor, land.r);

    // A scan band sweeping round the globe.
    float sweep = fract(lon / (2.0 * PI) + 0.5 - uTime * 0.035);
    float band = smoothstep(0.0, 0.035, sweep) * (1.0 - smoothstep(0.035, 0.11, sweep));
    color += uGlow * band * (0.08 + 0.35 * land.r * dots);

    color *= light;
    color += uGlow * land.g * 0.7;
    color += uGlow * rim * 0.3;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    // Seen from inside (back faces): strongest just outside the globe's edge,
    // fading to nothing at the halo's own edge.
    float k = clamp(-vNormal.z / 0.5, 0.0, 1.0);
    float glow = pow(k, 3.0) * 0.35;
    gl_FragColor = vec4(uColor * glow, 1.0);
    #include <colorspace_fragment>
  }
`;

const TRAIL_VERTEX = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uHead;
  uniform float uLength;
  uniform float uFade;
  uniform vec3 uColor;
  uniform vec3 uHot;
  varying float vT;
  void main() {
    if (vT > uHead) discard;
    float a = smoothstep(uHead - uLength, uHead, vT);
    vec3 color = mix(uColor, uHot, pow(a, 6.0));
    gl_FragColor = vec4(color * a * uFade, 1.0);
    #include <colorspace_fragment>
  }
`;

interface Missile {
  line: THREE.Line<THREE.BufferGeometry, THREE.ShaderMaterial>;
  head: THREE.Sprite;
  points: THREE.Vector3[];
  age: number;
  duration: number;
  /** Where it blows up: 1 = the target; below 1 = shot down mid-air. */
  end: number;
  done: boolean;
  fadeFor: number;
  /** Blows up in the air (an interceptor, or a missile it meets). */
  airburst: boolean;
  /** The target's tag, for the readout (interceptors have none). */
  target?: string;
}

interface Blast {
  object: THREE.Object3D;
  age: number;
  life: number;
  update: (blast: Blast, k: number) => void;
}

export class WarGlobe {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly tilt = new THREE.Group();
  private readonly world = new THREE.Group();
  private readonly effects = new THREE.Group();
  private readonly glow = glowTexture();
  private readonly bufferSize = new THREE.Vector2();
  private readonly capitalMaterial = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: this.glow }, uSize: { value: 0.1 }, uScale: { value: 400 }, uTime: { value: 0 } },
    vertexShader: CAPITAL_VERTEX,
    fragmentShader: CAPITAL_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Drawn over the globe's edge rather than cut by it; the back side fades out in the shader.
    depthTest: false,
  });
  private readonly globeMaterial: THREE.ShaderMaterial;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private mapObjects: THREE.Object3D[] = [];
  private capitals: THREE.Vector3[] = [];
  private readonly capitalTags = new Map<THREE.Vector3, string>();
  private missiles: Missile[] = [];
  private blasts: Blast[] = [];
  private fires: Blast[] = [];
  private options: GlobeOptions;
  private frame = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private nextLaunch = 1.2;
  private width = 1;
  private height = 1;
  // Dragging the globe round.
  private dragging = false;
  private dragFrom = { x: 0, y: 0 };
  private velocity = { x: 0, y: 0 };
  private resumeSpinAt = 0;
  // Frame rate, for the readout and the automatic step down.
  private frames = 0;
  private statsFrom = 0;
  private slowSeconds = 0;

  constructor(private readonly canvas: HTMLCanvasElement, options: GlobeOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    // See-through: the site's night sky (SkyBackground) shows round the globe.
    // Black at zero alpha, as a grey clear colour came out wrong through bloom.
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, 4.1);

    this.scene.add(this.tilt);
    this.tilt.rotation.x = TILT;
    this.tilt.add(this.world);
    this.world.rotation.y = -THREE.MathUtils.degToRad(START_LON);
    this.world.add(this.effects);

    this.globeMaterial = new THREE.ShaderMaterial({
      vertexShader: GLOBE_VERTEX,
      fragmentShader: GLOBE_FRAGMENT,
      uniforms: {
        uLand: { value: null },
        uTime: { value: 0 },
        uOcean: { value: new THREE.Color(0x020403) },
        uLandDeep: { value: new THREE.Color(COLORS.brand950) },
        uLandLit: { value: new THREE.Color(COLORS.brand700) },
        uGrid: { value: new THREE.Color(COLORS.brand500) },
        uGlow: { value: new THREE.Color(COLORS.brand400) },
      },
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 80), this.globeMaterial);
    this.world.add(globe);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.16, 96, 48),
      new THREE.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        uniforms: { uColor: { value: new THREE.Color(COLORS.brand400) } },
        side: THREE.BackSide,
        // Adds light only: it leaves the canvas's opacity alone, so the sky
        // behind shows through the halo (as additive, it made a dark ring).
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.tilt.add(atmosphere);

    this.addOrbits();
    this.applyQuality();
    this.bindPointer();
  }

  // ---- Setup ---------------------------------------------------------------

  setData(data: GlobeData): void {
    for (const object of this.mapObjects) {
      this.world.remove(object);
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose();
      });
    }
    this.mapObjects = [];
    const old = this.globeMaterial.uniforms.uLand.value as THREE.Texture | null;
    old?.dispose();
    this.globeMaterial.uniforms.uLand.value = landTexture(data, this.options.quality === "high" ? 4096 : 2048);

    const lines = (source: number[][], radius: number, color: number, opacity: number) => {
      const positions: number[] = [];
      // A straight piece between two far points cuts under the curved surface
      // and vanishes in places (borders looked broken): follow the curve instead.
      const step = THREE.MathUtils.degToRad(LINE_STEP);
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const p = new THREE.Vector3();
      const q = new THREE.Vector3();
      for (const line of source) {
        for (let i = 2; i < line.length; i += 2) {
          a.copy(toVector(line[i - 2], line[i - 1]));
          b.copy(toVector(line[i], line[i + 1]));
          const pieces = Math.max(1, Math.ceil(a.angleTo(b) / step));
          for (let k = 0; k < pieces; k++) {
            p.lerpVectors(a, b, k / pieces).setLength(radius);
            q.lerpVectors(a, b, (k + 1) / pieces).setLength(radius);
            positions.push(p.x, p.y, p.z, q.x, q.y, q.z);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const object = new THREE.LineSegments(geometry, material);
      this.world.add(object);
      this.mapObjects.push(object);
    };
    lines(data.border, 1.0015, COLORS.brand400, 0.5);
    lines(data.coast, 1.002, COLORS.brand400, 0.6);

    this.capitalTags.clear();
    this.capitals = Object.entries(data.capitals).map(([tag, [lon, lat]]) => {
      const point = toVector(lon, lat);
      this.capitalTags.set(point, tag);
      return point;
    });
    const dotGeometry = new THREE.BufferGeometry().setFromPoints(this.capitals.map((point) => point.clone().multiplyScalar(1.003)));
    dotGeometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(this.capitals.map(() => Math.random()), 1));
    const dots = new THREE.Points(dotGeometry, this.capitalMaterial);
    this.world.add(dots);
    this.mapObjects.push(dots);
    this.render();
  }

  setOptions(options: Partial<GlobeOptions>): void {
    const qualityChanged = options.quality !== undefined && options.quality !== this.options.quality;
    this.options = { ...this.options, ...options };
    if (qualityChanged) this.applyQuality();
    if (!this.options.motion) this.clearStrikes();
    this.render();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    const layout = (this.options.layout ?? centredLayout)(this.width, this.height);
    // Distance at which the globe's radius covers `layout.radius` of the height.
    const reach = 2 * layout.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.z = 1 / Math.sin(Math.atan(reach));
    // Shift the picture so the globe's centre lands at (x, y).
    this.camera.setViewOffset(
      this.width,
      this.height,
      -layout.x * this.width,
      -layout.y * this.height,
      this.width,
      this.height,
    );
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(this.width, this.height);
    this.bloom?.setSize(this.width, this.height);
    this.render();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.statsFrom = this.last;
    this.frames = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  dispose(): void {
    this.stop();
    this.unbindPointer();
    this.clearStrikes();
    this.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    (this.globeMaterial.uniforms.uLand.value as THREE.Texture | null)?.dispose();
    this.glow.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }

  private applyQuality(): void {
    const high = this.options.quality === "high";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const scene = new SavePass();
    composer.addPass(scene);
    if (high) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.75, 0.25, 0.6);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    // Glow drawn over empty space has light but no opacity; give it some, so it
    // shows over the sky behind the canvas instead of vanishing.
    const alpha = new ShaderPass(GLOW_ALPHA);
    alpha.uniforms.tScene.value = scene.renderTarget.texture;
    composer.addPass(alpha);
    composer.setSize(this.width, this.height);
    this.composer = composer;
  }



  /** Two thin orbit rings with a satellite on each: a quiet sci-fi touch. */
  private addOrbits(): void {
    const orbits: [number, number, number][] = [
      [1.42, 0.5, 0.18],
      [1.62, -0.35, -0.11],
    ];
    for (const [radius, tiltX, speed] of orbits) {
      const group = new THREE.Group();
      group.rotation.x = Math.PI / 2 + tiltX;
      group.rotation.y = tiltX * 0.6;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + 0.0025, 256),
        new THREE.MeshBasicMaterial({
          color: COLORS.brand500,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      group.add(ring);
      const satellite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color: COLORS.brand200, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      satellite.scale.setScalar(0.06);
      group.add(satellite);
      group.userData = { radius, speed, satellite };
      this.tilt.add(group);
    }
  }

  // ---- Strikes -------------------------------------------------------------

  /** Capitals on the side facing the camera, so every strike is seen. */
  private facingCapitals(): THREE.Vector3[] {
    const matrix = this.world.matrixWorld;
    const toCamera = new THREE.Vector3();
    return this.capitals.filter((point) => {
      const world = point.clone().applyMatrix4(matrix);
      toCamera.copy(this.camera.position).normalize();
      return world.normalize().dot(toCamera) > 0.35;
    });
  }

  private launchWave(): void {
    const setting = INTENSITY[this.options.intensity];
    if (this.missiles.length >= setting.max) return;
    const facing = this.facingCapitals();
    if (facing.length < 4) return;
    const from = facing[Math.floor(Math.random() * facing.length)];
    const count = Math.round(random(setting.salvo[0], setting.salvo[1]));
    for (let i = 0; i < count; i++) {
      const targets = facing.filter((point) => {
        const angle = point.angleTo(from);
        return angle > 0.18 && angle < 1.5;
      });
      if (targets.length === 0) return;
      const to = targets[Math.floor(Math.random() * targets.length)];
      const delay = i * random(0.12, 0.3);
      window.setTimeout(() => {
        if (!this.running || !this.options.motion) return;
        const intercepted = Math.random() < setting.intercept;
        const missile = this.launch(from, to, intercepted ? random(0.55, 0.8) : 1, COLORS.brand300);
        missile.target = this.capitalTags.get(to);
        if (missile.target) this.options.onEvent?.({ kind: "launch", from: this.capitalTags.get(from), to: missile.target });
        if (intercepted) this.intercept(missile);
      }, delay * 1000);
    }
  }

  private launch(from: THREE.Vector3, to: THREE.Vector3, end: number, color: number): Missile {
    const angle = from.angleTo(to);
    const height = 0.06 + angle * 0.22;
    const segments = 72;
    const points: THREE.Vector3[] = [];
    const t: number[] = [];
    const sin = Math.sin(angle);
    for (let i = 0; i <= segments; i++) {
      const k = i / segments;
      const a = Math.sin((1 - k) * angle) / sin;
      const b = Math.sin(k * angle) / sin;
      const point = from.clone().multiplyScalar(a).add(to.clone().multiplyScalar(b));
      point.normalize().multiplyScalar(1.004 + height * Math.sin(Math.PI * k));
      points.push(point);
      t.push(k);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setAttribute("aT", new THREE.Float32BufferAttribute(t, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERTEX,
      fragmentShader: TRAIL_FRAGMENT,
      uniforms: {
        uHead: { value: 0 },
        uLength: { value: 0.55 },
        uFade: { value: 1 },
        uColor: { value: new THREE.Color(color) },
        uHot: { value: new THREE.Color(0xffffff) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    const head = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color: 0xd8ffd8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    head.scale.setScalar(0.03);
    head.position.copy(points[0]);
    this.effects.add(line, head);
    this.flash(points[0], 0.07, 0.35, COLORS.brand200);
    const missile: Missile = {
      line,
      head,
      points,
      age: 0,
      duration: random(2.0, 2.8) + angle * 0.8,
      end,
      done: false,
      fadeFor: 0,
      airburst: end < 1,
    };
    this.missiles.push(missile);
    return missile;
  }

  /** A second, faster missile rises from near the target and meets the first mid-air. */
  private intercept(target: Missile): void {
    const meet = target.end;
    const meetAt = target.points[Math.round(meet * (target.points.length - 1))];
    const ground = target.points[target.points.length - 1];
    const nearby = this.capitals
      .filter((point) => point.angleTo(ground) < 0.45 && point.angleTo(ground) > 0.02)
      .sort((a, b) => a.angleTo(ground) - b.angleTo(ground))[0];
    const from = nearby ?? ground;
    const flight = target.duration * meet;
    const startAfter = flight * 0.45;
    window.setTimeout(() => {
      if (!this.running || target.done) return;
      const surfaceUnder = meetAt.clone().normalize();
      const interceptor = this.launch(from, surfaceUnder, 1, COLORS.brand200);
      interceptor.duration = flight - startAfter;
      // Bend its last point up to where the missile will be.
      const positions = interceptor.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const count = interceptor.points.length;
      for (let i = 0; i < count; i++) {
        const k = i / (count - 1);
        const lift = (meetAt.length() - 1.004) * Math.pow(k, 1.6);
        interceptor.points[i].normalize().multiplyScalar(interceptor.points[i].length() + lift);
        positions.setXYZ(i, interceptor.points[i].x, interceptor.points[i].y, interceptor.points[i].z);
      }
      positions.needsUpdate = true;
      interceptor.line.material.uniforms.uLength.value = 0.35;
      interceptor.airburst = true;
    }, startAfter * 1000);
  }

  /** How much a point on the globe faces the camera: 1 straight on, 0 at the edge, below 0 behind. */
  private facing(local: THREE.Vector3): number {
    const world = local.clone().applyMatrix4(this.world.matrixWorld);
    return world.clone().normalize().dot(this.camera.position.clone().sub(world).normalize());
  }

  /** 1 on the side facing you and right up to the globe's edge, fading to 0 just past it. */
  private inView(local: THREE.Vector3): number {
    return THREE.MathUtils.smoothstep(this.facing(local), -0.18, 0.02);
  }

  private flash(at: THREE.Vector3, size: number, life: number, color: number): void {
    // Not depth-tested: near the globe's edge the curve would cut the glow in half.
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }),
    );
    sprite.position.copy(at);
    this.effects.add(sprite);
    this.blasts.push({
      object: sprite,
      age: 0,
      life,
      update: (_, k) => {
        sprite.scale.setScalar(size * (0.4 + 1.2 * Math.sqrt(k)));
        sprite.material.opacity = (1 - k) * this.inView(at);
      },
    });
  }

  private explode(at: THREE.Vector3, ground: boolean): void {
    const normal = at.clone().normalize();
    // The white-hot flash, then the fireball.
    this.flash(at, ground ? 0.22 : 0.16, 0.45, COLORS.flash);
    this.flash(at, ground ? 0.15 : 0.1, 1.1, COLORS.fire);

    // Sparks thrown out and falling back.
    const sparkCount = ground ? 26 : 18;
    const positions = new Float32Array(sparkCount * 3);
    const velocities: THREE.Vector3[] = [];
    const tangent = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
    for (let i = 0; i < sparkCount; i++) {
      const angle = random(0, Math.PI * 2);
      const speed = random(0.05, 0.16);
      velocities.push(
        tangent
          .clone()
          .multiplyScalar(Math.cos(angle) * speed)
          .add(bitangent.clone().multiplyScalar(Math.sin(angle) * speed))
          .add(normal.clone().multiplyScalar(ground ? random(0.04, 0.12) : random(-0.08, 0.08))),
      );
      positions.set([at.x, at.y, at.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const sparks = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: COLORS.fire,
        size: 0.018,
        map: this.glow,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.effects.add(sparks);
    this.blasts.push({
      object: sparks,
      age: 0,
      life: 1.2,
      update: (blast, k) => {
        const attribute = sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < sparkCount; i++) {
          const v = velocities[i];
          const fall = normal.clone().multiplyScalar(-0.14 * blast.age * blast.age);
          attribute.setXYZ(
            i,
            at.x + v.x * blast.age + fall.x,
            at.y + v.y * blast.age + fall.y,
            at.z + v.z * blast.age + fall.z,
          );
        }
        attribute.needsUpdate = true;
        sparks.material.opacity = (1 - k) * this.inView(at);
        sparks.material.color.lerpColors(new THREE.Color(COLORS.flash), new THREE.Color(COLORS.ember), Math.min(1, k * 1.6));
      },
    });

    if (!ground) return;

    // Shockwave ring on the ground, bent round the globe so it's a full circle
    // anywhere (a flat ring sank into the surface away from the middle).
    const segments = 72;
    const ringPositions = new Float32Array((segments + 1) * 2 * 3);
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
    const order: number[] = [];
    for (let i = 0; i < segments; i++) order.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    ringGeometry.setIndex(order);
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: COLORS.brand300,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.effects.add(ring);
    const spot = new THREE.Vector3();
    /** A point `angle` radians from the blast across the globe, `turn` round it. */
    const place = (angle: number, turn: number, index: number) => {
      spot
        .copy(tangent)
        .multiplyScalar(Math.cos(turn))
        .addScaledVector(bitangent, Math.sin(turn))
        .multiplyScalar(Math.sin(angle))
        .addScaledVector(normal, Math.cos(angle))
        .multiplyScalar(1.004);
      ringPositions[index] = spot.x;
      ringPositions[index + 1] = spot.y;
      ringPositions[index + 2] = spot.z;
    };
    this.blasts.push({
      object: ring,
      age: 0,
      life: 1.4,
      update: (_, k) => {
        // Angular radius on the globe (radians), easing out; the band is its outer tenth.
        const outer = 0.005 + 0.1 * (1 - Math.pow(1 - k, 3));
        for (let i = 0; i <= segments; i++) {
          const turn = (i / segments) * Math.PI * 2;
          place(outer * 0.9, turn, i * 6);
          place(outer, turn, i * 6 + 3);
        }
        ringGeometry.attributes.position.needsUpdate = true;
        ringGeometry.computeBoundingSphere();
        ring.material.opacity = 0.9 * (1 - k);
      },
    });

    // A fire left burning for a while.
    const fire = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color: COLORS.ember, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }),
    );
    fire.position.copy(normal.clone().multiplyScalar(1.004));
    this.effects.add(fire);
    const seed = Math.random() * 10;
    this.fires.push({
      object: fire,
      age: 0,
      life: random(6, 11),
      update: (blast, k) => {
        const flicker = 0.75 + 0.25 * Math.sin(blast.age * 13 + seed) * Math.sin(blast.age * 7.3 + seed);
        fire.scale.setScalar(0.045 * flicker * (k < 0.08 ? k / 0.08 : 1));
        // Drawn over the globe's edge, so it fades itself out as the spin carries it round the back.
        fire.material.opacity = (1 - k) * flicker * THREE.MathUtils.smoothstep(this.facing(fire.position), 0.02, 0.3);
      },
    });
    const maxFires = this.options.intensity === "war" ? 60 : 24;
    while (this.fires.length > maxFires) this.removeBlast(this.fires.shift()!);
  }

  private removeBlast(blast: Blast): void {
    this.effects.remove(blast.object);
    const object = blast.object as THREE.Mesh;
    // Sprites share one geometry: leave it.
    if (!(blast.object instanceof THREE.Sprite)) object.geometry?.dispose();
    (object.material as THREE.Material).dispose();
  }

  private removeMissile(missile: Missile): void {
    this.effects.remove(missile.line, missile.head);
    missile.line.geometry.dispose();
    missile.line.material.dispose();
    missile.head.material.dispose();
  }

  private clearStrikes(): void {
    for (const missile of this.missiles) this.removeMissile(missile);
    for (const blast of [...this.blasts, ...this.fires]) this.removeBlast(blast);
    this.missiles = [];
    this.blasts = [];
    this.fires = [];
  }

  private updateStrikes(dt: number): void {
    const setting = INTENSITY[this.options.intensity];
    this.nextLaunch -= dt;
    if (this.nextLaunch <= 0) {
      this.launchWave();
      this.nextLaunch = setting.every * random(0.6, 1.4);
    }

    for (const missile of this.missiles) {
      missile.age += dt;
      const material = missile.line.material;
      if (!missile.done) {
        const progress = Math.min(missile.end, missile.age / missile.duration);
        // Ease: slow climb, faster fall.
        const eased = progress * progress * (3 - 2 * progress) * 0.35 + progress * 0.65;
        const head = Math.min(missile.end, eased);
        material.uniforms.uHead.value = head;
        const index = head * (missile.points.length - 1);
        const i0 = Math.floor(index);
        const i1 = Math.min(missile.points.length - 1, i0 + 1);
        missile.head.position.lerpVectors(missile.points[i0], missile.points[i1], index - i0);
        if (progress >= missile.end) {
          missile.done = true;
          this.explode(missile.head.position.clone(), !missile.airburst);
          if (missile.target) this.options.onEvent?.({ kind: missile.airburst ? "intercept" : "impact", to: missile.target });
          missile.head.visible = false;
        }
      } else {
        missile.fadeFor += dt;
        material.uniforms.uFade.value = Math.max(0, 1 - missile.fadeFor / 0.9);
      }
    }
    const finished = this.missiles.filter((missile) => missile.done && missile.fadeFor > 0.9);
    for (const missile of finished) this.removeMissile(missile);
    this.missiles = this.missiles.filter((missile) => !finished.includes(missile));

    for (const list of [this.blasts, this.fires]) {
      for (const blast of list) {
        blast.age += dt;
        blast.update(blast, Math.min(1, blast.age / blast.life));
      }
    }
    for (const blast of this.blasts.filter((b) => b.age >= b.life)) this.removeBlast(blast);
    this.blasts = this.blasts.filter((b) => b.age < b.life);
    for (const blast of this.fires.filter((b) => b.age >= b.life)) this.removeBlast(blast);
    this.fires = this.fires.filter((b) => b.age < b.life);
  }

  // ---- Frame loop ----------------------------------------------------------

  /**
   * For recordings (the trailer renders frame by frame): stop the globe's own
   * clock and move it on by exactly `dt` seconds, then draw.
   */
  advance(dt: number): void {
    this.stop();
    let left = dt;
    while (left > 1e-6) {
      const step = Math.min(left, 1 / 60);
      this.step(step, performance.now());
      left -= step;
    }
    this.render();
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt, now);
    this.render();
    this.countFrame(now);
    this.frame = requestAnimationFrame(this.tick);
  };

  private step(dt: number, now: number): void {
    if (this.options.motion) {
      this.time += dt;
      if (!this.dragging) {
        const spin = now > this.resumeSpinAt ? SPIN : 0;
        this.world.rotation.y += (spin + this.velocity.x) * dt;
        this.tilt.rotation.x = THREE.MathUtils.clamp(this.tilt.rotation.x + this.velocity.y * dt, -0.2, 0.9);
        this.velocity.x *= Math.pow(0.04, dt);
        this.velocity.y *= Math.pow(0.04, dt);
      }
      this.updateStrikes(dt);
      for (const child of this.tilt.children) {
        const orbit = child.userData as { radius?: number; speed?: number; satellite?: THREE.Sprite };
        if (orbit.satellite && orbit.radius && orbit.speed) {
          const angle = this.time * orbit.speed * 2;
          orbit.satellite.position.set(Math.cos(angle) * orbit.radius, Math.sin(angle) * orbit.radius, 0);
        }
      }
    }
  }

  private render(): void {
    this.globeMaterial.uniforms.uTime.value = this.time;
    this.capitalMaterial.uniforms.uTime.value = this.time;
    this.capitalMaterial.uniforms.uScale.value = this.renderer.getDrawingBufferSize(this.bufferSize).y / 2;
    this.tilt.updateMatrixWorld();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private countFrame(now: number): void {
    this.frames += 1;
    const elapsed = now - this.statsFrom;
    if (elapsed < 1000) return;
    const fps = Math.round((this.frames * 1000) / elapsed);
    this.frames = 0;
    this.statsFrom = now;
    // Three slow seconds in a row on high quality: step down (phones, old PCs).
    this.slowSeconds = fps < 40 ? this.slowSeconds + 1 : 0;
    if (this.slowSeconds >= 3 && this.options.quality === "high") {
      this.slowSeconds = 0;
      this.setOptions({ quality: "low" });
    }
    this.options.onStats?.({ fps, strikes: this.missiles.length, quality: this.options.quality });
  }

  // ---- Dragging ------------------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.dragFrom = { x: event.clientX, y: event.clientY };
    this.velocity = { x: 0, y: 0 };
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = event.clientX - this.dragFrom.x;
    const dy = event.clientY - this.dragFrom.y;
    this.dragFrom = { x: event.clientX, y: event.clientY };
    const scale = 3 / Math.max(300, Math.min(this.width, this.height));
    this.world.rotation.y += dx * scale;
    this.tilt.rotation.x = THREE.MathUtils.clamp(this.tilt.rotation.x + dy * scale, -0.2, 0.9);
    this.velocity = { x: dx * scale * 30, y: dy * scale * 30 };
    if (!this.running) this.render();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    this.resumeSpinAt = performance.now() + 1500;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private bindPointer(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  private unbindPointer(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
  }
}
