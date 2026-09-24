import {
  GOAL_HALF_X,
  LAVA_Y,
  START_HALF_X,
  STAGES,
  WORLD_SOLIDS,
  formatWins,
  type CourseBox,
  type StageLayout,
} from '@anime/shared';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { PartBuilder } from '../render/PartBuilder.js';
import { BURSTS, POP, auraRing, burstSign, pedestal, sparkles, statue } from './anime/AnimeKit.js';
import { CanvasSign } from './CanvasSign.js';
import { boundary } from './japan/Boundary.js';
import { JP, curvedRoof, fillBox, island, seeded, torii, type IslandStyle, type Random } from './japan/Kit.js';
import { sign } from './japan/Signs.js';
import { dressStage, stageRange, themeOfStage, type Theme } from './japan/Themes.js';
import { worldTextures } from './WorldTextures.js';

/** Build a stage when the runner is within this distance before its start... */
const BUILD_AHEAD = 900;
/** ...or this far past its end. */
const BUILD_BEHIND = 300;
/** Beyond this from a stage, its meshes and sign canvases are released. */
const DROP_DISTANCE = 2400;
/** The statue island floats this far to one side of the course's centre line. */
const STATUE_X = 36;

interface BuiltStage {
  readonly group: Group;
  readonly signs: CanvasSign[];
  /** Everything with a `userData.tick`: rings, sparkles, crystals. */
  readonly animated: Object3D[];
}

interface LavaLook {
  readonly texture: Texture;
  readonly material: MeshBasicMaterial;
}

/** Whether a mesh's geometry belongs to something shared (a statue's body, the orb spheres). */
const sharedGeometry = (object: Object3D, root: Object3D): boolean => {
  for (let o: Object3D | null = object; o && o !== root; o = o.parent) if (o.userData['sharedGeometry']) return true;
  return false;
};

/** `#rrggbb` for a colour number (sign canvases take CSS colours). */
const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * THE COURSE, drawn from the same `WORLD_SOLIDS` the simulation collides
 * against, one stage at a time as the runner nears it, in its ANIME WORLD
 * (`japan/Themes.ts`) - the world of the character that stage belongs to:
 *
 *   - islands alternating between the world's two island colours;
 *   - climbing walls in its material, marked with glowing UP arrows;
 *   - WALL-RUN BUILDINGS in its architecture (a ship's hull, a city block, a
 *     rampart, a rock face, a temple, a dojo, a void crystal) with a bright
 *     running face, forward chevrons, buttresses and end towers;
 *   - its GATE over every start with the world's name, a portal ring in its
 *     accent and the stage sign above;
 *   - ONE giant statue of the world's character beside the stage;
 *   - the banks' few large set-pieces and the side boundary;
 *   - lava laid over exactly the stage's own stretch.
 */
export class CourseWorld {
  readonly root = new Group();

  private readonly built = new Map<number, BuiltStage>();
  private readonly byStage = new Map<number, CourseBox[]>();
  private readonly lavas = new Map<number, LavaLook>();
  private readonly padGlow: MeshBasicMaterial;
  private time = 0;

  constructor() {
    for (const box of WORLD_SOLIDS) {
      if (box.stage <= 0) continue;
      let list = this.byStage.get(box.stage);
      if (!list) {
        list = [];
        this.byStage.set(box.stage, list);
      }
      list.push(box);
    }
    this.padGlow = new MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.55, depthWrite: false });
  }

  private lavaOf(theme: Theme): LavaLook {
    let look = this.lavas.get(theme.id);
    if (!look) {
      const [base, hot, crust] = theme.lava;
      const texture = worldTextures.lava(base, hot, crust).clone();
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.needsUpdate = true;
      look = { texture, material: new MeshBasicMaterial({ map: texture, fog: true }) };
      this.lavas.set(theme.id, look);
    }
    return look;
  }

  /** Build what the runner is about to see; animate what is built. */
  update(delta: number, z: number): void {
    this.time += delta;
    for (const look of this.lavas.values()) look.texture.offset.set(this.time * 0.02, this.time * 0.035);
    const pulse = 0.45 + Math.sin(this.time * 4) * 0.15;
    this.padGlow.opacity = pulse;
    // At most one stage per frame, nearest first.
    for (const stage of STAGES) {
      if (this.built.has(stage.index)) continue;
      if (z < stage.startMinZ - BUILD_AHEAD || z > stage.goalMaxZ + BUILD_BEHIND) continue;
      this.built.set(stage.index, this.build(stage));
      break;
    }
    for (const [index, stage] of this.built) {
      const def = STAGES[index - 1]!;
      stage.group.visible = z > def.startMinZ - BUILD_AHEAD * 1.2 && z < def.goalMaxZ + BUILD_BEHIND * 2;
      if (stage.group.visible) for (const object of stage.animated) (object.userData['tick'] as (t: number) => void)(this.time);
      // Far behind or far ahead (a teleport): free it. It is rebuilt if the runner comes back.
      if (z < def.startMinZ - DROP_DISTANCE || z > def.goalMaxZ + DROP_DISTANCE) {
        this.release(stage);
        this.built.delete(index);
      }
    }
  }

  /** Free a built stage's own geometry and sign canvases. Shared materials (and shared bodies) stay. */
  private release(stage: BuiltStage): void {
    for (const s of stage.signs) s.dispose();
    stage.group.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh || (child as { isPoints?: boolean }).isPoints) {
        if (!sharedGeometry(child, stage.group)) mesh.geometry.dispose();
      }
    });
    stage.group.removeFromParent();
  }

  private build(stage: StageLayout): BuiltStage {
    const theme = themeOfStage(stage.index);
    const group = new Group();
    group.name = `stage-${stage.index}`;
    const signs: CanvasSign[] = [];
    const animated: Object3D[] = [];
    const b = new PartBuilder();
    const random = seeded(stage.index * 131 + 7);
    const boxes = this.byStage.get(stage.index) ?? [];
    const add = (object: Object3D): Object3D => {
      group.add(object);
      if (object.userData['tick']) animated.push(object);
      return object;
    };

    let hop = 0;
    for (const box of boxes) {
      switch (box.look) {
        case 'start':
        case 'goal':
          island(b, box, theme.start);
          this.edgePosts(b, box, box.look === 'start' ? START_HALF_X : GOAL_HALF_X, theme.accent);
          break;
        case 'platform':
        case 'pillar': {
          const topColor = theme.islandColors[hop % theme.islandColors.length]!;
          hop += 1;
          island(b, box, { ...theme.island, topColor });
          break;
        }
        case 'bridge':
          island(b, box, theme.bridge);
          this.bridgeRails(b, box, theme.bridge);
          break;
        case 'climb':
          this.climbWall(b, box, theme);
          break;
        case 'wall':
          this.wallRunBuilding(b, box, theme, add);
          break;
        case 'end':
          fillBox(b, { ...box, maxY: box.maxY - 3 }, theme.wallRun.body, 'plaster');
          b.box(box.maxX - box.minX + 2, 3, box.maxZ - box.minZ + 3, theme.wallRun.roof, 'smooth', { x: 0, y: box.maxY - 1.5, z: (box.minZ + box.maxZ) / 2 });
          break;
        case 'torii':
          // Drawn once per start, as the world's whole gateway, below.
          break;
        default:
          fillBox(b, box, JP.stone, 'stone');
      }
    }

    this.gateway(b, group, stage, theme, add, signs);

    for (const s of stage.signs) {
      if (s.kind === 'wallrun') this.wallRunSign(group, b, signs, s.x, s.y, s.z, s.side);
      else this.climbArrows(b, signs, group, s.x, s.y, s.z, s.width, s.height);
    }

    this.pads(group, b, signs, stage);
    dressStage({ b, group, random, add }, stage, theme);
    boundary(b, stage, theme, add);
    this.statue(b, stage, theme, random, add);

    // The lava under exactly this stage's own stretch: neighbouring stages never overlap it.
    const [from, to] = stageRange(stage);
    const length = to - from;
    const lavaGeometry = new PlaneGeometry(190, length);
    const uv = lavaGeometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 7.6, uv.getY(i) * (length / 25));
    const lava = new Mesh(lavaGeometry, this.lavaOf(theme).material);
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(0, LAVA_Y, (from + to) / 2);
    group.add(lava);

    group.add(b.build(`stage-${stage.index}-parts`));
    this.root.add(group);
    return { group, signs, animated };
  }

  /**
   * THE GATEWAY over a start, in the world's own architecture - a rope-bound
   * timber arch, a steel frame, a torii, twin towers or rock pillars - with
   * the world's name on it, a portal ring in its accent, and the stage sign.
   */
  private gateway(b: PartBuilder, group: Group, stage: StageLayout, theme: Theme, add: (o: Object3D) => Object3D, signs: CanvasSign[]): void {
    const span = (START_HALF_X - 1.6) * 2;
    const gateZ = stage.startMinZ + 1.7;
    const { style, color, beam } = theme.gate;
    const half = span / 2;
    let plaqueY = 19.6;
    switch (style) {
      case 'torii':
        torii(b, 0, 0, gateZ, span, 16, color);
        plaqueY = 15.2;
        break;
      case 'arch':
        for (const side of [-1, 1]) {
          b.add(new CylinderGeometry(1.3, 1.5, 19, 10), color, 'wood', { x: side * half, y: 9.5, z: gateZ });
          for (const y of [4, 10, 16]) b.add(new CylinderGeometry(1.55, 1.55, 0.8, 10), 0x5a3a24, 'smooth', { x: side * half, y, z: gateZ });
        }
        b.box(span + 5, 2.2, 2.4, color, 'wood', { y: 19.6, x: 0, z: gateZ });
        b.box(10, 5, 0.3, beam, 'smooth', { y: 15.8, x: 0, z: gateZ - 0.2 });
        plaqueY = 19.6;
        break;
      case 'frame':
        for (const side of [-1, 1]) {
          b.box(2.6, 19, 2.6, color, 'smooth', { x: side * half, y: 9.5, z: gateZ });
          b.box(0.5, 17, 0.4, beam, 'glow', { x: side * (half - 1.5), y: 9.5, z: gateZ - 1.1 });
        }
        b.box(span + 5, 2.6, 2.6, color, 'smooth', { y: 20.3, x: 0, z: gateZ });
        b.box(span + 4, 0.5, 0.4, beam, 'glow', { y: 19.1, x: 0, z: gateZ - 1.4 });
        plaqueY = 20.3;
        break;
      case 'towers':
        for (const side of [-1, 1]) {
          b.box(7, 24, 7, color, 'ishigaki', { x: side * (half + 1), y: 12, z: gateZ });
          for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]] as const) b.box(1.8, 2.4, 1.8, color, 'smooth', { x: side * (half + 1) + dx, y: 25.2, z: gateZ + dz });
        }
        b.box(span - 5, 3, 3, color, 'ishigaki', { y: 19, x: 0, z: gateZ });
        b.box(8, 7, 0.3, beam, 'smooth', { y: 13.6, x: 0, z: gateZ - 1.4 });
        plaqueY = 19;
        break;
      case 'rock':
        for (const side of [-1, 1]) b.add(new CylinderGeometry(2.4, 3.8, 20, 7), color, 'rock', { x: side * half, y: 10, z: gateZ });
        b.box(span + 6, 3.4, 5, color, 'rock', { y: 20.5, x: 0, z: gateZ });
        b.box(span + 6.6, 1, 5.6, beam, 'smooth', { y: 22.7, x: 0, z: gateZ });
        plaqueY = 20.5;
        break;
    }
    const plaque = sign(theme.name, { bg: '#241d4a', fg: '#ffffff', border: css(beam) }, 14);
    plaque.position.set(0, plaqueY, gateZ - (style === 'torii' ? 1.1 : style === 'rock' ? 2.7 : 1.6));
    plaque.rotation.y = Math.PI;
    add(plaque);

    const ring = auraRing(theme.accent, START_HALF_X + 1, 0.4, 0.2);
    ring.position.set(0, 9, gateZ + 3.5);
    add(ring);

    const title = new CanvasSign(30, 12, [
      { text: `Stage ${stage.index}`, size: 1.25, fill: '#ffffff', stroke: '#2a4ad8', strokeWidth: 0.16 },
      { text: `Level Recommended: ${stage.recommended}`, size: 0.62, fill: '#3b8bff', stroke: '#ffffff', strokeWidth: 0.18 },
    ]);
    title.mesh.position.set(0, 28.5, gateZ);
    title.mesh.rotation.y = Math.PI;
    group.add(title.mesh);
    signs.push(title);
  }

  /** Slim posts in the world's accent beside (never on) a start or goal platform. */
  private edgePosts(b: PartBuilder, box: CourseBox, half: number, accent: number): void {
    for (const side of [-1, 1]) {
      for (const z of [box.minZ + 4, box.maxZ - 4]) {
        const x = side * (half + 0.9);
        b.add(new CylinderGeometry(0.28, 0.34, 11, 8), POP.ink, 'smooth', { x, y: box.maxY - 3, z });
        b.add(new SphereGeometry(0.75, 12, 8), accent, 'glow', { x, y: box.maxY + 3, z });
      }
    }
  }

  /** Beams along a bridge's sides, below the walking surface. */
  private bridgeRails(b: PartBuilder, box: CourseBox, look: IslandStyle): void {
    const d = box.maxZ - box.minZ;
    const cz = (box.minZ + box.maxZ) / 2;
    for (const x of [box.minX - 0.3, box.maxX + 0.3]) {
      b.box(0.6, 0.8, d, look.trim, 'smooth', { x, y: box.maxY - 0.5, z: cz });
      for (let z = box.minZ + 2; z < box.maxZ; z += 6) b.box(0.5, 2.4, 0.5, look.trim, 'smooth', { x, y: box.maxY - 1.8, z });
    }
  }

  /** A climbing wall in the world's material, capped, with a walkable top. */
  private climbWall(b: PartBuilder, box: CourseBox, theme: Theme): void {
    const w = box.maxX - box.minX;
    const d = box.maxZ - box.minZ;
    const cz = (box.minZ + box.maxZ) / 2;
    fillBox(b, { ...box, minY: Math.min(box.minY, LAVA_Y - 1), maxY: box.maxY - 1.4 }, theme.climb.color, theme.climb.kind);
    b.box(w + 0.8, 0.8, d + 0.8, theme.climb.cap, 'smooth', { x: 0, y: box.maxY - 1.0, z: cz });
    b.box(w, 0.7, d, theme.islandColors[0]!, theme.island.top, { x: 0, y: box.maxY - 0.35, z: cz });
  }

  /**
   * A WALL-RUN BUILDING over one wall-run collision box, in the world's
   * architecture: a thick body down into the lava, a bright RUNNING FACE
   * (exactly the collision face) with glowing forward chevrons, buttresses on
   * the outside, end towers and the world's roofline. Nothing but the running
   * face is near the runner: every addition goes outward or upward.
   */
  private wallRunBuilding(b: PartBuilder, box: CourseBox, theme: Theme, add: (o: Object3D) => Object3D): void {
    const look = theme.wallRun;
    const out = box.minX >= 0 ? 1 : -1;
    const face = out > 0 ? box.minX : box.maxX;
    const outerX = out > 0 ? box.maxX : box.minX;
    const depth = box.maxX - box.minX;
    const xc = (box.minX + box.maxX) / 2;
    const z0 = box.minZ;
    const z1 = box.maxZ;
    const length = z1 - z0;
    const cz = (z0 + z1) / 2;
    const top = box.maxY;
    const bottom = LAVA_Y - 1;
    const bodyKind = look.style === 'ship' || look.style === 'dojo' ? 'wood' : look.style === 'fort' ? 'ishigaki' : look.style === 'rock' ? 'rock' : look.style === 'city' ? 'windows' : 'plaster';

    // The body and its foundation.
    b.box(depth, top - 2 - bottom, length, look.body, bodyKind, { x: xc, y: (top - 2 + bottom) / 2, z: cz });
    b.box(depth + 0.6, 4, length + 0.6, look.trim, 'smooth', { x: xc, y: bottom + 2, z: cz });
    b.box(depth + 0.8, 2, length + 0.8, look.trim, 'smooth', { x: xc, y: top - 1, z: cz });

    // The running face: a bright track edged in white, chevrons pointing the way.
    b.box(0.1, 15, length - 1, look.face, 'stone', { x: face - out * 0.06, y: 8, z: cz });
    for (const y of [0.3, 15.7]) b.box(0.16, 0.5, length - 1, POP.white, 'glow', { x: face - out * 0.09, y, z: cz });
    for (let z = z0 + 10; z < z1 - 6; z += 9) {
      for (const y of [5, 11]) {
        for (const tilt of [-1, 1]) b.box(0.14, 0.55, 2.8, POP.white, 'glow', { x: face - out * 0.2, y: y + tilt * 0.75, z: z + 0.2, rx: tilt * 0.62 });
      }
    }

    // Buttresses on the outer face.
    for (let z = z0 + 14; z < z1 - 10; z += 18) b.box(2.4, top + 2 - bottom, 2.4, look.trim, 'smooth', { x: outerX + out * 1.1, y: (top + 2 + bottom) / 2, z });

    this.wallRunRoof(b, theme, xc, depth, z0, z1, top, face, out);

    // End towers, set just OUTSIDE the body's faces so no two surfaces share a plane.
    const towerW = depth + 0.3;
    const towerX = xc + out * 0.15 + out * 0.3;
    for (const [zFrom, zTo] of [[z0 - 0.5, z0 + 6], [z1 - 6, z1 + 0.5]] as const) {
      const towerTop = top + 12;
      const tz = (zFrom + zTo) / 2;
      b.box(towerW, towerTop - bottom, zTo - zFrom, look.body, bodyKind, { x: towerX, y: (towerTop + bottom) / 2, z: tz });
      b.box(towerW + 1, 1.2, zTo - zFrom + 1, look.trim, 'smooth', { x: towerX, y: towerTop + 0.6, z: tz });
      b.add(new ConeGeometry(depth * 0.62, 6, 4), look.roof, 'smooth', { x: towerX, y: towerTop + 4.2, z: tz, ry: Math.PI / 4 });
    }
    // A comic burst on the entry tower, telling the runner what this is.
    const burst = burstSign('WALL RUN!!', BURSTS[theme.burst % BURSTS.length]!, 11);
    burst.position.set(xc, top + 6, z0 - 1);
    burst.rotation.y = Math.PI;
    add(burst);
  }

  /** The roofline of a wall-run building, in its world's architecture. */
  private wallRunRoof(b: PartBuilder, theme: Theme, xc: number, depth: number, z0: number, z1: number, top: number, face: number, out: number): void {
    const look = theme.wallRun;
    const length = z1 - z0;
    const cz = (z0 + z1) / 2;
    const inner = face + out * 0.8;
    const outer = xc + out * (depth / 2 - 0.8);
    switch (look.style) {
      case 'temple':
      case 'dojo':
        b.add(curvedRoof(length - 10, depth + 3, look.style === 'temple' ? 4.5 : 3.5), look.roof, 'roof', { x: xc, y: top, z: cz, ry: Math.PI / 2 });
        break;
      case 'city':
        b.box(depth - 1, 1.2, length - 14, look.roof, 'smooth', { x: xc, y: top + 0.6, z: cz });
        for (let z = z0 + 16; z < z1 - 14; z += 26) b.box(depth * 0.45, 3, 5, theme.boundary.cap, 'smooth', { x: xc + out * 0.8, y: top + 2.7, z });
        break;
      case 'ship':
        // Deck rails, two masts with sails across the hull, a pennant.
        for (const x of [inner, outer]) b.box(0.3, 1.2, length - 12, look.trim, 'smooth', { x, y: top + 0.6, z: cz });
        for (const t of [0.32, 0.68]) {
          const mz = z0 + length * t;
          b.add(new CylinderGeometry(0.4, 0.5, 20, 8), look.trim, 'smooth', { x: xc, y: top + 10, z: mz });
          b.box(depth - 1, 9, 0.4, 0xfff6e4, 'smooth', { x: xc, y: top + 12, z: mz + 0.6 });
          b.box(depth + 0.6, 0.5, 0.5, look.trim, 'smooth', { x: xc, y: top + 16.8, z: mz });
        }
        b.box(0.2, 1.6, 3.2, look.roof, 'smooth', { x: xc, y: top + 21, z: z0 + length * 0.32 + 1.7 });
        break;
      case 'fort':
        b.box(depth, 1, length - 12, look.trim, 'smooth', { x: xc, y: top + 0.5, z: cz });
        for (let z = z0 + 8; z < z1 - 7; z += 5) {
          for (const x of [inner, outer]) b.box(1.4, 2.2, 2.4, look.body, 'ishigaki', { x, y: top + 2.1, z });
        }
        break;
      case 'rock':
        b.box(depth + 0.4, 1, length - 12, look.roof, 'grass', { x: xc, y: top + 0.5, z: cz });
        for (let z = z0 + 12; z < z1 - 10; z += 17) b.add(new IcosahedronGeometry(2.6, 0), look.body, 'rock', { x: xc + out * 0.6, y: top + 2.4, z, sy: 0.7 });
        break;
      case 'crystal':
        b.box(depth, 0.6, length - 12, look.roof, 'glow', { x: xc, y: top + 0.3, z: cz });
        for (let z = z0 + 14; z < z1 - 12; z += 22) b.add(new OctahedronGeometry(2.2, 0), look.roof, 'glow', { x: xc, y: top + 5, z, sy: 1.6 });
        break;
    }
  }

  /** "Wall run!" with two white arrows pointing at the wall, facing the runner. */
  private wallRunSign(group: Group, b: PartBuilder, signs: CanvasSign[], x: number, y: number, z: number, side: number): void {
    const s = new CanvasSign(8.5, 2.4, [{ text: 'Wall run!', size: 1, fill: '#ffffff', stroke: '#1a2440', strokeWidth: 0.16 }]);
    s.mesh.position.set(x - side * 5.2, y, z);
    s.mesh.rotation.y = Math.PI;
    group.add(s.mesh);
    signs.push(s);
    for (const dy of [0.9, -0.9]) {
      b.add(new ConeGeometry(0.7, 1.4, 3), 0xffffff, 'glow', { x: x - side * 1.2, y: y + dy, z, rz: -side * (Math.PI / 2) });
    }
  }

  /** Rows of glowing UP chevrons across a climbable face, and a "Climb!" sign. */
  private climbArrows(b: PartBuilder, signs: CanvasSign[], group: Group, x: number, y: number, z: number, width: number, height: number): void {
    const bottom = y - height / 2 + 1;
    for (let cx = x - width / 2 + 2; cx <= x + width / 2 - 2; cx += 4) {
      for (let cy = bottom + 1.5; cy < bottom + height - 1.5; cy += 3) {
        for (const side of [-1, 1]) {
          b.box(1.5, 0.42, 0.2, 0xfff27a, 'glow', { x: cx + side * 0.5, y: cy, z: z - 0.14, rz: side * -0.7 });
        }
      }
    }
    const s = new CanvasSign(7, 2.2, [{ text: 'Climb!', size: 1, fill: '#ffe14a', stroke: '#3a2400', strokeWidth: 0.16 }]);
    s.mesh.position.set(x, bottom + height + 1.8, z - 0.3);
    s.mesh.rotation.y = Math.PI;
    group.add(s.mesh);
    signs.push(s);
  }

  /**
   * THE WORLD'S CHARACTER, a giant statue on its own floating island beside
   * the stage (alternating sides), in an aura of the world's accent: the
   * player sees the evolution this world belongs to. Its top is higher than
   * any jump from the course reaches, so it never passes for a platform.
   */
  private statue(b: PartBuilder, stage: StageLayout, theme: Theme, random: Random, add: (o: Object3D) => Object3D): void {
    const side = stage.index % 2 === 0 ? -1 : 1;
    const x = side * STATUE_X;
    const z = stage.startMinZ + (stage.goalMaxZ - stage.startMinZ) * 0.4;
    const top = 10;
    island(b, { minX: x - 6.5, maxX: x + 6.5, minY: top - 6, maxY: top, minZ: z - 6.5, maxZ: z + 6.5 }, { ...theme.island, topColor: theme.islandColors[1] ?? POP.white, trim: theme.accent, trimKind: 'glow' });
    pedestal(b, x, top, z, 4.6, 2.4, theme.accent);
    const body = statue(theme.character, 5.2, Math.atan2(-side, -0.6));
    if (body) {
      body.position.set(x, top + 2.4, z);
      add(body);
    }
    const ring = auraRing(theme.accent, 6.2, 0.35, 0.8);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, top + 2.8, z);
    add(ring);
    const glitter = sparkles(theme.accent, 5.5, 22, 28, random);
    glitter.position.set(x, top + 2, z);
    add(glitter);
  }

  /** The goal's claim pad (flush with the ground) and its floating label. */
  private pads(group: Group, b: PartBuilder, signs: CanvasSign[], stage: StageLayout): void {
    const claim = stage.claimPad;
    b.box(claim.half * 2, 0.1, claim.half * 2, JP.gold, 'stone', { x: claim.x, y: 0.05, z: claim.z });
    const glowA = new Mesh(new BoxGeometry(claim.half * 2 + 0.3, 0.06, claim.half * 2 + 0.3), this.padGlow);
    glowA.position.set(claim.x, 0.13, claim.z);
    group.add(glowA);

    const reward = new CanvasSign(9, 4.4, [
      { text: `+${formatWins(stage.reward)} Wins`, size: 1.1, fill: '#ffe14a', stroke: '#3a2400', strokeWidth: 0.16 },
      { text: 'Return', size: 0.7, fill: '#ffffff', stroke: '#1a2440', strokeWidth: 0.16 },
    ]);
    reward.mesh.position.set(claim.x, 4, claim.z);
    reward.mesh.rotation.y = Math.PI;
    group.add(reward.mesh);
    signs.push(reward);
    if (stage.index === STAGES.length) {
      const end = new CanvasSign(26, 6, [{ text: 'YOU BEAT THE COURSE!', size: 1, fill: '#ffe14a', stroke: '#5a1a00', strokeWidth: 0.14 }]);
      end.mesh.position.set(0, 12, stage.goalMaxZ - 0.2);
      end.mesh.rotation.y = Math.PI;
      group.add(end.mesh);
      signs.push(end);
    }
  }

  dispose(): void {
    for (const stage of this.built.values()) this.release(stage);
    for (const look of this.lavas.values()) {
      look.material.dispose();
      look.texture.dispose();
    }
    this.padGlow.dispose();
    this.root.removeFromParent();
  }
}
