import {
  ALL_CHARACTER_BITS,
  ALL_TRAIL_BITS,
  CHARACTER_COUNT,
  CHARM_COUNT,
  MAX_EQUIPPED_CHARMS,
  STARTER_CHARACTER_BITS,
  STARTER_TRAIL_BITS,
  TRAIL_COUNT,
} from '@anime/shared';
import {
  emptyProgress,
  progressOf,
  storage,
  type MigrationFields,
  type ProfileFields,
  type ProgressFields,
  type StoredProfile,
} from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { logger } from '../util/logger.js';

const SCOPE = 'profiles';

/** How often the leaderboard cache is re-read from storage. */
const CACHE_REFRESH_MS = 30_000;

/**
 * Progression that outlives a session.
 *
 * A thin, PER-KEY front on the storage: a profile is READ FROM STORAGE AT
 * JOIN TIME, never from a cache filled at boot, because several pods share
 * one database and the boot cache of one knows nothing of what another has
 * written since. The cache here exists for exactly one reader - the
 * leaderboards, which want everyone at once - and is refreshed on a timer
 * with newer `updatedAt` winning.
 */
class ProfileStore {
  private readonly cache = new Map<string, StoredProfile>();
  private refreshTimer: NodeJS.Timeout | null = null;

  get kind(): string {
    return storage.kind;
  }

  /** Connect the store and warm the leaderboard cache. Never throws. */
  async open(): Promise<void> {
    await storage.open();
    await this.refresh();
    this.refreshTimer = setInterval(() => void this.refresh(), CACHE_REFRESH_MS);
    this.refreshTimer.unref?.();
  }

  /** Profiles known to the cache, for the boards. */
  get size(): number {
    return this.cache.size;
  }

  entries(): IterableIterator<[string, StoredProfile]> {
    return this.cache.entries();
  }

  /** The profile under a key, read from storage NOW. Throws when storage is unreachable. */
  async load(key: string): Promise<StoredProfile | null> {
    const profile = await storage.get(key);
    if (profile) this.remember(key, profile);
    return profile;
  }

  /** What a live session is worth on disk: the deriving facts and the identity. */
  snapshot(player: PlayerState): ProfileFields {
    return {
      level: player.level,
      xp: player.xp,
      totalXp: player.totalXp,
      wins: player.wins,
      lifetimeWins: player.lifetimeWins,
      rebirths: player.rebirths,
      ownedCharacters: player.ownedCharacters,
      characterSlot: player.characterSlot,
      ownedTrails: player.ownedTrails,
      trailId: player.trailId,
      charms: Array.from(player.charms),
      equippedCharms: Array.from(player.equippedCharms),
      bestStage: player.bestStage,
      playSeconds: player.playSeconds,
      shopWindow: player.shopWindow,
      shopBought: player.shopBought,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      updatedAt: Date.now(),
    };
  }

  /**
   * Apply a profile onto player state - or the fresh-player defaults when
   * there is none. Only the DERIVING facts: the multiplier, run speed and
   * XP-per-stride are recomputed by the progression service, which the room
   * runs right after.
   */
  applyTo(player: PlayerState, profile: StoredProfile | null, keepIdentity = false): void {
    const p = profile ? progressOf(profile) : freshProgress();
    player.level = Math.max(1, Math.floor(p.level));
    player.xp = p.xp;
    player.totalXp = p.totalXp;
    player.wins = Math.floor(p.wins);
    player.lifetimeWins = Math.max(Math.floor(p.lifetimeWins), player.wins);
    player.rebirths = Math.floor(p.rebirths);
    player.ownedCharacters = (Math.floor(p.ownedCharacters) & ALL_CHARACTER_BITS) | STARTER_CHARACTER_BITS;
    const slot = Math.floor(p.characterSlot);
    player.characterSlot =
      slot >= 1 && slot <= CHARACTER_COUNT && (player.ownedCharacters & (1 << (slot - 1))) !== 0 ? slot : 1;
    player.ownedTrails = (Math.floor(p.ownedTrails) & ALL_TRAIL_BITS) | STARTER_TRAIL_BITS;
    const trail = Math.floor(p.trailId);
    player.trailId = trail >= 0 && trail < TRAIL_COUNT && (player.ownedTrails & (1 << trail)) !== 0 ? trail : 0;
    for (let id = 0; id < CHARM_COUNT; id += 1) player.charms[id] = Math.min(999, Math.floor(p.charms[id] ?? 0));
    player.equippedCharms.clear();
    const worn = new Map<number, number>();
    for (const id of p.equippedCharms.slice(0, MAX_EQUIPPED_CHARMS)) {
      const used = worn.get(id) ?? 0;
      if (id < 0 || id >= CHARM_COUNT || used >= (player.charms[id] ?? 0)) continue;
      worn.set(id, used + 1);
      player.equippedCharms.push(id);
    }
    player.bestStage = Math.floor(p.bestStage);
    player.checkpoint = 0;
    player.playSeconds = p.playSeconds;
    player.shopWindow = p.shopWindow;
    player.shopBought = Math.floor(p.shopBought);
    if (!keepIdentity) {
      player.displayName = profile?.displayName ?? '';
      player.avatarUrl = profile?.avatarUrl ?? '';
    }
  }

  /** Save a live session under a key. Resolves once the write has landed. */
  async save(key: string, player: PlayerState, extras?: MigrationFields): Promise<void> {
    const fields = this.snapshot(player);
    this.remember(key, { ...(this.cache.get(key) ?? {}), ...fields, ...extras } as StoredProfile);
    await storage.put(key, fields, extras);
  }

  /** Create a profile only if the key is free. Throws when storage is unreachable. */
  async insertIfAbsent(key: string, profile: ProfileFields & MigrationFields): Promise<boolean> {
    const inserted = await storage.insertIfAbsent(key, profile);
    if (inserted) this.remember(key, { ...profile });
    return inserted;
  }

  /**
   * RETIRE a guest profile whose progress just became an account's: reset its
   * progress, keep what it held as `migratedSnapshot`, and mark where it went.
   * A retired guest is never migrated again and never ranks on a board.
   */
  async retireGuest(
    guestKey: string,
    accountKey: string,
    snapshot: ProgressFields,
    identity: { displayName: string; avatarUrl: string },
  ): Promise<void> {
    const now = Date.now();
    const fields: ProfileFields = { ...freshProgress(), ...identity, updatedAt: now };
    const extras: MigrationFields = { migratedTo: accountKey, migratedAt: now, migratedSnapshot: snapshot };
    this.remember(guestKey, { ...(this.cache.get(guestKey) ?? {}), ...fields, ...extras } as StoredProfile);
    await storage.put(guestKey, fields, extras);
  }

  flush(timeoutMs?: number): Promise<boolean> {
    return storage.flush(timeoutMs);
  }

  async close(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    await storage.close();
  }

  private remember(key: string, profile: StoredProfile): void {
    const known = this.cache.get(key);
    if (known && known.updatedAt > profile.updatedAt) return;
    this.cache.set(key, profile);
  }

  private async refresh(): Promise<void> {
    try {
      for (const [key, profile] of await storage.loadAll()) this.remember(key, profile);
    } catch (error) {
      logger.warn(SCOPE, `leaderboard cache not refreshed: ${String(error)}`);
    }
  }
}

/** What a brand-new player holds: Level 1, Luffy, no trail, no charms. */
const freshProgress = (): ProgressFields => emptyProgress();

export const profileStore = new ProfileStore();
