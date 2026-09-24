import type { PoseDefinition } from '../animation/PoseBuffer.js';

const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Procedural animation tuning. Every number the animator uses lives here.
 * All rotations are in CHARACTER space (see `PlayerRig`): +X pitch swings a
 * limb BACKWARD, so a raised arm is a large negative X.
 */

/** The run cycle: ONE cycle at three depths - walk, run, and the anime sprint. */
export const LOCOMOTION = {
  minFrequency: 0.7,
  maxFrequency: 5.4,
  strideDistance: 5.2,
  /** Stride lengthens with speed, so cadence stays readable at 100 units/s. */
  strideGrowth: 0.045,
  idleSpeed: 0.6,
  walkSpeed: 4,
  runSpeed: 14,
  sprintSpeed: 30,

  hipSwing: { walk: deg(22), run: deg(44), sprint: deg(62) },
  kneeBend: { walk: deg(30), run: deg(62), sprint: deg(86) },
  armSwing: { walk: deg(18), run: deg(40), sprint: deg(8) },
  elbowBend: { walk: deg(14), run: deg(48), sprint: deg(6) },
  torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(3) },
  torsoLean: { walk: deg(3), run: deg(12), sprint: deg(34) },
  headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(2) },
  torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(2) },
  bob: { walk: 0.05, run: 0.11, sprint: 0.1 },
  bankAngle: deg(9),
  bankRate: 8,
} as const;

/**
 * THE ANIME SPRINT: arms swept straight back behind the body, the torso
 * thrown forward, head up. Blended over the arms by the sprint weight.
 */
export const SPRINT_ARMS = {
  ArmL1: { x: deg(78), z: deg(18) },
  ArmR1: { x: deg(78), z: deg(-18) },
  ArmL2: { x: deg(4) },
  ArmR2: { x: deg(4) },
} satisfies PoseDefinition;

/** The idle: relaxed and ready, breathing. */
export const IDLE = {
  breathFrequency: 0.35,
  breathAmount: deg(1.8),
  breathBob: 0.012,
  basePose: {
    ArmL1: { x: deg(-4), z: deg(8) },
    ArmL2: { x: deg(12) },
    ArmR1: { x: deg(-4), z: deg(-8) },
    ArmR2: { x: deg(12) },
    LegL1: { x: deg(-3) },
    LegR1: { x: deg(3) },
  } satisfies PoseDefinition,
} as const;

/** In the air: knees tucked on the way up, legs reaching on the way down. */
export const AIRBORNE = {
  rise: {
    LegL1: { x: deg(-38) },
    LegR1: { x: deg(8) },
    LegL2: { x: deg(62) },
    LegR2: { x: deg(40) },
    ArmL1: { x: deg(-40), z: deg(34) },
    ArmR1: { x: deg(-30), z: deg(-34) },
    ArmL2: { x: deg(30) },
    ArmR2: { x: deg(30) },
    Spine1: { x: deg(6) },
  } satisfies PoseDefinition,
  fall: {
    LegL1: { x: deg(-14) },
    LegR1: { x: deg(10) },
    LegL2: { x: deg(22) },
    LegR2: { x: deg(18) },
    ArmL1: { x: deg(-70), z: deg(40) },
    ArmR1: { x: deg(-60), z: deg(-40) },
    ArmL2: { x: deg(20) },
    ArmR2: { x: deg(20) },
    Spine1: { x: deg(-4) },
  } satisfies PoseDefinition,
  /** Tucked tight for the double-jump flip. */
  tuck: {
    LegL1: { x: deg(-100) },
    LegR1: { x: deg(-100) },
    LegL2: { x: deg(120) },
    LegR2: { x: deg(120) },
    ArmL1: { x: deg(-60), z: deg(10) },
    ArmR1: { x: deg(-60), z: deg(-10) },
    ArmL2: { x: deg(90) },
    ArmR2: { x: deg(90) },
    Spine1: { x: deg(24) },
  } satisfies PoseDefinition,
  velocityReference: 20,
  /** Seconds a double-jump flip takes. */
  flipSeconds: 0.42,
} as const;

/** The landing crouch. Short: a runner lands and keeps going. */
export const LANDING = {
  duration: 0.16,
  pose: {
    LegL1: { x: deg(-34) },
    LegR1: { x: deg(-34) },
    LegL2: { x: deg(58) },
    LegR2: { x: deg(58) },
    ArmL1: { x: deg(-18), z: deg(20) },
    ArmR1: { x: deg(-18), z: deg(-20) },
    Spine1: { x: deg(14) },
  } satisfies PoseDefinition,
  bobY: -0.32,
} as const;

/** Running along a wall: the run cycle, the body tipped away from the wall. */
export const WALLRUN = {
  roll: deg(28),
  /** The wall-side arm reaches out toward it. */
  reach: deg(40),
} as const;

/** Climbing: hand over hand, knees pumping. */
export const CLIMB = {
  frequency: 2.6,
  armBase: deg(-150),
  armSwing: deg(26),
  legBase: deg(-40),
  legSwing: deg(34),
  knee: deg(70),
  lean: deg(10),
} as const;

export const TRANSITIONS = {
  toLocomotion: 0.14,
  toAirborne: 0.12,
  toLanding: 0.06,
  toWall: 0.1,
} as const;
