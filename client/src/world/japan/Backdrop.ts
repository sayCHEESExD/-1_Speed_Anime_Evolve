import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from './Kit.js';
import type { Backdrop as BackdropKind } from './Themes.js';

/**
 * THE HORIZON: mountain ranges with Fuji ahead, a city skyline with a red
 * lattice tower, and a castle keep on its hill - flat, hazy silhouettes far
 * beyond the fog that travel with the runner, so the whole 45 km course sits
 * inside one Japanese landscape. Unlit and fog-free; `Atmosphere` tints them
 * into each district's haze.
 */
export class Backdrop {
  readonly root = new Group();
  private readonly layers = new Map<BackdropKind, Group>();
  private readonly materials: { material: MeshBasicMaterial; base: Color; haze: number }[] = [];
  private readonly geometries: BufferGeometry[] = [];

  constructor() {
    const random = seeded(0xf0f1);
    // Mountains: always there. Fuji straight ahead and a range all round.
    const mountains = new Group();
    const body: BufferGeometry[] = [];
    const snow: BufferGeometry[] = [];
    const cone = (x: number, z: number, r: number, h: number, withSnow: boolean): void => {
      const g = new ConeGeometry(r, h, 12, 1);
      g.translate(x, h / 2 - 40, z);
      body.push(g);
      if (withSnow) {
        // Fatter than the peak's slope, so the cap's surface never coincides with the mountain's.
        const s = new ConeGeometry(r * 0.37, h * 0.33, 12, 1);
        s.translate(x, h - h * 0.165 - 40 + 0.5, z);
        snow.push(s);
      }
    };
    cone(0, 1250, 520, 430, true);
    cone(-40, -1250, 400, 300, true);
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2 + random() * 0.1;
      const d = 1050 + random() * 250;
      if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) > 0) continue;
      cone(Math.sin(a) * d, Math.cos(a) * d, 180 + random() * 220, 140 + random() * 200, random() < 0.45);
    }
    this.addMesh(mountains, body, 0x6f86a8, 0.42);
    this.addMesh(mountains, snow, 0xffffff, 0.2);
    this.layers.set('mountains', mountains);

    // City: towers either side, and the red lattice tower.
    const city = new Group();
    const towers: BufferGeometry[] = [];
    for (let i = 0; i < 70; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const w = 30 + random() * 50;
      const h = 60 + random() * 180;
      const g = new BoxGeometry(w, h, w * (0.6 + random() * 0.6));
      g.translate(side * (420 + random() * 380), h / 2 - 40, (random() - 0.5) * 2000);
      towers.push(g);
    }
    this.addMesh(city, towers, 0x5a6a92, 0.35);
    const tower: BufferGeometry[] = [];
    const legs = new CylinderGeometry(4, 38, 260, 4, 1, true);
    legs.translate(-520, 90, 700);
    tower.push(legs);
    for (const y of [80, 150]) {
      const deck = new CylinderGeometry(18, 18, 10, 8);
      deck.translate(-520, y, 700);
      tower.push(deck);
    }
    this.addMesh(city, tower, 0xff5a3a, 0.3);
    this.layers.set('city', city);

    // Castle: a keep on a hill, ahead and to the left.
    const keep = new Group();
    const hill: BufferGeometry[] = [];
    const h = new ConeGeometry(260, 90, 10, 1);
    h.translate(-380, 5, 900);
    hill.push(h);
    this.addMesh(keep, hill, 0x3a3060, 0.3);
    const walls: BufferGeometry[] = [];
    const roofs: BufferGeometry[] = [];
    let y = 50;
    for (const [w, t] of [
      [90, 34],
      [70, 30],
      [52, 26],
      [34, 22],
    ] as const) {
      const g = new BoxGeometry(w, t, w * 0.8);
      g.translate(-380, y + t / 2, 900);
      walls.push(g);
      const r = new ConeGeometry(w * 0.85, t * 0.6, 4, 1);
      r.rotateY(Math.PI / 4);
      r.translate(-380, y + t + t * 0.3, 900);
      roofs.push(r);
      y += t + t * 0.45;
    }
    this.addMesh(keep, walls, 0xe8e4f0, 0.25);
    this.addMesh(keep, roofs, 0x2a2a44, 0.25);
    this.layers.set('castle', keep);

    for (const group of this.layers.values()) this.root.add(group);
    this.root.renderOrder = -1;
  }

  private addMesh(into: Group, parts: BufferGeometry[], color: number, haze: number): void {
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) return;
    this.geometries.push(merged);
    const material = new MeshBasicMaterial({ color, fog: false });
    this.materials.push({ material, base: new Color(color), haze });
    const mesh = new Mesh(merged, material);
    mesh.frustumCulled = false;
    into.add(mesh);
  }

  /** Which layers this district shows. The mountains always stand. */
  show(kind: BackdropKind): void {
    this.layers.get('city')!.visible = kind === 'city';
    this.layers.get('castle')!.visible = kind === 'castle';
  }

  /** Haze every silhouette toward the district's horizon colour. */
  tint(horizon: Color, dark: number): void {
    for (const entry of this.materials) {
      entry.material.color.copy(entry.base).multiplyScalar(dark).lerp(horizon, entry.haze);
    }
  }

  follow(z: number): void {
    this.root.position.set(0, 0, z);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.material.dispose();
    this.root.removeFromParent();
  }
}
