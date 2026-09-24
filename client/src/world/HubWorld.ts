import {
  CHARM_SHOP,
  EVOLVE_SHRINE,
  HUB_GATE,
  HUB_GROUND,
  SPAWN,
  TREADMILLS,
  WORLD_SOLIDS,
  characterBySlot,
  formatClock,
  formatWins,
  type Aabb,
  type TreadmillDef,
} from '@anime/shared';
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { createCharacterBody } from '../anime/CharacterModels.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { BURSTS, POP, auraRing, burstSign, energyOrb, sparkles } from './anime/AnimeKit.js';
import { CanvasSign } from './CanvasSign.js';
import {
  JP,
  castle,
  curvedRoof,
  fillBox,
  pagoda,
  paperLantern,
  pine,
  seeded,
  shrine,
  stoneLantern,
  torii,
} from './japan/Kit.js';
import { sign } from './japan/Signs.js';
import { terrace } from './japan/Themes.js';
import { Scoreboard } from './Scoreboard.js';
import { worldTextures } from './WorldTextures.js';

/** Castle-wall bands: stone base, plaster, tiled cap. */
const WALL_STONE_TOP = 22;
const WALL_PLASTER_TOP = 30;

/**
 * THE SPAWN: a Japanese castle town square.
 *
 *   - CENTRE: a stone plaza, the spawn circle, lantern-lined path to the
 *     gatehouse, and the EVOLVE shrine - glowing ring, next evolution on its
 *     pedestal;
 *   - LEFT (+X): the three scoreboards as roofed notice boards, standing well
 *     clear of the wall;
 *   - RIGHT (-X): the treadmills under a training pavilion;
 *   - BACK (-Z): the charm shop stall under a temple roof;
 *   - ALL ROUND: white-and-stone castle walls with tiled caps; beyond them a
 *     pagoda, a castle keep, a shrine and pines; Stage 1's torii through the
 *     gatehouse ahead.
 */
export class HubWorld {
  readonly root = new Group();
  readonly scoreboard = new Scoreboard();

  private readonly signs: CanvasSign[] = [];
  private readonly belts: Texture[] = [];
  private readonly beltMaterials: MeshLambertMaterial[] = [];
  private readonly treadmillSigns = new Map<number, { sign: CanvasSign; locked: boolean | null }>();
  private readonly ring: Mesh;
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly statueRoot = new Group();
  private statue: Object3D | null = null;
  private statueSlot = -1;
  private evolveSign: CanvasSign | null = null;
  private evolveKey = '';
  private shopClock: CanvasSign | null = null;
  private shopClockText = '';
  private time = 0;
  /** The hub's animated anime effects (orbs, rings, sparkles). */
  private readonly animated: Object3D[] = [];

  constructor() {
    const b = new PartBuilder();
    const random = seeded(0xa11e);

    this.ground(b);
    for (const box of WORLD_SOLIDS) {
      if (box.stage !== 0) continue;
      if (box.look === 'cliff') this.castleWall(b, box);
      else if (box.look === 'pedestal') {
        fillBox(b, box, JP.stone, 'stone');
        fillBox(b, { ...box, minY: box.maxY - 0.3, minX: box.minX - 0.3, maxX: box.maxX + 0.3, minZ: box.minZ - 0.3, maxZ: box.maxZ + 0.3 }, JP.gold, 'smooth');
      }
    }
    this.gatehouse(b);
    for (const t of TREADMILLS) this.treadmill(b, t);
    this.pavilion(b);
    this.shop(b);
    this.spawnCircle(b);
    this.courtyard(b, random);
    this.beyondTheWalls(b, random);
    this.animeHub(b, random);

    // The evolution ring.
    this.ringMaterial = new MeshBasicMaterial({ color: 0xc24dff, transparent: true, opacity: 0.8, depthWrite: false });
    this.ring = new Mesh(new RingGeometry(EVOLVE_SHRINE.padRadius - 0.7, EVOLVE_SHRINE.padRadius, 40), this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(EVOLVE_SHRINE.x, 0.06, EVOLVE_SHRINE.z);
    const disc = new Mesh(
      new CylinderGeometry(EVOLVE_SHRINE.padRadius - 0.7, EVOLVE_SHRINE.padRadius - 0.7, 0.08, 40),
      new MeshBasicMaterial({ color: 0x5a1f8a, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    disc.position.set(EVOLVE_SHRINE.x, 0.05, EVOLVE_SHRINE.z);
    this.statueRoot.position.set(EVOLVE_SHRINE.x, 1.6, EVOLVE_SHRINE.statueZ);
    this.root.add(this.ring, disc, this.statueRoot);
    // A small torii behind the statue, and lanterns either side of the ring.
    torii(b, EVOLVE_SHRINE.x, 0, EVOLVE_SHRINE.statueZ + 4, 9, 9, 0xb04dff);
    stoneLantern(b, EVOLVE_SHRINE.x - 6, 0, EVOLVE_SHRINE.z + 2, 1.1);
    stoneLantern(b, EVOLVE_SHRINE.x + 6.5, 0, EVOLVE_SHRINE.z + 2, 1.1);
    const evolveTitle = this.sign(12, 2.8, [{ text: 'EVOLVE', size: 1, fill: '#e7b8ff', stroke: '#3a0a5a', strokeWidth: 0.16 }]);
    evolveTitle.mesh.position.set(EVOLVE_SHRINE.x, 0.08, EVOLVE_SHRINE.z - EVOLVE_SHRINE.padRadius - 1.2);
    evolveTitle.mesh.rotation.x = -Math.PI / 2;
    evolveTitle.mesh.rotation.z = Math.PI;
    const shinka = sign('進化', { bg: '#2a0a3a', fg: '#e7b8ff', border: '#b04dff' }, 3.4);
    shinka.position.set(EVOLVE_SHRINE.x, 7.6, EVOLVE_SHRINE.statueZ + 3.7);
    shinka.rotation.y = Math.PI;
    this.root.add(shinka);

    this.root.add(b.build('hub'));
    this.root.add(this.scoreboard.root);
  }

  private sign(width: number, height: number, lines: ConstructorParameters<typeof CanvasSign>[2]): CanvasSign {
    const s = new CanvasSign(width, height, lines);
    this.root.add(s.mesh);
    this.signs.push(s);
    return s;
  }

  private ground(b: PartBuilder): void {
    const g = HUB_GROUND;
    const floor = (minX: number, maxX: number, minZ: number, maxZ: number, color: number, kind: 'stone' | 'grass'): void =>
      fillBox(b, { minX, maxX, minY: -1.5, maxY: 0, minZ, maxZ }, color, kind);
    // Stone plaza, a darker processional path to the gate, grass strips by the walls.
    floor(-40, 40, g.minZ, 0, 0xe8e2d4, 'stone');
    floor(-40, -8, 0, g.maxZ, 0xe8e2d4, 'stone');
    floor(8, 40, 0, g.maxZ, 0xe8e2d4, 'stone');
    floor(-8, 8, 0, g.maxZ, 0xc8bca6, 'stone');
    floor(g.minX, -40, g.minZ, g.maxZ, 0x8fd46a, 'grass');
    floor(40, g.maxX, g.minZ, g.maxZ, 0x8fd46a, 'grass');
  }

  /** A castle wall over a boundary solid: dressed stone, white plaster, a tiled cap. */
  private castleWall(b: PartBuilder, box: Aabb): void {
    fillBox(b, { ...box, maxY: WALL_STONE_TOP }, 0xc8bff0, 'ishigaki');
    fillBox(b, { ...box, minY: WALL_STONE_TOP, maxY: WALL_PLASTER_TOP }, JP.plaster, 'plaster');
    b.box(box.maxX - box.minX + 2.4, 1.2, box.maxZ - box.minZ + 2.4, JP.roofDark, 'smooth', { x: (box.minX + box.maxX) / 2, y: WALL_PLASTER_TOP + 0.4, z: (box.minZ + box.maxZ) / 2 });
    fillBox(b, { minX: box.minX - 0.6, maxX: box.maxX + 0.6, minY: WALL_PLASTER_TOP + 1, maxY: box.maxY, minZ: box.minZ - 0.6, maxZ: box.maxZ + 0.6 }, JP.roof, 'roof');
    b.box(box.maxX - box.minX, 0.9, box.maxZ - box.minZ, JP.roofDark, 'smooth', { x: (box.minX + box.maxX) / 2, y: box.maxY + 0.45, z: (box.minZ + box.maxZ) / 2 });
  }

  /** The gatehouse over the opening to Stage 1: a roofed yagura bridging the wall. */
  private gatehouse(b: PartBuilder): void {
    const z = HUB_GATE.z;
    const w = HUB_GATE.maxX - HUB_GATE.minX + 10;
    b.box(w, 8, 8, JP.plaster, 'plaster', { x: 0, y: WALL_PLASTER_TOP - 2, z });
    b.box(w + 0.4, 1.4, 8.4, JP.lacquer, 'smooth', { x: 0, y: WALL_PLASTER_TOP - 6.4, z });
    for (let i = -2; i <= 2; i += 1) b.box(1.6, 2.2, 0.3, 0x2a2a2a, 'smooth', { x: i * 4.4, y: WALL_PLASTER_TOP - 1.5, z: z - 4.1 });
    b.add(curvedRoof(w + 6, 14, 6), JP.roofDark, 'roof', { x: 0, y: WALL_PLASTER_TOP + 2, z });
    b.box(w + 3, 0.8, 1, JP.gold, 'smooth', { x: 0, y: WALL_PLASTER_TOP + 7.7, z });
    for (const x of [-9, 9]) paperLantern(b, x, WALL_PLASTER_TOP - 9, z - 4.6, JP.paperWarm, 1.6);
    const name = sign('速度の門', { bg: '#1d1a22', fg: '#f2c14e', border: '#f2c14e' }, 12);
    name.position.set(0, WALL_PLASTER_TOP - 2.2, z - 4.2);
    name.rotation.y = Math.PI;
    this.root.add(name);
  }

  private spawnCircle(b: PartBuilder): void {
    b.add(new CylinderGeometry(6, 6, 0.16, 32), JP.roof, 'smooth', { x: SPAWN.x, y: 0.08, z: SPAWN.z });
    b.add(new CylinderGeometry(5.2, 5.2, 0.2, 32), 0xf6f1e4, 'stone', { x: SPAWN.x, y: 0.1, z: SPAWN.z });
  }

  private treadmill(b: PartBuilder, t: TreadmillDef): void {
    const top = t.top;
    b.box(t.halfX * 2, top - 0.1, t.halfZ * 2, 0x3a3f4a, 'smooth', { x: t.x, y: (top - 0.1) / 2, z: t.z });
    for (const side of [-1, 1]) {
      b.box(t.halfX * 2, 0.3, 0.5, t.color, 'glow', { x: t.x, y: top + 0.05, z: t.z + side * (t.halfZ - 0.25) });
      b.box(0.4, 3.2, 0.4, 0x2a2e38, 'smooth', { x: t.x - t.halfX + 0.4, y: top + 1.6, z: t.z + side * (t.halfZ - 0.6) });
    }
    b.box(0.6, 0.5, t.halfZ * 2 - 0.6, 0x2a2e38, 'smooth', { x: t.x - t.halfX + 0.4, y: top + 3.2, z: t.z });
    b.box(0.25, 1.4, 2.6, t.color, 'glow', { x: t.x - t.halfX + 0.75, y: top + 3.4, z: t.z, rz: 0.3 });

    const texture = worldTextures.belt('#23262e', '#8a93a8').clone();
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(3, 1);
    texture.needsUpdate = true;
    this.belts.push(texture);
    const material = new MeshLambertMaterial({ map: texture });
    this.beltMaterials.push(material);
    const belt = new Mesh(new PlaneGeometry(t.halfX * 2 - 0.4, t.halfZ * 2 - 1.1), material);
    belt.rotation.x = -Math.PI / 2;
    belt.position.set(t.x, top + 0.01, t.z);
    belt.receiveShadow = true;
    this.root.add(belt);
    this.treadmillSigns.set(t.id, { sign: this.treadmillSign(t, false), locked: false });
  }

  private treadmillSign(t: TreadmillDef, locked: boolean): CanvasSign {
    const color = `#${t.color.toString(16).padStart(6, '0')}`;
    const s = this.sign(10, 4, [
      { text: `x${t.multiplier} Speed`, size: 1, fill: color, stroke: '#141824', strokeWidth: 0.16 },
      locked
        ? { text: `${t.rebirthsRequired} Rebirths`, size: 0.75, fill: '#ff5a5a', stroke: '#2a0808', strokeWidth: 0.16 }
        : { text: t.rebirthsRequired > 0 ? `${t.rebirthsRequired} Rebirths` : 'Free!', size: 0.75, fill: '#7dff6a', stroke: '#0a2a0a', strokeWidth: 0.16 },
    ]);
    s.mesh.position.set(t.x + 1, t.top + 6.5, t.z);
    s.mesh.rotation.y = Math.PI / 2;
    return s;
  }

  /** The training pavilion over the treadmills: dark posts, a long temple roof. */
  private pavilion(b: PartBuilder): void {
    const x = -44;
    const posts = [-32, -16, 0, 16, 32];
    for (const z of posts) {
      b.add(new CylinderGeometry(0.45, 0.5, 12, 8), JP.roofDark, 'smooth', { x: -53, y: 6, z });
      b.add(new CylinderGeometry(0.45, 0.5, 12, 8), JP.roofDark, 'smooth', { x: -35, y: 6, z });
    }
    b.box(20, 1, 68, JP.woodDark, 'wood', { x, y: 12.2, z: 0 });
    b.add(curvedRoof(72, 26, 7), JP.roofDark, 'roof', { x, y: 12.7, z: 0, ry: Math.PI / 2 });
    const plaque = sign('修行場', { bg: '#1d1a22', fg: '#ffffff', border: '#e23b2e' }, 9);
    plaque.position.set(-34.4, 10.6, 0);
    plaque.rotation.y = Math.PI / 2;
    this.root.add(plaque);
  }

  private shop(b: PartBuilder): void {
    const z = CHARM_SHOP.counterZ;
    // The counter is the shared solid; the stall around it is scenery.
    b.box(22, 1.7, 4, JP.wood, 'wood', { x: CHARM_SHOP.x, y: 0.85, z });
    b.box(22.6, 0.3, 4.6, JP.woodDark, 'smooth', { x: CHARM_SHOP.x, y: 1.85, z });
    b.box(24, 10, 1, 0xfff6e0, 'shoji', { x: CHARM_SHOP.x, y: 5, z: z - 5 });
    for (const x of [-11.5, 11.5]) {
      b.add(new CylinderGeometry(0.5, 0.55, 9.5, 8), JP.roofDark, 'smooth', { x: CHARM_SHOP.x + x, y: 4.75, z: z + 2.5 });
      b.add(new CylinderGeometry(0.5, 0.55, 9.5, 8), JP.roofDark, 'smooth', { x: CHARM_SHOP.x + x, y: 4.75, z: z - 4.4 });
    }
    for (let i = 0; i < 5; i += 1) b.box(4, 2.2, 0.15, i % 2 ? 0x2a4ad8 : 0xd0302e, 'smooth', { x: CHARM_SHOP.x - 9 + i * 4.5, y: 8.1, z: z + 2.8 });
    b.add(curvedRoof(30, 14, 5), JP.roofDark, 'roof', { x: CHARM_SHOP.x, y: 9.6, z: z - 1 });
    stoneLantern(b, CHARM_SHOP.x - 15, 0, z + 3);
    stoneLantern(b, CHARM_SHOP.x + 15, 0, z + 3);
    for (const x of [-7, 0, 7]) paperLantern(b, CHARM_SHOP.x + x, 8.2, z + 3.4, JP.paperWarm, 0.9);
    // The pad: stand here to shop.
    b.box(CHARM_SHOP.padHalfX * 2, 0.12, CHARM_SHOP.padHalfZ * 2, 0xffd23a, 'stone', { x: CHARM_SHOP.x, y: 0.06, z: CHARM_SHOP.padZ });

    const title = this.sign(16, 3.2, [{ text: 'CHARM SHOP', size: 1, fill: '#ffe14a', stroke: '#5a1a00', strokeWidth: 0.16 }]);
    title.mesh.position.set(CHARM_SHOP.x, 16.4, z + 1.6);
    const omamori = sign('お守り', { bg: '#fff6ea', fg: '#c0201a', border: '#c0201a' }, 6);
    omamori.position.set(CHARM_SHOP.x, 11.6, z + 3.4);
    this.root.add(omamori);
  }

  /**
   * THE ANIME HUB, in one controlled palette (white stone, blue roofs, gold):
   * gold energy orbs crowning the wall corners, a comic burst over the gate,
   * and the evolve shrine wrapped in its own purple aura with sparkles rising.
   */
  private animeHub(b: PartBuilder, random: () => number): void {
    const add = (object: Object3D): void => {
      this.root.add(object);
      if (object.userData['tick']) this.animated.push(object);
    };
    const g = HUB_GROUND;
    // ONE accent for the whole spawn: gold orbs on the corners and over the gate.
    for (const [x, z] of [[g.minX, g.minZ], [g.maxX, g.minZ], [g.minX, g.maxZ], [g.maxX, g.maxZ]] as const) {
      b.add(new CylinderGeometry(1.4, 2, 6, 10), POP.white, 'smooth', { x, y: 37, z });
      b.add(new CylinderGeometry(1.5, 1.5, 0.8, 10), JP.gold, 'glow', { x, y: 38.5, z });
      const orb = energyOrb(JP.gold, 2.6, x * 0.1 + z * 0.01);
      orb.position.set(x, 44, z);
      add(orb);
    }
    const go = burstSign('GO GO GO!', BURSTS[1]!, 18);
    go.position.set(0, 45, HUB_GROUND.maxZ - 2);
    go.rotation.y = Math.PI;
    add(go);
    // The evolve shrine keeps its own purple: the one place it appears.
    const ring = auraRing(POP.violet, EVOLVE_SHRINE.padRadius + 0.6, 0.18, 0.9);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(EVOLVE_SHRINE.x, 0.4, EVOLVE_SHRINE.z);
    add(ring);
    const glitter = sparkles(POP.purple, 3.5, 14, 36, random);
    glitter.position.set(EVOLVE_SHRINE.x, 0, EVOLVE_SHRINE.statueZ);
    add(glitter);
  }

  /** Lanterns and banners inside the walls (no trees: the spawn stays open), clear of every station. */
  private courtyard(b: PartBuilder, random: () => number): void {
    for (const z of [6, 16, 26]) {
      stoneLantern(b, -10.5, 0, z);
      stoneLantern(b, 10.5, 0, z);
    }
    // Banner poles along the left, between (not in front of) the boards.
    for (const z of [-42, -18, 6, 29]) {
      b.box(0.25, 9, 0.25, JP.woodDark, 'smooth', { x: 56, y: 4.5, z });
      const words = ['速度', '進化', '転生', '勝利'];
      const flag = sign(words[Math.floor(random() * words.length)]!, { bg: '#fff6ea', fg: '#c0201a', border: '#c0201a', vertical: true }, 5.5);
      flag.position.set(55.8, 5.6, z);
      flag.rotation.y = -Math.PI / 2;
      this.root.add(flag);
    }
  }

  /** What rises over the walls: a pagoda, a castle keep, a shrine and pines on terraces. */
  private beyondTheWalls(b: PartBuilder, random: () => number): void {
    const look = { top: 'grass' as const, topColor: 0x8fd46a, trim: JP.woodDark, trimKind: 'wood' as const, rock: JP.rock };
    terrace(b, { minX: -120, maxX: 120, minY: -8, maxY: 6, minZ: -150, maxZ: -66 }, look);
    terrace(b, { minX: 70, maxX: 150, minY: -8, maxY: 6, minZ: -66, maxZ: 30 }, look);
    terrace(b, { minX: -150, maxX: -70, minY: -8, maxY: 6, minZ: -66, maxZ: 30 }, look);
    pagoda(b, -30, 6, -90, 5, 1.4);
    castle(b, 40, 6, -110, 1.3);
    shrine(b, -70, 6, -86, 0, 1.3);
    for (let i = 0; i < 6; i += 1) pine(b, -90 + i * 36, 6, -76 - random() * 8, 1.8, random);
    for (let i = 0; i < 6; i += 1) pine(b, 80 + random() * 50, 6, -64 + random() * 90, 1.5, random);
    for (let i = 0; i < 6; i += 1) pine(b, -80 - random() * 50, 6, -64 + random() * 90, 1.5, random);
  }

  /** The next evolution on the pedestal, or nothing once fully evolved. */
  setNextEvolution(slot: number, wins: number): void {
    const def = characterBySlot(slot);
    if (slot !== this.statueSlot) {
      this.statueSlot = slot;
      this.statue?.removeFromParent();
      this.statue = null;
      if (def) {
        const body = createCharacterBody(def.slot);
        const rig = new PlayerRig(body.model, body.model);
        rig.resetToBindPose();
        body.model.scale.multiplyScalar(1.8);
        this.statue = body.model;
        this.statueRoot.add(body.model);
      }
    }
    const affordable = def ? wins >= def.cost : false;
    const key = def ? `${def.slot}:${affordable}` : 'max';
    if (key === this.evolveKey) return;
    this.evolveKey = key;
    if (this.evolveSign) {
      this.evolveSign.dispose();
      this.signs.splice(this.signs.indexOf(this.evolveSign), 1);
    }
    this.evolveSign = this.sign(
      14,
      5,
      def
        ? [
            { text: `Next: ${def.name}`, size: 1, fill: '#ffffff', stroke: '#3a0a5a', strokeWidth: 0.16 },
            { text: `${formatWins(def.cost)} Wins  -  x${def.multiplier} Speed`, size: 0.7, fill: affordable ? '#7dff6a' : '#ffd23a', stroke: '#1a1030', strokeWidth: 0.16 },
          ]
        : [{ text: 'FULLY EVOLVED!', size: 1, fill: '#ffe14a', stroke: '#3a0a5a', strokeWidth: 0.16 }],
    );
    this.evolveSign.mesh.position.set(EVOLVE_SHRINE.x, 12.4, EVOLVE_SHRINE.statueZ);
    this.evolveSign.mesh.rotation.y = Math.PI;
  }

  /** Re-label the treadmills this player cannot use yet. */
  setRebirths(rebirths: number): void {
    for (const t of TREADMILLS) {
      const entry = this.treadmillSigns.get(t.id);
      const locked = rebirths < t.rebirthsRequired;
      if (!entry || entry.locked === locked) continue;
      entry.sign.dispose();
      this.signs.splice(this.signs.indexOf(entry.sign), 1);
      this.treadmillSigns.set(t.id, { sign: this.treadmillSign(t, locked), locked });
    }
  }

  setShopClock(secondsLeft: number): void {
    const text = `Restocks in ${formatClock(secondsLeft)}`;
    if (text === this.shopClockText) return;
    this.shopClockText = text;
    if (this.shopClock) {
      this.shopClock.dispose();
      this.signs.splice(this.signs.indexOf(this.shopClock), 1);
    }
    this.shopClock = this.sign(12, 1.8, [{ text, size: 1, fill: '#ffffff', stroke: '#1a1a24', strokeWidth: 0.16 }]);
    this.shopClock.mesh.position.set(CHARM_SHOP.x, 14, CHARM_SHOP.counterZ + 1.7);
  }

  update(delta: number): void {
    this.time += delta;
    for (const object of this.animated) (object.userData['tick'] as (t: number) => void)(this.time);
    for (const belt of this.belts) belt.offset.x = (belt.offset.x + delta * 1.4) % 1;
    this.ringMaterial.opacity = 0.6 + Math.sin(this.time * 3) * 0.25;
    this.ring.scale.setScalar(1 + Math.sin(this.time * 3) * 0.03);
    this.statueRoot.rotation.y = this.time * 0.6;
    this.statueRoot.position.y = 1.6 + Math.sin(this.time * 1.6) * 0.25;
  }

  dispose(): void {
    for (const s of this.signs) s.dispose();
    for (const belt of this.belts) belt.dispose();
    for (const material of this.beltMaterials) material.dispose();
    this.ringMaterial.dispose();
    this.scoreboard.dispose();
    this.root.removeFromParent();
  }
}
