import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { createCharacterBody } from '../../anime/CharacterModels.js';
import type { PartBuilder } from '../../render/PartBuilder.js';
import { Local, type Random } from '../japan/Kit.js';

/**
 * THE ANIME KIT: what makes the course read as an ANIME GAME rather than
 * simply "Japan" - comic-burst signs shouting ドドド and POWER UP!, floating
 * energy orbs, aura rings, rising sparkles, giant lightning bolts, oversized
 * training gear and towering statues of the twelve evolutions.
 *
 * Everything animated carries `userData.tick(time)`; `CourseWorld` calls it
 * while the stage is on screen. Materials are cached process-wide per colour,
 * so a stage of orbs costs a handful of materials. Nothing here collides.
 */
export type Tick = (time: number) => void;

export const animate = (object: Object3D, tick: Tick): Object3D => {
  object.userData['tick'] = tick;
  return object;
};

/** Bright, saturated anime-game colours. */
export const POP = {
  pink: 0xff4fa8,
  hot: 0xff2d6f,
  orange: 0xff8a1f,
  yellow: 0xffd92e,
  lime: 0x7cf03a,
  mint: 0x2ee8b0,
  cyan: 0x2ed8ff,
  blue: 0x2f7dff,
  violet: 0x8a4dff,
  purple: 0xc04dff,
  white: 0xffffff,
  ink: 0x241d4a,
} as const;

// ------------------------------------------------------------ comic bursts

const FONT = '"Arial Black", "Segoe UI Black", "Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Meiryo", sans-serif';

export interface BurstLook {
  readonly inner: string;
  readonly outer: string;
  readonly text: string;
  readonly stroke: string;
}

export const BURSTS: readonly BurstLook[] = [
  { inner: '#fff36a', outer: '#ff9a1f', text: '#ff2d6f', stroke: '#ffffff' },
  { inner: '#7ff6ff', outer: '#2f7dff', text: '#ffffff', stroke: '#1a1a6a' },
  { inner: '#ff9ad6', outer: '#ff2d8f', text: '#ffffff', stroke: '#6a0a3a' },
  { inner: '#b8ff7a', outer: '#2ec84a', text: '#ffffff', stroke: '#0a4a1a' },
  { inner: '#e0b8ff', outer: '#8a4dff', text: '#fff36a', stroke: '#2a0a6a' },
];

const burstMaterials = new Map<string, Material>();

const drawBurst = (text: string, look: BurstLook): Texture => {
  // Drawn in 512 x 384 units onto a 384 x 288 canvas: crisp enough at any
  // distance, and a quarter of the GPU memory of a full-size one.
  const w = 512;
  const h = 384;
  const k = 0.75;
  const canvas = document.createElement('canvas');
  canvas.width = w * k;
  canvas.height = h * k;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(k, k);
  const cx = w / 2;
  const cy = h / 2;
  const spikes = 16;
  const star = (scale: number): void => {
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i += 1) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = (i % 2 === 0 ? 1 : 0.72 + ((i * 7) % 5) * 0.03) * scale;
      const x = cx + Math.cos(a) * r * (w / 2 - 8);
      const y = cy + Math.sin(a) * r * (h / 2 - 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  star(1);
  ctx.fillStyle = '#1d1840';
  ctx.fill();
  star(0.93);
  const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, w / 2);
  grad.addColorStop(0, look.inner);
  grad.addColorStop(0.55, look.inner);
  grad.addColorStop(1, look.outer);
  ctx.fillStyle = grad;
  ctx.fill();
  // Speed lines radiating from the middle.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 90);
    ctx.lineTo(cx + Math.cos(a) * 200, cy + Math.sin(a) * 150);
    ctx.stroke();
  }
  let size = 150;
  ctx.font = `italic 900 ${size}px ${FONT}`;
  while (ctx.measureText(text).width > w * 0.7 && size > 40) {
    size -= 6;
    ctx.font = `italic 900 ${size}px ${FONT}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(cx, cy + 6);
  ctx.rotate(-0.08);
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = '#1d1840';
  ctx.strokeText(text, 0, 0);
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = look.stroke;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = look.text;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

/** A comic-burst sign `size` units wide, facing +Z. Cached per text and look. */
export const burstSign = (text: string, look: BurstLook, size: number): Mesh => {
  const key = `${text}|${look.inner}|${look.outer}`;
  let material = burstMaterials.get(key);
  if (!material) {
    material = new MeshBasicMaterial({ map: drawBurst(text, look), transparent: true, alphaTest: 0.4, side: DoubleSide });
    burstMaterials.set(key, material);
  }
  const mesh = new Mesh(new PlaneGeometry(size, size * 0.75), material);
  mesh.userData['sharedMaterial'] = true;
  return mesh;
};

// ------------------------------------------------------------------ energy

const glowMaterials = new Map<string, MeshBasicMaterial>();

/** An unlit, additive glow in one colour (shared). */
const glow = (color: number, opacity: number): MeshBasicMaterial => {
  const key = `${color}:${opacity}`;
  let material = glowMaterials.get(key);
  if (!material) {
    material = new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false });
    glowMaterials.set(key, material);
  }
  return material;
};

const solidGlow = (color: number): MeshBasicMaterial => {
  const key = `solid:${color}`;
  let material = glowMaterials.get(key);
  if (!material) {
    material = new MeshBasicMaterial({ color, fog: false });
    glowMaterials.set(key, material);
  }
  return material;
};

const orbCore = new IcosahedronGeometry(1, 1);
const orbHalo = new SphereGeometry(1, 16, 12);

/** A FLOATING ENERGY ORB: a bright core in a soft halo, bobbing and turning. */
export const energyOrb = (color: number, radius: number, phase: number): Object3D => {
  const group = new Group();
  const core = new Mesh(orbCore, solidGlow(0xffffff));
  core.scale.setScalar(radius * 0.55);
  const inner = new Mesh(orbHalo, glow(color, 0.75));
  inner.scale.setScalar(radius * 0.8);
  const halo = new Mesh(orbHalo, glow(color, 0.28));
  halo.scale.setScalar(radius * 1.6);
  group.add(core, inner, halo);
  group.userData['sharedGeometry'] = true;
  const baseY = { value: Number.NaN };
  return animate(group, (t) => {
    if (Number.isNaN(baseY.value)) baseY.value = group.position.y;
    group.position.y = baseY.value + Math.sin(t * 1.6 + phase) * radius * 0.35;
    core.rotation.set(t * 1.3, t * 0.9, 0);
    const pulse = 1 + Math.sin(t * 3 + phase) * 0.08;
    halo.scale.setScalar(radius * 1.6 * pulse);
  });
};

/** An AURA RING: a glowing torus that turns and breathes. */
export const auraRing = (color: number, radius: number, tube: number, spin = 0.4): Object3D => {
  const ring = new Mesh(new TorusGeometry(radius, tube, 10, 56), glow(color, 0.75));
  const outer = new Mesh(new TorusGeometry(radius, tube * 2.6, 8, 56), glow(color, 0.22));
  const group = new Group();
  group.add(ring, outer);
  return animate(group, (t) => {
    ring.rotation.z = t * spin;
    outer.rotation.z = -t * spin * 0.5;
    const s = 1 + Math.sin(t * 2.2) * 0.03;
    outer.scale.setScalar(s);
  });
};

let sparkleTexture: Texture | null = null;
const sparkleMaterials = new Map<number, PointsMaterial>();

const sparkleMap = (): Texture => {
  if (!sparkleTexture) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // A four-point twinkle.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(30, 2, 4, 60);
    ctx.fillRect(2, 30, 60, 4);
    sparkleTexture = new CanvasTexture(c);
  }
  return sparkleTexture;
};

/** RISING SPARKLES in a column: particles that drift up and wrap, turning slowly. */
export const sparkles = (color: number, radius: number, height: number, count: number, random: Random): Object3D => {
  const positions = new Float32Array(count * 3);
  const speeds: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = random() * height;
    positions[i * 3 + 2] = Math.sin(a) * r;
    speeds.push(1.5 + random() * 3);
  }
  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);
  let material = sparkleMaterials.get(color);
  if (!material) {
    material = new PointsMaterial({ color, map: sparkleMap(), size: 1.6, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
    sparkleMaterials.set(color, material);
  }
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  let last = Number.NaN;
  return animate(points, (t) => {
    const dt = Number.isNaN(last) ? 0 : Math.min(0.1, t - last);
    last = t;
    for (let i = 0; i < count; i += 1) {
      let y = positions[i * 3 + 1]! + speeds[i]! * dt;
      if (y > height) y -= height;
      positions[i * 3 + 1] = y;
    }
    attribute.needsUpdate = true;
    points.rotation.y = t * 0.3;
  });
};

// ------------------------------------------------------------ landmarks

/** A GIANT LIGHTNING BOLT on a plinth: an energy landmark. */
export const lightningBolt = (b: PartBuilder, x: number, y: number, z: number, yaw: number, s: number, color: number): void => {
  const shape = new Shape();
  shape.moveTo(0.6, 6);
  shape.lineTo(-1.6, 0.6);
  shape.lineTo(0.1, 0.6);
  shape.lineTo(-0.9, -6);
  shape.lineTo(1.8, 1.2);
  shape.lineTo(0.1, 1.2);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 1 });
  geometry.translate(0, 0, -0.45);
  const l = new Local(b, x, y, z, yaw);
  l.add(new CylinderGeometry(2.2 * s, 2.8 * s, 1.6 * s, 10), POP.ink, 'smooth', { y: 0.8 * s });
  l.add(new CylinderGeometry(1.7 * s, 1.7 * s, 0.5 * s, 10), color, 'glow', { y: 1.8 * s });
  l.add(geometry, color, 'glow', { y: 8.5 * s, sx: s, sy: s, sz: s, rz: -0.12 });
};

/** A round pedestal with a glowing rim, for a statue or an orb. */
export const pedestal = (b: PartBuilder, x: number, y: number, z: number, radius: number, height: number, color: number): void => {
  b.add(new CylinderGeometry(radius, radius * 1.12, height, 20), POP.white, 'smooth', { x, y: y + height / 2, z });
  b.add(new CylinderGeometry(radius * 1.02, radius * 1.02, 0.5, 20), color, 'glow', { x, y: y + height - 0.4, z });
  b.add(new CylinderGeometry(radius * 1.2, radius * 1.25, 0.8, 20), POP.ink, 'smooth', { x, y: y + 0.4, z });
};

// --------------------------------------------------------------- statues

/**
 * A GIANT STATUE of one of the twelve evolutions: the playable character
 * itself, scaled up, standing on the terrace in its own aura. The body's
 * geometry is shared with the players, so the stage must never dispose it
 * (`userData.sharedGeometry`).
 */
export const statue = (slot: number, scale: number, yaw: number): Object3D | null => {
  try {
    const body = createCharacterBody(slot);
    const group = new Group();
    group.add(body.model);
    group.scale.setScalar(scale * body.scale);
    group.rotation.y = yaw;
    group.traverse((child) => {
      child.userData['sharedGeometry'] = true;
      child.frustumCulled = false;
    });
    return group;
  } catch {
    // The player model is not loaded yet: the stage simply goes without.
    return null;
  }
};
