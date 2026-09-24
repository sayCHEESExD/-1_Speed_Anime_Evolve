import { characterMultiplierOf } from './characters.js';
import { charmMultiplierOf } from './charms.js';
import { rebirthPower } from './rebirth.js';
import { trailMultiplierOf } from './trails.js';

/**
 * THE SPEED FORMULA: what one stride of running is worth, in Speed XP.
 *
 *   gain = BASE x Character x Trail x Charms x Rebirth Power (x Treadmill)
 *
 * Every multiplier appears here exactly once, so none can be applied twice.
 * The server pays with it (`SpeedService`) and the HUD prints the factor the
 * server replicated, never a copy of its own.
 */
export const BASE_XP_PER_STRIDE = 1;
/** World units of running that make one stride. */
export const STRIDE_DISTANCE = 3.2;

export interface SpeedInputs {
  readonly characterSlot: number;
  readonly ownedCharacters: number;
  readonly trailId: number;
  readonly ownedTrails: number;
  readonly equippedCharms: readonly number[];
  readonly rebirths: number;
}

export interface SpeedBreakdown {
  readonly character: number;
  readonly trail: number;
  readonly charms: number;
  readonly rebirth: number;
  /** Everything multiplied: the HUD's "Speed Boost". */
  readonly total: number;
}

export const speedBreakdown = (inputs: SpeedInputs): SpeedBreakdown => {
  const character = characterMultiplierOf(inputs.characterSlot, inputs.ownedCharacters);
  const trail = trailMultiplierOf(inputs.trailId, inputs.ownedTrails);
  const charms = charmMultiplierOf(inputs.equippedCharms);
  const rebirth = rebirthPower(inputs.rebirths);
  return { character, trail, charms, rebirth, total: character * trail * charms * rebirth };
};

/** Speed XP one stride pays (before a treadmill's factor). */
export const xpPerStride = (inputs: SpeedInputs): number => BASE_XP_PER_STRIDE * speedBreakdown(inputs).total;

export const describeSpeed = (inputs: SpeedInputs): string => {
  const b = speedBreakdown(inputs);
  const f = (n: number): string => `x${Math.round(n * 1000) / 1000}`;
  return `character ${f(b.character)} trail ${f(b.trail)} charms ${f(b.charms)} rebirth ${f(b.rebirth)} = ${f(b.total)}`;
};
