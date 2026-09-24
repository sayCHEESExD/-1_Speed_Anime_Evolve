import {
  MOVEMENT,
  MODE_NORMAL,
  WorldCollision,
  copyMotion,
  createMotion,
  createSimEvents,
  createSimParams,
  horizontalSpeed,
  resetMotion,
  sprintFactor,
  stepPlayer,
  type MoveMessage,
  type MovementInput,
  type PlayerMotion,
  type SimParams,
} from '@anime/shared';
import { Vector3 } from 'three';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import type { InputState } from '../input/InputState.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const MAX_PENDING_INPUTS = 240;
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const SNAP_DISTANCE = 6;
const CORRECTION_RATE = 14;

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;
const EMPTY_INPUTS: MoveMessage[] = [];

export type PlacementKind = 'none' | 'respawn' | 'correction';

interface PendingInput {
  seq: number;
  dt: number;
  input: MovementInput;
}

/** The authoritative motion the client reconciles against: EVERY field of `PlayerMotion`. */
export type AuthoritativeMotion = PlayerMotion & { lastInputSeq: number };

/** 0..1 sprint weight from the replicated run timer. */
export const sprintWeight = (runTime: number): number =>
  Math.min(1, Math.max(0, (sprintFactor(runTime) - 1) / (MOVEMENT.sprintMultiplier - 1)));

/** +1 when the wall of a wall-run is on the character's right, -1 on its left. */
export const wallSideOf = (yaw: number, wallNx: number, wallNz: number): number => {
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  return -(wallNx * rx + wallNz * rz) >= 0 ? 1 : -1;
};

/**
 * The locally controlled runner: a PREDICTION of a server-owned simulation.
 *
 * Runs the identical `stepPlayer`, keeps every input the server has not
 * acknowledged, and on each server update snaps to the authoritative motion
 * and replays them. Run speed and jump come from the server's replicated
 * figures (`setParams`), never from anything local.
 */
export class LocalPlayer {
  readonly character: PlayerCharacter;
  readonly position = new Vector3();
  readonly velocity = new Vector3();

  private readonly previous = { x: 0, y: 0, z: 0 };
  private readonly motion: PlayerMotion = createMotion();
  private readonly events = createSimEvents();
  private readonly replayEvents = createSimEvents();
  private readonly collision: WorldCollision;
  private readonly params: SimParams = createSimParams();

  private readonly pending: PendingInput[] = [];
  private nextSeq = 1;
  private readonly outgoing: MoveMessage[] = [];
  private accumulator = 0;
  private readonly correction = new Vector3();
  private placement: PlacementKind = 'none';
  private turnSignal = 0;
  private jumpPending = false;
  private wasJumpHeld = false;
  private readonly animationInput: AnimationInput = createAnimationInput();
  private lastFlipCount = 0;
  private flipTime = -1;
  private onTreadmill = false;
  private treadmillSpeed = 0;

  jumpedEdge = false;
  airJumpedEdge = false;
  wallJumpedEdge = false;
  landedEdge = false;
  diedEdge = false;

  constructor(collision: WorldCollision) {
    this.collision = collision;
    this.character = new PlayerCharacter(1);
    this.previous.x = this.motion.x;
    this.previous.y = this.motion.y;
    this.previous.z = this.motion.z;
    this.syncFromMotion();
    this.syncCharacter();
  }

  get horizontalSpeed(): number {
    return horizontalSpeed(this.motion);
  }

  get isGrounded(): boolean {
    return this.motion.grounded;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get mode(): number {
    return this.motion.mode;
  }

  get sprint(): number {
    return sprintWeight(this.motion.runTime);
  }

  get dead(): boolean {
    return this.motion.dead;
  }

  drainOutgoing(): MoveMessage[] {
    if (this.outgoing.length === 0) return EMPTY_INPUTS;
    const batch = this.outgoing.slice();
    this.outgoing.length = 0;
    return batch;
  }

  /** The server's movement figures. */
  setParams(moveSpeed: number, jumpVelocity: number): void {
    if (Number.isFinite(moveSpeed) && moveSpeed > 0) this.params.moveSpeed = moveSpeed;
    if (Number.isFinite(jumpVelocity) && jumpVelocity > 0) this.params.jumpVelocity = jumpVelocity;
  }

  /** On a treadmill: runs in place at `speed` (run speed x the treadmill's multiplier). */
  setTreadmill(on: boolean, speed = 0): void {
    this.onTreadmill = on;
    this.treadmillSpeed = speed;
  }

  /** The server's run speed for this player (before sprint). */
  get maxRunSpeed(): number {
    return this.params.moveSpeed;
  }

  teleport(x: number, y: number, z: number, rotationY: number): void {
    resetMotion(this.motion, x, y, z, rotationY);
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.accumulator = 0;
    this.correction.set(0, 0, 0);
    this.placement = 'respawn';
    this.jumpPending = false;
    this.character.setDead(false);
    this.character.resetAnimation();
    this.syncFromMotion();
    this.syncCharacter();
  }

  reconcile(state: AuthoritativeMotion): void {
    const predictedX = this.motion.x;
    const predictedY = this.motion.y;
    const predictedZ = this.motion.z;

    copyMotion(state, this.motion);
    // `copyMotion` copies every own field; the sequence number is not motion.
    delete (this.motion as Partial<AuthoritativeMotion>).lastInputSeq;

    let kept = 0;
    for (const entry of this.pending) {
      if (entry.seq <= state.lastInputSeq) continue;
      this.pending[kept] = entry;
      kept += 1;
    }
    this.pending.length = kept;
    const m = this.motion;
    for (const entry of this.pending) stepPlayer(m, entry.input, this.params, entry.dt, this.collision, this.replayEvents);

    const dx = predictedX - m.x;
    const dy = predictedY - m.y;
    const dz = predictedZ - m.z;
    const snapped = Math.hypot(dx, dy, dz) > SNAP_DISTANCE;
    this.correction.set(snapped ? 0 : dx, snapped ? 0 : dy, snapped ? 0 : dz);
    if (snapped) {
      this.previous.x = m.x;
      this.previous.y = m.y;
      this.previous.z = m.z;
      if (this.placement === 'none') this.placement = 'correction';
    }
    this.syncFromMotion();
    this.syncCharacter();
  }

  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    this.jumpedEdge = false;
    this.airJumpedEdge = false;
    this.wallJumpedEdge = false;
    this.landedEdge = false;
    this.diedEdge = false;

    // A fresh press is remembered until a step takes it: a tap can be shorter than a fixed step.
    if (input.jump && !this.wasJumpHeld) this.jumpPending = true;
    this.wasJumpHeld = input.jump;

    this.accumulator += Math.max(0, delta);
    this.turnSignal = input.moveX;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      const movement: MovementInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        jump: this.jumpPending || input.jump,
        cameraYaw,
      };
      this.jumpPending = false;
      const seq = this.nextSeq;
      this.nextSeq += 1;
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;
      stepPlayer(this.motion, movement, this.params, FIXED_DT, this.collision, this.events);
      this.jumpedEdge ||= this.events.jumped;
      this.airJumpedEdge ||= this.events.airJumped;
      this.wallJumpedEdge ||= this.events.wallJumped;
      this.landedEdge ||= this.events.landed;
      this.diedEdge ||= this.events.died;
      this.pending.push({ seq, dt: FIXED_DT, input: movement });
      if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
      this.outgoing.push({ seq, dt: FIXED_DT, moveX: movement.moveX, moveZ: movement.moveZ, jump: movement.jump, cameraYaw });
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;

    if (this.motion.flipCount !== this.lastFlipCount) {
      this.lastFlipCount = this.motion.flipCount;
      this.flipTime = 0;
    } else if (this.flipTime >= 0) {
      this.flipTime += delta;
      if (this.flipTime > 1 || this.motion.grounded || this.motion.mode !== MODE_NORMAL) this.flipTime = -1;
    }

    this.decayCorrection(delta);
    this.syncFromMotion();
    this.syncCharacter();
    this.updateAnimation(delta);
    this.character.updateTrail(delta, this.horizontalSpeed > 2 || this.onTreadmill);
  }

  consumePlacement(): PlacementKind {
    const kind = this.placement;
    this.placement = 'none';
    return kind;
  }

  private decayCorrection(delta: number): void {
    if (this.correction.lengthSq() < 1e-8) {
      this.correction.set(0, 0, 0);
      return;
    }
    this.correction.multiplyScalar(Math.exp(-CORRECTION_RATE * delta));
  }

  private syncFromMotion(): void {
    const alpha = Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
    this.position.set(
      lerp(this.previous.x, this.motion.x, alpha) + this.correction.x,
      lerp(this.previous.y, this.motion.y, alpha) + this.correction.y,
      lerp(this.previous.z, this.motion.z, alpha) + this.correction.z,
    );
    this.velocity.set(this.motion.vx, this.motion.vy, this.motion.vz);
  }

  private updateAnimation(delta: number): void {
    const a = this.animationInput;
    const m = this.motion;
    a.grounded = m.grounded;
    a.horizontalSpeed = this.horizontalSpeed;
    a.verticalVelocity = m.vy;
    a.turn = this.turnSignal;
    a.landed = this.landedEdge;
    a.sprint = this.onTreadmill ? 0 : sprintWeight(m.runTime);
    a.mode = m.mode;
    a.wallSide = wallSideOf(m.yaw, m.wallNx, m.wallNz);
    a.flipTime = this.flipTime;
    a.treadmill = this.onTreadmill && m.grounded && this.horizontalSpeed < 2;
    a.treadmillSpeed = this.treadmillSpeed;
    this.character.setDead(m.dead);
    this.character.update(delta, a);
  }

  private syncCharacter(): void {
    this.character.setPosition(this.position.x, this.position.y, this.position.z);
    this.character.root.rotation.y = this.motion.yaw;
  }
}
