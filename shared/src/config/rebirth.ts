/**
 * REBIRTH: the prestige ladder, fully dynamic.
 *
 *   R0: 1.0x Power, Level cap 15
 *   R1: 1.5x Power, Level cap 30
 *   R2: 2.0x Power, Level cap 45
 *   ...every rebirth: +0.5x Power, +15 levels of cap. No last rung.
 *
 * POWER is the rebirth factor of the Speed formula (`speed.ts`). A rebirth is
 * allowed once the player's level has reached its cap; it resets the level and
 * XP to the start and keeps everything else (Wins, characters, trails,
 * charms, opened stages).
 */
export const BASE_LEVEL_CAP = 15;
export const LEVEL_CAP_PER_REBIRTH = 15;
export const POWER_PER_REBIRTH = 0.5;

export const rebirthPower = (rebirths: number): number => 1 + POWER_PER_REBIRTH * Math.max(0, Math.floor(rebirths));

export const levelCapFor = (rebirths: number): number =>
  BASE_LEVEL_CAP + LEVEL_CAP_PER_REBIRTH * Math.max(0, Math.floor(rebirths));

export const canRebirth = (level: number, rebirths: number): boolean => Math.floor(level) >= levelCapFor(rebirths);
