import { trailById } from '@anime/shared';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  type Object3D,
} from 'three';

/** Points kept along the ribbon. */
const POINTS = 28;
/** Seconds between samples. */
const SAMPLE = 0.028;
/** Ribbon half-width at its head. */
const WIDTH = 0.62;
/** Height of the ribbon above the feet. */
const HEIGHT = 1.35;

const COLOR = new Color();

/**
 * THE TRAIL: a ribbon in WORLD space behind a runner, in the equipped trail's
 * colours, fading and narrowing toward its tail. One mesh, rewritten in place
 * each sample - no allocation per frame. No Trail draws nothing.
 */
export class TrailRibbon {
  readonly mesh: Mesh;

  private readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(POINTS * 2 * 3);
  private readonly colors = new Float32Array(POINTS * 2 * 4);
  private readonly material: MeshBasicMaterial;
  private readonly xs = new Float32Array(POINTS);
  private readonly ys = new Float32Array(POINTS);
  private readonly zs = new Float32Array(POINTS);
  private count = 0;
  private timer = 0;
  private trailId = -1;
  private palette: Color[] = [];

  constructor(parent: Object3D) {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 4));
    const index: number[] = [];
    for (let i = 0; i < POINTS - 1; i += 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  setTrail(id: number): void {
    if (id === this.trailId) return;
    this.trailId = id;
    const def = trailById(id);
    this.palette = (def?.colors ?? []).map((hex) => new Color(hex));
    this.material.blending = def?.glow ? AdditiveBlending : NormalBlending;
    this.material.needsUpdate = true;
    this.mesh.visible = this.palette.length > 0;
    this.count = 0;
  }

  /** Forget the path (a teleport must not draw a ribbon across the map). */
  reset(): void {
    this.count = 0;
  }

  update(delta: number, x: number, y: number, z: number, moving: boolean): void {
    if (this.palette.length === 0) return;
    this.timer += delta;
    if (this.timer >= SAMPLE) {
      this.timer = 0;
      if (moving || this.count > 0) this.push(x, y + HEIGHT, z, moving);
    }
    this.write(x, y + HEIGHT, z);
  }

  private push(x: number, y: number, z: number, moving: boolean): void {
    // Standing still, the tail catches up and the ribbon shrinks away.
    if (!moving) {
      this.count = Math.max(0, this.count - 2);
      return;
    }
    for (let i = Math.min(this.count, POINTS - 1); i > 0; i -= 1) {
      this.xs[i] = this.xs[i - 1]!;
      this.ys[i] = this.ys[i - 1]!;
      this.zs[i] = this.zs[i - 1]!;
    }
    this.xs[0] = x;
    this.ys[0] = y;
    this.zs[0] = z;
    this.count = Math.min(POINTS, this.count + 1);
  }

  private write(hx: number, hy: number, hz: number): void {
    const n = this.count;
    if (n < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    // The head follows the runner every frame, between samples.
    this.xs[0] = hx;
    this.ys[0] = hy;
    this.zs[0] = hz;
    for (let i = 0; i < n; i += 1) {
      const j = Math.min(i + 1, n - 1);
      const k = Math.max(i - 1, 0);
      let dx = this.xs[k]! - this.xs[j]!;
      let dz = this.zs[k]! - this.zs[j]!;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const t = i / (n - 1);
      const w = WIDTH * (1 - t * 0.85);
      // Perpendicular in the ground plane, plus a little height so it reads side-on too.
      const px = -dz * w;
      const pz = dx * w;
      const at = i * 6;
      this.positions[at] = this.xs[i]! + px;
      this.positions[at + 1] = this.ys[i]! + w * 0.35;
      this.positions[at + 2] = this.zs[i]! + pz;
      this.positions[at + 3] = this.xs[i]! - px;
      this.positions[at + 4] = this.ys[i]! - w * 0.35;
      this.positions[at + 5] = this.zs[i]! - pz;

      const band = t * (this.palette.length - 1);
      const a = this.palette[Math.floor(band)]!;
      const b = this.palette[Math.min(this.palette.length - 1, Math.floor(band) + 1)]!;
      COLOR.copy(a).lerp(b, band - Math.floor(band));
      const alpha = (1 - t) * 0.9;
      for (let side = 0; side < 2; side += 1) {
        const c = i * 8 + side * 4;
        this.colors[c] = COLOR.r;
        this.colors[c + 1] = COLOR.g;
        this.colors[c + 2] = COLOR.b;
        this.colors[c + 3] = alpha;
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    this.geometry.setDrawRange(0, (n - 1) * 6);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
