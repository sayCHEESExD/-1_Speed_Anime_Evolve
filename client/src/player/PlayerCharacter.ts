import { AVATAR_SLOT, PLAYER_HEIGHT, characterBySlot } from '@anime/shared';
import { Group, type Mesh, type Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator, type AnimationState } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { createCharacterBody } from '../anime/CharacterModels.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { TrailRibbon } from '../fx/TrailRibbon.js';
import { WindLines } from '../fx/WindLines.js';
import { playerModelLoader } from './PlayerModelLoader.js';

/** The lava burn: how long the body takes to vanish. Inside the server's respawn delay. */
const BURN_SECONDS = 0.75;

/**
 * The visual half of a player, arranged so animation can never move them.
 *
 *   root            physics transform (position + facing). Gameplay owns it.
 *     burn          the lava burn's sink and shrink (identity while alive)
 *       visual      the bob, the lean, the flip, the evolution's size
 *         avatar    the avatar's own height (its Bloxity proportions)
 *           model   the player's Bloxity avatar body
 *         model     OR the evolution's body
 *     wind          the sprint's speed lines
 *   worldRoot       the trail ribbon, in WORLD space
 *
 * TWO bodies, one shown. The AVATAR body is the player's own Bloxity avatar -
 * `AvatarDresser` owns it through `setModel` / `body` - and it is who every
 * player starts as (slot 0). The EVOLUTION body is the supplied rig in an
 * anime character's look. While an evolution is worn it is drawn and the
 * avatar waits, dressed and ready, for the player to wear it again.
 *
 * Both are the same twelve-bone rig, so the one animator drives either: run,
 * sprint, jumps, flips, wall-runs and climbs look the same on both.
 */
export class PlayerCharacter {
  readonly root = new Group();
  readonly worldRoot = new Group();

  private readonly visual = new Group();
  /** Holds the avatar body; the dresser scales it by the avatar's height. */
  private readonly avatarHolder = new Group();
  private readonly burn = new Group();
  private readonly trail: TrailRibbon;
  private readonly wind: WindLines;
  private burnTime = -1;
  /** The bundled body, worn by the avatar until (or unless) the Bloxity one loads. */
  private readonly defaultModel: Object3D;
  private avatarModel: Object3D;
  private characterModel: Object3D | null = null;
  private shown: Object3D;
  private animator: PlayerAnimator;
  private slot = -1;
  /** The evolution's size (1 while the avatar is worn: its height is the holder's). */
  private scale = 1;

  constructor(slot: number = AVATAR_SLOT) {
    this.root.add(this.burn);
    this.burn.add(this.visual);
    this.visual.add(this.avatarHolder);
    this.trail = new TrailRibbon(this.worldRoot);
    this.wind = new WindLines(this.root);
    this.defaultModel = playerModelLoader.createInstance();
    this.avatarModel = this.defaultModel;
    this.avatarModel.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.avatarHolder.add(this.avatarModel);
    this.shown = this.avatarModel;
    const rig = new PlayerRig(this.shown, this.shown);
    rig.resetToBindPose();
    this.animator = new PlayerAnimator(rig, this.visual);
    this.setCharacter(slot);
  }

  get height(): number {
    return PLAYER_HEIGHT * (this.characterModel ? this.scale : this.avatarHolder.scale.y);
  }

  get character(): number {
    return this.slot;
  }

  /** The AVATAR body, for the dresser: the group its height scales, and the model it dresses. */
  get body(): { visual: Group; model: Object3D } {
    return { visual: this.avatarHolder, model: this.avatarModel };
  }

  /** Wear a different AVATAR body, or null for the bundled one. Drawn only while the avatar is worn. */
  setModel(next: Object3D | null): Object3D {
    const target = next ?? this.defaultModel;
    if (target === this.avatarModel) return target;
    const previous = this.avatarModel;
    previous.removeFromParent();
    releaseBody(previous);
    target.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.avatarModel = target;
    this.avatarHolder.add(target);
    if (!this.characterModel) this.show(target);
    return target;
  }

  /** Which character this player is: 0 = their own avatar, 1-12 = an evolution. Cheap when unchanged. */
  setCharacter(slot: number): void {
    const def = characterBySlot(slot) ?? characterBySlot(AVATAR_SLOT)!;
    if (def.slot === this.slot) return;
    this.slot = def.slot;
    this.characterModel?.removeFromParent();
    this.characterModel = null;
    if (def.slot === AVATAR_SLOT) {
      this.scale = 1;
      this.avatarHolder.visible = true;
      this.show(this.avatarModel);
      return;
    }
    const body = createCharacterBody(def.slot);
    this.scale = body.scale;
    this.characterModel = body.model;
    this.characterModel.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.visual.add(this.characterModel);
    this.avatarHolder.visible = false;
    this.show(this.characterModel);
  }

  /** Put the rig and the animator on `model`, the body now drawn. */
  private show(model: Object3D): void {
    this.shown = model;
    const rig = new PlayerRig(model, model);
    rig.resetToBindPose();
    this.animator.setRig(rig);
    this.animator.reset();
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
    this.animator.update(dt, input);
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
    return this.animator.currentState;
  }

  resetAnimation(): void {
    this.animator.reset();
    this.trail.reset();
  }

  dispose(): void {
    releaseBody(this.avatarModel);
    this.trail.dispose();
    this.wind.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}

/** Let go of a Bloxity body's own materials when it is swapped out (the bundled one's are shared). */
const releaseBody = (model: Object3D): void => {
  if (model.userData['bloxityBody'] !== true) return;
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
};
