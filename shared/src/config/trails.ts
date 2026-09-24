/**
 * TRAILS: a ribbon behind the runner and a real Speed multiplier.
 *
 * Bought once with Wins, then equipped from the Backpack. The multiplier is a
 * factor of the Speed formula (`speed.ts`). Order is the menu order and the
 * owned bitmask. Never reorder.
 */
export interface TrailDef {
  /** 0 = No Trail. Bit `id` of the owned mask. */
  readonly id: number;
  readonly name: string;
  readonly multiplier: number;
  /** Wins price. */
  readonly cost: number;
  /** Ribbon colours, head to tail. Empty for No Trail. */
  readonly colors: readonly number[];
  /** Additive sparkle on the ribbon. */
  readonly glow: boolean;
}

export const TRAILS: readonly TrailDef[] = [
  { id: 0, name: 'No Trail', multiplier: 1.0, cost: 0, colors: [], glow: false },
  { id: 1, name: 'Green', multiplier: 1.0, cost: 650, colors: [0x5cff6a, 0x1fbf4a], glow: false },
  { id: 2, name: 'Red', multiplier: 1.1, cost: 2_000, colors: [0xff4a4a, 0xb3121f], glow: false },
  { id: 3, name: 'Blue', multiplier: 1.1, cost: 4_500, colors: [0x5ab8ff, 0x1f4fd6], glow: false },
  { id: 4, name: '67', multiplier: 1.2, cost: 9_500, colors: [0xffe14a, 0xff7a1f, 0xffe14a], glow: false },
  { id: 5, name: 'Fire', multiplier: 1.2, cost: 15_000, colors: [0xfff27a, 0xff9a1f, 0xff2e1f], glow: true },
  { id: 6, name: 'Water', multiplier: 1.4, cost: 30_000, colors: [0xdff6ff, 0x4fc8ff, 0x1f6fe0], glow: true },
  { id: 7, name: 'Void', multiplier: 1.6, cost: 50_000, colors: [0xc27aff, 0x5a1fbf, 0x14052a], glow: true },
  { id: 8, name: 'Star', multiplier: 1.9, cost: 80_000, colors: [0xffffff, 0xfff27a, 0xffc21f], glow: true },
  { id: 9, name: 'Galaxy', multiplier: 2.1, cost: 100_000, colors: [0xff7ae0, 0x7a5aff, 0x1f2a8f], glow: true },
  { id: 10, name: 'Rainbow', multiplier: 2.5, cost: 150_000, colors: [0xff3b3b, 0xffa51f, 0xfff23b, 0x3bff5a, 0x3bb8ff, 0xa53bff], glow: true },
];

export const TRAIL_COUNT = TRAILS.length;
export const ALL_TRAIL_BITS = (1 << TRAIL_COUNT) - 1;
/** No Trail is always owned. */
export const STARTER_TRAIL_BITS = 1;

export const trailById = (id: number): TrailDef | undefined => TRAILS[Math.floor(id)];

export const ownsTrail = (owned: number, id: number): boolean =>
  id >= 0 && id < TRAIL_COUNT && ((owned | STARTER_TRAIL_BITS) & (1 << id)) !== 0;

export const trailMultiplierOf = (id: number, owned: number): number => {
  const def = trailById(id);
  if (!def || !ownsTrail(owned, id)) return 1;
  return def.multiplier;
};
