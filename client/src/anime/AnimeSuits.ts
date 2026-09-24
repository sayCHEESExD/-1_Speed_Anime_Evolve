import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three';
import type { PartBuilder } from '../render/PartBuilder.js';
import type { PaintPoint, SuitPainter } from './SuitPainter.js';

/**
 * THE TWELVE EVOLUTIONS, drawn.
 *
 * Each character is the supplied blocky body with its atlas repainted
 * (`SuitPainter`: a function from a point on the body to a colour) plus a
 * handful of merged primitives on its bones - the hair, a hat, a cape, a
 * sword. Nothing here is an image file: every character costs a few lines of
 * code and no download, which is what keeps twelve of them inside the budget.
 *
 * Accessories are authored in CHARACTER space (x = the character's left,
 * y up, z forward) around their mount, sized by the measured body.
 */
export interface AccessoryContext {
  /** Head box height; torso width / depth / height; arm box width. */
  readonly head: number;
  readonly torsoW: number;
  readonly torsoD: number;
  readonly torsoH: number;
  readonly limb: number;
}

type Accessory = (b: PartBuilder, c: AccessoryContext) => void;

export interface SuitDef {
  readonly paint: SuitPainter;
  /** Around the centre of the head. */
  readonly head?: Accessory;
  /** At the top of the back, between the shoulders. */
  readonly back?: Accessory;
  /** At the centre of the chest's front face. */
  readonly chest?: Accessory;
  /** At the bottom of the right / left arm (the fist). */
  readonly handR?: Accessory;
  readonly handL?: Accessory;
  readonly scale?: number;
}

// ------------------------------------------------------------------ helpers

const within = (value: number, min: number, max: number): boolean => value >= min && value <= max;
const rect = (p: PaintPoint, u0: number, u1: number, v0: number, v1: number): boolean => within(p.u, u0, u1) && within(p.v, v0, v1);
const ellipse = (p: PaintPoint, cu: number, cv: number, ru: number, rv: number): boolean =>
  ((p.u - cu) / ru) ** 2 + ((p.v - cv) / rv) ** 2 <= 1;
const isFront = (p: PaintPoint): boolean => p.face === 'front';
const isBack = (p: PaintPoint): boolean => p.face === 'back';
const isSide = (p: PaintPoint): boolean => p.face === 'left' || p.face === 'right';
const isArm = (p: PaintPoint): boolean => p.part === 'armL' || p.part === 'armR';
const isLeg = (p: PaintPoint): boolean => p.part === 'legL' || p.part === 'legR';
const checker = (p: PaintPoint, n: number): boolean => (Math.floor(p.u * n) + Math.floor(p.v * n)) % 2 === 0;

const SKIN = 0xf6cfa8;
const SKIN_TAN = 0xe0ab80;
const INK = 0x16121a;

interface FaceStyle {
  readonly skin: number;
  readonly iris: number;
  /** Eye height on the face. */
  readonly eyeV?: number;
  /** Narrow, bored eyes (Saitama). */
  readonly dots?: boolean;
  /** Angry brows (Ichigo, Eren). */
  readonly fierce?: boolean;
  /** A wide grin (Luffy, Goku). */
  readonly grin?: boolean;
}

/**
 * AN ANIME FACE on the front of the head: big eyes with an iris and a
 * highlight, brows, a small mouth. Returns null off the face so callers can
 * paint hair around it.
 */
const animeFace = (p: PaintPoint, style: FaceStyle): number | null => {
  if (!isFront(p)) return null;
  const ev = style.eyeV ?? 0.5;
  for (const cu of [0.3, 0.7]) {
    if (style.dots) {
      if (ellipse(p, cu, ev, 0.05, 0.035)) return INK;
      continue;
    }
    if (ellipse(p, cu, ev, 0.125, 0.14)) {
      if (!ellipse(p, cu, ev - 0.01, 0.1, 0.115)) return INK;
      if (ellipse(p, cu + 0.035, ev + 0.05, 0.03, 0.035)) return 0xffffff;
      if (ellipse(p, cu, ev - 0.02, 0.05, 0.065)) return 0x0c0a10;
      if (ellipse(p, cu, ev - 0.02, 0.08, 0.1)) return style.iris;
      return 0xffffff;
    }
    // Brows.
    const tilt = style.fierce ? (cu < 0.5 ? (p.u - cu) * 0.5 : (cu - p.u) * 0.5) : 0;
    if (within(p.u, cu - 0.12, cu + 0.12) && within(p.v, ev + 0.19 + tilt, ev + 0.23 + tilt)) return INK;
  }
  if (style.grin) {
    if (ellipse(p, 0.5, 0.22, 0.17, 0.07) && p.v < 0.24) return within(p.v, 0.18, 0.24) ? 0xffffff : 0x8a2020;
  } else if (rect(p, 0.43, 0.57, 0.22, 0.25)) {
    return 0x9a4a3a;
  }
  return style.skin;
};

/**
 * A head: hair on the top, back and upper sides and a fringe on the front,
 * the face below it.
 */
const hairHead = (p: PaintPoint, hair: number, face: FaceStyle, fringe = 0.8, sideline = 0.45): number => {
  if (p.face === 'top') return hair;
  if (isBack(p)) return p.v > 0.18 ? hair : face.skin;
  if (isSide(p)) return p.v > sideline ? hair : face.skin;
  if (p.v > fringe) return hair;
  return animeFace(p, face) ?? face.skin;
};

/** Hands are skin at the bottom of the arms. */
const hand = (p: PaintPoint, skin = SKIN): boolean => isArm(p) && p.ny < 0.16;

// ---------------------------------------------------------------- painters

const luffy: SuitPainter = (p) => {
  const red = 0xe0282e;
  const blue = 0x2f64c8;
  if (p.part === 'head') {
    const c = hairHead(p, 0x15151a, { skin: SKIN, iris: 0x2a1a14, grin: true }, 0.8);
    // The scar under his left eye (the viewer's right).
    if (isFront(p) && within(p.u, 0.69, 0.73) && within(p.v, 0.3, 0.38)) return 0xa8302a;
    return c;
  }
  if (p.part === 'torso') {
    if (p.v < 0.13) return 0xf2c94c;
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.06 + p.v * 0.16) {
      // The open vest, and the X scar on his chest.
      const x = Math.abs(Math.abs(p.u - 0.5) - Math.abs(p.v - 0.62) * 0.9) < 0.018 && Math.abs(p.v - 0.62) < 0.1;
      return x ? 0xb0503a : SKIN;
    }
    if (isFront(p) && within(p.v, 0.3, 0.7) && (Math.abs(p.u - 0.28) < 0.03 || Math.abs(p.u - 0.72) < 0.03) && Math.floor(p.v * 10) % 2 === 0) return 0xf2c94c;
    return red;
  }
  if (isArm(p)) return p.ny > 0.84 ? red : SKIN;
  if (isLeg(p)) {
    if (p.ny < 0.08) return 0x8a5a33;
    if (p.ny > 0.46) return within(p.ny, 0.46, 0.53) ? 0x5a8ae0 : blue;
    return SKIN;
  }
  return red;
};

const deku: SuitPainter = (p) => {
  const suit = 0x1f7a62;
  const dark = 0x145a48;
  if (p.part === 'head') {
    const face: FaceStyle = { skin: SKIN, iris: 0x2aa84a };
    const c = hairHead(p, 0x1d4a36, face, 0.78);
    if (isFront(p) && p.v < 0.78) {
      // Freckles, and the mouth guard of his costume.
      if (rect(p, 0.2, 0.8, 0.08, 0.32)) return within(p.v, 0.08, 0.12) ? 0x9aa6b0 : 0xd8dee4;
      for (const cu of [0.18, 0.22, 0.78, 0.82]) if (ellipse(p, cu, 0.4, 0.014, 0.014)) return 0xc98a6a;
    }
    return c;
  }
  if (p.part === 'torso') {
    if (within(p.v, 0.06, 0.15)) return 0xd0302e;
    if (p.v > 0.9) return 0x14161c;
    if ((isFront(p) || isBack(p)) && (Math.abs(p.u - 0.3) < 0.03 || Math.abs(p.u - 0.7) < 0.03)) return 0x14161c;
    if (isFront(p) && ellipse(p, 0.5, 0.55, 0.14, 0.1)) return dark;
    return suit;
  }
  if (isArm(p)) {
    if (p.ny < 0.3) return within(p.ny, 0.26, 0.3) ? 0xd0302e : 0xf2f2f2;
    return p.ny > 0.85 ? dark : suit;
  }
  if (isLeg(p)) {
    if (p.ny < 0.16) return p.ny < 0.05 ? 0xffffff : 0xd0302e;
    if (within(p.ny, 0.45, 0.58) && isFront(p)) return 0x14161c;
    return suit;
  }
  return suit;
};

const yuji: SuitPainter = (p) => {
  const coat = 0x1d1f2a;
  const red = 0xd02a2a;
  if (p.part === 'head') {
    const face: FaceStyle = { skin: SKIN, iris: 0x6a3a1a };
    if (isBack(p) || isSide(p)) {
      if (p.v > 0.62) return 0xf07aa8;
      if (p.v > 0.3) return 0x4a2632;
      return SKIN;
    }
    const c = hairHead(p, 0xf07aa8, face, 0.8);
    // The marks under his eyes.
    if (isFront(p) && within(p.v, 0.33, 0.36) && (within(p.u, 0.2, 0.4) || within(p.u, 0.6, 0.8))) return 0x7a1a1a;
    return c;
  }
  if (p.part === 'torso') {
    if (p.v > 0.84) return red;
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.02 && Math.floor(p.v * 8) % 2 === 0) return 0xf2c94c;
    if (p.v < 0.1) return 0x14151d;
    return coat;
  }
  if (isArm(p)) return hand(p) ? SKIN : coat;
  if (isLeg(p)) return p.ny < 0.12 ? (p.ny < 0.04 ? 0xffffff : 0xb02a2a) : coat;
  return coat;
};

const naruto: SuitPainter = (p) => {
  const orange = 0xff8a1f;
  const black = 0x1f2330;
  if (p.part === 'head') {
    const face: FaceStyle = { skin: SKIN, iris: 0x2f7fff, grin: true };
    // The headband.
    if (!isBack(p) && p.face !== 'top' && within(p.v, 0.72, 0.84)) {
      if (isFront(p) && within(p.u, 0.3, 0.7)) return within(p.u, 0.47, 0.53) ? 0x5a6478 : 0xc9d2de;
      return 0x24336a;
    }
    const c = hairHead(p, 0xffd23a, face, 0.84, 0.55);
    // Whiskers.
    if (isFront(p) && p.v < 0.45) {
      for (const v of [0.32, 0.36, 0.4]) {
        if (within(p.v, v, v + 0.015) && (within(p.u, 0.06, 0.2) || within(p.u, 0.8, 0.94))) return 0x5a3a2a;
      }
    }
    return c;
  }
  if (p.part === 'torso') {
    if (p.v > 0.76) return black;
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.025) return 0xffffff;
    if (isBack(p) && ellipse(p, 0.5, 0.52, 0.16, 0.13) && !ellipse(p, 0.5, 0.52, 0.1, 0.08)) return 0xd0202a;
    if (p.v < 0.1) return 0xe07010;
    return orange;
  }
  if (isArm(p)) {
    if (hand(p)) return SKIN;
    return p.ny > 0.78 ? black : orange;
  }
  if (isLeg(p)) return p.ny < 0.14 ? 0x2f4fbf : orange;
  return orange;
};

const tanjiro: SuitPainter = (p) => {
  const green = 0x1f9a70;
  const black = 0x15161b;
  const uniform = 0x1a1c26;
  if (p.part === 'head') {
    const face: FaceStyle = { skin: SKIN, iris: 0x9a1a1a };
    const c = hairHead(p, 0x3a1212, face, 0.8);
    // The scar on his forehead.
    if (isFront(p) && within(p.u, 0.18, 0.36) && within(p.v, 0.7, 0.8)) return 0x9a2a1a;
    return c;
  }
  if (p.part === 'torso') {
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.12) {
      if (within(p.v, 0.1, 0.16)) return 0xf2f2f2;
      return uniform;
    }
    return checker(p, 6) ? green : black;
  }
  if (isArm(p)) return hand(p) ? SKIN : checker(p, 5) ? green : black;
  if (isLeg(p)) {
    if (p.ny < 0.06) return 0x2a1a14;
    if (p.ny < 0.42) return (Math.floor(p.ny * 20) % 2 === 0) ? 0xf2f2f2 : 0xd8d8d8;
    return uniform;
  }
  return uniform;
};

const gon: SuitPainter = (p) => {
  const green = 0x2fae4a;
  const dark = 0x1f7a34;
  if (p.part === 'head') return hairHead(p, 0x14201a, { skin: SKIN, iris: 0x6a3a14 }, 0.84);
  if (p.part === 'torso') {
    if (p.v > 0.86 || (isFront(p) && Math.abs(p.u - 0.5) < 0.03)) return dark;
    if (p.v < 0.1) return dark;
    return green;
  }
  if (isArm(p)) return hand(p) ? SKIN : green;
  if (isLeg(p)) {
    if (p.ny < 0.3) return p.ny < 0.05 ? 0x1a1a1a : dark;
    if (p.ny > 0.62) return green;
    return SKIN;
  }
  return green;
};

const eren: SuitPainter = (p) => {
  const jacket = 0xb68c5c;
  const strap = 0x4a2e1a;
  if (p.part === 'head') return hairHead(p, 0x5a3a22, { skin: SKIN, iris: 0x2fae8f, fierce: true }, 0.78, 0.35);
  if (p.part === 'torso') {
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.18) {
      if (within(p.v, 0.4, 0.46) || within(p.v, 0.7, 0.75)) return strap;
      return 0xf0eee8;
    }
    if (p.v < 0.3) return 0xf0eee8;
    if (within(p.v, 0.4, 0.46)) return strap;
    return jacket;
  }
  if (isArm(p)) return hand(p) ? SKIN : jacket;
  if (isLeg(p)) {
    if (p.ny < 0.34) return 0x3a2418;
    if (within(p.ny, 0.6, 0.66) || within(p.ny, 0.8, 0.86)) return strap;
    return 0xf0eee8;
  }
  return jacket;
};

const asta: SuitPainter = (p) => {
  const shirt = 0x1d1e26;
  if (p.part === 'head') {
    const face: FaceStyle = { skin: SKIN_TAN, iris: 0x3aa84a, grin: true };
    if (p.face !== 'top' && !isBack(p) && within(p.v, 0.74, 0.84)) return 0x14141a;
    const c = hairHead(p, 0xe6e6ee, face, 0.84, 0.5);
    if (isFront(p) && within(p.u, 0.12, 0.2) && within(p.v, 0.3, 0.4)) return 0x9a5a3a;
    return c;
  }
  if (p.part === 'torso') {
    if (p.v < 0.12) return 0x6a4a2a;
    if (p.v > 0.9) return 0xf2f2f2;
    return shirt;
  }
  if (isArm(p)) {
    if (hand(p, SKIN_TAN)) return SKIN_TAN;
    if (p.ny < 0.5) return Math.floor(p.ny * 24) % 2 === 0 ? 0xf2f2f2 : 0xdadada;
    return p.ny > 0.86 ? shirt : SKIN_TAN;
  }
  if (isLeg(p)) return p.ny < 0.2 ? 0x121216 : 0x3a3d48;
  return shirt;
};

const saitama: SuitPainter = (p) => {
  const yellow = 0xffd23a;
  const red = 0xd0202a;
  if (p.part === 'head') {
    if (!isFront(p)) {
      // The shine on his head.
      if (p.face === 'top' && ellipse(p, 0.62, 0.62, 0.12, 0.08)) return 0xfff2e2;
      return SKIN;
    }
    return animeFace(p, { skin: SKIN, iris: INK, dots: true, eyeV: 0.52 }) ?? SKIN;
  }
  if (p.part === 'torso') {
    if (within(p.v, 0.1, 0.17)) return isFront(p) && Math.abs(p.u - 0.5) < 0.06 ? 0xf2c14e : 0x1a1a1a;
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.015 && p.v > 0.17) return 0x8a7a2a;
    return yellow;
  }
  if (isArm(p)) return p.ny < 0.32 ? red : yellow;
  if (isLeg(p)) return p.ny < 0.32 ? red : yellow;
  return yellow;
};

const goku: SuitPainter = (p) => {
  const orange = 0xff7a1a;
  const blue = 0x1f3fa8;
  if (p.part === 'head') return hairHead(p, 0x121216, { skin: SKIN, iris: 0x121216, grin: true }, 0.86, 0.5);
  if (p.part === 'torso') {
    if (within(p.v, 0.08, 0.17)) return blue;
    if (isFront(p) && p.v > 0.55 && Math.abs(p.u - 0.5) < (p.v - 0.55) * 0.55) return blue;
    if (isFront(p) && ellipse(p, 0.7, 0.72, 0.09, 0.09)) return ellipse(p, 0.7, 0.72, 0.045, 0.06) ? INK : 0xffffff;
    if (isBack(p) && ellipse(p, 0.5, 0.62, 0.16, 0.16)) return ellipse(p, 0.5, 0.62, 0.08, 0.1) ? INK : 0xffffff;
    return orange;
  }
  if (isArm(p)) {
    if (p.ny < 0.13) return SKIN;
    if (p.ny < 0.3) return blue;
    return p.ny > 0.84 ? orange : SKIN;
  }
  if (isLeg(p)) {
    if (p.ny < 0.22) return p.ny > 0.18 ? 0xd0202a : blue;
    return orange;
  }
  return orange;
};

const gojo: SuitPainter = (p) => {
  const black = 0x14161f;
  if (p.part === 'head') {
    // The blindfold all the way round.
    if (p.face !== 'top' && within(p.v, 0.44, 0.66)) return 0x0c0c10;
    if (p.face === 'top') return 0xf4f6ff;
    if (isBack(p)) return p.v > 0.3 ? 0xf4f6ff : SKIN;
    if (isSide(p)) return p.v > 0.66 ? 0xf4f6ff : SKIN;
    if (p.v > 0.82) return 0xf4f6ff;
    if (rect(p, 0.44, 0.56, 0.22, 0.25)) return 0x9a4a3a;
    return SKIN;
  }
  if (p.part === 'torso') {
    if (p.v > 0.86) return 0x0a0b12;
    if (isFront(p) && Math.abs(p.u - 0.5) < 0.012) return 0x2a2d3a;
    return black;
  }
  if (isArm(p)) return hand(p) ? SKIN : black;
  if (isLeg(p)) return p.ny < 0.1 ? 0x08080c : black;
  return black;
};

const ichigo: SuitPainter = (p) => {
  const robe = 0x16161c;
  if (p.part === 'head') return hairHead(p, 0xff8a2a, { skin: SKIN, iris: 0x6a3a14, fierce: true }, 0.8, 0.5);
  if (p.part === 'torso') {
    // The white under-collar in a V, and the sword's red strap across the chest.
    if (isFront(p) && p.v > 0.5 && Math.abs(Math.abs(p.u - 0.5) - (p.v - 0.5) * 0.7) < 0.05) return 0xf2f2f2;
    if (isFront(p) && p.v > 0.5 && Math.abs(p.u - 0.5) < (p.v - 0.5) * 0.7) return SKIN;
    if ((isFront(p) || isBack(p)) && Math.abs(p.u - (1 - p.v)) < 0.05) return 0xa8202a;
    if (within(p.v, 0.08, 0.14)) return 0xf2f2f2;
    return robe;
  }
  if (isArm(p)) return hand(p) ? SKIN : robe;
  if (isLeg(p)) return p.ny < 0.08 ? 0xf2f2f2 : robe;
  return robe;
};

// ------------------------------------------------------------- accessories

/** A hair cap over the top and back of the head. */
const cap = (b: PartBuilder, c: AccessoryContext, color: number, back = 0.7): void => {
  const h = c.head;
  b.add(new BoxGeometry(h * 1.12, h * 0.3, h * 1.12), color, 'smooth', { y: h * 0.47 });
  b.add(new BoxGeometry(h * 1.12, h * back, h * 0.2), color, 'smooth', { y: h * (0.62 - back / 2), z: -h * 0.5 });
};

/** One spike of hair: a four-sided cone from (x, y, z), tipped by rx (toward +z) and rz (toward -x). */
const spike = (b: PartBuilder, c: AccessoryContext, color: number, x: number, y: number, z: number, length: number, radius: number, rx: number, rz: number): void => {
  const h = c.head;
  // The cone's axis after the rotation (Euler YXZ): its base sits at (x, y, z).
  const half = h * length * 0.5;
  b.add(new ConeGeometry(h * radius, h * length, 4), color, 'smooth', {
    x: h * x - Math.sin(rz) * half,
    y: h * y + Math.cos(rz) * Math.cos(rx) * half,
    z: h * z + Math.cos(rz) * Math.sin(rx) * half,
    rx,
    rz,
  });
};

/** A crown of spikes around the head. */
const spikyCrown = (b: PartBuilder, c: AccessoryContext, color: number, length: number, count: number, lift = 0.5, spread = 0.9): void => {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    // Front spikes lie flatter (a fringe); back ones stand up.
    const front = cz > 0.3;
    spike(b, c, color, sx * 0.42, lift, cz * 0.42, front ? length * 0.6 : length, 0.2, cz * spread * (front ? 1.2 : 1), -sx * spread);
  }
};

const cape = (b: PartBuilder, c: AccessoryContext, color: number, length = 1.9): void => {
  const h = c.torsoH * length;
  b.add(new BoxGeometry(c.torsoW * 1.18, h, 0.08), color, 'smooth', { y: -h / 2 + 0.1, z: -0.08, rx: 0.12 });
  b.add(new BoxGeometry(c.torsoW * 1.22, 0.16, 0.26), color, 'smooth', { y: 0.08, z: 0.02 });
};

const SUITS: Readonly<Record<number, SuitDef>> = {
  1: {
    paint: luffy,
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0x15151a, 0.62);
      for (const x of [-0.5, 0.5]) b.add(new BoxGeometry(h * 0.16, h * 0.34, h * 0.3), 0x15151a, 'smooth', { x: h * x, y: h * 0.26, z: h * 0.18 });
      // The straw hat.
      b.add(new CylinderGeometry(h * 1.0, h * 1.02, h * 0.07, 20), 0xf2cf6a, 'smooth', { y: h * 0.6 });
      b.add(new CylinderGeometry(h * 0.56, h * 0.6, h * 0.3, 18), 0xf2cf6a, 'smooth', { y: h * 0.8 });
      b.add(new CylinderGeometry(h * 0.61, h * 0.61, h * 0.12, 18), 0xd0202a, 'smooth', { y: h * 0.7 });
    },
  },
  2: {
    paint: deku,
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0x1d4a36, 0.6);
      const spots: readonly (readonly [number, number, number, number])[] = [
        [-0.35, 0.6, 0.25, 0.26], [0.1, 0.72, 0.3, 0.28], [0.42, 0.62, 0.1, 0.25], [-0.1, 0.66, -0.25, 0.3],
        [0.3, 0.6, -0.35, 0.26], [-0.45, 0.45, -0.15, 0.22], [0.5, 0.45, -0.1, 0.22], [0, 0.5, 0.5, 0.2],
        [-0.3, 0.42, 0.5, 0.17], [0.32, 0.44, 0.5, 0.17],
      ];
      for (const [x, y, z, r] of spots) b.add(new SphereGeometry(h * r, 7, 5), x > 0 ? 0x1f5a40 : 0x173f2e, 'smooth', { x: h * x, y: h * y, z: h * z });
    },
  },
  3: {
    paint: yuji,
    head: (b, c) => {
      cap(b, c, 0xf07aa8, 0.3);
      spikyCrown(b, c, 0xf07aa8, 0.42, 9, 0.52, 0.8);
      spike(b, c, 0x4a2632, 0, 0.62, 0.35, 0.36, 0.16, 1.2, 0);
    },
    back: (b, c) => {
      // The red hood.
      b.add(new BoxGeometry(c.torsoW * 0.9, c.torsoH * 0.36, c.torsoD * 0.5), 0xd02a2a, 'smooth', { y: 0.05, z: -c.torsoD * 0.25 });
    },
  },
  4: {
    paint: naruto,
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0xffd23a, 0.55);
      spikyCrown(b, c, 0xffd23a, 0.62, 12, 0.5, 0.95);
      spikyCrown(b, c, 0xffc21a, 0.5, 8, 0.62, 0.55);
      // The forehead protector's metal plate.
      b.add(new BoxGeometry(h * 0.44, h * 0.14, h * 0.06), 0xc9d2de, 'smooth', { y: h * 0.28, z: h * 0.55 });
      for (const side of [-1, 1]) b.add(new BoxGeometry(h * 0.08, h * 0.5, h * 0.06), 0x24336a, 'smooth', { x: side * h * 0.2, y: h * 0.0, z: -h * 0.58, rz: side * 0.3 });
    },
  },
  5: {
    paint: tanjiro,
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0x3a1212, 0.7);
      spikyCrown(b, c, 0x3a1212, 0.36, 9, 0.5, 1.0);
      spike(b, c, 0x7a1a1a, 0.2, 0.58, 0.4, 0.3, 0.14, 1.3, -0.3);
      // The hanafuda earrings.
      for (const side of [-1, 1]) {
        b.add(new BoxGeometry(h * 0.04, h * 0.26, h * 0.14), 0xf6f2e6, 'smooth', { x: side * h * 0.58, y: -h * 0.2 });
        b.add(new BoxGeometry(h * 0.045, h * 0.1, h * 0.09), 0xd0202a, 'glow', { x: side * h * 0.585, y: -h * 0.16 });
      }
    },
    back: (b, c) => {
      // The Nichirin sword, slung across the back.
      b.add(new BoxGeometry(0.12, c.torsoH * 1.9, 0.12), 0x15161b, 'smooth', { x: 0, y: -c.torsoH * 0.35, z: -c.torsoD * 0.25, rz: 0.9 });
      b.add(new BoxGeometry(0.34, 0.06, 0.3), 0x1f9a70, 'smooth', { x: -c.torsoW * 0.35, y: 0.25, z: -c.torsoD * 0.25, rz: 0.9 });
    },
  },
  6: {
    paint: gon,
    head: (b, c) => {
      cap(b, c, 0x14201a, 0.4);
      for (let i = 0; i < 11; i += 1) {
        const a = (i / 11) * Math.PI * 2;
        spike(b, c, i % 2 ? 0x14201a : 0x22382a, Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3, 0.95, 0.2, Math.cos(a) * 0.35 - 0.15, -Math.sin(a) * 0.35);
      }
    },
    back: (b, c) => {
      // The fishing rod.
      b.add(new CylinderGeometry(0.04, 0.05, c.torsoH * 3.2, 6), 0x9a6a3a, 'smooth', { x: c.torsoW * 0.1, y: c.torsoH * 0.5, z: -c.torsoD * 0.35, rz: -0.35 });
      b.add(new CylinderGeometry(0.12, 0.12, 0.1, 10), 0x5a5a64, 'smooth', { x: -c.torsoW * 0.1, y: -c.torsoH * 0.35, z: -c.torsoD * 0.42, rx: Math.PI / 2 });
    },
  },
  7: {
    paint: eren,
    head: (b, c) => {
      const h = c.head;
      cap(b, c, 0x5a3a22, 0.9);
      for (const side of [-1, 1]) b.add(new BoxGeometry(h * 0.18, h * 0.62, h * 0.8), 0x5a3a22, 'smooth', { x: side * h * 0.52, y: h * 0.12, z: -h * 0.05 });
      b.add(new BoxGeometry(h * 0.9, h * 0.2, h * 0.14), 0x5a3a22, 'smooth', { y: h * 0.4, z: h * 0.52, rx: 0.3 });
      b.add(new BoxGeometry(h * 0.3, h * 0.26, h * 0.26), 0x5a3a22, 'smooth', { y: h * 0.18, z: -h * 0.66 });
    },
    back: (b, c) => {
      cape(b, c, 0x2f6a3a, 1.65);
      // The Wings of Freedom.
      b.add(new BoxGeometry(c.torsoW * 0.26, c.torsoH * 0.3, 0.04), 0xf2f2f2, 'smooth', { x: c.torsoW * 0.14, y: -c.torsoH * 0.35, z: -0.16, rz: 0.3 });
      b.add(new BoxGeometry(c.torsoW * 0.26, c.torsoH * 0.3, 0.04), 0x2f5aa8, 'smooth', { x: -c.torsoW * 0.14, y: -c.torsoH * 0.35, z: -0.16, rz: -0.3 });
    },
  },
  8: {
    paint: asta,
    head: (b, c) => {
      cap(b, c, 0xe6e6ee, 0.5);
      spikyCrown(b, c, 0xe6e6ee, 0.6, 13, 0.46, 1.1);
      spikyCrown(b, c, 0xcfd0da, 0.4, 7, 0.62, 0.5);
    },
    back: (b, c) => {
      cape(b, c, 0x121216, 1.3);
      // The Demon-Slayer Sword.
      b.add(new BoxGeometry(0.46, c.torsoH * 2.6, 0.08), 0x2a2a30, 'smooth', { x: 0, y: 0, z: -c.torsoD * 0.3, rz: -0.55 });
      b.add(new BoxGeometry(0.2, c.torsoH * 0.5, 0.14), 0x6a4a2a, 'smooth', { x: c.torsoW * 0.78, y: c.torsoH * 1.15, z: -c.torsoD * 0.3, rz: -0.55 });
    },
  },
  9: {
    paint: saitama,
    back: (b, c) => cape(b, c, 0xf6f6f6, 2.0),
  },
  10: {
    paint: goku,
    head: (b, c) => {
      cap(b, c, 0x121216, 0.7);
      for (let i = 0; i < 9; i += 1) {
        const a = Math.PI * 0.35 + (i / 8) * Math.PI * 1.3;
        spike(b, c, 0x121216, Math.sin(a) * 0.4, 0.48, Math.cos(a) * 0.35, 0.95, 0.28, Math.cos(a) * 1.0, -Math.sin(a) * 1.0);
      }
      spike(b, c, 0x121216, 0, 0.6, 0.1, 0.9, 0.3, -0.25, 0);
      for (const x of [-0.25, 0.1, 0.35]) spike(b, c, 0x121216, x, 0.45, 0.5, 0.4, 0.13, 1.9, x);
    },
  },
  11: {
    paint: gojo,
    head: (b, c) => {
      cap(b, c, 0xf4f6ff, 0.3);
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        spike(b, c, i % 2 ? 0xf4f6ff : 0xe2e8f6, Math.sin(a) * 0.3, 0.52, Math.cos(a) * 0.3, 0.72, 0.22, Math.cos(a) * 0.4 - 0.35, -Math.sin(a) * 0.45);
      }
    },
  },
  12: {
    paint: ichigo,
    head: (b, c) => {
      cap(b, c, 0xff8a2a, 0.62);
      spikyCrown(b, c, 0xff8a2a, 0.55, 12, 0.48, 1.0);
      spikyCrown(b, c, 0xff9a3d, 0.42, 7, 0.6, 0.55);
    },
    back: (b, c) => {
      // Zangetsu: the cleaver.
      b.add(new BoxGeometry(0.62, c.torsoH * 2.5, 0.07), 0xdde2ea, 'smooth', { x: 0, y: -c.torsoH * 0.1, z: -c.torsoD * 0.32, rz: 0.5 });
      b.add(new BoxGeometry(0.12, c.torsoH * 2.5, 0.08), 0x2a2a30, 'smooth', { x: -0.16, y: -c.torsoH * 0.1 + 0.08, z: -c.torsoD * 0.32, rz: 0.5 });
      b.add(new BoxGeometry(0.16, c.torsoH * 0.6, 0.14), 0xf2f2f2, 'smooth', { x: -c.torsoW * 0.72, y: c.torsoH * 1.05, z: -c.torsoD * 0.32, rz: 0.5 });
    },
  },
};

export const suitFor = (slot: number): SuitDef => SUITS[slot] ?? SUITS[1]!;
