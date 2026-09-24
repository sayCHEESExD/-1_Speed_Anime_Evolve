import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';

const LINES = 14;
const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();

let sharedGeometry: BoxGeometry | null = null;
let sharedMaterial: MeshBasicMaterial | null = null;

/**
 * THE SPRINT'S WIND: white speed lines streaming past the runner, plus a cone
 * of wind ahead of them. Local to the character (it turns with them), one
 * instanced draw for every line, faded in by the sprint weight.
 */
export class WindLines {
  readonly root = new Group();

  private readonly lines: InstancedMesh;
  private readonly seeds: { x: number; y: number; z: number; speed: number; length: number }[] = [];
  private weight = 0;

  constructor(parent: Object3D) {
    sharedGeometry ??= new BoxGeometry(0.05, 0.05, 1);
    sharedMaterial ??= new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.lines = new InstancedMesh(sharedGeometry, sharedMaterial.clone(), LINES);
    this.lines.frustumCulled = false;
    for (let i = 0; i < LINES; i += 1) this.seeds.push(this.respawn({ x: 0, y: 0, z: 0, speed: 0, length: 0 }, true));
    this.root.add(this.lines);
    this.root.visible = false;
    parent.add(this.root);
  }

  private respawn(seed: { x: number; y: number; z: number; speed: number; length: number }, anywhere: boolean) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.9 + Math.random() * 1.2;
    seed.x = Math.cos(a) * r;
    seed.y = 1.5 + Math.sin(a) * r * 0.9;
    seed.z = anywhere ? -4 + Math.random() * 7 : 3 + Math.random() * 1.5;
    seed.speed = 22 + Math.random() * 14;
    seed.length = 1.2 + Math.random() * 1.8;
    return seed;
  }

  /** `sprint` 0..1; `scale` the character's size. */
  update(delta: number, sprint: number, scale: number): void {
    this.weight += (sprint - this.weight) * (1 - Math.exp(-6 * delta));
    const visible = this.weight > 0.04;
    this.root.visible = visible;
    if (!visible) return;
    (this.lines.material as MeshBasicMaterial).opacity = 0.5 * this.weight;
    for (let i = 0; i < LINES; i += 1) {
      const seed = this.seeds[i]!;
      seed.z -= seed.speed * delta;
      if (seed.z < -5) this.respawn(seed, false);
      P.set(seed.x * scale, seed.y * scale, seed.z * scale);
      S.set(1, 1, seed.length * this.weight);
      M.compose(P, Q, S);
      this.lines.setMatrixAt(i, M);
    }
    this.lines.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    (this.lines.material as MeshBasicMaterial).dispose();
    this.lines.dispose();
    this.root.removeFromParent();
  }
}
