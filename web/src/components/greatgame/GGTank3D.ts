"use client";

import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

/**
 * A neon Abrams-style tank as a real 3D model (three.js), so it has true
 * proportions and perspective: dark armour with glowing neon edges. It's
 * built in metres from the M1's layout (hull with a sloped glacis and a flat
 * engine deck, tracks with the raised rear sprocket, side skirts, the low
 * wedge turret set forward with the bustle rack around its back, cupola,
 * loader's hatch, gunner's sight, the long gun held level) and drawn through
 * a camera that matches the stage scene exactly, into a small region the
 * scene then copies onto its front layer.
 */

const CYAN = 0x22e5ff;
const PINK = 0xff4fe0;
const VIOLET = 0xb46bff;
/** The model's overall width (skirt to skirt), in metres. */
export const TANK_WIDTH_M = 3.72;
/** The model's rear face, in metres from its origin (it drives towards -z). */
export const TANK_REAR_M = 3.97;

interface EdgeSet {
  thin: LineMaterial;
  glow: LineMaterial;
}

/** A side profile (z, y pairs, metres) extruded across x, centred on `x` with `width`. */
function profile(points: [number, number][], width: number, x = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // Shape x is the world z, shape y the world y, the extrusion runs across x.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(x + width / 2, 0, 0);
  return geometry;
}

/** A plan outline (x, z pairs, metres) extruded upwards from `bottom` by `height`, with a small bevel. */
function plan(points: [number, number][], bottom: number, height: number, bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom + bevel, 0);
  return geometry;
}

function cylinder(radius: number, length: number, at: [number, number, number], along: "x" | "y" | "z"): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12, 1);
  if (along === "z") geometry.rotateX(Math.PI / 2);
  if (along === "x") geometry.rotateZ(Math.PI / 2);
  geometry.translate(...at);
  return geometry;
}

function box(size: [number, number, number], at: [number, number, number]): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(...size);
  geometry.translate(...at);
  return geometry;
}

export class Tank3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();
  private tank = new THREE.Group();
  private materials: LineMaterial[] = [];
  private tailLights: THREE.MeshBasicMaterial;
  private size = { w: 0, h: 0, ratio: 0 };
  private box = new THREE.Box3();

  constructor() {
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.AmbientLight(0x6a4aa8, 1.1));
    const key = new THREE.DirectionalLight(0xff8ff0, 1.4);
    key.position.set(-3, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x22e5ff, 0.9);
    rim.position.set(5, 3, -4);
    this.scene.add(rim);

    // Faces sit a hair behind their own edge lines so the neon never flickers into them.
    const skin = (color: number, emissive: number) =>
      new THREE.MeshLambertMaterial({ color, emissive, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const hullSkin = skin(0x1b0d3a, 0x0a0418);
    const turretSkin = skin(0x25124f, 0x0c0520);
    const trackSkin = skin(0x0c0618, 0x05020c);
    this.tailLights = new THREE.MeshBasicMaterial({ color: 0xff3a6a });

    const pink = this.edges(PINK, 1.15);
    const cyan = this.edges(CYAN, 1.15);
    const violet = this.edges(VIOLET, 0.8);

    // Tracks: the raised rear drive sprocket, the long run on the road, the front idler.
    const track: [number, number][] = [
      [3.55, 0.92],
      [3.82, 0.58],
      [3.35, 0.06],
      [-3.0, 0.06],
      [-3.78, 0.46],
      [-3.6, 0.8],
    ];
    for (const side of [-1, 1]) this.part(profile(track, 0.62, side * 1.49), trackSkin, cyan, 35);
    // Lower hull between the tracks.
    this.part(box([2.3, 0.42, 7.4], [0, 0.62, 0]), hullSkin, pink, 35);
    // Upper hull: the rear plate, the flat engine deck and the sloped glacis, wide over the tracks.
    const hull: [number, number][] = [
      [TANK_REAR_M, 0.82],
      [TANK_REAR_M, 1.34],
      [-2.35, 1.34],
      [-3.92, 1.02],
      [-3.92, 0.82],
    ];
    this.part(profile(hull, 3.62), hullSkin, pink, 30);
    // Side skirts over the upper tracks.
    for (const side of [-1, 1]) this.part(box([0.1, 0.52, 6.7], [side * 1.81, 0.58, -0.25]), hullSkin, pink, 35);
    // Rear details: the three-panel turbine grille and the tail lights.
    for (const x of [-0.82, 0, 0.82]) this.part(box([0.74, 0.36, 0.04], [x, 1.06, TANK_REAR_M + 0.02]), trackSkin, violet, 35);
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(box([0.2, 0.12, 0.04], [side * 1.5, 1.2, TANK_REAR_M + 0.03]), this.tailLights);
      this.tank.add(light);
    }
    // Engine deck grilles.
    for (const x of [-0.75, 0.75]) this.part(box([1.1, 0.02, 1.4], [x, 1.35, 2.9]), trackSkin, violet, 35);

    // Turret: low and wide, a wedge at the front, set forward on the hull; its back (the bustle) overhangs the deck.
    const turret = new THREE.Group();
    const outline: [number, number][] = [
      [-1.72, 2.55],
      [1.72, 2.55],
      [1.84, 0.45],
      [1.7, -1.05],
      [0.72, -1.78],
      [-0.72, -1.78],
      [-1.7, -1.05],
      [-1.84, 0.45],
    ];
    this.part(plan(outline, 1.34, 0.74, 0.05), turretSkin, cyan, 30, turret);
    // Gun mantlet, and the gun held level: thermal-sleeve clamps, bore evacuator, muzzle.
    this.part(box([0.62, 0.42, 0.36], [0, 1.68, -1.9]), turretSkin, cyan, 35, turret);
    this.part(cylinder(0.09, 5.5, [0, 1.7, -4.8], "z"), turretSkin, cyan, 50, turret);
    for (const z of [-2.9, -3.9, -6.6]) this.part(cylinder(0.115, 0.08, [0, 1.7, z], "z"), turretSkin, cyan, 50, turret);
    this.part(cylinder(0.15, 0.62, [0, 1.7, -5.2], "z"), turretSkin, cyan, 50, turret);
    this.part(cylinder(0.11, 0.2, [0, 1.7, -7.5], "z"), turretSkin, cyan, 50, turret);
    // Commander's cupola (right) with its heavy machine gun, the loader's hatch (left) with its gun, the gunner's sight.
    this.part(cylinder(0.38, 0.22, [0.62, 2.19, 0.35], "y"), turretSkin, cyan, 50, turret);
    this.part(box([0.07, 0.07, 1.15], [0.62, 2.42, -0.05]), turretSkin, cyan, 35, turret);
    this.part(cylinder(0.33, 0.07, [-0.62, 2.12, 0.5], "y"), turretSkin, cyan, 50, turret);
    this.part(box([0.06, 0.06, 0.85], [-0.62, 2.3, 0.15]), turretSkin, cyan, 35, turret);
    this.part(box([0.42, 0.3, 0.48], [0.98, 2.23, -1.05]), turretSkin, cyan, 35, turret);
    // The bustle rack: rails around the turret's back.
    const rails: number[] = [];
    const railY = [1.48, 1.86];
    const back = 2.95;
    const front = 1.75;
    for (const y of railY) {
      rails.push(-1.95, y, front, -1.95, y, back, -1.95, y, back, 1.95, y, back, 1.95, y, back, 1.95, y, front);
    }
    for (const x of [-1.95, -1.3, -0.65, 0, 0.65, 1.3, 1.95]) rails.push(x, railY[0], back, x, railY[1], back);
    for (const side of [-1.95, 1.95]) for (const z of [front, 2.35]) rails.push(side, railY[0], z, side, railY[1], z);
    this.lines(rails, pink, turret);
    // Whip antennas at the turret's rear corners.
    this.lines([-1.5, 2.08, 2.25, -1.54, 2.7, 2.33, 1.5, 2.08, 2.25, 1.54, 2.7, 2.33], pink, turret);
    turret.position.z = -0.35;
    this.tank.add(turret);
    this.scene.add(this.tank);
  }

  /** A neon edge style: a thin bright line over a wide faint glow. */
  private edges(color: number, width: number): EdgeSet {
    const thin = new LineMaterial({ color, linewidth: width, transparent: true });
    const glow = new LineMaterial({ color, linewidth: width * 3.4, transparent: true, opacity: 0.16, depthWrite: false });
    this.materials.push(thin, glow);
    return { thin, glow };
  }

  private part(geometry: THREE.BufferGeometry, skin: THREE.Material, edges: EdgeSet, threshold: number, parent: THREE.Object3D = this.tank) {
    parent.add(new THREE.Mesh(geometry, skin));
    const lines = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geometry, threshold));
    parent.add(new LineSegments2(lines, edges.glow));
    parent.add(new LineSegments2(lines, edges.thin));
  }

  private lines(positions: number[], edges: EdgeSet, parent: THREE.Object3D) {
    const geometry = new LineSegmentsGeometry().setPositions(positions);
    parent.add(new LineSegments2(geometry, edges.glow));
    parent.add(new LineSegments2(geometry, edges.thin));
  }

  /**
   * Draws the tank for a view of the stage scene and returns where on the
   * stage the picture goes (CSS px). The scene's projection: world (x, y, z
   * ahead) → (cx + x / z · f, hy + (camH − y) / z · f).
   *
   * `place`: the tank's centre across (x), the distance to its rear face (z),
   * its width (world units), its lean and yaw (radians), a bob (world units).
   */
  render(
    view: { w: number; h: number; hy: number; cx: number; f: number; camH: number },
    place: { x: number; z: number; width: number; lean: number; yaw: number; bob: number },
    ratio: number,
    time: number,
  ): { x: number; y: number; w: number; h: number } | null {
    const s = place.width / TANK_WIDTH_M;
    this.tank.scale.setScalar(s);
    this.tank.position.set(place.x, place.bob, -(place.z + TANK_REAR_M * s));
    this.tank.rotation.set(0, place.yaw, place.lean);
    this.tank.updateMatrixWorld(true);
    // Where it lands on the stage: the projected bounds, with a margin for the glow.
    this.box.setFromObject(this.tank);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const x of [this.box.min.x, this.box.max.x]) {
      for (const y of [this.box.min.y, this.box.max.y]) {
        for (const z of [this.box.min.z, this.box.max.z]) {
          const depth = -z;
          if (depth <= 0.05) continue;
          const px = view.cx + (x / depth) * view.f;
          const py = view.hy + ((view.camH - y) / depth) * view.f;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
      }
    }
    if (!Number.isFinite(minX)) return null;
    const pad = 14;
    const rx = Math.floor(minX - pad);
    const ry = Math.floor(minY - pad);
    const rw = Math.ceil(maxX - minX + pad * 2);
    const rh = Math.ceil(maxY - minY + pad * 2);
    if (rw < 4 || rh < 4) return null;
    if (this.size.w < rw || this.size.h < rh || this.size.ratio !== ratio) {
      this.size = { w: Math.max(rw, this.size.w), h: Math.max(rh, this.size.h), ratio };
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(this.size.w, this.size.h, false);
      for (const material of this.materials) material.resolution.set(this.size.w, this.size.h);
    }
    const W = this.size.w;
    const H = this.size.h;
    // A camera at the scene's eye height, looking straight ahead, with the
    // scene's focal length and its principal point moved to this region.
    const pcx = view.cx - rx;
    const phy = view.hy - ry;
    const near = 0.1;
    const far = 400;
    this.camera.position.set(0, view.camH, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    this.camera.projectionMatrix.set(
      (2 * view.f) / W, 0, -((2 * pcx) / W - 1), 0,
      0, (2 * view.f) / H, -(1 - (2 * phy) / H), 0,
      0, 0, -(far + near) / (far - near), (-2 * far * near) / (far - near),
      0, 0, -1, 0,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    // Tail lights breathe.
    const pulse = 0.75 + 0.25 * Math.sin(time * 3);
    this.tailLights.color.setRGB(1, 0.23 * pulse, 0.42 * pulse);
    this.renderer.render(this.scene, this.camera);
    return { x: rx, y: ry, w: W, h: H };
  }

  dispose() {
    this.renderer.dispose();
  }
}
