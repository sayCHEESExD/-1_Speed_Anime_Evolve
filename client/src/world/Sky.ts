import { COURSE_END_Z } from '@anime/shared';
const COURSE_TOP_Y = 24;
/** Z span of one cloud chunk, so the field can be frustum-culled along a long river. */
const CLOUD_CHUNK = 1500;
import {
  BackSide,
  IcosahedronGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/worldVisuals.js';

/** How far out the dome sits. Inside the camera's far plane. */
const DOME_RADIUS = 1500;

/**
 * The sky: a gradient dome and a field of soft, rounded anime clouds - each a
 * cluster of round puffs over a flatter shaded base; the whole sky is a
 * handful of merged meshes. `setColors` repaints it per district.
 */
export class Sky {
  readonly root = new Group();
  private readonly dome: Mesh;
  private domeMaterial!: ShaderMaterial;
  private readonly cloudTop = new MeshBasicMaterial({ color: PALETTE.skyCloud, fog: false });
  private readonly cloudBase = new MeshBasicMaterial({ color: PALETTE.skyCloudShade, fog: false });

  /** Keep the dome centred on the viewer: the river is far longer than the dome is wide. */
  follow(x: number, z: number): void {
    this.dome.position.set(x, 0, z);
  }
  private readonly disposables: (BufferGeometry | ShaderMaterial | MeshBasicMaterial)[] = [];

  constructor() {
    this.dome = this.buildDome();
    this.root.add(this.dome);
    // Overhead and below, as many clouds per kilometre as ever, along the whole river.
    this.buildClouds(0x9a1ce, Math.round((COURSE_END_Z + 900) / 200), -400, COURSE_END_Z + 500, 90 + 0, 220 + COURSE_TOP_Y, 900);
    this.root.renderOrder = -1;
  }

  private buildDome(): Mesh {
    const geometry = new SphereGeometry(DOME_RADIUS, 24, 16);
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new Color(PALETTE.skyTop) },
        midColor: { value: new Color(PALETTE.sky) },
        bottomColor: { value: new Color(PALETTE.fog) },
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vHeight = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying float vHeight;
        void main() {
          float h = clamp(vHeight, -1.0, 1.0);
          vec3 sky = mix(midColor, topColor, clamp(h * 1.4, 0.0, 1.0));
          vec3 low = mix(bottomColor, midColor, clamp((h + 0.3) * 3.0, 0.0, 1.0));
          gl_FragColor = vec4(h > 0.0 ? sky : low, 1.0);
        }
      `,
    });
    this.disposables.push(geometry, material);
    this.domeMaterial = material;
    const dome = new Mesh(geometry, material);
    dome.frustumCulled = false;
    return dome;
  }

  private buildClouds(
    seed: number,
    clusters: number,
    fromZ: number,
    toZ: number,
    minY: number,
    maxY: number,
    halfWidth: number,
  ): void {
    const random = seeded(seed);
    const tops = new Map<number, BufferGeometry[]>();
    const bases = new Map<number, BufferGeometry[]>();
    const into = (map: Map<number, BufferGeometry[]>, z: number): BufferGeometry[] => {
      const chunk = Math.floor(z / CLOUD_CHUNK);
      let list = map.get(chunk);
      if (!list) {
        list = [];
        map.set(chunk, list);
      }
      return list;
    };

    for (let i = 0; i < clusters; i += 1) {
      const cx = (random() * 2 - 1) * halfWidth;
      const cy = minY + random() * (maxY - minY);
      const cz = fromZ + random() * (toZ - fromZ);
      const scale = 9 + random() * 18;
      const puffs = 3 + Math.floor(random() * 3);

      // A soft cumulus: overlapping round puffs, fattest in the middle, a
      // flatter shaded base under them.
      for (let b = 0; b < puffs; b += 1) {
        const t = puffs === 1 ? 0.5 : b / (puffs - 1);
        const bulge = Math.sin(t * Math.PI);
        const r = scale * (0.7 + bulge * 0.8 + random() * 0.25);
        const x = cx + (t - 0.5) * scale * 4;
        const y = cy + bulge * scale * 0.45;
        const z = cz + (random() - 0.5) * scale * 1.2;
        const top = new IcosahedronGeometry(r, 1);
        top.scale(1.2, 0.8, 1);
        top.translate(x, y, z);
        into(tops, cz).push(top);
        const base = new IcosahedronGeometry(r * 0.95, 0);
        base.scale(1.25, 0.35, 1.05);
        base.translate(x, y - r * 0.45, z);
        into(bases, cz).push(base);
      }
    }

    for (const parts of tops.values()) this.addLayer(parts, this.cloudTop);
    for (const parts of bases.values()) this.addLayer(parts, this.cloudBase);
  }

  private addLayer(parts: BufferGeometry[], material: MeshBasicMaterial): void {
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) return;
    this.disposables.push(merged);
    const mesh = new Mesh(merged, material);
    this.root.add(mesh);
  }

  /** Recolour the dome and the clouds (a district's sky: day, sunset, night). */
  setColors(top: Color, mid: Color, bottom: Color, cloud: Color, cloudShade: Color): void {
    const u = this.domeMaterial.uniforms;
    (u['topColor']!.value as Color).copy(top);
    (u['midColor']!.value as Color).copy(mid);
    (u['bottomColor']!.value as Color).copy(bottom);
    this.cloudTop.color.copy(cloud);
    this.cloudBase.color.copy(cloudShade);
  }

  dispose(): void {
    this.cloudTop.dispose();
    this.cloudBase.dispose();
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.root.removeFromParent();
  }
}

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
