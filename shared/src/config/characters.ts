/**
 * THE TWELVE EVOLUTIONS.
 *
 * A player starts as Luffy and EVOLVES one step at a time: evolving to the
 * next character spends its Wins price, unlocks it for good and wears it.
 * Any owned character can be worn again from the Backpack.
 *
 * `multiplier` is a real factor of the Speed formula (`speed.ts`): it
 * multiplies every point of Speed XP the player earns, running or on a
 * treadmill. It never changes physical run speed directly - that is the
 * level's job - so a course stays traversable at every multiplier.
 *
 * Order is the evolution order. Never reorder: owned characters are a bitmask
 * keyed by slot.
 */
export interface CharacterDef {
  /** 1-based slot: evolution order, bit (slot - 1) of the owned mask. */
  readonly slot: number;
  readonly name: string;
  readonly series: string;
  readonly multiplier: number;
  /** Wins spent to evolve into it. */
  readonly cost: number;
  /** Label colour in the menus. */
  readonly color: string;
}

export const CHARACTERS: readonly CharacterDef[] = [
  { slot: 1, name: 'Luffy', series: 'One Piece', multiplier: 1.0, cost: 0, color: '#ff4a3d' },
  { slot: 2, name: 'Deku', series: 'My Hero Academia', multiplier: 1.25, cost: 5, color: '#3ddc84' },
  { slot: 3, name: 'Yuji Itadori', series: 'Jujutsu Kaisen', multiplier: 1.5, cost: 25, color: '#ff8fb8' },
  { slot: 4, name: 'Naruto', series: 'Naruto', multiplier: 1.75, cost: 100, color: '#ff9a1f' },
  { slot: 5, name: 'Tanjiro', series: 'Demon Slayer', multiplier: 2.0, cost: 400, color: '#3fd1a6' },
  { slot: 6, name: 'Gon', series: 'Hunter x Hunter', multiplier: 2.25, cost: 1_500, color: '#5fe05a' },
  { slot: 7, name: 'Eren', series: 'Attack on Titan', multiplier: 2.5, cost: 5_000, color: '#8fbf5a' },
  { slot: 8, name: 'Asta', series: 'Black Clover', multiplier: 2.75, cost: 15_000, color: '#d9dde6' },
  { slot: 9, name: 'Saitama', series: 'One Punch Man', multiplier: 3.0, cost: 50_000, color: '#ffd23a' },
  { slot: 10, name: 'Goku', series: 'Dragon Ball', multiplier: 3.5, cost: 150_000, color: '#ff8a1f' },
  { slot: 11, name: 'Gojo', series: 'Jujutsu Kaisen', multiplier: 4.0, cost: 500_000, color: '#7fd8ff' },
  { slot: 12, name: 'Ichigo', series: 'Bleach', multiplier: 5.0, cost: 2_000_000, color: '#ff7a2e' },
];

export const CHARACTER_COUNT = CHARACTERS.length;

/** Every character bit, for sanitising a stored mask. */
export const ALL_CHARACTER_BITS = (1 << CHARACTER_COUNT) - 1;

/** Luffy is always owned. */
export const STARTER_CHARACTER_BITS = 1;

export const characterBySlot = (slot: number): CharacterDef | undefined => CHARACTERS[Math.floor(slot) - 1];

export const ownsCharacter = (owned: number, slot: number): boolean =>
  slot >= 1 && slot <= CHARACTER_COUNT && ((owned | STARTER_CHARACTER_BITS) & (1 << (slot - 1))) !== 0;

/** The highest slot owned: evolution always moves on from here. */
export const highestOwnedSlot = (owned: number): number => {
  let best = 1;
  for (let slot = 1; slot <= CHARACTER_COUNT; slot += 1) if (ownsCharacter(owned, slot)) best = slot;
  return best;
};

/** The next evolution, or undefined at the last. */
export const nextEvolution = (owned: number): CharacterDef | undefined => characterBySlot(highestOwnedSlot(owned) + 1);

/** The worn character's multiplier; an unowned or unknown slot falls back to Luffy. */
export const characterMultiplierOf = (slot: number, owned: number): number => {
  const def = characterBySlot(slot);
  if (!def || !ownsCharacter(owned, slot)) return CHARACTERS[0]!.multiplier;
  return def.multiplier;
};
