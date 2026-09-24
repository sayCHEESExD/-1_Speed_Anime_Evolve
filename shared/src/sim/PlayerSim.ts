import { SPAWN } from '../config/map.js';
import { MOVEMENT, sprintFactor } from '../config/movement.js';
import { rotateTowards } from '../types/math.js';
import { createWallContact, type WallContact, type WorldCollision } from './WorldCollision.js';

/**
 * THE movement simulation, shared by the server and by client prediction.
 *
 * The server runs it to own the result and the client runs the identical
 * function to predict ahead of the network, so the two can only disagree
 * through inputs, never through maths. Every field of `PlayerMotion` is
 * replicated, so a client replay starts from exactly what the server had.
 *
 *   - RUN: accelerate toward the stick at `moveSpeed`. After `sprintDelay`
 *     seconds of unbroken running the SPRINT ramps in on its own.
 *   - JUMP: a ground jump (with a little coyote time), then ONE air jump.
 *   - WALL-RUN: airborne against a 'wallrun' surface, moving, holding a
 *     direction: run along it with most of gravity switched off; jump to
 *     kick off (and keep the air jump).
 *   - CLIMB: pushing into a 'climb' surface: go straight up it; at the top,
 *     hop onto it. Jump to push off.
 *   - LAVA: off the hub ground below the lava line, the player is dead until
 *     the server places them back at the spawn (there are no checkpoints).
 */
export const MODE_NORMAL = 0;
export const MODE_WALLRUN = 1;
export const MODE_CLIMB = 2;

export interface PlayerMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  /** Edge-detect for the jump control, so a hold is one jump. */
  jumpLatched: boolean;
  /** Monotonic count of jumps of every kind, so a remote can mirror them. */
  jumpCount: number;
  /** Monotonic count of AIR jumps: the double-jump flip. */
  flipCount: number;
  /** Seconds of unbroken running: drives the sprint. */
  runTime: number;
  airJumpsUsed: number;
  /** Seconds left in which a ground jump is still allowed after leaving an edge. */
  coyote: number;
  mode: number;
  /** The wall being run or climbed: its outward normal. */
  wallNx: number;
  wallNz: number;
  /** Seconds in the current wall-run / climb. */
  modeTime: number;
  /** Seconds before the last wall can be grabbed again, and which wall. */
  regrab: number;
  regrabNx: number;
  regrabNz: number;
  /** In the lava, waiting for the server to place them. */
  dead: boolean;
}

/** One frame of player intent. Carries no position - only what was pressed. */
export interface MovementInput {
  moveX: number;
  moveZ: number;
  jump: boolean;
  cameraYaw: number;
}

/** Server-owned tuning the step reads but never changes. */
export interface SimParams {
  /** Run speed before sprint, world units per second. */
  moveSpeed: number;
  jumpVelocity: number;
}

export interface SimEvents {
  jumped: boolean;
  airJumped: boolean;
  wallJumped: boolean;
  landed: boolean;
  mantled: boolean;
  died: boolean;
}

/** Largest single step the simulation will take, in seconds. */
export const MAX_SIM_DELTA = 0.1;

export const createMotion = (): PlayerMotion => ({
  x: SPAWN.x,
  y: SPAWN.y,
  z: SPAWN.z,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: SPAWN.yaw,
  grounded: true,
  jumpLatched: false,
  jumpCount: 0,
  flipCount: 0,
  runTime: 0,
  airJumpsUsed: 0,
  coyote: 0,
  mode: MODE_NORMAL,
  wallNx: 0,
  wallNz: 0,
  modeTime: 0,
  regrab: 0,
  regrabNx: 0,
  regrabNz: 0,
  dead: false,
});

export const createSimEvents = (): SimEvents => ({
  jumped: false,
  airJumped: false,
  wallJumped: false,
  landed: false,
  mantled: false,
  died: false,
});

export const createSimParams = (): SimParams => ({ moveSpeed: 16, jumpVelocity: 24 });

export const copyMotion = (from: PlayerMotion, to: PlayerMotion): void => {
  Object.assign(to, from);
};

/** Reset to a placement. */
export const resetMotion = (motion: PlayerMotion, x: number, y: number, z: number, yaw: number): void => {
  motion.x = x;
  motion.y = y;
  motion.z = z;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = yaw;
  motion.grounded = true;
  motion.jumpLatched = false;
  motion.runTime = 0;
  motion.airJumpsUsed = 0;
  motion.coyote = 0;
  motion.mode = MODE_NORMAL;
  motion.wallNx = 0;
  motion.wallNz = 0;
  motion.modeTime = 0;
  motion.regrab = 0;
  motion.regrabNx = 0;
  motion.regrabNz = 0;
  motion.dead = false;
};

export const horizontalSpeed = (motion: PlayerMotion): number => Math.hypot(motion.vx, motion.vz);

/** Sanitise one input before it is simulated. Applied on the SERVER. */
export const sanitiseInput = (input: Partial<MovementInput> | undefined): MovementInput => {
  const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  let moveX = finite(input?.moveX);
  let moveZ = finite(input?.moveZ);
  const magnitude = Math.hypot(moveX, moveZ);
  if (magnitude > 1) {
    moveX /= magnitude;
    moveZ /= magnitude;
  }
  return { moveX, moveZ, jump: input?.jump === true, cameraYaw: finite(input?.cameraYaw) };
};

const AXIS = { value: 0, y: 0, hit: false };
const CONTACT: WallContact = createWallContact();

/** Accelerate the horizontal velocity toward a target at `rate`. */
const approach = (motion: PlayerMotion, targetX: number, targetZ: number, rate: number, dt: number): void => {
  const dvx = targetX - motion.vx;
  const dvz = targetZ - motion.vz;
  const dv = Math.hypot(dvx, dvz);
  const maxChange = rate * dt;
  if (dv <= maxChange) {
    motion.vx = targetX;
    motion.vz = targetZ;
  } else {
    motion.vx += (dvx / dv) * maxChange;
    motion.vz += (dvz / dv) * maxChange;
  }
};

const endMode = (motion: PlayerMotion): void => {
  if (motion.mode !== MODE_NORMAL) {
    motion.regrab = MOVEMENT.regrabTime;
    motion.regrabNx = motion.wallNx;
    motion.regrabNz = motion.wallNz;
  }
  motion.mode = MODE_NORMAL;
  motion.modeTime = 0;
};

/**
 * Advance one player by one step.
 *
 * @param motion    mutated in place
 * @param input     already sanitised intent
 * @param params    server-owned tuning
 * @param delta     seconds; clamped internally to [0, MAX_SIM_DELTA]
 * @param collision the world the player moves through
 * @param events    mutated in place with the edges this step produced
 */
export const stepPlayer = (
  motion: PlayerMotion,
  input: MovementInput,
  params: SimParams,
  delta: number,
  collision: WorldCollision,
  events: SimEvents,
): void => {
  events.jumped = false;
  events.airJumped = false;
  events.wallJumped = false;
  events.landed = false;
  events.mantled = false;
  events.died = false;
  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_SIM_DELTA) : 0;
  if (dt === 0 || motion.dead) {
    motion.jumpLatched = input.jump;
    return;
  }

  const pressed = input.jump && !motion.jumpLatched;
  motion.jumpLatched = input.jump;

  // Camera-relative stick: forward is where the camera looks, right is -X at yaw 0.
  const yaw = input.cameraYaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const wishX = rx * input.moveX + fx * input.moveZ;
  const wishZ = rz * input.moveX + fz * input.moveZ;
  const wishLength = Math.hypot(wishX, wishZ);

  const base = Math.max(0, params.moveSpeed);
  const speed = base * sprintFactor(motion.runTime);
  motion.regrab = Math.max(0, motion.regrab - dt);
  motion.coyote = Math.max(0, motion.coyote - dt);

  // ------------------------------------------------------------ modes
  if (motion.mode === MODE_WALLRUN) {
    motion.modeTime += dt;
    const touching = collision.touching(motion.x, motion.y, motion.z, 'wallrun', MOVEMENT.wallReach, CONTACT);
    const sameWall = touching && CONTACT.nx === motion.wallNx && CONTACT.nz === motion.wallNz;
    const away = wishX * motion.wallNx + wishZ * motion.wallNz;
    if (pressed) {
      // WALL JUMP: up and away, keeping the run along the wall; the air jump comes back.
      const along = motion.vx * -motion.wallNz + motion.vz * motion.wallNx;
      const tx = -motion.wallNz * Math.sign(along || 1);
      const tz = motion.wallNx * Math.sign(along || 1);
      const keep = Math.abs(along);
      motion.vx = tx * keep + motion.wallNx * MOVEMENT.wallJumpPush;
      motion.vz = tz * keep + motion.wallNz * MOVEMENT.wallJumpPush;
      motion.vy = params.jumpVelocity;
      motion.airJumpsUsed = 0;
      motion.jumpCount += 1;
      events.jumped = true;
      events.wallJumped = true;
      endMode(motion);
    } else if (!sameWall || motion.grounded || motion.modeTime > MOVEMENT.wallRunMax || wishLength < 0.2 || away > 0.6) {
      endMode(motion);
    }
  } else if (motion.mode === MODE_CLIMB) {
    motion.modeTime += dt;
    const touching = collision.touching(motion.x, motion.y, motion.z, 'climb', MOVEMENT.wallReach, CONTACT);
    const into = -(wishX * motion.wallNx + wishZ * motion.wallNz);
    if (pressed) {
      motion.vx = motion.wallNx * MOVEMENT.wallJumpPush * 0.8;
      motion.vz = motion.wallNz * MOVEMENT.wallJumpPush * 0.8;
      motion.vy = params.jumpVelocity * 0.85;
      motion.jumpCount += 1;
      events.jumped = true;
      events.wallJumped = true;
      endMode(motion);
    } else if (!touching || CONTACT.top - motion.y < 1.6) {
      // Over the top: hop onto it.
      motion.vy = MOVEMENT.mantleVy;
      motion.vx = -motion.wallNx * MOVEMENT.mantlePush;
      motion.vz = -motion.wallNz * MOVEMENT.mantlePush;
      events.mantled = true;
      endMode(motion);
      motion.regrab = 0.5;
    } else if (into < 0.25) {
      endMode(motion);
    }
  }

  if (motion.mode === MODE_NORMAL) {
    if (pressed) {
      if (motion.grounded || motion.coyote > 0) {
        motion.vy = params.jumpVelocity;
        motion.grounded = false;
        motion.coyote = 0;
        motion.jumpCount += 1;
        events.jumped = true;
      } else if (motion.airJumpsUsed < MOVEMENT.airJumps) {
        motion.vy = params.jumpVelocity * MOVEMENT.airJumpScale;
        motion.airJumpsUsed += 1;
        motion.jumpCount += 1;
        motion.flipCount += 1;
        events.jumped = true;
        events.airJumped = true;
      }
    }
    if (wishLength > 0.3) {
      const regrabbing = (nx: number, nz: number): boolean =>
        motion.regrab > 0 && nx === motion.regrabNx && nz === motion.regrabNz;
      if (collision.touching(motion.x, motion.y, motion.z, 'climb', MOVEMENT.wallReach, CONTACT)) {
        const into = -(wishX * CONTACT.nx + wishZ * CONTACT.nz) / wishLength;
        if (into > 0.5 && !regrabbing(CONTACT.nx, CONTACT.nz) && CONTACT.top - motion.y >= 1.6) {
          motion.mode = MODE_CLIMB;
          motion.wallNx = CONTACT.nx;
          motion.wallNz = CONTACT.nz;
          motion.modeTime = 0;
          motion.airJumpsUsed = 0;
          motion.grounded = false;
        }
      }
      if (
        motion.mode === MODE_NORMAL &&
        !motion.grounded &&
        Math.hypot(motion.vx, motion.vz) >= MOVEMENT.wallRunMinSpeed &&
        collision.touching(motion.x, motion.y, motion.z, 'wallrun', MOVEMENT.wallReach, CONTACT)
      ) {
        const away = (wishX * CONTACT.nx + wishZ * CONTACT.nz) / wishLength;
        if (away < 0.5 && !regrabbing(CONTACT.nx, CONTACT.nz)) {
          motion.mode = MODE_WALLRUN;
          motion.wallNx = CONTACT.nx;
          motion.wallNz = CONTACT.nz;
          motion.modeTime = 0;
          motion.airJumpsUsed = 0;
          motion.vy = Math.min(Math.max(motion.vy, 2.5), 7);
        }
      }
    }
  }

  // --------------------------------------------------------- velocity
  if (motion.mode === MODE_WALLRUN) {
    const along = motion.vx * -motion.wallNz + motion.vz * motion.wallNx;
    const wishAlong = wishX * -motion.wallNz + wishZ * motion.wallNx;
    const sign = Math.sign(along || wishAlong || 1);
    const tx = -motion.wallNz * sign;
    const tz = motion.wallNx * sign;
    const run = Math.max(speed, MOVEMENT.wallRunMinSpeed);
    approach(motion, tx * run - motion.wallNx * 2, tz * run - motion.wallNz * 2, MOVEMENT.acceleration * Math.max(1, run / 16), dt);
    motion.vy = Math.max(motion.vy - MOVEMENT.gravity * MOVEMENT.wallRunGravity * dt, MOVEMENT.wallRunMinVy);
    motion.yaw = rotateTowards(motion.yaw, Math.atan2(tx, tz), MOVEMENT.turnSpeed * 1.5 * dt);
  } else if (motion.mode === MODE_CLIMB) {
    motion.vx = -motion.wallNx * 1.5;
    motion.vz = -motion.wallNz * 1.5;
    motion.vy = MOVEMENT.climbBase + MOVEMENT.climbShare * base;
    motion.yaw = rotateTowards(motion.yaw, Math.atan2(-motion.wallNx, -motion.wallNz), MOVEMENT.turnSpeed * 1.5 * dt);
  } else {
    const scale = Math.max(1, speed / 16);
    const control = motion.grounded ? 1 : MOVEMENT.airControl;
    const rate = (wishLength > 0.01 ? MOVEMENT.acceleration : MOVEMENT.deceleration) * scale * control;
    approach(motion, wishX * speed, wishZ * speed, rate, dt);
    if (wishLength > 0.05) motion.yaw = rotateTowards(motion.yaw, Math.atan2(wishX, wishZ), MOVEMENT.turnSpeed * dt);
    motion.vy = Math.max(motion.vy - MOVEMENT.gravity * dt, -MOVEMENT.terminalVelocity);
  }

  // ------------------------------------------------------- integrate
  const travel = Math.max(Math.abs(motion.vx), Math.abs(motion.vz), Math.abs(motion.vy)) * dt;
  const steps = Math.min(MOVEMENT.maxSubsteps, Math.max(1, Math.ceil(travel / MOVEMENT.maxSubstepDistance)));
  const h = dt / steps;
  const wasGrounded = motion.grounded;
  let grounded = false;

  for (let i = 0; i < steps; i += 1) {
    collision.moveAxis('x', motion.x, motion.y, motion.z, motion.vx * h, AXIS);
    if (AXIS.hit && motion.mode === MODE_NORMAL) motion.vx = 0;
    motion.x = AXIS.value;
    motion.y = AXIS.y;
    collision.moveAxis('z', motion.x, motion.y, motion.z, motion.vz * h, AXIS);
    if (AXIS.hit && motion.mode === MODE_NORMAL) motion.vz = 0;
    motion.z = AXIS.value;
    motion.y = AXIS.y;
    collision.clampToBounds(motion);

    const nextY = motion.y + motion.vy * h;
    if (motion.vy <= 0) {
      const floor = collision.floorBelow(motion.x, motion.y, motion.z, 1e-3);
      const snap = wasGrounded && !events.jumped && motion.y - floor <= MOVEMENT.stepHeight + 0.05;
      if (nextY <= floor || snap) {
        motion.y = floor;
        motion.vy = 0;
        grounded = true;
      } else {
        motion.y = nextY;
      }
    } else {
      const ceiling = collision.ceilingAbove(motion.x, motion.y + 3.2, motion.z);
      if (nextY + 3.2 >= ceiling) {
        motion.y = ceiling - 3.2;
        motion.vy = 0;
      } else {
        motion.y = nextY;
      }
    }
  }

  if (!grounded && motion.vy <= 0) {
    const floor = collision.floorBelow(motion.x, motion.y, motion.z, 0.05);
    if (motion.y - floor <= 0.05) {
      motion.y = floor;
      motion.vy = 0;
      grounded = true;
    }
  }
  motion.grounded = grounded;
  if (grounded) {
    motion.airJumpsUsed = 0;
    if (motion.mode === MODE_WALLRUN) endMode(motion);
  }
  if (grounded && !wasGrounded) events.landed = true;
  if (!grounded && wasGrounded && !events.jumped) motion.coyote = MOVEMENT.coyoteTime;

  // ----------------------------------------------------------- sprint
  const moving = wishLength > 0.5 && Math.hypot(motion.vx, motion.vz) >= base * 0.55;
  if ((grounded || motion.mode === MODE_WALLRUN) && moving) motion.runTime = Math.min(motion.runTime + dt, 60);
  else if ((grounded && !moving) || motion.mode === MODE_CLIMB) motion.runTime = 0;

  // ------------------------------------------------------------- lava
  if (collision.inLava(motion.x, motion.y, motion.z)) {
    motion.dead = true;
    motion.vx = 0;
    motion.vy = 0;
    motion.vz = 0;
    motion.mode = MODE_NORMAL;
    motion.runTime = 0;
    events.died = true;
  }
};
