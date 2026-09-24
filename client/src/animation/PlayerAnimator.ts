import type { Group } from 'three';
import { AIRBORNE, CLIMB, IDLE, LANDING, LOCOMOTION, SPRINT_ARMS, TRANSITIONS, WALLRUN } from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';
import { LocomotionCycle } from './LocomotionCycle.js';
import { PoseBuffer } from './PoseBuffer.js';
import type { PlayerRig } from './rig/PlayerRig.js';
import { BONE_INDEX, type BoneName } from './rig/boneNames.js';

export type AnimationState = 'idle' | 'run' | 'airborne' | 'landing' | 'wallrun' | 'climb';

const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);
const ease = (t: number): number => t * t * (3 - 2 * t);
const ARMS: readonly BoneName[] = ['ArmL1', 'ArmL2', 'ArmR1', 'ArmR2'];
/** Height of the body's centre, for the flip's pivot. */
const PIVOT = 1.6;

/**
 * Writes ONLY to bones (via `PlayerRig`) and to the visual node's position and
 * rotation. It never touches the physics root.
 *
 * Idle, run and air are the base states; the run cycle deepens into the anime
 * SPRINT (arms swept back, body thrown forward) by the sprint weight the
 * simulation reports. A wall-run is the run cycle tipped away from the wall; a
 * climb is its own hand-over-hand cycle; a double jump is a front flip.
 */
export class PlayerAnimator {
  private readonly locomotion = new LocomotionCycle();
  private readonly target = new PoseBuffer();
  private readonly from = new PoseBuffer();
  private readonly output = new PoseBuffer();
  private readonly layer = new PoseBuffer();

  private state: AnimationState = 'idle';
  private stateTime = 0;
  private blendTime = 0;
  private blendDuration = 0;
  private idleTime = 0;
  private climbPhase = 0;
  private wasGrounded = true;
  private bank = 0;
  private roll = 0;
  private sprint = 0;

  constructor(
    private rig: PlayerRig,
    private readonly visual: Group,
  ) {}

  get currentState(): AnimationState {
    return this.state;
  }

  setRig(rig: PlayerRig): void {
    this.rig = rig;
  }

  reset(): void {
    this.state = 'idle';
    this.stateTime = 0;
    this.blendDuration = 0;
    this.wasGrounded = true;
    this.bank = 0;
    this.roll = 0;
    this.sprint = 0;
    this.target.reset();
    this.from.reset();
    this.output.reset();
    this.rig.resetToBindPose();
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    this.stateTime += dt;
    this.sprint += ((input.treadmill ? 0 : input.sprint) - this.sprint) * (1 - Math.exp(-6 * dt));
    this.resolveState(input);
    this.writePose(dt, input);
    this.blend(dt);
    this.rig.applyPose(this.output);
    this.applyVisual(dt, input);
  }

  private resolveState(input: AnimationInput): void {
    if (input.mode === 2) {
      this.setState('climb', TRANSITIONS.toWall);
      return;
    }
    if (input.mode === 1) {
      this.wasGrounded = false;
      this.setState('wallrun', TRANSITIONS.toWall);
      return;
    }
    if (input.landed || (input.grounded && !this.wasGrounded)) {
      this.wasGrounded = true;
      this.setState('landing', TRANSITIONS.toLanding);
      return;
    }
    this.wasGrounded = input.grounded;
    if (!input.grounded) {
      this.setState('airborne', TRANSITIONS.toAirborne);
      return;
    }
    if (this.state === 'landing' && this.stateTime < LANDING.duration) return;
    const moving = input.treadmill || input.horizontalSpeed >= LOCOMOTION.idleSpeed;
    this.setState(moving ? 'run' : 'idle', TRANSITIONS.toLocomotion);
  }

  private setState(next: AnimationState, duration: number): void {
    if (next === this.state) return;
    this.from.copyFrom(this.output);
    this.state = next;
    this.stateTime = 0;
    this.blendTime = 0;
    this.blendDuration = duration;
  }

  private runPose(dt: number, speed: number): void {
    const sprinting = this.sprint > 0.5;
    this.locomotion.advance(dt, speed, 1, sprinting);
    this.locomotion.writePose(this.target, speed, 1);
    // The anime sprint: arms swept straight back.
    const weight = ease(clamp(this.locomotion.sprintBlend, 0, 1));
    if (weight > 0.01) {
      this.layer.applyDefinition(SPRINT_ARMS);
      const out = this.target.rotations;
      const src = this.layer.rotations;
      for (const bone of ARMS) {
        const at = BONE_INDEX[bone] * 3;
        for (let k = 0; k < 3; k += 1) out[at + k] = (out[at + k] ?? 0) + ((src[at + k] ?? 0) - (out[at + k] ?? 0)) * weight;
      }
    }
  }

  private writePose(dt: number, input: AnimationInput): void {
    switch (this.state) {
      case 'idle': {
        this.locomotion.settleTowardNeutral(dt);
        this.idleTime += dt;
        const breath = Math.sin(this.idleTime * IDLE.breathFrequency * Math.PI * 2);
        this.target.applyDefinition(IDLE.basePose);
        this.target.add('Spine1', breath * IDLE.breathAmount);
        this.target.add('Neck1', -breath * IDLE.breathAmount * 0.6);
        this.target.bobY = breath * IDLE.breathBob;
        break;
      }
      case 'run':
        this.runPose(dt, input.treadmill ? Math.max(input.treadmillSpeed, 16) : input.horizontalSpeed);
        break;
      case 'wallrun': {
        this.runPose(dt, Math.max(input.horizontalSpeed, 12));
        // The wall-side arm reaches toward it.
        const reach = input.wallSide > 0 ? 'ArmR1' : 'ArmL1';
        this.target.add(reach, -WALLRUN.reach * 0.5, 0, (input.wallSide > 0 ? -1 : 1) * WALLRUN.reach);
        break;
      }
      case 'climb': {
        this.climbPhase += dt * CLIMB.frequency * Math.PI * 2;
        const s = Math.sin(this.climbPhase);
        this.target.reset();
        this.target.set('ArmL1', CLIMB.armBase + s * CLIMB.armSwing, 0, 0.2);
        this.target.set('ArmR1', CLIMB.armBase - s * CLIMB.armSwing, 0, -0.2);
        this.target.set('ArmL2', 0.4 - s * 0.3);
        this.target.set('ArmR2', 0.4 + s * 0.3);
        this.target.set('LegL1', CLIMB.legBase - s * CLIMB.legSwing);
        this.target.set('LegR1', CLIMB.legBase + s * CLIMB.legSwing);
        this.target.set('LegL2', CLIMB.knee + Math.max(0, s) * 0.4);
        this.target.set('LegR2', CLIMB.knee + Math.max(0, -s) * 0.4);
        this.target.set('Spine1', CLIMB.lean);
        this.target.set('Neck1', -0.3);
        this.target.bobY = Math.abs(s) * 0.08;
        break;
      }
      case 'airborne': {
        if (input.flipTime >= 0 && input.flipTime < AIRBORNE.flipSeconds) {
          const k = Math.sin(Math.PI * clamp(input.flipTime / AIRBORNE.flipSeconds, 0, 1));
          this.target.applyDefinition(AIRBORNE.rise);
          this.layer.applyDefinition(AIRBORNE.tuck);
          this.target.lerpBetween(this.target, this.layer, k);
        } else {
          const rising = clamp(input.verticalVelocity / AIRBORNE.velocityReference, -1, 1);
          this.target.applyDefinition(AIRBORNE.fall);
          this.layer.applyDefinition(AIRBORNE.rise);
          this.target.lerpBetween(this.target, this.layer, clamp(0.5 + rising * 0.5, 0, 1));
        }
        this.target.bobY = 0;
        break;
      }
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / LANDING.duration, 0, 1));
        this.target.applyDefinition(LANDING.pose, depth);
        this.target.bobY = LANDING.bobY * depth;
        break;
      }
    }
  }

  private blend(dt: number): void {
    if (this.blendDuration > 0) {
      this.blendTime += dt;
      const t = clamp(this.blendTime / this.blendDuration, 0, 1);
      this.output.lerpBetween(this.from, this.target, ease(t));
      if (t >= 1) this.blendDuration = 0;
    } else {
      this.output.copyFrom(this.target);
    }
  }

  private applyVisual(dt: number, input: AnimationInput): void {
    const wantBank = this.state === 'run' ? -input.turn * LOCOMOTION.bankAngle * 0.6 : 0;
    this.bank += (wantBank - this.bank) * (1 - Math.exp(-LOCOMOTION.bankRate * dt));
    // Tipped away from the wall while running on it: feet to the wall, head out.
    const wantRoll = this.state === 'wallrun' ? -input.wallSide * WALLRUN.roll : 0;
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-14 * dt));

    let flip = 0;
    if (this.state === 'airborne' && input.flipTime >= 0 && input.flipTime < AIRBORNE.flipSeconds) {
      flip = -Math.PI * 2 * ease(clamp(input.flipTime / AIRBORNE.flipSeconds, 0, 1));
    }
    this.visual.rotation.set(flip, 0, this.bank + this.roll);
    // A flip turns about the body's centre, not the feet.
    this.visual.position.set(0, this.output.bobY + (PIVOT - PIVOT * Math.cos(flip)), -PIVOT * Math.sin(flip));
  }
}
