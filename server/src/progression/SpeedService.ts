import { STRIDE_DISTANCE, TREADMILL_STRIDES_PER_SECOND, canUseTreadmill, treadmillAt, type TreadmillDef } from '@anime/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { ProgressionService } from './ProgressionService.js';

/** Longest distance one accepted step may credit: far above any legal step, a guard against a placement being "run". */
const MAX_STEP_DISTANCE = 40;

/**
 * SPEED XP FROM RUNNING: distance the SERVER simulated, and nothing else.
 *
 * Every accepted input's distance (on the ground, along a wall or up a climb)
 * is banked in a per-player carry; each full `STRIDE_DISTANCE` pays one
 * stride at the player's current `xpPerStride`. A TREADMILL pays strides on
 * a clock instead - `TREADMILL_STRIDES_PER_SECOND` times its multiplier -
 * while the player stands on its belt.
 */
export class SpeedService {
  private readonly carry = new Map<string, number>();
  private readonly beltCarry = new Map<string, number>();

  forget(sessionId: string): void {
    this.carry.delete(sessionId);
    this.beltCarry.delete(sessionId);
  }

  /** Credit one simulated step's travel. */
  creditMovement(player: PlayerState, distance: number, progression: ProgressionService): void {
    if (!Number.isFinite(distance) || distance <= 0 || distance > MAX_STEP_DISTANCE || player.dead) return;
    let carry = (this.carry.get(player.sessionId) ?? 0) + distance;
    const strides = Math.floor(carry / STRIDE_DISTANCE);
    carry -= strides * STRIDE_DISTANCE;
    this.carry.set(player.sessionId, carry);
    if (strides > 0) progression.grantXp(player, strides * player.xpPerStride);
  }

  /** Pay a treadmill's clock. Returns the belt underfoot (even a locked one), for notices. */
  tickTreadmill(delta: number, player: PlayerState, progression: ProgressionService): TreadmillDef | undefined {
    const underfoot = player.grounded && !player.dead ? treadmillAt(player.x, player.y, player.z) : undefined;
    const belt = underfoot && canUseTreadmill(underfoot, player.rebirths) ? underfoot : undefined;
    const id = belt ? belt.id : -1;
    if (player.treadmill !== id) player.treadmill = id;
    if (!belt) {
      this.beltCarry.delete(player.sessionId);
      return underfoot;
    }
    let carry = (this.beltCarry.get(player.sessionId) ?? 0) + TREADMILL_STRIDES_PER_SECOND * Math.max(0, delta);
    const strides = Math.floor(carry);
    carry -= strides;
    this.beltCarry.set(player.sessionId, carry);
    if (strides > 0) progression.grantXp(player, strides * player.xpPerStride * belt.multiplier);
    return underfoot;
  }
}
