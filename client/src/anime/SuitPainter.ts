import {
  CanvasTexture,
  Mesh,
  NearestFilter,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import { PLAYER_TEXTURE_SETTINGS } from '../config/assets.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';

/**
 * PAINTING A SUIT ONTO THE SUPPLIED PLAYER MODEL.
 *
 * The player FBX is a blocky, box-limbed body whose parts each own their own
 * region of a 64x64 atlas. A character is drawn by re-painting that atlas: every
 * triangle is rasterised in UV space into a fresh canvas, and for every texel
 * the painter is asked what colour the suit is AT THAT POINT OF THE BODY -
 * which part, which face of the box, and where on that face.
 *
 * So a character is a small pure function (`SuitPainter`) instead of an image file:
 * Naruto's whiskers, Tanjiro's checkered haori and Goku's gi are a few lines of maths each,
 * cost no download, and land on the right texels of the real model's UVs.
 */
export type BodyPart = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';
export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface PaintPoint {
  readonly part: BodyPart;
  readonly face: Face;
  /** Across the face as its viewer sees it, 0 (their left) .. 1. */
  readonly u: number;
  /** Up the face, 0 (bottom) .. 1. For top/bottom: 0 back .. 1 front. */
  readonly v: number;
  /** Position within the part's box: x 0 (character's right) .. 1 (left), y 0 (bottom) .. 1 (top), z 0 (back) .. 1 (front). */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/** A suit: colour (0xRRGGBB) at a point of the body. */
export type SuitPainter = (p: PaintPoint) => number;

const RESOLUTION = 256;

const BONE_TO_PART: Readonly<Record<string, BodyPart>> = {
  Neck1: 'head',
  Spine1: 'torso',
  Spine2: 'torso',
  Rig1: 'torso',
  ArmL1: 'armL',
  ArmL2: 'armL',
  ArmR1: 'armR',
  ArmR2: 'armR',
  LegL1: 'legL',
  LegL2: 'legL',
  LegR1: 'legR',
  LegR2: 'legR',
};

interface Triangle {
  readonly part: BodyPart;
  readonly face: Face;
  /** World positions of the three corners. */
  readonly p: readonly [Vector3, Vector3, Vector3];
  /** UVs of the three corners. */
  readonly uv: readonly [number, number, number, number, number, number];
}

interface Box {
  min: Vector3;
  max: Vector3;
}

/** The measured layout of the model: triangles by part and face, and each part's box. */
interface Layout {
  readonly triangles: Triangle[];
  readonly boxes: Map<BodyPart, Box>;
}

let layout: Layout | null = null;

const faceOf = (normal: Vector3): Face => {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ay >= ax && ay >= az) return normal.y > 0 ? 'top' : 'bottom';
  if (az >= ax) return normal.z > 0 ? 'front' : 'back';
  // The character faces +Z, so its LEFT is +X.
  return normal.x > 0 ? 'left' : 'right';
};

/** Measure the body once: which triangle belongs to which part, and where. */
const measure = (model: Object3D): Layout => {
  model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
  model.updateMatrixWorld(true);
  const triangles: Triangle[] = [];
  const boxes = new Map<BodyPart, Box>();
  const grow = (part: BodyPart, v: Vector3): void => {
    let box = boxes.get(part);
    if (!box) {
      box = { min: v.clone(), max: v.clone() };
      boxes.set(part, box);
    }
    box.min.min(v);
    box.max.max(v);
  };

  model.traverse((child) => {
    const mesh = child as SkinnedMesh;
    if (!(mesh as Mesh).isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    if (!position || !uv) return;
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    const bones = mesh.isSkinnedMesh ? mesh.skeleton.bones : [];
    if (mesh.isSkinnedMesh) mesh.skeleton.update();

    const world = (index: number): Vector3 => {
      const v = new Vector3().fromBufferAttribute(position, index);
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(index, v);
      return v.applyMatrix4(mesh.matrixWorld);
    };
    const partOf = (index: number): BodyPart => {
      if (!skinIndex || !skinWeight) return 'torso';
      let best = 0;
      let weight = -1;
      for (let k = 0; k < 4; k += 1) {
        const w = skinWeight.getComponent(index, k);
        if (w > weight) {
          weight = w;
          best = skinIndex.getComponent(index, k);
        }
      }
      return BONE_TO_PART[bones[best]?.name ?? ''] ?? 'torso';
    };

    const indexAt = (i: number): number => (geometry.index ? geometry.index.getX(i) : i);
    const count = geometry.index ? geometry.index.count : position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const ia = indexAt(t);
      const ib = indexAt(t + 1);
      const ic = indexAt(t + 2);
      const a = world(ia);
      const b = world(ib);
      const c = world(ic);
      // The part the triangle's corners mostly belong to.
      const parts = [partOf(ia), partOf(ib), partOf(ic)];
      const part = parts[1] === parts[2] ? parts[1]! : parts[0]!;
      const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      if (normal.lengthSq() < 1e-12) continue;
      normal.normalize();
      triangles.push({
        part,
        face: faceOf(normal),
        p: [a, b, c],
        uv: [uv.getX(ia), uv.getY(ia), uv.getX(ib), uv.getY(ib), uv.getX(ic), uv.getY(ic)],
      });
      grow(part, a);
      grow(part, b);
      grow(part, c);
    }
  });
  return { triangles, boxes };
};

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Where a point sits on its face, as the face's viewer sees it. */
const faceUv = (face: Face, nx: number, ny: number, nz: number): [number, number] => {
  switch (face) {
    case 'front':
      return [nx, ny];
    case 'back':
      return [1 - nx, ny];
    case 'left':
      return [1 - nz, ny];
    case 'right':
      return [nz, ny];
    case 'top':
      return [nx, nz];
    case 'bottom':
      return [nx, 1 - nz];
  }
};

const cache = new Map<string, Texture>();

/**
 * The atlas painted with a suit. `model` is any fresh instance of the player
 * model (only measured, never kept); the result is cached by `key`.
 */
export const paintSuit = (key: string, model: Object3D, painter: SuitPainter): Texture => {
  const existing = cache.get(key);
  if (existing) return existing;
  layout ??= measure(model);

  const canvas = document.createElement('canvas');
  canvas.width = RESOLUTION;
  canvas.height = RESOLUTION;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(RESOLUTION, RESOLUTION);
  const data = image.data;
  const P = new Vector3();

  for (const tri of layout.triangles) {
    const box = layout.boxes.get(tri.part);
    if (!box) continue;
    const size = new Vector3().subVectors(box.max, box.min);
    // Texel space: u across, and v flipped (the texture is uploaded flipped).
    const x0 = tri.uv[0] * RESOLUTION;
    const y0 = (1 - tri.uv[1]) * RESOLUTION;
    const x1 = tri.uv[2] * RESOLUTION;
    const y1 = (1 - tri.uv[3]) * RESOLUTION;
    const x2 = tri.uv[4] * RESOLUTION;
    const y2 = (1 - tri.uv[5]) * RESOLUTION;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-6) continue;
    // A texel and a half of bleed, so no seam shows the dark default between faces.
    const pad = 1.5;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) - pad));
    const maxX = Math.min(RESOLUTION - 1, Math.ceil(Math.max(x0, x1, x2) + pad));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) - pad));
    const maxY = Math.min(RESOLUTION - 1, Math.ceil(Math.max(y0, y1, y2) + pad));
    const edge = (pad / Math.sqrt(Math.abs(area))) * 1.2;
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const sx = px + 0.5;
        const sy = py + 0.5;
        const w1 = ((sx - x0) * (y2 - y0) - (x2 - x0) * (sy - y0)) / area;
        const w2 = ((x1 - x0) * (sy - y0) - (sx - x0) * (y1 - y0)) / area;
        const w0 = 1 - w1 - w2;
        if (w0 < -edge || w1 < -edge || w2 < -edge) continue;
        const a = clamp01(w0);
        const b = clamp01(w1);
        const c = clamp01(w2);
        const sum = a + b + c || 1;
        P.set(0, 0, 0)
          .addScaledVector(tri.p[0], a / sum)
          .addScaledVector(tri.p[1], b / sum)
          .addScaledVector(tri.p[2], c / sum);
        const nx = size.x > 1e-6 ? clamp01((P.x - box.min.x) / size.x) : 0.5;
        const ny = size.y > 1e-6 ? clamp01((P.y - box.min.y) / size.y) : 0.5;
        const nz = size.z > 1e-6 ? clamp01((P.z - box.min.z) / size.z) : 0.5;
        const [u, v] = faceUv(tri.face, nx, ny, nz);
        const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
        const at = (py * RESOLUTION + px) * 4;
        // A bleed texel never overwrites a texel some triangle already owns.
        if (!inside && data[at + 3] === 255) continue;
        let color = painter({ part: tri.part, face: tri.face, u, v, nx, ny, nz });
        // A soft bevel: the rim of every box face a touch darker, the pixel-art look.
        const rim = Math.min(u, 1 - u, v, 1 - v);
        if (rim < 0.06) color = shade(color, 0.86);
        data[at] = (color >> 16) & 255;
        data[at + 1] = (color >> 8) & 255;
        data[at + 2] = color & 255;
        data[at + 3] = inside ? 255 : 254;
      }
    }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  ctx.putImageData(image, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = PLAYER_TEXTURE_SETTINGS.flipY;
  texture.generateMipmaps = false;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  cache.set(key, texture);
  return texture;
};

/** Multiply a colour's channels. */
export const shade = (color: number, k: number): number => {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const b = Math.min(255, Math.round((color & 255) * k));
  return (r << 16) | (g << 8) | b;
};

/** The body's measured part boxes, in model space at the origin (after `paintSuit` ran once). */
export const partBox = (part: BodyPart): { min: Vector3; max: Vector3 } | null => {
  const box = layout?.boxes.get(part);
  return box ? { min: box.min.clone(), max: box.max.clone() } : null;
};
