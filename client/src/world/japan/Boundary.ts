import { LAVA_Y, type StageLayout } from '@anime/shared';
import { type Object3D } from 'three';
import type { PartBuilder } from '../../render/PartBuilder.js';
import { curvedRoof, mountain, seeded, type Random } from './Kit.js';
import { stageRange, type BoundaryLook, type Theme } from './Themes.js';

/**
 * THE SIDE BOUNDARIES: each anime world framing the course in its own way -
 * sea cliffs, a hero city's skyline, a great fortified wall, glowing void
 * walls. Three layers each side, over exactly the stage's own z range:
 *
 *   1. THE BOUNDARY behind the banks (|x| 80-160): cliff blocks, a wall or a
 *      row of buildings, 30-65 tall, in the world's palette;
 *   2. a FEW LARGE SKYLINE pieces on and behind it, far apart;
 *   3. a mountain ridge (or the sea) beyond, closing the view.
 *
 * Built for stability at distance: pieces ABUT, never overlap, and no two
 * same-facing surfaces ever share a plane, so nothing flickers as the camera
 * moves. All of it is scenery: never collides, never climbable or runnable.
 */

/** Where the boundary's face starts, either side of the centre line. */
const FACE_X = 80;
/** Where it ends, behind: deep enough that the skyline pieces stand on it. */
const BACK_X = 160;
/** Cliff blocks vary in front of this line; behind it a level plateau carries the skyline. */
const BLOCK_BACK_X = 120;
const BOTTOM = LAVA_Y - 2;
/** A city boundary's continuous base, under its buildings. */
const CITY_BASE_TOP = 22;

export const boundary = (b: PartBuilder, stage: StageLayout, theme: Theme, add: (o: Object3D) => Object3D): void => {
  const random = seeded(stage.index * 977 + 3);
  const look = theme.boundary;
  const [z0, z1] = stageRange(stage);
  for (const side of [-1, 1]) {
    switch (look.kind) {
      case 'wall':
        greatWall(b, side, z0, z1, look, random);
        break;
      case 'city':
        cityWall(b, side, z0, z1, look, random);
        break;
      default:
        blocks(b, side, z0, z1, look, random, look.kind === 'crystal');
    }
    skyline(b, side, z0, z1, look, random, add);
    if (look.ridge) ridge(b, side, z0, z1, look.ridge, random);
    if (look.ocean !== undefined) ocean(b, side, z0, z1, look.ocean, random);
  }
};

/** Cliff or crystal BLOCKS: abutting segments, alternating in depth so no two faces are coplanar. */
const blocks = (b: PartBuilder, side: number, z0: number, z1: number, look: BoundaryLook, random: Random, crystal: boolean): void => {
  let z = z0;
  let k = 0;
  while (z < z1 - 1) {
    const length = Math.min(26 + random() * 18, z1 - z);
    // Alternate between a near and a far face: never within 2 units of a neighbour's.
    const face = FACE_X + (k % 2 === 0 ? random() * 3 : 5 + random() * 3);
    const height = look.height + random() * 12;
    const cz = z + length / 2;
    const cx = (side * (face + BLOCK_BACK_X)) / 2;
    b.box(BLOCK_BACK_X - face, height - BOTTOM, length, k % 2 === 0 ? look.body : look.bodyAlt, look.bodyKind, { x: cx, y: (height + BOTTOM) / 2, z: cz });
    b.box(BLOCK_BACK_X - face + 1.2, 1.4, length, look.cap, look.capKind, { x: cx - side * 0.6, y: height + 0.7, z: cz });
    b.box(0.4, 0.8, length, look.trim, 'glow', { x: side * (face - 0.62), y: height - 0.2, z: cz });
    if (crystal) {
      // A glowing seam up the face at the block's leading edge.
      b.box(0.5, height - BOTTOM, 0.8, look.trim, 'glow', { x: side * (face - 0.2), y: (height + BOTTOM) / 2, z: z + 0.6 });
    } else if (look.waterfalls && random() < 0.14) {
      const w = 4 + random() * 3;
      b.box(0.4, height - BOTTOM, w, 0x9aeaff, 'glow', { x: side * (face - 0.25), y: (height + BOTTOM) / 2, z: cz });
    }
    z += length;
    k += 1;
  }
  // The level plateau behind, one piece per stage: what the skyline stands on.
  const px = (side * (BLOCK_BACK_X + BACK_X)) / 2;
  b.box(BACK_X - BLOCK_BACK_X, look.height - BOTTOM, z1 - z0, look.bodyAlt, look.bodyKind, { x: px, y: (look.height + BOTTOM) / 2, z: (z0 + z1) / 2 });
  b.box(BACK_X - BLOCK_BACK_X, 1.4, z1 - z0, look.cap, look.capKind, { x: px, y: look.height + 0.7, z: (z0 + z1) / 2 });
};

/** A GREAT WALL: one continuous rampart per stage, battlements or a tiled cap, towers now and then. */
const greatWall = (b: PartBuilder, side: number, z0: number, z1: number, look: BoundaryLook, random: Random): void => {
  const length = z1 - z0;
  const cz = (z0 + z1) / 2;
  const face = FACE_X + 4;
  const cx = (side * (face + BACK_X)) / 2;
  const top = look.height;
  b.box(BACK_X - face, top - BOTTOM, length, look.body, look.bodyKind, { x: cx, y: (top + BOTTOM) / 2, z: cz });
  b.box(0.5, 1.2, length, look.trim, 'smooth', { x: side * (face - 0.25), y: top - 6, z: cz });
  if (look.capKind === 'roof') {
    b.add(curvedRoof(length, BACK_X - face + 5, 5), look.cap, 'roof', { x: cx, y: top, z: cz, ry: Math.PI / 2 });
  } else {
    b.box(BACK_X - face + 1, 1.2, length, look.cap, look.capKind, { x: cx, y: top + 0.6, z: cz });
    // Merlons along the inner edge, a gap between each.
    for (let z = z0 + 3; z < z1 - 2; z += 6) b.box(2.4, 3, 3, look.body, look.bodyKind, { x: side * (face + 1.2), y: top + 2.7, z });
  }
  // Towers standing proud of the wall.
  for (let z = z0 + 60 + random() * 40; z < z1 - 30; z += 160 + random() * 60) {
    b.box(18, top + 16 - BOTTOM, 18, look.bodyAlt, look.bodyKind, { x: side * (face + 6), y: (top + 16 + BOTTOM) / 2, z });
    if (look.capKind === 'roof') b.add(curvedRoof(22, 22, 7), look.cap, 'roof', { x: side * (face + 6), y: top + 16, z });
    else b.box(19.4, 1.4, 19.4, look.cap, look.capKind, { x: side * (face + 6), y: top + 16.7, z });
    b.box(0.5, 2, 10, look.trim, 'glow', { x: side * (face - 3.25), y: top + 8, z });
  }
};

/** A CITY WALL: separate buildings of different heights and depths on a continuous base. */
const cityWall = (b: PartBuilder, side: number, z0: number, z1: number, look: BoundaryLook, random: Random): void => {
  const baseFace = FACE_X + 10;
  b.box(BACK_X - baseFace, CITY_BASE_TOP - BOTTOM, z1 - z0, look.bodyAlt, look.bodyKind, { x: (side * (baseFace + BACK_X)) / 2, y: (CITY_BASE_TOP + BOTTOM) / 2, z: (z0 + z1) / 2 });
  let z = z0 + 1;
  let k = 0;
  while (z < z1 - 12) {
    const width = Math.min(16 + random() * 12, z1 - 1 - z);
    const face = FACE_X + (k % 2 === 0 ? random() * 3 : 5 + random() * 3);
    const height = look.height + random() * 26;
    const cz = z + width / 2;
    const cx = (side * (face + baseFace + 6)) / 2;
    const depth = baseFace + 6 - face;
    b.box(depth, height - BOTTOM, width, k % 3 === 1 ? look.bodyAlt : look.body, look.bodyKind, { x: cx, y: (height + BOTTOM) / 2, z: cz });
    b.box(depth + 0.8, 1.2, width + 0.8, look.cap, look.capKind, { x: cx, y: height + 0.6, z: cz });
    b.box(0.4, 0.8, width, look.trim, 'glow', { x: side * (face - 0.62), y: height - 1.4, z: cz });
    z += width + 2 + random() * 3;
    k += 1;
  }
};

/** A few large skyline pieces on top of and behind the boundary, far apart. */
const skyline = (b: PartBuilder, side: number, z0: number, z1: number, look: BoundaryLook, random: Random, add: (o: Object3D) => Object3D): void => {
  if (look.skyline.length === 0) return;
  let k = 0;
  const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  for (let z = z0 + 40 + random() * 40; z < z1 - 20; z += 110 + random() * 60) {
    const piece = look.skyline[k % look.skyline.length]!;
    // Standing ON the boundary: a city's pieces on its base, the rest on the wall or cliff top.
    const y = look.kind === 'city' ? CITY_BASE_TOP - 0.5 : look.height + 1.2;
    piece({ b, random, add }, side * (125 + random() * 20), y, z, yaw);
    k += 1;
  }
};

/** A soft mountain ridge far beyond, in the world's colours. No snow caps: nothing to flicker. */
const ridge = (b: PartBuilder, side: number, z0: number, z1: number, colors: readonly number[], random: Random): void => {
  for (let z = z0 + random() * 40; z < z1; z += 80 + random() * 40) {
    mountain(b, side * (215 + random() * 45), 0, z, 60 + random() * 30, 110 + random() * 80, colors[Math.floor(random() * colors.length)]!, false);
  }
};

/** The open sea beyond sea cliffs, with a few distant green islands. */
const ocean = (b: PartBuilder, side: number, z0: number, z1: number, color: number, random: Random): void => {
  b.box(600, 0.4, z1 - z0, color, 'smooth', { x: side * (BACK_X + 300), y: 2, z: (z0 + z1) / 2 });
  for (let z = z0 + random() * 100; z < z1; z += 220 + random() * 120) {
    mountain(b, side * (220 + random() * 120), 1, z, 30 + random() * 20, 26 + random() * 20, 0x5ac84a, false);
  }
};
