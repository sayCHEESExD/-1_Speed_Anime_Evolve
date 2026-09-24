import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SURFACE_KINDS, SURFACE_TILE, surfaceTexture, worldRamp, type SurfaceKind } from '../world/japan/Surfaces.js';

/**
 * BATCHED PRIMITIVES.
 *
 * Everything drawn in code - every prop, building, pet and accessory - is a
 * pile of boxes, cylinders and cones. Drawn one mesh each, a village is
 * thousands of draw calls; merged, it is a handful. This builder collects
 * parts with a colour and a KIND and merges them into one mesh per kind:
 *
 *   - 'smooth' : untextured, vertex-coloured, in the world's soft bright light;
 *   - 'glow'   : unlit, vertex-coloured - paper lanterns, neon, eyes;
 *   - a SURFACE ('stone', 'wood', 'roof', ...): one neutral texture per
 *     surface, tinted per part by VERTEX COLOUR and tiled by world size.
 *
 * The materials are shared process-wide, so two builders' meshes differ only
 * in geometry.
 */
export type PartKind = 'smooth' | 'glow' | SurfaceKind;

export const PART_KINDS: readonly PartKind[] = ['smooth', 'glow', ...SURFACE_KINDS];

let shared: Record<PartKind, Material> | null = null;

export const partMaterials = (): Record<PartKind, Material> => {
  if (!shared) {
    const ramp = worldRamp();
    const built: Partial<Record<PartKind, Material>> = {
      smooth: new MeshToonMaterial({ vertexColors: true, gradientMap: ramp }),
      glow: new MeshBasicMaterial({ vertexColors: true, fog: false }),
    };
    for (const kind of SURFACE_KINDS) built[kind] = new MeshToonMaterial({ map: surfaceTexture(kind), vertexColors: true, gradientMap: ramp });
    shared = built as Record<PartKind, Material>;
  }
  return shared;
};

const MATRIX = new Matrix4();
const QUAT = new Quaternion();
const EULER = new Euler();
const SCALE = new Vector3(1, 1, 1);
const POSITION = new Vector3();
const COLOR = new Color();

export interface Transform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export class PartBuilder {
  private readonly parts = Object.fromEntries(PART_KINDS.map((kind) => [kind, [] as BufferGeometry[]])) as Record<PartKind, BufferGeometry[]>;

  get isEmpty(): boolean {
    return PART_KINDS.every((kind) => this.parts[kind].length === 0);
  }

  /**
   * Add a geometry, transformed and coloured. The geometry is consumed (it
   * is transformed in place and merged), so pass a fresh one.
   */
  add(geometry: BufferGeometry, color: number | string, kind: PartKind = 'smooth', transform: Transform = {}): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    EULER.set(transform.rx ?? 0, transform.ry ?? 0, transform.rz ?? 0, 'YXZ');
    QUAT.setFromEuler(EULER);
    POSITION.set(transform.x ?? 0, transform.y ?? 0, transform.z ?? 0);
    SCALE.set(transform.sx ?? 1, transform.sy ?? 1, transform.sz ?? 1);
    MATRIX.compose(POSITION, QUAT, SCALE);
    g.applyMatrix4(MATRIX);

    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    COLOR.set(color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = COLOR.r;
      colors[i * 3 + 1] = COLOR.g;
      colors[i * 3 + 2] = COLOR.b;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    this.parts[kind].push(g);
    return this;
  }

  /** A box by size and centre. Surfaced boxes get world-scaled UVs, so a stone is the same size everywhere. */
  box(w: number, h: number, d: number, color: number | string, kind: PartKind = 'smooth', transform: Transform = {}): this {
    const geometry = kind === 'smooth' || kind === 'glow' ? new BoxGeometry(w, h, d) : surfaceBox(w, h, d, SURFACE_TILE[kind]);
    return this.add(geometry, color, kind, transform);
  }

  /** Merge everything added so far into this builder's meshes. */
  build(name = 'parts', castShadow = true): Group {
    const group = new Group();
    group.name = name;
    const materials = partMaterials();
    for (const kind of PART_KINDS) {
      const list = this.parts[kind];
      if (list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      this.parts[kind] = [];
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, materials[kind]);
      mesh.name = `${name}-${kind}`;
      mesh.castShadow = castShadow && kind !== 'glow';
      mesh.receiveShadow = kind !== 'glow';
      group.add(mesh);
    }
    return group;
  }

  /** Merge into ONE geometry per kind without building meshes (for callers that instance or cache). */
  geometries(): Partial<Record<PartKind, BufferGeometry>> {
    const out: Partial<Record<PartKind, BufferGeometry>> = {};
    for (const kind of PART_KINDS) {
      const list = this.parts[kind];
      if (list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      this.parts[kind] = [];
      if (merged) {
        merged.computeBoundingSphere();
        out[kind] = merged;
      }
    }
    return out;
  }
}

/** Meshes for a cached set of geometries, on the shared materials. */
export const meshesFor = (geometries: Partial<Record<PartKind, BufferGeometry>>, name: string, castShadow = true): Group => {
  const group = new Group();
  group.name = name;
  const materials = partMaterials();
  for (const kind of PART_KINDS) {
    const geometry = geometries[kind];
    if (!geometry) continue;
    const mesh = new Mesh(geometry, materials[kind]);
    mesh.castShadow = castShadow && kind !== 'glow';
    mesh.receiveShadow = kind !== 'glow';
    group.add(mesh);
  }
  return group;
};

/** A box whose UVs are world-scaled (one texture repeat every `tile` units). */
export const surfaceBox = (w: number, h: number, d: number, tile = 2): BoxGeometry => {
  const geometry = new BoxGeometry(w, h, d);
  const uv = geometry.getAttribute('uv');
  const spans: readonly (readonly [number, number])[] = [
    [d / tile, h / tile],
    [d / tile, h / tile],
    [w / tile, d / tile],
    [w / tile, d / tile],
    [w / tile, h / tile],
    [w / tile, h / tile],
  ];
  for (let face = 0; face < 6; face += 1) {
    const span = spans[face]!;
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      uv.setXY(index, uv.getX(index) * span[0], uv.getY(index) * span[1]);
    }
  }
  uv.needsUpdate = true;
  return geometry;
};
