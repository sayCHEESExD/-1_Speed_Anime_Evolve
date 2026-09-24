import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  SphereGeometry,
  type Object3D,
} from 'three';
import type { PartBuilder } from '../../render/PartBuilder.js';
import { animate, auraRing, energyOrb } from '../anime/AnimeKit.js';
import { Local, curvedRoof, pagoda, type Random } from '../japan/Kit.js';

/**
 * THE SET-PIECES of the twelve anime worlds: a FEW LARGE, readable structures
 * per bank rather than dozens of props. Each is a small function of plain
 * Roblox-style shapes in the world's own palette (the caller passes every
 * colour: nothing here picks a random one).
 *
 * Authored in a LOCAL frame whose +Z faces the course; `yaw` turns it there.
 * Animated pieces (orbs, crystals, books) are handed to `add`.
 */
export interface PieceContext {
  readonly b: PartBuilder;
  readonly random: Random;
  readonly add: (object: Object3D) => Object3D;
}

/** Place a piece at (x, y, z) facing the course. */
export type Piece = (ctx: PieceContext, x: number, y: number, z: number, yaw: number) => void;

const local = (ctx: PieceContext, x: number, y: number, z: number, yaw: number): Local => new Local(ctx.b, x, y, z, yaw);

/** A prism roof (gable) along local X: two tilted slabs meeting at the ridge. */
const gable = (l: Local, w: number, d: number, rise: number, y: number, color: number, x = 0, z = 0): void => {
  const slope = Math.hypot(d / 2, rise);
  const angle = Math.atan2(rise, d / 2);
  for (const side of [-1, 1]) l.box(w, 0.5, slope + 0.4, color, 'roof', { x, y: y + rise / 2, z: z + side * d / 4, rx: side * angle });
};

// ------------------------------------------------------------- 1. PIRATE ISLES

export const PIRATE = { sand: 0xf2dca0, wood: 0xb0703f, woodDark: 0x7a4a2a, sail: 0xfff6e4, red: 0xe8453c, teal: 0x2ec4c4, palm: 0x3ec24a, stone: 0xd8b080 } as const;

/** A PIRATE SHIP beached on the bank: hull, deck, two masts with sails, a red pennant. */
export const pirateShip: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw + Math.PI / 2);
  const P = PIRATE;
  l.box(26, 5, 9, P.wood, 'wood', { y: 3.5 });
  l.box(26.4, 1, 9.4, P.woodDark, 'smooth', { y: 6.2 });
  l.box(6, 3, 9, P.wood, 'wood', { x: -12, y: 7.5 });
  l.add(new ConeGeometry(4.6, 8, 4), P.wood, 'smooth', { x: 16.5, y: 3.8, rz: -Math.PI / 2, ry: Math.PI / 4, sz: 1.35 });
  for (let i = -2; i <= 2; i += 1) l.box(1.4, 1, 0.3, P.woodDark, 'smooth', { x: i * 4, y: 4.2, z: 4.66 });
  for (const [mx, h] of [[-3, 20], [7, 16]] as const) {
    l.add(new CylinderGeometry(0.45, 0.55, h, 8), P.woodDark, 'smooth', { x: mx, y: 6.6 + h / 2 });
    l.box(0.4, h * 0.48, 9, P.sail, 'smooth', { x: mx + 0.6, y: 6.6 + h * 0.55 });
    l.box(0.5, 0.5, 9.6, P.woodDark, 'smooth', { x: mx, y: 6.6 + h * 0.8 });
  }
  l.box(0.2, 1.6, 3, P.red, 'smooth', { x: -3, y: 28, z: 1.6 });
};

/** A LIGHTHOUSE: a banded tower, its lamp lit. */
export const lighthouse: Piece = (ctx, x, y, z) => {
  const P = PIRATE;
  ctx.b.add(new CylinderGeometry(6, 7, 3, 12), P.stone, 'rock', { x, y: y + 1.5, z });
  for (let i = 0; i < 4; i += 1) ctx.b.add(new CylinderGeometry(3.4 - i * 0.35, 3.75 - i * 0.35, 5, 12), i % 2 ? P.red : P.sail, 'smooth', { x, y: y + 5.5 + i * 5, z });
  ctx.b.add(new CylinderGeometry(2.6, 2.6, 0.6, 12), P.woodDark, 'smooth', { x, y: y + 23.3, z });
  ctx.b.add(new CylinderGeometry(1.6, 1.6, 2.6, 10), 0xfff2a0, 'glow', { x, y: y + 25, z });
  ctx.b.add(new ConeGeometry(2.4, 3, 12), P.red, 'smooth', { x, y: y + 27.8, z });
};

/** A PALM: a leaning, segmented trunk and a crown of long leaves. */
const palm = (b: PartBuilder, x: number, y: number, z: number, s: number, lean: number, spin: number): void => {
  let px = x;
  let py = y;
  for (let i = 0; i < 5; i += 1) {
    b.add(new CylinderGeometry(0.42 * s, 0.5 * s, 2.4 * s, 7), i % 2 ? 0xb08a5a : 0x9a7a4a, 'smooth', { x: px, y: py + 1.2 * s, z, rz: -lean });
    px += Math.sin(lean) * 2.3 * s;
    py += Math.cos(lean) * 2.3 * s;
  }
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + spin;
    b.box(0.9 * s, 0.25 * s, 5.4 * s, k % 2 ? PIRATE.palm : 0x2fa83e, 'smooth', { x: px + Math.sin(a) * 2.2 * s, y: py - 0.4 * s, z: z + Math.cos(a) * 2.2 * s, ry: a, rx: 0.45 });
  }
};

export const palmGrove: Piece = (ctx, x, y, z) => {
  const r = ctx.random;
  palm(ctx.b, x, y, z, 1.4, 0.18, r());
  palm(ctx.b, x - 5, y, z + 6, 1.1, -0.25, r());
  palm(ctx.b, x + 4, y, z - 7, 1.2, 0.3, r());
};

// ------------------------------------------------------------- 2. HERO CITY

export const HERO = { white: 0xf4f6fa, glass: 0x9ad4f4, green: 0x2e9e6a, navy: 0x2a3a6a, red: 0xe8453c, grey: 0xc8d0dc } as const;

/** A HERO ACADEMY: two glass towers joined by a sky bridge over a wide white base. */
export const heroAcademy: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  const H = HERO;
  l.box(26, 8, 14, H.white, 'plaster', { y: 4 });
  l.box(26.4, 0.8, 14.4, H.green, 'smooth', { y: 8.4 });
  for (const tx of [-8, 8]) {
    l.box(7, 34, 7, H.glass, 'windows', { x: tx, y: 8 + 17 });
    l.box(7.6, 1.2, 7.6, H.green, 'smooth', { x: tx, y: 42.6 });
  }
  l.box(10, 4, 5, H.white, 'plaster', { y: 30 });
  l.box(10.2, 0.6, 5.2, H.green, 'glow', { y: 28.2 });
};

/** A GLASS OFFICE TOWER with a coloured crown. */
export const officeTower = (crown: number, body: number): Piece => (ctx, x, y, z) => {
  const h = 34 + ctx.random() * 22;
  ctx.b.box(12, h, 12, body, 'windows', { x, y: y + h / 2, z });
  ctx.b.box(12.8, 1.4, 12.8, crown, 'smooth', { x, y: y + h + 0.7, z });
  ctx.b.box(6, 3, 6, HERO.grey, 'smooth', { x, y: y + h + 2.9, z });
};

/** A TRAINING GROUND: a green field with lane lines and target boards. */
export const trainingField: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  l.box(22, 0.3, 26, 0x5ac86a, 'grass', { y: 0.15 });
  for (const lx of [-6, 0, 6]) l.box(0.4, 0.1, 24, 0xffffff, 'smooth', { x: lx, y: 0.35 });
  for (const tx of [-7, 0, 7]) {
    l.box(0.4, 4, 0.4, HERO.navy, 'smooth', { x: tx, y: 2, z: -10 });
    l.add(new CylinderGeometry(2, 2, 0.4, 20), 0xffffff, 'smooth', { x: tx, y: 4.6, z: -10, rx: Math.PI / 2 });
    l.add(new CylinderGeometry(1.2, 1.2, 0.5, 20), HERO.red, 'smooth', { x: tx, y: 4.6, z: -9.95, rx: Math.PI / 2 });
  }
};

// ------------------------------------------------------------- 3. CURSED CITY

export const CURSED = { navy: 0x2a2f5a, slate: 0x4a4f7a, glow: 0x9a5aff, roof: 0x1f1f3a, pale: 0xc8c8e8, blue: 0x5a7aff } as const;

/** A TRADITIONAL SCHOOL HALL in the dusk: dark timber, a heavy roof, a violet ridge. */
export const cursedHall: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  const C = CURSED;
  l.box(24, 2, 16, C.slate, 'ishigaki', { y: 1 });
  l.box(20, 8, 12, C.pale, 'plaster', { y: 6 });
  for (let i = -2; i <= 2; i += 1) l.box(0.6, 8, 0.6, C.roof, 'smooth', { x: i * 4.8, y: 6, z: 6.1 });
  l.add(curvedRoof(26, 18, 7), C.roof, 'roof', { y: 10 });
  l.box(22, 0.5, 0.6, C.glow, 'glow', { y: 16.9 });
};

/** A DARK TOWER with glowing violet windows at the top. */
export const darkTower: Piece = (ctx, x, y, z) => {
  const h = 40 + ctx.random() * 24;
  ctx.b.box(11, h, 11, CURSED.slate, 'windows', { x, y: y + h / 2, z });
  ctx.b.box(11.6, 2, 11.6, CURSED.navy, 'smooth', { x, y: y + h + 1, z });
  ctx.b.box(11.8, 0.6, 11.8, CURSED.glow, 'glow', { x, y: y + h - 3, z });
};

/** A CURSED RIFT: a ring of dark stones round a floating violet orb. */
export const cursedRift: Piece = (ctx, x, y, z) => {
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    ctx.b.box(2.4, 4 + (i % 3) * 2, 2.4, CURSED.navy, 'rock', { x: x + Math.cos(a) * 8, y: y + 2 + (i % 3), z: z + Math.sin(a) * 8, ry: a });
  }
  const orb = energyOrb(CURSED.glow, 3.2, x * 0.01);
  orb.position.set(x, y + 9, z);
  ctx.add(orb);
};

// ------------------------------------------------------------- 4. NINJA VILLAGE

export const NINJA = { orange: 0xff8a2a, roof: 0xd8552a, wall: 0xf4e0b8, wood: 0xa06a3a, leaf: 0x5ac84a, leafDark: 0x3aa83e, blue: 0x3a8ad8 } as const;

/** ROUND HOUSES: three cylinder homes with flat orange caps and dark window bands. */
export const roundHouses: Piece = (ctx, x, y, z) => {
  const N = NINJA;
  const homes = [[0, 0, 6, 14], [-9, 7, 4.5, 10], [8, 8, 4, 8]] as const;
  for (const [dx, dz, r, h] of homes) {
    ctx.b.add(new CylinderGeometry(r, r, h, 16), N.wall, 'plaster', { x: x + dx, y: y + h / 2, z: z + dz });
    ctx.b.add(new CylinderGeometry(r * 1.02, r * 1.02, 1.2, 16), 0x5a4a3a, 'smooth', { x: x + dx, y: y + h * 0.6, z: z + dz });
    ctx.b.add(new CylinderGeometry(r * 1.15, r * 1.15, 1, 16), N.roof, 'smooth', { x: x + dx, y: y + h + 0.5, z: z + dz });
  }
};

/** A WATER TOWER on four legs. */
export const waterTower: Piece = (ctx, x, y, z) => {
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) ctx.b.box(0.7, 16, 0.7, NINJA.wood, 'smooth', { x: x + dx, y: y + 8, z: z + dz });
  ctx.b.add(new CylinderGeometry(5, 5, 7, 16), NINJA.wall, 'plaster', { x, y: y + 19.5, z });
  ctx.b.add(new ConeGeometry(5.8, 3.5, 16), NINJA.roof, 'smooth', { x, y: y + 24.8, z });
};

/** A GREAT TREE: a thick trunk and three big round canopies. */
export const greatTree = (leaf: number, leafDark: number, s = 1): Piece => (ctx, x, y, z) => {
  ctx.b.add(new CylinderGeometry(1.8 * s, 2.8 * s, 16 * s, 9), 0x8a5a3a, 'smooth', { x, y: y + 8 * s, z });
  ctx.b.add(new SphereGeometry(8 * s, 12, 8), leaf, 'smooth', { x, y: y + 18 * s, z, sy: 0.75 });
  ctx.b.add(new SphereGeometry(5.5 * s, 12, 8), leafDark, 'smooth', { x: x + 6 * s, y: y + 15 * s, z: z + 2 * s, sy: 0.8 });
  ctx.b.add(new SphereGeometry(5 * s, 12, 8), leafDark, 'smooth', { x: x - 5.5 * s, y: y + 15.5 * s, z: z - 2.5 * s, sy: 0.8 });
};

// ------------------------------------------------------------- 5. WISTERIA MOUNTAINS

export const WISTERIA = { green: 0x2f6f5a, teal: 0x3fd1a6, bloom: 0xb88af0, bloomLight: 0xd8b8ff, wood: 0x5a3a2a, roof: 0x2a2f4a, warm: 0xffc86a } as const;

/** A WISTERIA TREE: a wide canopy of lilac blooms with hanging clusters. */
export const wisteriaTree: Piece = (ctx, x, y, z) => {
  const W = WISTERIA;
  ctx.b.add(new CylinderGeometry(1.2, 1.8, 10, 8), W.wood, 'smooth', { x, y: y + 5, z });
  ctx.b.add(new SphereGeometry(8, 12, 6), W.bloom, 'smooth', { x, y: y + 12, z, sy: 0.45 });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    ctx.b.add(new ConeGeometry(1.3, 5, 6), i % 2 ? W.bloomLight : W.bloom, 'smooth', { x: x + Math.cos(a) * 6, y: y + 8.2, z: z + Math.sin(a) * 6, rx: Math.PI });
  }
};

/** A MOUNTAIN HOUSE: dark timber, a heavy roof, warm light in the windows. */
export const mountainHouse: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  const W = WISTERIA;
  l.box(16, 1.2, 12, 0x6a6a7a, 'ishigaki', { y: 0.6 });
  l.box(14, 7, 10, W.wood, 'wood', { y: 4.7 });
  for (const wx of [-4, 0, 4]) l.box(2.4, 2.4, 0.2, W.warm, 'glow', { x: wx, y: 5, z: 5.05 });
  l.add(curvedRoof(19, 15, 5), W.roof, 'roof', { y: 8.2 });
};

/** A GROVE of three tall dark pines. */
export const pineGrove = (a: number, b2: number): Piece => (ctx, x, y, z) => {
  for (const [dx, dz, s] of [[0, 0, 1.3], [-6, 5, 1], [5, -6, 1.1]] as const) {
    ctx.b.add(new CylinderGeometry(0.6 * s, 0.9 * s, 8 * s, 7), 0x4a3426, 'smooth', { x: x + dx, y: y + 4 * s, z: z + dz });
    for (let i = 0; i < 3; i += 1) ctx.b.add(new ConeGeometry((4.2 - i * 1.1) * s, 5 * s, 8), i % 2 ? b2 : a, 'smooth', { x: x + dx, y: y + (7 + i * 3.2) * s, z: z + dz });
  }
};

// ------------------------------------------------------------- 6. WILD FRONTIER

export const WILD = { green: 0x5ad84a, dark: 0x2f9a4a, stone: 0xd8d0b8, blue: 0x3a9ae8, white: 0xf4f4ee } as const;

/** A FIGHTING TOWER: a very tall slender spire with banded floors and a crown dish. */
export const fightTower: Piece = (ctx, x, y, z) => {
  const W = WILD;
  ctx.b.add(new CylinderGeometry(7, 9, 6, 12), W.stone, 'ishigaki', { x, y: y + 3, z });
  ctx.b.add(new CylinderGeometry(4.2, 5.4, 70, 12), W.white, 'plaster', { x, y: y + 41, z });
  for (let i = 1; i < 6; i += 1) ctx.b.add(new CylinderGeometry(5.6 - i * 0.2, 5.6 - i * 0.2, 1, 12), W.blue, 'smooth', { x, y: y + 6 + i * 12, z });
  ctx.b.add(new CylinderGeometry(7, 4.2, 3, 12), W.white, 'smooth', { x, y: y + 77.5, z });
  ctx.b.add(new SphereGeometry(2.4, 10, 8), W.blue, 'glow', { x, y: y + 80.5, z });
};

/** A ROCK ARCH: two pillars and a lintel of stone. */
export const rockArch = (rock: number, cap: number): Piece => (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  for (const side of [-1, 1]) l.add(new CylinderGeometry(2.6, 3.6, 16, 7), rock, 'rock', { x: side * 7, y: 8 });
  l.box(20, 4, 5, rock, 'rock', { y: 17.5 });
  l.box(20.6, 1, 5.6, cap, 'grass', { y: 20 });
};

// ------------------------------------------------------------- 7. WALLED CITY

export const WALLED = { stone: 0xd8c8a8, stoneDark: 0xa8987a, roof: 0xd86a3a, cream: 0xf4ead0, wood: 0x6a4a3a, green: 0x5a8a4a } as const;

/** A ROW OF TOWN HOUSES: cream walls, timber bands, terracotta roofs. */
export const townHouses: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  const W = WALLED;
  [[-9, 8, 9], [0, 10, 11], [9, 7, 8]].forEach(([hx, h, w]) => {
    l.box(w!, h!, 8, W.cream, 'plaster', { x: hx, y: h! / 2 });
    l.box(w! + 0.2, 0.5, 8.2, W.wood, 'smooth', { x: hx, y: h! * 0.55 });
    gable(l, w! + 1, 9, 4, h!, W.roof, hx);
  });
};

/** A WATCH TOWER: a square stone tower with battlements. */
export const watchTower: Piece = (ctx, x, y, z) => {
  const W = WALLED;
  ctx.b.box(8, 26, 8, W.stone, 'ishigaki', { x, y: y + 13, z });
  ctx.b.box(9.4, 1.2, 9.4, W.stoneDark, 'smooth', { x, y: y + 26.6, z });
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, -4], [0, 4], [-4, 0], [4, 0]] as const) ctx.b.box(1.6, 2, 1.6, W.stone, 'smooth', { x: x + dx, y: y + 28.2, z: z + dz });
  ctx.b.box(0.3, 5, 3, W.green, 'smooth', { x, y: y + 31.5, z });
};

// ------------------------------------------------------------- 8. CLOVER KINGDOM

export const CLOVER = { stone: 0xb8bcc8, dark: 0x5a5e70, roof: 0x2f6a4a, gold: 0xe8c04a, crystal: 0x5ae08a } as const;

/** A MAGIC CASTLE: a keep and three round towers with pointed green roofs, gold tips. */
export const magicCastle: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  const C = CLOVER;
  l.box(16, 14, 12, C.stone, 'ishigaki', { y: 7 });
  gable(l, 17, 13, 6, 14, C.roof);
  for (const [tx, tz, h] of [[-10, -4, 22], [10, -4, 22], [0, -8, 30]] as const) {
    l.add(new CylinderGeometry(3, 3.4, h, 12), C.stone, 'plaster', { x: tx, y: h / 2, z: tz });
    l.add(new ConeGeometry(4.2, 9, 12), C.roof, 'smooth', { x: tx, y: h + 4.5, z: tz });
    l.add(new SphereGeometry(0.7, 8, 6), C.gold, 'glow', { x: tx, y: h + 9.4, z: tz });
  }
};

/** A CRYSTAL CLUSTER: tall glowing mana crystals. */
export const crystalCluster = (color: number): Piece => (ctx, x, y, z) => {
  for (const [dx, dz, h, lean] of [[0, 0, 16, 0], [-3.5, 2, 10, 0.25], [3, -2.5, 12, -0.2], [2, 3.5, 7, 0.35]] as const) {
    ctx.b.add(new CylinderGeometry(0.2, 1.6, h, 6), color, 'glow', { x: x + dx, y: y + h / 2, z: z + dz, rz: lean });
  }
  ctx.b.add(new CylinderGeometry(4.5, 5, 1.2, 8), CLOVER.dark, 'rock', { x, y: y + 0.6, z });
};

const BOOK_COVER = new MeshBasicMaterial({ color: 0x2a2a38 });
const BOOK_PAGE = new MeshBasicMaterial({ color: 0xfff4d8 });
const VOID_CRYSTAL = new MeshBasicMaterial({ color: 0x7fd8ff });

/** A FLOATING GRIMOIRE: a giant open book turning slowly over a plinth. */
export const floatingGrimoire: Piece = (ctx, x, y, z) => {
  ctx.b.add(new CylinderGeometry(3, 3.6, 3, 8), CLOVER.dark, 'rock', { x, y: y + 1.5, z });
  const book = new Group();
  for (const side of [-1, 1]) {
    const cover = new Mesh(new CylinderGeometry(2.6, 2.6, 0.5, 4), BOOK_COVER);
    const paper = new Mesh(new CylinderGeometry(2.3, 2.3, 0.3, 4), BOOK_PAGE);
    for (const [mesh, lift] of [[cover, 0], [paper, 0.4]] as const) {
      mesh.rotation.set(0, Math.PI / 4, side * 0.35);
      mesh.scale.set(1.3, 1, 1.8);
      mesh.position.set(side * 2.2, lift, 0);
      book.add(mesh);
    }
  }
  book.position.set(x, y + 8, z);
  const glow = auraRing(CLOVER.gold, 4.2, 0.18, 0.6);
  glow.rotation.x = Math.PI / 2;
  glow.position.set(x, y + 3.4, z);
  ctx.add(glow);
  ctx.add(
    animate(book, (t) => {
      book.rotation.y = t * 0.5;
      book.position.y = y + 8 + Math.sin(t * 1.4) * 0.6;
    }),
  );
};

// ------------------------------------------------------------- 9. CITY Z

export const CITYZ = { white: 0xf6f6f6, grey: 0xb8bec8, yellow: 0xffd23a, red: 0xe8453c, glass: 0x9ac8f0, rubble: 0x9a9aa8 } as const;

/** A CITY BLOCK: three clean boxy buildings with yellow awnings. */
export const cityBlock: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  const C = CITYZ;
  [[-8, 14, 9], [1, 22, 8], [9, 11, 7]].forEach(([bx, h, w]) => {
    l.box(w!, h!, 9, bx! === 1 ? C.glass : C.white, 'windows', { x: bx, y: h! / 2 });
    l.box(w! + 0.4, 0.8, 9.4, C.grey, 'smooth', { x: bx, y: h! + 0.4 });
    l.box(w! - 1, 0.4, 2, C.yellow, 'smooth', { x: bx, y: 3.4, z: 5.4, rx: 0.3 });
  });
};

/** A PUNCH CRATER: a ring of broken slabs round a dark scorch, one huge fist-print. */
export const punchCrater: Piece = (ctx, x, y, z) => {
  ctx.b.add(new CylinderGeometry(11, 11, 0.3, 20), 0x5a5a66, 'smooth', { x, y: y + 0.15, z });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + ctx.random() * 0.2;
    ctx.b.box(4 + ctx.random() * 2, 1.2, 3, CITYZ.rubble, 'stone', { x: x + Math.cos(a) * 12, y: y + 1, z: z + Math.sin(a) * 12, ry: -a, rz: 0.5 });
  }
};

/** A BROKEN TOWER: the top half knocked askew. */
export const brokenTower: Piece = (ctx, x, y, z) => {
  ctx.b.box(12, 26, 12, CITYZ.white, 'windows', { x, y: y + 13, z });
  ctx.b.box(12, 14, 12, CITYZ.white, 'windows', { x: x + 2, y: y + 33, z: z + 1, rz: 0.22, rx: 0.1 });
  ctx.b.box(12.6, 1, 12.6, CITYZ.yellow, 'smooth', { x, y: y + 26.2, z });
};

// ------------------------------------------------------------- 10. ROCKY PLAINS

export const PLAINS = { rock: 0xe89a5a, rockLight: 0xf2c08a, grass: 0x6ad85a, dome: 0xf4f4f0, blue: 0x3a8ae8, orange: 0xff8a2a } as const;

/** A MESA: a tall tapered rock pillar with a grassy cap. */
const mesa = (b: PartBuilder, x: number, y: number, z: number, r: number, h: number): void => {
  b.add(new CylinderGeometry(r * 0.8, r, h, 7), PLAINS.rock, 'rock', { x, y: y + h / 2, z });
  b.add(new CylinderGeometry(r * 0.86, r * 0.86, 1.4, 7), PLAINS.grass, 'grass', { x, y: y + h + 0.7, z });
};

export const mesaCluster: Piece = (ctx, x, y, z) => {
  mesa(ctx.b, x, y, z, 6, 30 + ctx.random() * 10);
  mesa(ctx.b, x - 9, y, z + 8, 4, 18 + ctx.random() * 8);
  mesa(ctx.b, x + 8, y, z - 9, 3.5, 14 + ctx.random() * 6);
};

/** A DOME HOUSE: a round white dome with a blue band and a door. */
export const domeHouse: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  l.add(new SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), PLAINS.dome, 'smooth', {});
  l.add(new CylinderGeometry(7.2, 7.2, 1, 20), PLAINS.blue, 'smooth', { y: 1 });
  l.box(2.6, 3.6, 1, PLAINS.orange, 'smooth', { y: 1.8, z: 6.6 });
  l.add(new SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), PLAINS.dome, 'smooth', { x: 9, z: -2 });
};

// ------------------------------------------------------------- 11. INFINITE VOID

export const VOID = { indigo: 0x2a2a7a, deep: 0x14143a, cyan: 0x7fd8ff, white: 0xf0f8ff, violet: 0x8a6aff } as const;

/** AN OBELISK: a tall dark prism edged in cyan light. */
export const obelisk: Piece = (ctx, x, y, z) => {
  const h = 26 + ctx.random() * 14;
  ctx.b.add(new CylinderGeometry(1.8, 3.2, h, 4), VOID.indigo, 'smooth', { x, y: y + h / 2, z, ry: Math.PI / 4 });
  ctx.b.add(new CylinderGeometry(0.01, 1.8, 4, 4), VOID.cyan, 'glow', { x, y: y + h + 2, z, ry: Math.PI / 4 });
  ctx.b.add(new CylinderGeometry(4.2, 4.6, 1.4, 4), VOID.deep, 'smooth', { x, y: y + 0.7, z, ry: Math.PI / 4 });
};

/** A VOID CRYSTAL: a great floating octahedron turning in a ring of light. */
export const voidCrystal: Piece = (ctx, x, y, z) => {
  const crystal = new Mesh(new OctahedronGeometry(4, 0), VOID_CRYSTAL);
  crystal.position.set(x, y + 12, z);
  crystal.scale.set(1, 1.6, 1);
  ctx.add(
    animate(crystal, (t) => {
      crystal.rotation.y = t * 0.6;
      crystal.position.y = y + 12 + Math.sin(t) * 0.8;
    }),
  );
  const ring = auraRing(VOID.white, 7, 0.22, 0.5);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, y + 12, z);
  ctx.add(ring);
  ctx.b.add(new CylinderGeometry(5, 6, 1.4, 8), VOID.deep, 'smooth', { x, y: y + 0.7, z });
};

// ------------------------------------------------------------- 12. SOUL REALM

export const SOUL = { white: 0xf6f2ea, black: 0x24242c, orange: 0xff7a2e, grey: 0xc8c4bc } as const;

/** A WHITE COMPOUND: long white walls under black tiled caps round a tall gate hall. */
export const whiteCompound: Piece = (ctx, x, y, z, yaw) => {
  const l = local(ctx, x, y, z, yaw);
  const S = SOUL;
  l.box(26, 6, 1.6, S.white, 'plaster', { y: 3, z: 6 });
  l.add(curvedRoof(27, 3, 1.2, 0.35), S.black, 'roof', { y: 6, z: 6 });
  l.box(12, 12, 10, S.white, 'plaster', { y: 6, z: -2 });
  l.add(curvedRoof(16, 14, 5), S.black, 'roof', { y: 12, z: -2 });
  l.box(12.2, 0.6, 10.2, S.orange, 'smooth', { y: 11.4, z: -2 });
};

/** A WHITE TOWER: tiered, black roofs, an orange band. */
export const whiteTower: Piece = (ctx, x, y, z) => {
  pagoda(ctx.b, x, y, z, 5, 1.2, SOUL.white, SOUL.black);
};

/** A SOUL SPIRE: a tall white pillar with a glowing orange band. */
export const soulSpire: Piece = (ctx, x, y, z) => {
  ctx.b.add(new CylinderGeometry(2.2, 3, 34, 8), SOUL.white, 'plaster', { x, y: y + 17, z });
  ctx.b.add(new CylinderGeometry(2.5, 2.5, 1.4, 8), SOUL.orange, 'glow', { x, y: y + 26, z });
  ctx.b.add(new ConeGeometry(3, 6, 8), SOUL.black, 'smooth', { x, y: y + 37, z });
};
