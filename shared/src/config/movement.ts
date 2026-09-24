/**
 * Movement tuning, shared by client prediction and the server's simulation so
 * there is exactly one copy. The run SPEED itself is a per-player parameter
 * (`SimParams.moveSpeed`) the server derives from the level and Custom Speed.
 *
 * There is NO sprint key: running for `sprintDelay` seconds breaks into the
 * sprint on its own, ramping to `sprintMultiplier` over `sprintRamp`.
 */
export interface MovementConfig {
  readonly acceleration: number;
  readonly deceleration: number;
  /** Fraction of ground acceleration retained in the air. */
  readonly airControl: number;
  /** Downward acceleration, world units per second squared. */
  readonly gravity: number;
  /** Turn rate toward the movement direction, radians per second. */
  readonly turnSpeed: number;
  /** Largest distance one substep may integrate. */
  readonly maxSubstepDistance: number;
  readonly maxSubsteps: number;
  /** Height the character steps up without jumping. */
  readonly stepHeight: number;
  /** Fastest fall, so a long drop cannot tunnel a floor. */
  readonly terminalVelocity: number;

  /** Seconds of running before the sprint begins. */
  readonly sprintDelay: number;
  /** Seconds the sprint takes to reach full speed. */
  readonly sprintRamp: number;
  readonly sprintMultiplier: number;

  /** Jumps allowed in the air after the first (a double jump = 1). */
  readonly airJumps: number;
  /** A double jump's take-off, as a fraction of the jump. */
  readonly airJumpScale: number;
  /** Seconds after walking off an edge that a ground jump is still allowed. */
  readonly coyoteTime: number;

  /** How near a wall must be to be run on or climbed. */
  readonly wallReach: number;
  /** Longest single wall-run, seconds. */
  readonly wallRunMax: number;
  /** Gravity while wall-running, as a fraction. */
  readonly wallRunGravity: number;
  /** Slowest fall while wall-running. */
  readonly wallRunMinVy: number;
  /** Least horizontal speed that starts a wall-run. */
  readonly wallRunMinSpeed: number;
  /** A wall-jump's push away from the wall. */
  readonly wallJumpPush: number;
  /** Seconds before the same wall can be grabbed again. */
  readonly regrabTime: number;

  /** Climb speed: base + a share of run speed. */
  readonly climbBase: number;
  readonly climbShare: number;
  /** The hop onto the top of a climbed wall. */
  readonly mantleVy: number;
  readonly mantlePush: number;
}

export const MOVEMENT: MovementConfig = {
  acceleration: 120,
  deceleration: 110,
  airControl: 0.6,
  gravity: 70,
  turnSpeed: 12,
  maxSubstepDistance: 0.5,
  maxSubsteps: 60,
  stepHeight: 1.05,
  terminalVelocity: 90,

  sprintDelay: 0.7,
  sprintRamp: 0.35,
  sprintMultiplier: 1.6,

  airJumps: 1,
  airJumpScale: 0.92,
  coyoteTime: 0.12,

  wallReach: 0.4,
  wallRunMax: 2.8,
  wallRunGravity: 0.14,
  wallRunMinVy: -3.5,
  wallRunMinSpeed: 5,
  wallJumpPush: 16,
  regrabTime: 0.35,

  climbBase: 12,
  climbShare: 0.15,
  mantleVy: 13,
  mantlePush: 8,
};

/** The sprint factor after `runTime` seconds of running: 1 until the delay, then ramps to the multiplier. */
export const sprintFactor = (runTime: number): number => {
  const t = (runTime - MOVEMENT.sprintDelay) / MOVEMENT.sprintRamp;
  if (t <= 0) return 1;
  const k = t >= 1 ? 1 : t * t * (3 - 2 * t);
  return 1 + (MOVEMENT.sprintMultiplier - 1) * k;
};

export const isSprinting = (runTime: number): boolean => runTime >= MOVEMENT.sprintDelay;
