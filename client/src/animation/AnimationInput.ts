/**
 * The gameplay signals the animator consumes each frame. It reads these and
 * never writes back. The local player fills it from its prediction and every
 * remote from replicated state, so both run the exact same animation code.
 */
export interface AnimationInput {
  grounded: boolean;
  /** Horizontal speed in world units per second. */
  horizontalSpeed: number;
  verticalVelocity: number;
  /** -1..1 steering, for the lean. */
  turn: number;
  landed: boolean;
  /** 0..1: how far into the auto-sprint the runner is. */
  sprint: number;
  /** 0 normal, 1 wall-run, 2 climb (the simulation's mode). */
  mode: number;
  /** Wall-run: +1 when the wall is on the character's right, -1 on the left. */
  wallSide: number;
  /** Seconds since the last double jump began, or -1. */
  flipTime: number;
  /** Running in place on a treadmill. */
  treadmill: boolean;
  /** How fast the belt runs them: their run speed x the treadmill's multiplier. */
  treadmillSpeed: number;
}

export const createAnimationInput = (): AnimationInput => ({
  grounded: true,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  turn: 0,
  landed: false,
  sprint: 0,
  mode: 0,
  wallSide: 0,
  flipTime: -1,
  treadmill: false,
  treadmillSpeed: 0,
});
