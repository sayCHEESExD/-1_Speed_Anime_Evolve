import { neckScale } from '@anime/shared';
import { Group, Matrix4, Mesh, MeshToonMaterial, Quaternion, Vector3, type BufferGeometry, type Bone, type Object3D } from 'three';
import { attachToMount } from '../animation/rig/BoneMounts.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import type { BoneName } from '../animation/rig/boneNames.js';
import { playerModelLoader } from '../player/PlayerModelLoader.js';
import { PartBuilder, meshesFor, type PartKind } from '../render/PartBuilder.js';
import { suitFor, type AccessoryContext, type SuitDef } from './AnimeSuits.js';
import { paintSuit, partBox, type BodyPart } from './SuitPainter.js';
import { toonGradient } from '../world/japan/Surfaces.js';

type Slot = 'head' | 'back' | 'chest' | 'handR' | 'handL';

const materials = new Map<number, MeshToonMaterial>();
const gear = new Map<string, Partial<Record<PartKind, BufferGeometry>>>();

const MOUNT_BONE: Readonly<Record<Slot, BoneName>> = {
  head: 'Neck1',
  back: 'Spine1',
  chest: 'Spine1',
  handR: 'ArmR2',
  handL: 'ArmL2',
};

const centre = (part: BodyPart): Vector3 => {
  const box = partBox(part);
  return box ? box.min.clone().add(box.max).multiplyScalar(0.5) : new Vector3();
};

/** Where each accessory sits on the measured body, in model space at the origin. */
const mountPoint = (slot: Slot): Vector3 => {
  const torso = partBox('torso');
  switch (slot) {
    case 'head':
      return centre('head');
    case 'back':
      return torso ? new Vector3((torso.min.x + torso.max.x) / 2, torso.max.y - 0.12, torso.min.z - 0.02) : new Vector3();
    case 'chest':
      return torso ? new Vector3((torso.min.x + torso.max.x) / 2, torso.min.y + (torso.max.y - torso.min.y) * 0.66, torso.max.z + 0.01) : new Vector3();
    case 'handR':
    case 'handL': {
      const arm = partBox(slot === 'handR' ? 'armR' : 'armL');
      return arm ? new Vector3((arm.min.x + arm.max.x) / 2, arm.min.y + 0.14, (arm.min.z + arm.max.z) / 2) : new Vector3();
    }
  }
};

/**
 * Where a mount's gear goes, in model space. The body is measured BEFORE the
 * rig enlarges the head on the neck bone, so head gear is grown by the same
 * factor about the same pivot - otherwise hair and hats sit a size too small,
 * inside the head, and their faces fight the face texture for the same pixels.
 */
const frameOf = (mount: Slot, bone: Bone): Matrix4 => {
  const at = mountPoint(mount);
  if (mount !== 'head') return new Matrix4().makeTranslation(at.x, at.y, at.z);
  const k = neckScale();
  const pivot = bone.getWorldPosition(new Vector3());
  const centre = at.sub(pivot).multiplyScalar(k).add(pivot);
  return new Matrix4().compose(centre, new Quaternion(), new Vector3(k, k, k));
};

const contextOf = (): AccessoryContext => {
  const head = partBox('head');
  const torso = partBox('torso');
  const arm = partBox('armR');
  return {
    head: head ? head.max.y - head.min.y : 0.9,
    torsoW: torso ? torso.max.x - torso.min.x : 1.1,
    torsoD: torso ? torso.max.z - torso.min.z : 0.55,
    torsoH: torso ? torso.max.y - torso.min.y : 1.1,
    limb: arm ? arm.max.x - arm.min.x : 0.55,
  };
};

const materialFor = (slot: number, suit: SuitDef, model: Object3D): MeshToonMaterial => {
  let material = materials.get(slot);
  if (!material) {
    // Cel-shaded like the world: flat bands of light, the anime look.
    material = new MeshToonMaterial({ map: paintSuit(`anime-${slot}`, model, suit.paint), gradientMap: toonGradient() });
    materials.set(slot, material);
  }
  return material;
};

/** The accessory geometry for one mount of one character, built once and shared. */
const gearFor = (slot: number, mount: Slot, suit: SuitDef): Partial<Record<PartKind, BufferGeometry>> | null => {
  const make = suit[mount];
  if (!make) return null;
  const key = `${slot}:${mount}`;
  let geometries = gear.get(key);
  if (!geometries) {
    const builder = new PartBuilder();
    make(builder, contextOf());
    geometries = builder.geometries();
    gear.set(key, geometries);
  }
  return geometries;
};

export interface CharacterBody {
  readonly model: Object3D;
  /** Visual scale the character is drawn at. */
  readonly scale: number;
}

/**
 * A playable body for one of the twelve evolutions: the supplied player
 * model, its atlas painted with the character, and the character's hair, hat
 * and gear bolted to its bones. Every character - Luffy included - is one.
 */
export const createCharacterBody = (slot: number): CharacterBody => {
  const suit = suitFor(slot);
  const model = playerModelLoader.createInstance();
  const material = materialFor(slot, suit, model);
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  });

  // Accessories go on in the bind pose with the body at the origin.
  const root = new Group();
  model.rotation.set(0, 0, 0);
  root.add(model);
  const rig = new PlayerRig(model, model);
  rig.resetToBindPose();
  root.updateMatrixWorld(true);
  for (const mount of ['head', 'back', 'chest', 'handR', 'handL'] as const) {
    const geometries = gearFor(slot, mount, suit);
    const bone = rig.getBone(MOUNT_BONE[mount]);
    if (!geometries || !bone) continue;
    const group = meshesFor(geometries, `anime-${slot}-${mount}`, true);
    group.userData['characterGear'] = true;
    attachToMount(group, { bone, frame: frameOf(mount, bone) }, root);
  }
  model.removeFromParent();
  model.userData['characterBody'] = slot;
  return { model, scale: suit.scale ?? 1 };
};
