/**
 * CHARMS: small collectibles that add a percentage to Speed gain.
 *
 * Bought from the Charm Shop at the back of the spawn, held in the Backpack,
 * and up to `MAX_EQUIPPED_CHARMS` worn at once. Their bonuses ADD: three
 * charms of +3%, +3% and +9% are a x1.15 factor of the Speed formula.
 *
 * ADDING A CHARM is one line in `CHARMS` - append it (never insert or
 * reorder: inventories are stored by id). The shop's rotation picks from the
 * whole table by rarity weight, so a new charm starts appearing on the next
 * restock with no other change.
 */
export type CharmRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface CharmDef {
  /** Index into CHARMS; what inventories store. */
  readonly id: number;
  /** Stable key. */
  readonly key: string;
  readonly name: string;
  readonly rarity: CharmRarity;
  /** Percent added to Speed gain. */
  readonly bonus: number;
  /** Wins price in the shop. */
  readonly cost: number;
  /** Drawing: the icon family and its colours. */
  readonly icon: CharmIcon;
  readonly colors: readonly [string, string];
}

export type CharmIcon = 'mask' | 'kunai' | 'finger' | 'headband' | 'hat' | 'star' | 'orb' | 'blade' | 'key' | 'book' | 'blindfold' | 'sword';

export const MAX_EQUIPPED_CHARMS = 3;
/** Most charms one player may hold. */
export const MAX_CHARM_INVENTORY = 60;

export const CHARMS: readonly CharmDef[] = [
  { id: 0, key: 'headband', name: 'Leaf Headband', rarity: 'common', bonus: 1, cost: 15, icon: 'headband', colors: ['#3b6fd6', '#c9d2de'] },
  { id: 1, key: 'strawhat', name: 'Straw Hat', rarity: 'common', bonus: 1, cost: 20, icon: 'hat', colors: ['#f2c94c', '#d0202a'] },
  { id: 2, key: 'shuriken', name: 'Shuriken', rarity: 'common', bonus: 2, cost: 35, icon: 'star', colors: ['#9aa6b8', '#39414f'] },
  { id: 3, key: 'kunai', name: 'Kunai', rarity: 'rare', bonus: 3, cost: 50, icon: 'kunai', colors: ['#3a4152', '#d0202a'] },
  { id: 4, key: 'cursedfinger', name: 'Cursed Finger', rarity: 'rare', bonus: 3, cost: 150, icon: 'finger', colors: ['#5a3a2e', '#2a1a14'] },
  { id: 5, key: 'dragonball', name: 'Dragon Orb', rarity: 'rare', bonus: 4, cost: 300, icon: 'orb', colors: ['#ffb21f', '#e0401f'] },
  { id: 6, key: 'colormask', name: 'Color Mask', rarity: 'epic', bonus: 9, cost: 4_000, icon: 'mask', colors: ['#f4f1ea', '#8a1f2e'] },
  { id: 7, key: 'demonmask', name: 'Demon Mask', rarity: 'epic', bonus: 8, cost: 2_500, icon: 'mask', colors: ['#e8d9b8', '#d0402a'] },
  { id: 8, key: 'nichirin', name: 'Nichirin Blade', rarity: 'epic', bonus: 10, cost: 6_000, icon: 'blade', colors: ['#1f1f24', '#3fd1a6'] },
  { id: 9, key: 'titankey', name: 'Titan Key', rarity: 'legendary', bonus: 15, cost: 20_000, icon: 'key', colors: ['#c9a25a', '#6a4a1a'] },
  { id: 10, key: 'grimoire', name: 'Five-Leaf Grimoire', rarity: 'legendary', bonus: 18, cost: 35_000, icon: 'book', colors: ['#2a2a38', '#5fe05a'] },
  { id: 11, key: 'blindfold', name: 'Six Eyes Blindfold', rarity: 'mythic', bonus: 25, cost: 90_000, icon: 'blindfold', colors: ['#141418', '#7fd8ff'] },
  { id: 12, key: 'zanpakuto', name: 'Zanpakuto', rarity: 'mythic', bonus: 30, cost: 150_000, icon: 'sword', colors: ['#1a1a1f', '#ff7a2e'] },
];

export const CHARM_COUNT = CHARMS.length;

export const RARITY: Readonly<Record<CharmRarity, { label: string; weight: number; color: string; dark: string }>> = {
  common: { label: 'Common', weight: 40, color: '#9aa6b8', dark: '#4a5263' },
  rare: { label: 'Rare', weight: 34, color: '#29b6ff', dark: '#0a5a9a' },
  epic: { label: 'Epic', weight: 18, color: '#b04dff', dark: '#5a1a9a' },
  legendary: { label: 'Legendary', weight: 6, color: '#ffc21f', dark: '#9a5a00' },
  mythic: { label: 'Mythic', weight: 2, color: '#ff3b6b', dark: '#8a0a2a' },
};

export const charmById = (id: number): CharmDef | undefined => CHARMS[Math.floor(id)];
export const charmByKey = (key: string): CharmDef | undefined => CHARMS.find((charm) => charm.key === key);

/** Sum of the equipped charms' percentages. Unknown ids count nothing. */
export const charmBonusPercent = (equipped: readonly number[]): number => {
  let total = 0;
  for (const id of equipped.slice(0, MAX_EQUIPPED_CHARMS)) total += charmById(id)?.bonus ?? 0;
  return total;
};

/** The charm factor of the Speed formula. */
export const charmMultiplierOf = (equipped: readonly number[]): number => 1 + charmBonusPercent(equipped) / 100;

// ---------------------------------------------------------------- the shop

/** Seconds between restocks. */
export const SHOP_RESTOCK_SECONDS = 5 * 60;
/** Cards on the counter. */
export const SHOP_SLOTS = 3;

/** Which restock window a wall-clock time falls in. The same everywhere. */
export const shopWindowAt = (epochMs: number): number => Math.floor(epochMs / (SHOP_RESTOCK_SECONDS * 1000));

/** Seconds until the window after `epochMs` opens. */
export const shopSecondsLeft = (epochMs: number): number =>
  SHOP_RESTOCK_SECONDS - (epochMs / 1000 - shopWindowAt(epochMs) * SHOP_RESTOCK_SECONDS);

/** A small deterministic PRNG (mulberry32). */
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * THE STOCK of one window: `SHOP_SLOTS` distinct charms, drawn by rarity
 * weight. Pure, so the server (which sells) and the client (which draws the
 * cards) always agree.
 */
export const shopStock = (window: number): number[] => {
  const random = seededRandom(Math.imul(window, 2654435761) ^ 40503);
  const picked: number[] = [];
  let guard = 0;
  while (picked.length < SHOP_SLOTS && guard < 200) {
    guard += 1;
    let total = 0;
    for (const charm of CHARMS) if (!picked.includes(charm.id)) total += RARITY[charm.rarity].weight;
    let r = random() * total;
    for (const charm of CHARMS) {
      if (picked.includes(charm.id)) continue;
      r -= RARITY[charm.rarity].weight;
      if (r <= 0) {
        picked.push(charm.id);
        break;
      }
    }
  }
  // Best card first, as the counter shows them.
  return picked.sort((a, b) => (charmById(b)?.bonus ?? 0) - (charmById(a)?.bonus ?? 0));
};

/** The best `MAX_EQUIPPED_CHARMS` a player can wear from their inventory (counts by id). */
export const bestCharms = (counts: readonly number[]): number[] => {
  const pool: number[] = [];
  for (let id = 0; id < counts.length; id += 1) {
    const n = Math.min(MAX_EQUIPPED_CHARMS, Math.max(0, Math.floor(counts[id] ?? 0)));
    for (let k = 0; k < n; k += 1) pool.push(id);
  }
  pool.sort((a, b) => (charmById(b)?.bonus ?? 0) - (charmById(a)?.bonus ?? 0));
  return pool.slice(0, MAX_EQUIPPED_CHARMS);
};
