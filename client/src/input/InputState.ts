/** Normalised, device-agnostic input snapshot consumed by the player controller. */
export interface InputState {
  /** -1 (left) .. 1 (right), camera-relative. */
  moveX: number;
  /** -1 (back) .. 1 (forward), camera-relative. */
  moveZ: number;
  /** The jump control, HELD: Space or the JUMP button. Only a fresh press jumps. */
  jump: boolean;
  /** Unused by this game (no attack): kept so the shared input sources stay one shape. */
  attack: boolean;
  /** Unused by this game (no attack). */
  attackHeld: boolean;
}

export const createInputState = (): InputState => ({ moveX: 0, moveZ: 0, jump: false, attack: false, attackHeld: false });
