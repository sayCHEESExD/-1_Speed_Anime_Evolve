import { MODE_NORMAL, TREADMILLS } from '@anime/shared';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { sprintWeight, wallSideOf } from './LocalPlayer.js';
import { NamePlate } from './NamePlate.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const FOLLOW_RATE = 16;
const SNAP_DISTANCE = 24;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/**
 * Another player's runner, rendered from replicated state ONLY: their
 * evolution, trail, sprint wind, wall-runs, climbs, flips and lava burns all
 * come from the same fields the server writes for everyone. The transform is
 * extrapolated along the replicated velocity and smoothed, so a fast runner
 * does not stutter between patches.
 */
export class RemotePlayer {
  readonly character: PlayerCharacter;

  private readonly plate = new NamePlate();
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private sinceUpdate = 0;
  private readonly input: AnimationInput = createAnimationInput();
  private placed = false;
  private wasGrounded = true;
  private lastFlipCount = -1;
  private flipTime = -1;
  private yawForWall = 0;
  private wallNx = 0;
  private wallNz = 0;

  get position(): { readonly x: number; readonly y: number; readonly z: number } {
    return { x: this.targetX, y: this.targetY, z: this.targetZ };
  }

  constructor(state: NetPlayerState) {
    this.character = new PlayerCharacter(state.characterSlot || 1);
    this.character.root.add(this.plate.sprite);
    this.apply(state);
    this.character.setPosition(this.targetX, this.targetY, this.targetZ);
    this.character.setYaw(this.targetYaw);
    this.placed = true;
  }

  apply(state: NetPlayerState): void {
    const jump = Math.hypot(state.x - this.targetX, state.z - this.targetZ);
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;
    this.vx = state.velocityX;
    this.vy = state.velocityY;
    this.vz = state.velocityZ;
    this.sinceUpdate = 0;
    if (jump > SNAP_DISTANCE) this.character.resetTrail();

    this.character.setCharacter(state.characterSlot);
    this.character.setTrail(state.trailId);
    this.character.setDead(state.dead);
    this.plate.set(state.displayName, state.avatarUrl, this.character.height);

    this.input.grounded = state.grounded;
    this.input.horizontalSpeed = state.speed;
    this.input.verticalVelocity = state.velocityY;
    this.input.sprint = sprintWeight(state.runTime);
    this.input.mode = state.mode;
    this.wallNx = state.wallNx;
    this.wallNz = state.wallNz;
    this.yawForWall = state.rotationY;
    this.input.treadmill = state.treadmill >= 0 && state.speed < 2;
    this.input.treadmillSpeed = state.moveSpeed * (TREADMILLS[state.treadmill]?.multiplier ?? 1);
    if (this.lastFlipCount >= 0 && state.flipCount !== this.lastFlipCount) this.flipTime = 0;
    this.lastFlipCount = state.flipCount;
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    this.sinceUpdate += dt;
    const position = this.character.root.position;
    // Extrapolate a little past the last patch, so a sprinter is drawn where they are.
    const ahead = Math.min(this.sinceUpdate, 0.12);
    const tx = this.targetX + this.vx * ahead;
    const ty = this.targetY + (this.input.grounded ? 0 : this.vy * ahead);
    const tz = this.targetZ + this.vz * ahead;
    const gap = Math.hypot(tx - position.x, ty - position.y, tz - position.z);
    if (!this.placed || gap > SNAP_DISTANCE) {
      position.set(tx, ty, tz);
      this.character.setYaw(this.targetYaw);
      this.placed = true;
    } else {
      const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
      position.x += (tx - position.x) * alpha;
      position.y += (ty - position.y) * alpha;
      position.z += (tz - position.z) * alpha;
      const yaw = this.character.root.rotation.y;
      this.character.setYaw(yaw + shortestAngle(yaw, this.targetYaw) * Math.min(1, alpha * 1.5));
    }

    if (this.flipTime >= 0) {
      this.flipTime += dt;
      if (this.flipTime > 1 || this.input.grounded || this.input.mode !== MODE_NORMAL) this.flipTime = -1;
    }
    this.input.landed = this.input.grounded && !this.wasGrounded;
    this.wasGrounded = this.input.grounded;
    this.input.flipTime = this.flipTime;
    this.input.wallSide = wallSideOf(this.yawForWall, this.wallNx, this.wallNz);
    this.character.update(dt, this.input);
    this.character.updateTrail(dt, this.input.horizontalSpeed > 2 || this.input.treadmill);
  }

  dispose(): void {
    this.plate.dispose();
    this.character.dispose();
  }
}
