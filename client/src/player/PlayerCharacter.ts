import { PLAYER_HEIGHT, characterBySlot } from '@anime/shared';
import { Group, type Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator, type AnimationState } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { createCharacterBody } from '../anime/CharacterModels.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { TrailRibbon } from '../fx/TrailRibbon.js';
import { WindLines } from '../fx/WindLines.js';

/** The lava burn: how long the body takes to vanish. Inside the server's respawn delay. */
const BURN_SECONDS = 0.75;

/**
 * The visual half of a player, arranged so animation can never move them.
 *
 *   root          physics transform (position + facing). Gameplay owns it.
 *     burn        the lava burn's sink and shrink (identity while alive)
 *       visual    the bob, the lean, the flip, the character's size
 *         model   the evolution's body
 *     wind        the sprint's speed lines
 *   worldRoot     the trail ribbon, in WORLD space
 */
export class PlayerCharacter {
  readonly root = new Group();
  readonly worldRoot = new Group();

  private readonly visual = new Group();
  private readonly burn = new Group();
  private readonly trail: TrailRibbon;
  private readonly wind: WindLines;
  private burnTime = -1;
  private model: Object3D | null = null;
  private animator: PlayerAnimator | null = null;
  private slot = 0;
  private scale = 1;

  constructor(slot = 1) {
    this.root.add(this.burn);
    this.burn.add(this.visual);
    this.trail = new TrailRibbon(this.worldRoot);
    this.wind = new WindLines(this.root);
    this.setCharacter(slot);
  }

  get height(): number {
    return PLAYER_HEIGHT * this.scale;
  }

  get character(): number {
    return this.slot;
  }

  /** Which evolution this player is. Cheap when unchanged. */
  setCharacter(slot: number): void {
    const def = characterBySlot(slot) ?? characterBySlot(1)!;
    if (def.slot === this.slot && this.model) return;
    this.slot = def.slot;
    this.model?.removeFromParent();
    const body = createCharacterBody(def.slot);
    this.scale = body.scale;
    this.model = body.model;
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.visual.add(this.model);
    const rig = new PlayerRig(this.model, this.model);
    rig.resetToBindPose();
    if (this.animator) {
      this.animator.setRig(rig);
      this.animator.reset();
    } else {
      this.animator = new PlayerAnimator(rig, this.visual);
    }
    this.visual.scale.setScalar(this.scale);
  }

  setTrail(id: number): void {
    this.trail.setTrail(id);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  /** The lava: true starts the burn (once), false - the respawn - restores the body. */
  setDead(dead: boolean): void {
    if (dead && this.burnTime < 0) {
      this.burnTime = 0;
    } else if (!dead && this.burnTime >= 0) {
      this.burnTime = -1;
      this.burn.position.set(0, 0, 0);
      this.burn.scale.setScalar(1);
      this.burn.rotation.set(0, 0, 0);
    }
  }

  get dead(): boolean {
    return this.burnTime >= 0;
  }

  private updateBurn(delta: number): void {
    if (this.burnTime < 0) return;
    this.burnTime += delta;
    const t = Math.min(1, this.burnTime / BURN_SECONDS);
    // A hop of pain, then down into the lava, shrinking.
    this.burn.position.y = Math.sin(Math.min(1, t * 2.2) * Math.PI) * 1.4 - t * t * 2.5;
    this.burn.rotation.y = t * 6;
    this.burn.scale.setScalar(Math.max(0.001, 1 - t * t));
  }

  /** Animate the body. `sprint` 0..1 also drives the wind. */
  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    this.updateBurn(dt);
    this.animator?.update(dt, input);
    if (this.visual.scale.x !== this.scale) this.visual.scale.setScalar(this.scale);
    this.wind.update(dt, this.dead ? 0 : input.treadmill ? 0.5 : input.sprint, this.scale);
  }

  /** Advance the trail, after the body has moved. */
  updateTrail(delta: number, moving: boolean): void {
    const p = this.root.position;
    this.trail.update(delta, p.x, p.y, p.z, moving && !this.dead);
  }

  resetTrail(): void {
    this.trail.reset();
  }

  get animationState(): AnimationState {
    return this.animator?.currentState ?? 'idle';
  }

  resetAnimation(): void {
    this.animator?.reset();
    this.trail.reset();
  }

  dispose(): void {
    this.trail.dispose();
    this.wind.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}
