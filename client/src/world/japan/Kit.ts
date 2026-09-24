import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  Vector2,
} from 'three';
import type { Aabb } from '@anime/shared';
import type { PartBuilder, PartKind, Transform } from '../../render/PartBuilder.js';
import { SURFACE_TILE, type SurfaceKind } from './Surfaces.js';

/**
 * THE JAPAN KIT: everything the world is built from, as functions that add
 * parts to a `PartBuilder` - curved temple roofs, flared pagoda roofs,
 * floating islands, sakura, pines, bamboo, torii, lanterns, shrines, machiya
 * townhouses, pagodas, a castle keep, city blocks with neon, a dojo, festival
 * stalls and mountains. Smooth, cel-shaded shapes: nothing here is a cube
 * pretending to be a tree.
 */
export type Random = () => number;

export const seeded = (seed: number): Random => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * THE PALETTE: bright, saturated game colours - the anime-Roblox look. Dark
 * tones are deep indigo rather than black, so even outlines stay colourful.
 */
export const JP = {
  vermilion: 0xff3a4a,
  vermilionDark: 0xd01f45,
  lacquer: 0x2a2250,
  roof: 0x2f7de0,
  roofDark: 0x2a5cc8,
  gold: 0xffc83a,
  wood: 0xd48a4a,
  woodDark: 0x9a5430,
  plaster: 0xfffaf0,
  stone: 0xe8e4f4,
  stoneDark: 0xb0a8d0,
  rock: 0x9d86e0,
  rockDark: 0x7a62c0,
  grass: 0x6fe04a,
  sakura: [0xff9ccf, 0xff7fbf, 0xffc2e0, 0xff6fb0],
  pine: [0x2fc060, 0x3ad874, 0x22a852],
  bamboo: 0x8fe050,
  paperRed: 0xff4a5a,
  paperWarm: 0xffe07a,
  snow: 0xf4f8ff,
} as const;

/** Rooftops in every colour: the skyline of an anime town. */
const ROOF_COLORS: readonly number[] = [0xff3a4a, 0x2f7de0, 0x19c2a0, 0x8a4de8, 0xff8a1f, 0xff4fa8, 0x3ac8ff];
/** Bright walls for houses and halls. */
const WALL_COLORS: readonly number[] = [0xfff2d8, 0xffd6e8, 0xd8f0ff, 0xe8ffd8, 0xfff0a8, 0xe8dcff];

const pick = <T>(list: readonly T[], random: Random): T => list[Math.floor(random() * list.length)]!;

/** A part placed relative to a local frame (x, y, z, yaw): props are authored upright at the origin. */
export class Local {
  constructor(
    private readonly b: PartBuilder,
    private readonly ox: number,
    private readonly oy: number,
    private readonly oz: number,
    private readonly yaw = 0,
  ) {}

  private place(t: Transform): Transform {
    const lx = t.x ?? 0;
    const lz = t.z ?? 0;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { ...t, x: this.ox + lx * c + lz * s, y: this.oy + (t.y ?? 0), z: this.oz - lx * s + lz * c, ry: (t.ry ?? 0) + this.yaw };
  }

  box(w: number, h: number, d: number, color: number, kind: PartKind = 'smooth', t: Transform = {}): this {
    this.b.box(w, h, d, color, kind, this.place(t));
    return this;
  }

  add(geometry: BufferGeometry, color: number, kind: PartKind = 'smooth', t: Transform = {}): this {
    this.b.add(geometry, color, kind, this.place(t));
    return this;
  }
}

/** Scale a geometry's UVs so a surface texture tiles by world size. */
const tileUv = (geometry: BufferGeometry, kind: SurfaceKind): BufferGeometry => {
  const uv = geometry.getAttribute('uv');
  if (!uv) return geometry;
  const k = 1 / SURFACE_TILE[kind];
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  uv.needsUpdate = true;
  return geometry;
};

/**
 * A CURVED GABLE ROOF: the sweeping concave profile of a temple roof, the
 * ridge along X, eaves at y = 0, `depth` across Z.
 */
export const curvedRoof = (width: number, depth: number, rise: number, thickness = 0.45): BufferGeometry => {
  const half = depth / 2;
  const shape = new Shape();
  shape.moveTo(-half, 0);
  shape.quadraticCurveTo(-half * 0.42, rise * 0.16, 0, rise);
  shape.quadraticCurveTo(half * 0.42, rise * 0.16, half, 0);
  shape.lineTo(half, -thickness);
  shape.quadraticCurveTo(half * 0.42, rise * 0.16 - thickness, 0, rise - thickness);
  shape.quadraticCurveTo(-half * 0.42, rise * 0.16 - thickness, -half, -thickness);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 7 });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  return tileUv(geometry, 'roof');
};

/** A FLARED HIP ROOF: a four-sided pyramid with concave sides (pagoda tiers, lantern caps). */
const flaredRoof = (radius: number, rise: number): BufferGeometry => {
  const points: Vector2[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    // Concave: stays low near the eave, climbs steeply to the tip.
    points.push(new Vector2(Math.max(0.02, radius * (1 - t)), rise * t * t));
  }
  points.push(new Vector2(0.001, rise));
  const geometry = new LatheGeometry(points, 4);
  geometry.rotateY(Math.PI / 4);
  return geometry;
};

/** Collision-true box parts for an AABB. */
export const fillBox = (b: PartBuilder, box: Aabb, color: number, kind: PartKind): void => {
  b.box(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ, color, kind, {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
    z: (box.minZ + box.maxZ) / 2,
  });
};

export interface IslandStyle {
  readonly top: SurfaceKind;
  readonly topColor: number;
  /** The band just under the walking surface. */
  readonly trim: number;
  readonly trimKind: PartKind;
  readonly rock: number;
  /** Paint street markings on the walking surface (the city district). */
  readonly road?: boolean;
}

/**
 * A FLOATING ISLAND: the walking surface (exactly the collision box's top),
 * a trim band, and a tapering rock root hanging toward the lava.
 */
export const island = (b: PartBuilder, box: Aabb, style: IslandStyle): void => {
  const w = box.maxX - box.minX;
  const d = box.maxZ - box.minZ;
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  b.box(w, 0.7, d, style.topColor, style.top, { x: cx, y: box.maxY - 0.35, z: cz });
  b.box(w + 0.02, 1.2, d + 0.02, style.trim, style.trimKind, { x: cx, y: box.maxY - 1.3, z: cz });
  b.box(w * 0.98, 1.2, d * 0.98, style.rock, 'rock', { x: cx, y: box.maxY - 2.5, z: cz });
  // A street: dashed white centre line and edge lines.
  if (style.road) {
    for (let z = box.minZ + 2; z < box.maxZ - 3; z += 6) b.box(0.5, 0.04, 3, 0xffffff, 'glow', { x: cx, y: box.maxY + 0.02, z: z + 1.5 });
    for (const ex of [box.minX + 1.2, box.maxX - 1.2]) b.box(0.35, 0.04, d - 1, 0xffffff, 'glow', { x: ex, y: box.maxY + 0.02, z: cz });
  }
  const depth = Math.min(22, 4 + Math.min(w, d) * 0.7);
  const root = new ConeGeometry(Math.SQRT1_2, depth, 4, 1);
  root.rotateY(Math.PI / 4);
  root.rotateX(Math.PI);
  b.add(root, style.rock, 'rock', { x: cx, y: box.maxY - 3.1 - depth / 2, z: cz, sx: w * 0.98, sz: d * 0.98 });
};

// ------------------------------------------------------------------ nature

export const sakura = (b: PartBuilder, x: number, y: number, z: number, s: number, random: Random): void => {
  b.add(new CylinderGeometry(0.35 * s, 0.6 * s, 4.4 * s, 7), 0x5a3a2e, 'smooth', { x, y: y + 2.2 * s, z, rz: (random() - 0.5) * 0.2 });
  for (const side of [-1, 1]) {
    b.add(new CylinderGeometry(0.18 * s, 0.3 * s, 3 * s, 6), 0x5a3a2e, 'smooth', { x: x + side * 1.1 * s, y: y + 4.6 * s, z, rz: side * -0.8 });
  }
  const blooms = 6 + Math.floor(random() * 3);
  for (let i = 0; i < blooms; i += 1) {
    const a = (i / blooms) * Math.PI * 2 + random();
    const r = (1.2 + random() * 1.6) * s;
    b.add(new IcosahedronGeometry((1.7 + random() * 1.1) * s, 1), JP.sakura[i % JP.sakura.length]!, 'smooth', {
      x: x + Math.cos(a) * r,
      y: y + (5.4 + random() * 1.8) * s,
      z: z + Math.sin(a) * r,
    });
  }
};

export const pine = (b: PartBuilder, x: number, y: number, z: number, s: number, random: Random, snow = false): void => {
  const lean = (random() - 0.5) * 0.5;
  b.add(new CylinderGeometry(0.35 * s, 0.55 * s, 6 * s, 7), 0x4a3426, 'smooth', { x, y: y + 3 * s, z, rz: lean });
  for (let i = 0; i < 3; i += 1) {
    const px = x - Math.sin(lean) * (2 + i * 2) * s + (random() - 0.5) * 2 * s;
    const py = y + (3.5 + i * 1.9) * s;
    const pz = z + (random() - 0.5) * 2 * s;
    const r = (2.8 - i * 0.6) * s;
    b.add(new SphereGeometry(r, 9, 5), JP.pine[i % 3]!, 'smooth', { x: px, y: py, z: pz, sy: 0.42 });
    if (snow) b.add(new SphereGeometry(r * 0.9, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2.5), JP.snow, 'smooth', { x: px, y: py + r * 0.12, z: pz, sy: 0.4 });
  }
};

export const bamboo = (b: PartBuilder, x: number, z: number, radius: number, count: number, random: Random, base = 0): void => {
  for (let i = 0; i < count; i += 1) {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius;
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    const h = 10 + random() * 8;
    const tone = random() < 0.5 ? JP.bamboo : 0x62a83c;
    b.add(new CylinderGeometry(0.2, 0.24, h, 6), tone, 'smooth', { x: bx, y: base + h / 2, z: bz, rz: (random() - 0.5) * 0.08 });
    for (let k = 1.6; k < h; k += 1.8) b.add(new CylinderGeometry(0.26, 0.26, 0.12, 6), 0x4f8a2c, 'smooth', { x: bx, y: base + k, z: bz });
    b.add(new IcosahedronGeometry(1.1 + random() * 0.6, 0), 0x8fd65a, 'smooth', { x: bx + 0.5, y: base + h, z: bz, sy: 0.5 });
  }
};

export const mountain = (b: PartBuilder, x: number, y: number, z: number, radius: number, height: number, color: number, snow: boolean): void => {
  b.add(new ConeGeometry(radius, height, 10, 1), color, 'rock', { x, y: y + height / 2, z });
  // The cap is a little FATTER than the peak it sits on (0.4 radius over 0.36 height), so its surface stands
  // clear of the mountain's: a cap of the same slope would share the surface and flicker at distance.
  if (snow) b.add(new ConeGeometry(radius * 0.4, height * 0.36, 10, 1), JP.snow, 'smooth', { x, y: y + height * 0.82 + 0.3, z });
};

// ------------------------------------------------------------ architecture

/** A TORII: two pillars, the curved black kasagi, the red nuki tie beam and a plaque. */
export const torii = (b: PartBuilder, x: number, y: number, z: number, span: number, height: number, color: number = JP.vermilion): void => {
  for (const side of [-1, 1]) {
    b.add(new CylinderGeometry(0.75, 0.9, height, 12), color, 'smooth', { x: x + side * span / 2, y: y + height / 2, z });
    b.add(new CylinderGeometry(1.05, 1.1, 1.1, 12), JP.lacquer, 'smooth', { x: x + side * span / 2, y: y + 0.55, z });
  }
  // The kasagi sweeps up at both ends.
  b.box(span + 2.4, 1.1, 1.9, JP.lacquer, 'smooth', { x, y: y + height + 1.0, z });
  for (const side of [-1, 1]) b.box(3.4, 1.0, 1.95, JP.lacquer, 'smooth', { x: x + side * (span / 2 + 2.6), y: y + height + 1.35, z, rz: side * -0.22 });
  b.box(span + 3.4, 0.8, 1.6, color, 'smooth', { x, y: y + height + 0.1, z });
  b.box(span + 1.4, 0.7, 1.1, color, 'smooth', { x, y: y + height - 2.6, z });
  b.box(2.4, 2.4, 0.5, JP.lacquer, 'smooth', { x, y: y + height - 1.2, z: z - 0.3 });
  // The gold face stands clear in front of its backing plate (a shared plane would flicker).
  b.box(2.0, 2.0, 0.2, JP.gold, 'glow', { x, y: y + height - 1.2, z: z - 0.7 });
};

export const stoneLantern = (b: PartBuilder, x: number, y: number, z: number, s = 1): void => {
  b.add(new CylinderGeometry(0.9 * s, 1.1 * s, 0.5 * s, 8), JP.stoneDark, 'stone', { x, y: y + 0.25 * s, z });
  b.add(new CylinderGeometry(0.32 * s, 0.4 * s, 2.2 * s, 8), JP.stone, 'stone', { x, y: y + 1.6 * s, z });
  b.box(1.4 * s, 0.35 * s, 1.4 * s, JP.stoneDark, 'stone', { x, y: y + 2.85 * s, z });
  b.box(0.95 * s, 0.95 * s, 0.95 * s, 0xffe7a8, 'glow', { x, y: y + 3.5 * s, z });
  b.add(flaredRoof(1.2 * s, 1.1 * s), JP.stone, 'smooth', { x, y: y + 3.95 * s, z });
  b.add(new SphereGeometry(0.2 * s, 6, 4), JP.stone, 'smooth', { x, y: y + 5.15 * s, z });
};

/** A round paper lantern (chōchin), lit. */
export const paperLantern = (b: PartBuilder, x: number, y: number, z: number, color: number = JP.paperRed, s = 1): void => {
  b.add(new SphereGeometry(0.7 * s, 10, 8), color, 'glow', { x, y, z, sy: 1.3 });
  b.add(new CylinderGeometry(0.45 * s, 0.45 * s, 0.2 * s, 8), JP.lacquer, 'smooth', { x, y: y + 0.95 * s, z });
  b.add(new CylinderGeometry(0.45 * s, 0.45 * s, 0.2 * s, 8), JP.lacquer, 'smooth', { x, y: y - 0.95 * s, z });
};

/** A SHRINE HALL: raised floor, vermilion posts, shoji walls, a sweeping roof with a gold ridge. */
export const shrine = (b: PartBuilder, x: number, y: number, z: number, yaw: number, s = 1): void => {
  const l = new Local(b, x, y, z, yaw);
  const w = 12 * s;
  const d = 9 * s;
  l.box(w + 2, 1.2 * s, d + 2, JP.stoneDark, 'stone', { y: 0.6 * s });
  l.box(w, 0.5 * s, d, JP.woodDark, 'wood', { y: 1.45 * s });
  for (const px of [-1, 1]) for (const pz of [-1, 1]) l.add(new CylinderGeometry(0.35 * s, 0.35 * s, 6 * s, 8), JP.vermilion, 'smooth', { x: px * (w / 2 - 0.5), y: 4.6 * s, z: pz * (d / 2 - 0.5) });
  l.box(w - 1.2, 5.4 * s, 0.3, 0xffffff, 'shoji', { y: 4.4 * s, z: -d / 2 + 0.6 });
  for (const px of [-1, 1]) l.box(0.3, 5.4 * s, d - 1.2, 0xffffff, 'shoji', { x: px * (w / 2 - 0.6), y: 4.4 * s });
  l.box(w - 1.2, 5.4 * s, 0.3, 0xfff6e0, 'shoji', { y: 4.4 * s, z: d / 2 - 0.9 });
  l.add(curvedRoof(w + 5 * s, d + 6 * s, 5.5 * s), JP.roof, 'roof', { y: 7.5 * s });
  l.box(w + 3 * s, 0.6 * s, 0.9 * s, JP.gold, 'smooth', { y: 7.5 * s + 5.3 * s });
  // Steps and the offering box.
  l.box(4 * s, 0.6 * s, 2 * s, JP.stone, 'stone', { y: 0.3 * s, z: d / 2 + 1.8 });
  l.box(2.2 * s, 1 * s, 1 * s, JP.woodDark, 'wood', { y: 2.2 * s, z: d / 2 - 0.2 });
  paperLantern(b, x + Math.cos(yaw) * (w / 2 - 1), y + 6.2 * s, z - Math.sin(yaw) * (w / 2 - 1) + Math.cos(yaw) * (d / 2), JP.paperRed, s);
};

/** A MACHIYA townhouse: dark lattice ground floor, plaster upper floor, two roofs, a noren and a lantern. */
export const house = (b: PartBuilder, x: number, y: number, z: number, yaw: number, random: Random, s = 1): void => {
  const l = new Local(b, x, y, z, yaw);
  const w = (8 + random() * 4) * s;
  const d = 8 * s;
  const roof = pick(ROOF_COLORS, random);
  l.box(w, 4.2 * s, d, pick([0xd48a4a, 0x5a8ae0, 0xe05a8a, 0x3ab88a], random), 'wood', { y: 2.1 * s });
  l.box(w * 0.94, 3.6 * s, d * 0.94, pick(WALL_COLORS, random), 'plaster', { y: 6.2 * s });
  l.box(w * 0.5, 2 * s, 0.2, 0xffffff, 'shoji', { y: 6.3 * s, z: d * 0.47 + 0.05 });
  l.add(curvedRoof(w + 1.5, 2.6 * s, 1.1 * s, 0.35), roof, 'roof', { y: 4.25 * s, z: d / 2 + 0.6 });
  l.add(curvedRoof(w + 2, d + 3.5 * s, 3.2 * s), roof, 'roof', { y: 8 * s });
  const noren = pick([0x2f7dff, 0xff2d6f, 0x8a4dff, 0x19c2a0], random);
  for (let i = -1; i <= 1; i += 1) l.box(1.2 * s, 1.6 * s, 0.1, noren, 'smooth', { x: i * 1.35 * s, y: 3.2 * s, z: d / 2 + 0.08 });
};

/** A PAGODA: stacked bodies under flared roofs, a gold spire on top. */
export const pagoda = (b: PartBuilder, x: number, y: number, z: number, tiers: number, s = 1, body: number = JP.vermilion, roof: number = JP.roof): void => {
  b.box(10 * s, 1.5 * s, 10 * s, JP.stoneDark, 'stone', { x, y: y + 0.75 * s, z });
  let top = y + 1.5 * s;
  for (let i = 0; i < tiers; i += 1) {
    const w = (7 - i * 0.9) * s;
    const h = 3.6 * s;
    b.box(w, h, w, body, 'smooth', { x, y: top + h / 2, z });
    b.box(w * 0.7, h * 0.5, w + 0.05, 0xffffff, 'shoji', { x, y: top + h * 0.5, z });
    b.add(flaredRoof(w * 0.95 + 3 * s, 2.2 * s), roof, 'roof', { x, y: top + h - 0.2 * s, z });
    top += h + 1.2 * s;
  }
  b.add(new CylinderGeometry(0.18 * s, 0.25 * s, 6 * s, 6), JP.gold, 'smooth', { x, y: top + 2.5 * s, z });
  for (let k = 0; k < 5; k += 1) b.add(new CylinderGeometry(0.55 * s, 0.55 * s, 0.18 * s, 8), JP.gold, 'smooth', { x, y: top + 1 * s + k * 0.9 * s, z });
};

/** A CASTLE KEEP: sloped castle-stone base, white tiers under dark curved roofs, gold ornaments. */
export const castle = (b: PartBuilder, x: number, y: number, z: number, s = 1): void => {
  for (let i = 0; i < 3; i += 1) b.box((30 - i * 3) * s, 3 * s, (24 - i * 3) * s, 0x9a9690, 'ishigaki', { x, y: y + (1.5 + i * 3) * s, z });
  let top = y + 9 * s;
  const tiers = [
    [22, 18, 6],
    [17, 14, 5.5],
    [12, 10, 5],
    [8, 7, 4.5],
  ] as const;
  for (const [w, d, h] of tiers) {
    b.box(w * s, h * s, d * s, JP.plaster, 'plaster', { x, y: top + (h * s) / 2, z });
    b.box(w * s * 1.01, 0.8 * s, d * s * 1.01, JP.roofDark, 'smooth', { x, y: top + 0.4 * s, z });
    b.add(curvedRoof((w + 4) * s, (d + 5) * s, 2.6 * s), JP.roofDark, 'roof', { x, y: top + h * s, z });
    top += (h + 2) * s;
  }
  for (const side of [-1, 1]) b.add(new ConeGeometry(0.6 * s, 2 * s, 5), JP.gold, 'smooth', { x: x + side * 4 * s, y: top + 0.5 * s, z, rz: side * 0.6 });
};

/** A FESTIVAL STALL (yatai): counter, posts and a striped awning. */
export const stall = (b: PartBuilder, x: number, y: number, z: number, yaw: number, stripe: number): void => {
  const l = new Local(b, x, y, z, yaw);
  l.box(6, 2, 3, stripe, 'smooth', { y: 1 });
  for (const px of [-2.8, 2.8]) l.box(0.25, 5, 0.25, JP.woodDark, 'smooth', { x: px, y: 2.5, z: 1.3 });
  for (let i = 0; i < 6; i += 1) l.box(1, 0.3, 3.8, i % 2 ? 0xffffff : stripe, 'smooth', { x: -2.5 + i, y: 5.1, z: 0.2, rx: -0.25 });
  l.box(6.4, 0.9, 0.12, stripe, 'glow', { y: 4.3, z: 1.45 });
};

/** A DOJO hall: wide low building, dark wood and plaster, a big curved roof. */
export const dojo = (b: PartBuilder, x: number, y: number, z: number, yaw: number, s = 1): void => {
  const l = new Local(b, x, y, z, yaw);
  const w = 18 * s;
  const d = 12 * s;
  l.box(w + 1, 1, d + 1, JP.stoneDark, 'stone', { y: 0.5 });
  l.box(w, 5 * s, d, JP.plaster, 'plaster', { y: 1 + 2.5 * s });
  for (let i = 0; i <= 6; i += 1) l.box(0.5, 5 * s, 0.5, JP.woodDark, 'smooth', { x: -w / 2 + (i * w) / 6, y: 1 + 2.5 * s, z: d / 2 + 0.1 });
  l.box(w, 0.6, 0.55, JP.woodDark, 'smooth', { y: 1 + 5 * s, z: d / 2 + 0.1 });
  l.add(curvedRoof(w + 5, d + 7, 5 * s), 0x19c2a0, 'roof', { y: 1 + 5.4 * s });
};

