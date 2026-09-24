import type { Aabb } from '../types/math.js';
import { seededRandom } from './charms.js';
import { runSpeedForLevel } from './leveling.js';

/**
 * THE MAP, as pure data. Collision (shared, both sides) and the client's
 * visuals both read it, so what a player stands on and what they see cannot
 * drift apart.
 *
 * Axes: +Z runs from the spawn toward the course. The spawn faces +Z, so the
 * camera's LEFT is world +X and its RIGHT is world -X:
 *
 *   - SCOREBOARDS on the LEFT (+X): Wins, Total Playtime, Total Rebirths;
 *   - TREADMILLS on the RIGHT (-X);
 *   - the CHARM SHOP at the BACK (-Z);
 *   - the spawn and the EVOLUTION shrine in the CENTRE;
 *   - the course straight ahead (+Z), through the Stage 1 torii.
 *
 * The hub is the only place with ground. Everywhere past it the floor is
 * LAVA: a player who falls off the course burns and returns to their
 * checkpoint.
 */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Facing, radians: 0 faces +Z. */
  readonly yaw: number;
}

export const SPAWN: Placement = { x: 0, y: 0, z: -6, yaw: 0 };

/** The walkable ground of the hub (y = 0). Nothing else has a floor. */
export const HUB_GROUND = { minX: -60, maxX: 60, minZ: -56, maxZ: 36 } as const;
/** The front wall's opening onto Stage 1. */
export const HUB_GATE = { minX: -12, maxX: 12, z: 34 } as const;
export const HUB_WALL_HEIGHT = 34;

/** Below this, anywhere off the hub ground, a player is in the lava. */
export const KILL_Y = -2.5;
/** Where the lava surface is drawn. */
export const LAVA_Y = -5;

/** What a surface does to a player touching it. */
export type SurfaceKind = 'solid' | 'wallrun' | 'climb';

/** How the client draws a box. Gameplay never reads it. */
export type BoxLook =
  | 'cliff'
  | 'platform'
  | 'start'
  | 'goal'
  | 'pillar'
  | 'bridge'
  | 'wall'
  | 'climb'
  | 'torii'
  | 'treadmill'
  | 'counter'
  | 'post'
  | 'pedestal'
  | 'end';

export interface CourseBox extends Aabb {
  readonly kind: SurfaceKind;
  readonly look: BoxLook;
  /** 0 = hub. */
  readonly stage: number;
}

/** Wall-run buildings: how thick (outward from the running face) and how tall. */
export const WALLRUN_DEPTH = 7;
export const WALLRUN_TOP = 20;

const box = (
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  look: BoxLook,
  stage = 0,
  kind: SurfaceKind = 'solid',
): CourseBox => ({ minX, maxX, minY, maxY, minZ, maxZ, look, stage, kind });

// ------------------------------------------------------------------- hub

/** The evolution shrine: a glowing ring pad and the next evolution's statue behind it. */
export const EVOLVE_SHRINE = { x: -18, z: 6, padRadius: 4.2, statueZ: 12.5 } as const;

/** The charm shop at the back of the spawn. */
export const CHARM_SHOP = { x: 0, counterZ: -46, padZ: -39, padHalfX: 7, padHalfZ: 4 } as const;

/** The three boards on the LEFT (+X), facing the spawn, each on its own two legs. */
export const BOARDS = {
  /** Eight units clear of the side wall (x = 60), facing the spawn. */
  x: 50,
  /** Spaced along the left side, clear of the back wall (z = -56) and the front wall (z = 32). */
  z: [-30, -6, 18] as readonly number[],
  width: 17,
  height: 15,
  bottom: 3,
} as const;

export interface TreadmillDef {
  readonly id: number;
  readonly name: string;
  readonly multiplier: number;
  readonly rebirthsRequired: number;
  /** Centre of the belt. The belt runs along X; a runner faces -X. */
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly top: number;
  readonly color: number;
}

/** THE TREADMILLS on the RIGHT (-X). Standing on one runs automatically. */
export const TREADMILLS: readonly TreadmillDef[] = [
  { id: 0, name: 'Treadmill', multiplier: 1, rebirthsRequired: 0, x: -44, z: -24, halfX: 6, halfZ: 3.2, top: 0.9, color: 0x3fa9ff },
  { id: 1, name: 'Treadmill', multiplier: 1, rebirthsRequired: 0, x: -44, z: -8, halfX: 6, halfZ: 3.2, top: 0.9, color: 0x3fa9ff },
  { id: 2, name: 'Pro Treadmill', multiplier: 1.5, rebirthsRequired: 2, x: -44, z: 8, halfX: 6, halfZ: 3.2, top: 0.9, color: 0xffb21f },
  { id: 3, name: 'Elite Treadmill', multiplier: 3, rebirthsRequired: 3, x: -44, z: 24, halfX: 6, halfZ: 3.2, top: 0.9, color: 0xc24dff },
];

/** Strides a second a treadmill runs its runner at. */
export const TREADMILL_STRIDES_PER_SECOND = 4;

/** The treadmill a foot position stands on, or undefined. */
export const treadmillAt = (x: number, y: number, z: number): TreadmillDef | undefined => {
  for (const t of TREADMILLS) {
    if (Math.abs(x - t.x) <= t.halfX && Math.abs(z - t.z) <= t.halfZ && Math.abs(y - t.top) < 0.3) return t;
  }
  return undefined;
};

export const canUseTreadmill = (t: TreadmillDef, rebirths: number): boolean => rebirths >= t.rebirthsRequired;

const hubSolids = (): CourseBox[] => {
  const g = HUB_GROUND;
  const h = HUB_WALL_HEIGHT;
  const out: CourseBox[] = [
    // The cliffs around the hub. The front one is split by the Stage 1 gate.
    box(g.maxX, g.maxX + 8, -10, h, g.minZ - 8, g.maxZ + 4, 'cliff'),
    box(g.minX - 8, g.minX, -10, h, g.minZ - 8, g.maxZ + 4, 'cliff'),
    box(g.minX, g.maxX, -10, h, g.minZ - 8, g.minZ, 'cliff'),
    box(g.minX, HUB_GATE.minX, -10, h, 32, g.maxZ + 4, 'cliff'),
    box(HUB_GATE.maxX, g.maxX, -10, h, 32, g.maxZ + 4, 'cliff'),
    // The charm shop's counter.
    box(CHARM_SHOP.x - 11, CHARM_SHOP.x + 11, 0, 1.7, CHARM_SHOP.counterZ - 2, CHARM_SHOP.counterZ + 2, 'counter'),
    // The evolution statue's pedestal.
    box(EVOLVE_SHRINE.x - 2.2, EVOLVE_SHRINE.x + 2.2, 0, 1.6, EVOLVE_SHRINE.statueZ - 2.2, EVOLVE_SHRINE.statueZ + 2.2, 'pedestal'),
  ];
  for (const t of TREADMILLS) {
    out.push(box(t.x - t.halfX, t.x + t.halfX, 0, t.top, t.z - t.halfZ, t.z + t.halfZ, 'treadmill'));
  }
  for (const z of BOARDS.z) {
    for (const dz of [-BOARDS.width / 2 + 1, BOARDS.width / 2 - 1]) {
      out.push(box(BOARDS.x - 0.8, BOARDS.x + 0.8, 0, BOARDS.bottom + BOARDS.height, z + dz - 0.8, z + dz + 0.8, 'post'));
    }
  }
  return out;
};

// ---------------------------------------------------------------- stages

export const STAGE_COUNT = 30;

/** Level each stage is built for (and recommends). Stage 3 recommends 15. */
export const recommendedLevel = (stage: number): number => {
  const n = Math.max(1, Math.floor(stage));
  if (n === 1) return 1;
  if (n === 2) return 6;
  return 15 * (n - 2);
};

const EARLY_REWARDS = [1, 2, 5, 12, 25, 50, 100, 180, 320, 550] as const;

/** Wins a stage's claim pad pays (before the x2 Wins pass). */
export const stageReward = (stage: number): number => {
  const n = Math.max(1, Math.floor(stage));
  if (n <= EARLY_REWARDS.length) return EARLY_REWARDS[n - 1]!;
  return Math.round(550 * 1.62 ** (n - EARLY_REWARDS.length));
};

export interface PadDef {
  readonly x: number;
  readonly z: number;
  readonly half: number;
}

/** A sign or marking the client draws on the course. */
export interface CourseSign {
  readonly kind: 'wallrun' | 'climb';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** For 'wallrun': the sign faces the runner coming up the course; `side` is the wall it points at (+1 = +X). */
  readonly side: number;
  /** For 'climb': the width and height of the climbable face. */
  readonly width: number;
  readonly height: number;
}

export interface StageLayout {
  readonly index: number;
  readonly recommended: number;
  readonly reward: number;
  /** Physical run speed the stage is built around. */
  readonly designSpeed: number;
  /** Start platform: the checkpoint. */
  readonly startMinZ: number;
  readonly startMaxZ: number;
  /** Goal platform, with the claim pad. */
  readonly goalMinZ: number;
  readonly goalMaxZ: number;
  readonly goalHalfX: number;
  /** Where a checkpoint respawn / stage teleport places a player. */
  readonly spawn: Placement;
  /** "+N Wins / Return": pays and sends home. On the runner's RIGHT (-X). */
  readonly claimPad: PadDef;
  readonly signs: readonly CourseSign[];
  /** Shortest time a real run of the stage can take, seconds. */
  readonly minRunSeconds: number;
}

const START_LENGTH = 22;
/** Island half-widths: WIDE, so there is room to run, line up a jump and pick a wall. */
export const START_HALF_X = 22;
const GOAL_LENGTH = 30;
export const GOAL_HALF_X = 26;
export const COURSE_START_Z = HUB_GROUND.maxZ;

interface Cursor {
  /** Far edge of the last platform, and its top. */
  z: number;
  y: number;
  x: number;
}

/**
 * Build one stage's sections after `cursor`, sized by the speed it is designed
 * for. Every gap is a fraction of what that speed can jump (a double jump
 * covers ~1.11 x speed), so a player at the recommended level clears it
 * without sprinting, and one far below it needs the sprint or cannot.
 */
const buildStage = (n: number, cursor: Cursor, out: CourseBox[], signs: CourseSign[]): void => {
  const v = runSpeedForLevel(recommendedLevel(n));
  const random = seededRandom(n * 7919 + 17);
  const pick = (min: number, max: number): number => min + (max - min) * random();
  const d = Math.min(1, (n - 1) / 6);
  const doubleReach = 1.11 * v;
  const gapOf = (scale = 1): number => Math.max(4, doubleReach * (0.3 + 0.32 * d) * scale);
  // Long enough to land on at the design speed, even arriving at a sprint.
  const platLength = (): number => Math.min(60, Math.max(10, 0.45 * v + 6));
  const halfWidth = (): number => Math.max(14, 20 - d * 4 + v * 0.03);

  const platform = (length: number, half: number, x: number, top: number, look: BoxLook = 'platform'): void => {
    out.push(box(x - half, x + half, top - 3, top, cursor.z, cursor.z + length, look, n));
    cursor.z += length;
    cursor.y = top;
    cursor.x = x;
  };

  const hops = (): void => {
    const count = 3 + (random() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      cursor.z += gapOf(pick(0.85, 1.05));
      const x = Math.max(-8, Math.min(8, cursor.x + pick(-5, 5)));
      const top = i === count - 1 ? 0 : Math.round(pick(-0.5, 2.5) * 2) / 2;
      platform(platLength() * pick(0.7, 1), halfWidth() * pick(0.8, 1.1), x, Math.max(0, top));
    }
  };

  const pillars = (): void => {
    const count = 5;
    const small = Math.max(6, 8 - d * 1.5 + v * 0.02);
    let x = 0;
    for (let i = 0; i < count; i += 1) {
      cursor.z += gapOf(0.55) * pick(0.85, 1.05);
      x = i % 2 === 0 ? pick(4, 10) : -pick(4, 10);
      const top = i === count - 1 ? 0 : Math.round(pick(0, 3) * 2) / 2;
      out.push(box(x - small, x + small, top - 14, top, cursor.z, cursor.z + small * 2, 'pillar', n));
      cursor.z += small * 2;
      cursor.y = top;
      cursor.x = x;
    }
    cursor.z += gapOf(0.6);
    platform(platLength(), halfWidth(), 0, 0);
  };

  const wallRun = (): void => {
    // A lava channel between two wall-run BUILDINGS. Jump in, run a wall, jump out.
    // A centred take-off pad first, so either wall is a jump away. The running
    // faces are at +/-half; the buildings are thick (outward only) and taller
    // than any jump reaches, so their tops never become a walkway.
    cursor.z += gapOf(0.45);
    const half = 11;
    platform(Math.max(10, platLength() * 0.6), half, 0, 0);
    const length = Math.min(150, Math.max(30, 1.35 * v));
    const lip = WALLRUN_DEPTH;
    const z0 = cursor.z + 2;
    const z1 = z0 + length;
    out.push(box(-half - lip, -half, -8, WALLRUN_TOP, z0, z1, 'wall', n, 'wallrun'));
    out.push(box(half, half + lip, -8, WALLRUN_TOP, z0, z1, 'wall', n, 'wallrun'));
    signs.push({ kind: 'wallrun', x: half - 0.1, y: 6.5, z: z0 + 5, side: 1, width: 0, height: 0 });
    signs.push({ kind: 'wallrun', x: -half + 0.1, y: 6.5, z: z0 + 5, side: -1, width: 0, height: 0 });
    cursor.z = z1 + 2;
    cursor.x = 0;
    platform(platLength(), halfWidth() + 1, 0, 0);
  };

  const climb = (): void => {
    // A wall marked with arrows: climb it, cross the top, drop to the next platform.
    cursor.z += Math.max(3, gapOf(0.35));
    const height = Math.round(Math.min(24, Math.max(10, 8 + 0.14 * v)));
    const half = halfWidth() + 1;
    const depth = Math.max(8, platLength() * 0.6);
    out.push(box(-half, half, -10, height, cursor.z, cursor.z + depth, 'climb', n, 'climb'));
    signs.push({ kind: 'climb', x: 0, y: height / 2, z: cursor.z - 0.02, side: 0, width: half * 2 - 1.5, height: height - 1 });
    cursor.z += depth;
    cursor.y = height;
    cursor.x = 0;
    cursor.z += gapOf(0.7);
    platform(platLength(), halfWidth(), 0, 0);
  };

  const bridge = (): void => {
    // A narrow zig-zag over the lava, with short hops between the legs.
    const legs = 3;
    const width = Math.max(5, 6.5 - d * 1.5 + v * 0.01);
    for (let i = 0; i < legs; i += 1) {
      cursor.z += i === 0 ? gapOf(0.5) : gapOf(0.3);
      const x = (i % 2 === 0 ? 1 : -1) * pick(3, 8);
      const length = Math.min(70, Math.max(14, 0.55 * v));
      out.push(box(x - width, x + width, -2, 0, cursor.z, cursor.z + length, 'bridge', n));
      cursor.z += length;
      cursor.x = x;
      cursor.y = 0;
    }
    cursor.z += gapOf(0.5);
    platform(platLength(), halfWidth(), 0, 0);
  };

  const sections: (() => void)[] = [hops, wallRun, pillars, climb, bridge];
  // Stage 1 teaches one thing at a time; later stages shuffle and add sections.
  const order: (() => void)[] = [];
  if (n === 1) order.push(hops, wallRun, climb, pillars);
  else {
    const pool = sections.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    order.push(...pool);
    const extra = Math.min(3, Math.floor(n / 6));
    for (let i = 0; i < extra; i += 1) order.push(sections[Math.floor(random() * sections.length)]!);
  }
  for (const section of order) section();
};

interface Course {
  readonly solids: readonly CourseBox[];
  readonly stages: readonly StageLayout[];
}

const buildCourse = (): Course => {
  const solids: CourseBox[] = hubSolids();
  const stages: StageLayout[] = [];
  let z: number = COURSE_START_Z;
  for (let n = 1; n <= STAGE_COUNT; n += 1) {
    const signs: CourseSign[] = [];
    const startMinZ = z;
    const startMaxZ = z + START_LENGTH;
    solids.push(box(-START_HALF_X, START_HALF_X, -3, 0, startMinZ, startMaxZ, 'start', n));
    // The torii over the start: two pillars and nothing to trip on.
    for (const side of [-1, 1]) {
      solids.push(box(side * (START_HALF_X - 1.6) - 0.7, side * (START_HALF_X - 1.6) + 0.7, 0, 13, startMinZ + 1, startMinZ + 2.4, 'torii', n));
    }
    const cursor: Cursor = { z: startMaxZ, y: 0, x: 0 };
    buildStage(n, cursor, solids, signs);
    cursor.z += Math.max(4, 1.11 * runSpeedForLevel(recommendedLevel(n)) * 0.3);
    const goalMinZ = cursor.z;
    const goalMaxZ = goalMinZ + GOAL_LENGTH;
    solids.push(box(-GOAL_HALF_X, GOAL_HALF_X, -3, 0, goalMinZ, goalMaxZ, 'goal', n));
    if (n === STAGE_COUNT) {
      solids.push(box(-GOAL_HALF_X, GOAL_HALF_X, 0, 18, goalMaxZ, goalMaxZ + 3, 'end', n));
    }
    const mid = (goalMinZ + goalMaxZ) / 2;
    const v = runSpeedForLevel(recommendedLevel(n));
    const length = goalMaxZ - startMinZ;
    stages.push({
      index: n,
      recommended: recommendedLevel(n),
      reward: stageReward(n),
      designSpeed: v,
      startMinZ,
      startMaxZ,
      goalMinZ,
      goalMaxZ,
      goalHalfX: GOAL_HALF_X,
      spawn: { x: 0, y: 0, z: startMinZ + 8, yaw: 0 },
      claimPad: { x: -15, z: mid, half: 5 },
      signs,
      // Faster than anyone can legally run it, even sprinting at the top speed.
      minRunSeconds: Math.max(2, length / (MAX_SPRINT_SPEED * 1.25)),
    });
    z = goalMaxZ;
  }
  return { solids, stages };
};

/** The top physical speed anyone reaches (max run speed x sprint), for sanity checks. */
export const MAX_SPRINT_SPEED = 110 * 1.6;

const COURSE = buildCourse();

/** Every solid in the world: hub and course. */
export const WORLD_SOLIDS: readonly CourseBox[] = COURSE.solids;
export const STAGES: readonly StageLayout[] = COURSE.stages;
export const COURSE_END_Z = STAGES[STAGES.length - 1]!.goalMaxZ;

export const stageByIndex = (stage: number): StageLayout | undefined => STAGES[Math.floor(stage) - 1];

/** Which stage a z lies in (start of its start platform to the end of its goal), 0 in the hub. */
export const stageAt = (z: number): number => {
  if (z < COURSE_START_Z) return 0;
  let low = 0;
  let high = STAGES.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (STAGES[mid]!.startMinZ <= z) low = mid;
    else high = mid - 1;
  }
  return STAGES[low]!.index;
};

export const onHubGround = (x: number, z: number): boolean =>
  x >= HUB_GROUND.minX && x <= HUB_GROUND.maxX && z >= HUB_GROUND.minZ && z <= HUB_GROUND.maxZ;

/** Standing on a pad, by the player's feet. */
export const onPad = (pad: PadDef, x: number, y: number, z: number, top = 0): boolean =>
  Math.abs(x - pad.x) <= pad.half && Math.abs(z - pad.z) <= pad.half && Math.abs(y - top) < 0.6;

/** The world's outer bounds, for clamping. */
export const WORLD_BOUNDS: Aabb = {
  minX: -80,
  maxX: 80,
  minY: -50,
  maxY: 400,
  minZ: HUB_GROUND.minZ - 10,
  maxZ: COURSE_END_Z + 20,
};

// ------------------------------------------------------------- teleports

export type TeleportId = 'spawn' | 'treadmills' | 'shop' | 'boards';

export const TELEPORTS: Readonly<Record<TeleportId, Placement>> = {
  spawn: SPAWN,
  treadmills: { x: -30, y: 0, z: 0, yaw: -Math.PI / 2 },
  shop: { x: 0, y: 0, z: -32, yaw: Math.PI },
  boards: { x: 36, y: 0, z: 0, yaw: Math.PI / 2 },
};

/** Where a stage teleport or checkpoint respawn lands. */
export const stageEntry = (stage: number): Placement => stageByIndex(stage)?.spawn ?? SPAWN;
