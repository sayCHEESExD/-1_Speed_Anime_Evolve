import type { MigrationFields, ProfileFields, StoredProfile } from './StoredProfile.js';

export type StorageKind = 'mongo' | 'json';

/**
 * WHERE PROFILES LIVE. The contract is PER KEY, because several
 * pods share one database and nothing may write back a snapshot of a whole
 * map that another pod has since changed.
 *
 * Reads THROW when storage cannot be reached: a failed read is not "no
 * profile", and a caller that cannot tell the difference would let a player
 * in on an empty profile that autosaves over their real one.
 *
 * `put` never drops a write. It queues the latest snapshot per key, retries
 * on a backoff for as long as it takes, and resolves once the write has
 * landed.
 */
export interface ProfileStorage {
  readonly kind: StorageKind;

  /** Connect / load. Logs loudly on failure and DOES NOT THROW: boot must succeed. */
  open(): Promise<void>;

  /** The profile under a key, or null when there is none. THROWS on failure. */
  get(key: string): Promise<StoredProfile | null>;

  /**
   * Write a save. Resolves when durable. `extras` are set alongside; the
   * known clearable fields are unset when empty; every other stored field is
   * left as it was.
   */
  put(key: string, fields: ProfileFields, extras?: MigrationFields): Promise<void>;

  /** Create a profile only if the key is free. THROWS on failure. */
  insertIfAbsent(key: string, profile: ProfileFields & MigrationFields): Promise<boolean>;

  /** Every profile, for the leaderboards' cache. THROWS on failure. */
  loadAll(): Promise<Map<string, StoredProfile>>;

  /** Wait for queued writes. False if some were still outstanding at the deadline. */
  flush(timeoutMs?: number): Promise<boolean>;

  close(): Promise<void>;
}
