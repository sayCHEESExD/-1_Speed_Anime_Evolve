import { CanvasTexture, DataTexture, LinearFilter, NearestFilter, RedFormat, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * THE WORLD'S MATERIALS, painted on canvases at runtime, in ONE material
 * language: clean, slightly stylised game materials in the manner of a
 * polished Roblox place - a slab, planks, bricks, roof tiles, faceted rock,
 * soft grass, near-flat plaster and asphalt. Every one follows the same rules:
 *
 *   - LOW CONTRAST and LOW FREQUENCY: a few big, readable shapes per tile and
 *     no speckle, grit or photographic detail, so it reads from gameplay
 *     distance and never shimmers;
 *   - the same bevel treatment (a light edge on top, a soft shade underneath)
 *     wherever a material has pieces;
 *   - drawn in NEUTRAL light greys, so one texture serves every colour: the
 *     part's vertex colour is what makes a district red, snowy or neon.
 *
 * Each tiles by world size (`SURFACE_TILE`), so a brick is the same size on a
 * climb wall and on the spawn's castle wall. A few hundred kilobytes of GPU
 * memory, zero bytes of download.
 */
export type SurfaceKind =
  | 'stone'
  | 'wood'
  | 'roof'
  | 'plaster'
  | 'ishigaki'
  | 'rock'
  | 'asphalt'
  | 'windows'
  | 'shoji'
  | 'tatami'
  | 'grass';

export const SURFACE_KINDS: readonly SurfaceKind[] = ['stone', 'wood', 'roof', 'plaster', 'ishigaki', 'rock', 'asphalt', 'windows', 'shoji', 'tatami', 'grass'];

/** World units one texture repeat covers. */
export const SURFACE_TILE: Readonly<Record<SurfaceKind, number>> = {
  /** The platform slab: 2 x 2 slabs of 4 units. */
  stone: 8,
  wood: 4,
  roof: 3,
  plaster: 8,
  /** Blocks: 6 x 3 units. */
  ishigaki: 6,
  rock: 10,
  asphalt: 10,
  /** Facade: 2 x 2 big windows of 4 units. */
  windows: 8,
  shoji: 4,
  tatami: 6,
  grass: 10,
};

const SIZE = 256;

const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const canvas = (): CanvasRenderingContext2D => {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c.getContext('2d')!;
};

const grey = (v: number, alpha = 1): string => `rgba(${v},${v},${v},${alpha})`;

/** Draw something at every wrap offset, so a shape crossing an edge tiles. */
const wrapped = (draw: (ox: number, oy: number) => void): void => {
  for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) draw(ox, oy);
};

/** Big, soft, barely-there patches: the only "noise" any material gets. */
const blotches = (ctx: CanvasRenderingContext2D, random: () => number, count: number, rMin: number, rMax: number, alpha: number): void => {
  for (let i = 0; i < count; i += 1) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const r = rMin + random() * (rMax - rMin);
    const v = random() < 0.5 ? 255 : 0;
    wrapped((ox, oy) => {
      const grad = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, `rgba(${v},${v},${v},${alpha})`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
};

/**
 * THE SHARED PIECE LOOK: a flat fill, a light bevel along the top and left,
 * a soft shade along the bottom and right. Slabs, planks and bricks are all
 * drawn with it, which is what makes them one family.
 */
const piece = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, value: number, bevel = 3): void => {
  wrapped((ox, oy) => {
    const px = x + ox;
    const py = y + oy;
    if (px > SIZE || py > SIZE || px + w < 0 || py + h < 0) return;
    ctx.fillStyle = grey(value);
    ctx.fillRect(px, py, w, h);
    ctx.fillStyle = grey(255, 0.45);
    ctx.fillRect(px, py, w, bevel);
    ctx.fillRect(px, py, bevel, h);
    ctx.fillStyle = grey(0, 0.07);
    ctx.fillRect(px, py + h - bevel, w, bevel);
    ctx.fillRect(px + w - bevel, py, bevel, h);
  });
};

/** A tileable cell field (Voronoi): each pixel's nearest cell and its distance to the nearest edge. */
export interface CellField {
  readonly size: number;
  /** Nearest cell index per pixel. */
  readonly id: Uint16Array;
  /** Distance to the nearest cell centre, in pixels. */
  readonly near: Float32Array;
  /** Distance from the edge between cells (second-nearest minus nearest), in pixels. */
  readonly edge: Float32Array;
  readonly count: number;
  /** Cell centres, in pixels. */
  readonly cx: readonly number[];
  readonly cy: readonly number[];
}

export const cellField = (size: number, cols: number, rows: number, jitter: number, random: () => number): CellField => {
  const cw = size / cols;
  const ch = size / rows;
  const px: number[] = [];
  const py: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      px.push((i + 0.5 + (random() - 0.5) * jitter) * cw);
      py.push((j + 0.5 + (random() - 0.5) * jitter) * ch);
    }
  }
  const count = px.length;
  const id = new Uint16Array(size * size);
  const near = new Float32Array(size * size);
  const edge = new Float32Array(size * size);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let d1 = Infinity;
      let d2 = Infinity;
      let best = 0;
      for (let k = 0; k < count; k += 1) {
        let dx = Math.abs(x - px[k]!);
        let dy = Math.abs(y - py[k]!);
        if (dx > half) dx = size - dx;
        if (dy > half) dy = size - dy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = k;
        } else if (d < d2) {
          d2 = d;
        }
      }
      const i = y * size + x;
      id[i] = best;
      near[i] = d1;
      // Distances to two centres differ by twice the distance to their bisector.
      edge[i] = (d2 - d1) / 2;
    }
  }
  return { size, id, near, edge, count, cx: px, cy: py };
};

const DRAW: Readonly<Record<SurfaceKind, (ctx: CanvasRenderingContext2D, random: () => number) => void>> = {
  /** THE PLATFORM SLAB: 2 x 2 clean bevelled slabs with a thin seam - every island, path and pad. */
  stone: (ctx, random) => {
    ctx.fillStyle = grey(196);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 2;
    const s = SIZE / n;
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) piece(ctx, i * s + 2, j * s + 2, s - 4, s - 4, 232 + Math.floor(random() * 10), 4);
    blotches(ctx, random, 6, 50, 110, 0.035);
  },
  /** WOOD PLANKS: four wide planks, staggered joints, one faint grain line. */
  wood: (ctx, random) => {
    ctx.fillStyle = grey(168);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const planks = 4;
    const h = SIZE / planks;
    for (let p = 0; p < planks; p += 1) {
      const joint = Math.floor(random() * SIZE);
      const value = 218 + Math.floor(random() * 18);
      piece(ctx, joint + 2, p * h + 2, SIZE - 4, h - 4, value, 3);
      ctx.strokeStyle = grey(120, 0.09);
      ctx.lineWidth = 3;
      const y = p * h + h * (0.35 + random() * 0.3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(SIZE * 0.35, y - 4, SIZE * 0.65, y + 4, SIZE, y);
      ctx.stroke();
    }
  },
  /** ROOF TILES: rounded tile columns down the slope, clean course lines. */
  roof: (ctx) => {
    ctx.fillStyle = grey(200);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const cols = 6;
    const w = SIZE / cols;
    for (let c = 0; c < cols; c += 1) {
      const grad = ctx.createLinearGradient(c * w, 0, c * w + w, 0);
      grad.addColorStop(0, grey(205));
      grad.addColorStop(0.45, grey(238));
      grad.addColorStop(1, grey(208));
      ctx.fillStyle = grad;
      ctx.fillRect(c * w + 2, 0, w - 4, SIZE);
    }
    for (let r = 0; r < 4; r += 1) {
      ctx.fillStyle = grey(0, 0.1);
      ctx.fillRect(0, (r * SIZE) / 4, SIZE, 4);
      ctx.fillStyle = grey(255, 0.3);
      ctx.fillRect(0, (r * SIZE) / 4 + 4, SIZE, 3);
    }
  },
  /** PLASTER: smooth and near-flat. */
  plaster: (ctx, random) => {
    ctx.fillStyle = grey(240);
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, 8, 50, 110, 0.03);
  },
  /** BLOCKS: big bevelled game blocks in a running bond (6 x 3 units) - walls and castle bases. */
  ishigaki: (ctx, random) => {
    ctx.fillStyle = grey(196);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const rows = 2;
    const perRow = 1;
    const h = SIZE / rows;
    const w = SIZE / perRow;
    for (let r = 0; r < rows; r += 1) {
      const shift = r % 2 === 0 ? 0 : w / 2;
      for (let k = -1; k < perRow; k += 1) piece(ctx, k * w + shift + 3, r * h + 3, w - 6, h - 6, 222 + Math.floor(random() * 16), 4);
    }
  },
  /** ROCK: big flat facets, each lit a little differently, with a soft crease between them. */
  rock: (ctx, random) => {
    const field = cellField(SIZE, 3, 3, 0.85, random);
    const tone = Array.from({ length: field.count }, () => 208 + Math.floor(random() * 32));
    const tilt = Array.from({ length: field.count }, () => [(random() - 0.5) * 0.12, (random() - 0.5) * 0.12] as const);
    const image = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const i = y * SIZE + x;
        const cell = field.id[i]!;
        const [tx, ty] = tilt[cell]!;
        // Each facet leans toward the light a little differently: a flat plane per cell.
        let dx = x - field.cx[cell]!;
        let dy = y - field.cy[cell]!;
        if (dx > SIZE / 2) dx -= SIZE;
        else if (dx < -SIZE / 2) dx += SIZE;
        if (dy > SIZE / 2) dy -= SIZE;
        else if (dy < -SIZE / 2) dy += SIZE;
        let v = tone[cell]! + tx * dx + ty * dy;
        const e = field.edge[i]!;
        if (e < 5) v -= (1 - e / 5) * 34;
        const o = i * 4;
        const c = Math.max(0, Math.min(255, v));
        image.data[o] = c;
        image.data[o + 1] = c;
        image.data[o + 2] = c;
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  },
  /** ASPHALT: flat, with the faintest patches. */
  asphalt: (ctx, random) => {
    ctx.fillStyle = grey(212);
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, 8, 40, 100, 0.04);
  },
  /** CITY FACADE: a few big, framed windows per tile, some lit - readable from far off. */
  windows: (ctx, random) => {
    ctx.fillStyle = grey(226);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 2;
    const cell = SIZE / n;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const lit = random() < 0.35;
        const x = i * cell + cell * 0.16;
        const y = j * cell + cell * 0.18;
        const w = cell * 0.68;
        const h = cell * 0.6;
        ctx.fillStyle = grey(150);
        ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
        ctx.fillStyle = lit ? '#ffe9a0' : '#5a6f96';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = grey(255, lit ? 0.25 : 0.18);
        ctx.fillRect(x, y, w, h * 0.22);
      }
    }
  },
  /** SHOJI: paper panes in a clean lattice. */
  shoji: (ctx) => {
    ctx.fillStyle = '#fbf6e8';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = grey(140);
    for (let i = 0; i <= 4; i += 1) ctx.fillRect((i * SIZE) / 4 - 3, 0, 6, SIZE);
    for (let j = 0; j <= 6; j += 1) ctx.fillRect(0, (j * SIZE) / 6 - 3, SIZE, 6);
  },
  /** TATAMI: flat mats with their dark cloth border, the weave only hinted. */
  tatami: (ctx) => {
    ctx.fillStyle = grey(230);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 16) {
      ctx.fillStyle = grey(0, 0.04);
      ctx.fillRect(0, y, SIZE, 8);
    }
    ctx.fillStyle = grey(96);
    ctx.fillRect(0, 0, SIZE, 10);
    ctx.fillRect(0, SIZE / 2, SIZE / 2, 10);
    ctx.fillRect(SIZE / 2, 0, 10, SIZE);
  },
  /** GRASS: soft light and dark patches - no blades. */
  grass: (ctx, random) => {
    ctx.fillStyle = grey(218);
    ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, random, 14, 30, 80, 0.07);
  },
};

const textures = new Map<SurfaceKind, Texture>();

export const surfaceTexture = (kind: SurfaceKind): Texture => {
  let texture = textures.get(kind);
  if (!texture) {
    const ctx = canvas();
    DRAW[kind](ctx, seeded(kind.length * 7919 + kind.charCodeAt(0)));
    texture = new CanvasTexture(ctx.canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    textures.set(kind, texture);
  }
  return texture;
};

let toonRamp: DataTexture | null = null;
let worldRampTexture: DataTexture | null = null;

/**
 * THE WORLD'S LIGHT RAMP: soft and bright, the clean even light of a Roblox
 * place - a smooth fall-off (linear filtering) that never drops below a
 * well-lit shade, so every colour stays bright and saturated. The characters
 * keep the hard anime bands of `toonGradient`.
 */
export const worldRamp = (): DataTexture => {
  if (!worldRampTexture) {
    worldRampTexture = new DataTexture(new Uint8Array([172, 214, 244, 255]), 4, 1, RedFormat);
    worldRampTexture.minFilter = LinearFilter;
    worldRampTexture.magFilter = LinearFilter;
    worldRampTexture.generateMipmaps = false;
    worldRampTexture.needsUpdate = true;
  }
  return worldRampTexture;
};

/**
 * THE ANIME SHADING RAMP: three flat bands of light (shadow, mid, lit), so
 * every surface is cel-shaded rather than smoothly lit.
 */
export const toonGradient = (): DataTexture => {
  if (!toonRamp) {
    toonRamp = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
    toonRamp.minFilter = NearestFilter;
    toonRamp.magFilter = NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
};
