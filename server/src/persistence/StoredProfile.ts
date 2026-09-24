/**
 * The DERIVING facts of a player's progression: everything a session is
 * rebuilt from. The multiplier, run speed and XP-per-stride are recomputed
 * from these by the same shared formulas a live session uses.
 */
export interface ProgressFields {
  level: number;
  /** XP into the current level. */
  xp: number;
  /** Speed XP earned, ever. */
  totalXp: number;
  wins: number;
  /** Wins earned, ever: the Wins board. */
  lifetimeWins: number;
  rebirths: number;
  /** Bitmask of characters owned (slot 1 = bit 0, always owned). */
  ownedCharacters: number;
  characterSlot: number;
  /** Bitmask of trails owned (No Trail = bit 0, always owned). */
  ownedTrails: number;
  trailId: number;
  /** Charms held, counted by charm id. */
  charms: number[];
  /** Charm ids worn. */
  equippedCharms: number[];
  /** Highest stage ever claimed. */
  bestStage: number;
  /** Seconds played, lifetime: the Playtime board. */
  playSeconds: number;
  /** The shop window the player's purchases belong to. */
  shopWindow: number;
  shopBought: number;
}

/** What one save writes. */
export interface ProfileFields extends ProgressFields {
  /** The portal's display name and portrait as last seen. Cleared when empty. */
  displayName: string;
  avatarUrl: string;
  /** Wall clock of the save. */
  updatedAt: number;
}

/**
 * The first-login migration's bookkeeping.
 *
 *   - An ACCOUNT profile created from a browser's guest progress carries
 *     `migratedFrom`, the guest key it came from.
 *   - That GUEST profile is then RETIRED: its progress is reset, it carries
 *     `migratedTo` (the account key), `migratedAt`, and `migratedSnapshot` -
 *     the progress it held at that moment, kept as a recovery copy.
 */
export interface MigrationFields {
  migratedFrom?: string;
  migratedTo?: string;
  migratedAt?: number;
  migratedSnapshot?: ProgressFields;
}

/**
 * A profile as READ from storage. Beyond the fields this build knows, it may
 * carry any field a newer or older build wrote: those are kept and written
 * back untouched, never dropped.
 */
export type StoredProfile = ProfileFields & MigrationFields & { [field: string]: unknown };

const NUMERIC_KEYS = [
  'level',
  'xp',
  'totalXp',
  'wins',
  'lifetimeWins',
  'rebirths',
  'ownedCharacters',
  'characterSlot',
  'ownedTrails',
  'trailId',
  'bestStage',
  'playSeconds',
  'shopWindow',
  'shopBought',
] as const satisfies readonly (keyof ProgressFields)[];

/** Optional string fields a save may CLEAR. The only fields ever $unset. */
export const CLEARABLE_FIELDS = ['displayName', 'avatarUrl'] as const;

const numeric = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const numbers = (value: unknown, limit: number): number[] =>
  Array.isArray(value) ? value.slice(0, limit).map((entry) => Math.floor(numeric(entry))) : [];

export const emptyProgress = (): ProgressFields => ({
  level: 1,
  xp: 0,
  totalXp: 0,
  wins: 0,
  lifetimeWins: 0,
  rebirths: 0,
  ownedCharacters: 1,
  characterSlot: 1,
  ownedTrails: 1,
  trailId: 0,
  charms: [],
  equippedCharms: [],
  bestStage: 0,
  playSeconds: 0,
  shopWindow: 0,
  shopBought: 0,
});

/** Just the progression of a profile, coerced. */
export const progressOf = (source: Partial<ProgressFields>): ProgressFields => {
  const out = emptyProgress();
  for (const key of NUMERIC_KEYS) out[key] = numeric(source[key]);
  if (out.level < 1) out.level = 1;
  if (out.ownedCharacters === 0) out.ownedCharacters = 1;
  if (out.characterSlot === 0) out.characterSlot = 1;
  if (out.ownedTrails === 0) out.ownedTrails = 1;
  out.charms = numbers(source.charms, 64);
  out.equippedCharms = numbers(source.equippedCharms, 3);
  return out;
};

/**
 * Coerce whatever storage held into a profile, KEEPING every unknown field.
 */
export const coerceProfile = (raw: unknown): StoredProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const profile: StoredProfile = {
    ...source,
    ...progressOf(source as Partial<ProgressFields>),
    displayName: text(source['displayName']),
    avatarUrl: text(source['avatarUrl']),
    updatedAt: numeric(source['updatedAt']),
  };
  if (typeof source['migratedFrom'] !== 'string') delete profile.migratedFrom;
  if (typeof source['migratedTo'] !== 'string') delete profile.migratedTo;
  if (typeof source['migratedAt'] !== 'number') delete profile.migratedAt;
  if (source['migratedSnapshot'] && typeof source['migratedSnapshot'] === 'object') {
    profile.migratedSnapshot = progressOf(source['migratedSnapshot'] as Partial<ProgressFields>);
  } else {
    delete profile.migratedSnapshot;
  }
  return profile;
};

/**
 * Whether a profile holds anything worth carrying into an account. A player
 * who opened the game and stood still has nothing to migrate.
 */
export const hasProgress = (p: ProgressFields): boolean =>
  p.totalXp > 0 ||
  p.wins > 0 ||
  p.lifetimeWins > 0 ||
  p.bestStage > 0 ||
  p.rebirths > 0 ||
  p.ownedCharacters > 1 ||
  p.ownedTrails > 1 ||
  p.charms.some((count) => count > 0);
