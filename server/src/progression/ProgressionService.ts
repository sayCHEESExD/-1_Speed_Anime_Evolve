import {
  JUMP_VELOCITY,
  MAX_XP,
  describeSpeed,
  levelCapFor,
  runSpeedFor,
  speedBreakdown,
  xpToNext,
  type SpeedInputs,
} from '@anime/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { logger } from '../util/logger.js';

const SCOPE = 'progression';

export const speedInputsOf = (player: PlayerState): SpeedInputs => ({
  characterSlot: player.characterSlot,
  ownedCharacters: player.ownedCharacters,
  trailId: player.trailId,
  ownedTrails: player.ownedTrails,
  equippedCharms: Array.from(player.equippedCharms),
  rebirths: player.rebirths,
});

/**
 * Server authority over Speed XP, levels and every DERIVED stat.
 *
 * `grantXp` is THE ONE PLACE XP is added, and `syncDerived` the one place the
 * level cap, XP-per-stride, multiplier and run speed are written. Every
 * service that changes an input to them (an evolution, a trail, a charm, a
 * rebirth, a pass, Custom Speed) calls `syncDerived` afterwards.
 */
export class ProgressionService {
  private readonly logged = new Map<string, number>();

  initialise(player: PlayerState): void {
    this.syncDerived(player);
  }

  forget(sessionId: string): void {
    this.logged.delete(sessionId);
  }

  /**
   * Add Speed XP and level up through it, never past the rebirth's cap. At the
   * cap the bar fills and stops: the rest waits for a rebirth. Returns the XP
   * actually banked.
   */
  grantXp(player: PlayerState, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const cap = levelCapFor(player.rebirths);
    let xp = player.xp + amount;
    let level = player.level;
    let banked = amount;
    // A big payout can level through many levels at once: bounded loop.
    for (let guard = 0; guard < 100_000 && level < cap; guard += 1) {
      const need = xpToNext(level);
      if (xp < need) break;
      xp -= need;
      level += 1;
    }
    if (level >= cap) {
      const need = xpToNext(cap);
      if (xp > need) {
        banked -= xp - need;
        xp = need;
      }
      level = cap;
    }
    player.xp = xp;
    player.totalXp = Math.min(MAX_XP, player.totalXp + Math.max(0, banked));
    if (player.level !== level) {
      player.level = level;
      this.syncDerived(player);
    }
    return Math.max(0, banked);
  }

  /** The rebirth: level and XP back to the start; everything else kept. */
  resetForRebirth(player: PlayerState): void {
    player.rebirths += 1;
    player.level = 1;
    player.xp = 0;
    this.syncDerived(player);
  }

  /** Re-derive every figure that follows from the player's own server state. */
  syncDerived(player: PlayerState): void {
    const cap = levelCapFor(player.rebirths);
    if (player.level > cap) player.level = cap;
    if (player.level < 1) player.level = 1;
    player.levelCap = cap;
    player.xpNeeded = xpToNext(player.level);
    if (player.xp > player.xpNeeded && player.level >= cap) player.xp = player.xpNeeded;
    const inputs = speedInputsOf(player);
    const breakdown = speedBreakdown(inputs);
    player.multiplier = breakdown.total;
    player.xpPerStride = breakdown.total;
    // Physical speed: the level's run speed boosted by the whole multiplier stack.
    player.maxSpeed = runSpeedFor(player.level, breakdown.total);
    player.moveSpeed = player.maxSpeed;
    player.jumpVelocity = JUMP_VELOCITY;

    if (this.logged.get(player.sessionId) !== breakdown.total) {
      this.logged.set(player.sessionId, breakdown.total);
      logger.info(SCOPE, `${player.sessionId} L${player.level}/${cap} speed: ${describeSpeed(inputs)}`);
    }
  }
}
