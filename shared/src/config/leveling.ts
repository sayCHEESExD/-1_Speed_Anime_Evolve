/**
 * LEVELS: Speed XP fills a bar; a full bar is a level.
 *
 * A level costs `XP_BASE + XP_STEP x level` up to `XP_KNEE` - Level 24 needs
 * 129 XP to reach 25, Level 25 needs 133 - and past the knee that linear
 * figure compounds by `XP_GROWTH` per level, so late rebirths stay a grind
 * when the multiplier stack reaches the hundreds.
 *
 * The LEVEL is what makes a player physically faster (`runSpeedForLevel`),
 * boosted by the Speed multiplier (`runSpeedFor`). Level 15 runs at 27.
 */
export const XP_BASE = 33;
export const XP_STEP = 4;
export const XP_KNEE = 30;
export const XP_GROWTH = 1.02;

/** Hard ceiling on the level: float64 XP would reach it only after hundreds of rebirths. */
export const MAX_LEVEL = 5000;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => {
  const l = Math.max(1, Math.floor(level));
  const linear = XP_BASE + XP_STEP * l;
  if (l <= XP_KNEE) return linear;
  return Math.round(linear * XP_GROWTH ** (l - XP_KNEE));
};

/**
 * THE LEVEL'S RUN SPEED, before any multiplier or sprint. Strictly rising:
 * every level runs faster than the one before. Level 1 runs at 16 and
 * Level 15 at 27 (the reference's MAX: 27); past it the gain per level eases
 * off (logarithmic) so a Level 400 runner is fast but still lands a jump.
 */
export const runSpeedForLevel = (level: number): number => {
  const l = Math.max(1, Math.floor(level));
  if (l <= 15) return 16 + ((l - 1) * 11) / 14;
  return 27 + 16 * Math.log(l / 15);
};

/** The fastest anybody runs before sprint, whatever their level and multipliers. */
export const MAX_RUN_SPEED = 160;

/**
 * THE MULTIPLIER STACK MOVES THE LEGS TOO. The Speed multiplier (character x
 * trail x charms x rebirth power x pass, `speed.ts`) multiplies XP in full;
 * physical speed gets a SOFTENED share of it - a log, so Deku (x1.25) runs
 * ~4.5% faster, Tanjiro (x2) ~14%, a full end-game stack (x500) ~2.2x - which
 * keeps every stage landable while progression is felt in the legs.
 */
export const MOVEMENT_BOOST_STRENGTH = 0.2;
export const movementBoost = (multiplier: number): number =>
  1 + MOVEMENT_BOOST_STRENGTH * Math.log(Number.isFinite(multiplier) ? Math.max(1, multiplier) : 1);

/** Physical run speed: the level's speed x the multiplier boost, capped. What the server simulates. */
export const runSpeedFor = (level: number, multiplier: number): number =>
  Math.min(MAX_RUN_SPEED, runSpeedForLevel(level) * movementBoost(multiplier));


/** Take-off velocity of a jump. Fixed for everyone. */
export const JUMP_VELOCITY = 24;
