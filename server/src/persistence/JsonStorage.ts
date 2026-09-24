import { join } from 'node:path';
import { logger } from '../util/logger.js';
import { AtomicJsonFile } from './AtomicJsonFile.js';
import type { ProfileStorage } from './Storage.js';
import {
  CLEARABLE_FIELDS,
  coerceProfile,
  type MigrationFields,
  type ProfileFields,
  type StoredProfile,
} from './StoredProfile.js';

const SCOPE = 'persistence';

type ProfileDocument = Record<string, StoredProfile>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * THE DEV STORE: `profiles.json` under the data directory, held in memory and
 * written atomically per change.
 *
 * Same per-key contract as the database, so the room above cannot tell them
 * apart - but a single process is the only writer here, which is why a
 * whole-document file is acceptable in a way it never would be for Mongo.
 */
export class JsonStorage implements ProfileStorage {
  readonly kind = 'json' as const;

  private readonly profiles = new Map<string, StoredProfile>();
  private readonly profileFile: AtomicJsonFile<ProfileDocument>;

  constructor(directory: string) {
    this.profileFile = new AtomicJsonFile<ProfileDocument>(join(directory, 'profiles.json'));
  }

  async open(): Promise<void> {
    try {
      const raw = this.profileFile.load();
      if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw)) {
          const profile = coerceProfile(value);
          if (profile) this.profiles.set(key, profile);
        }
      }
      logger.info(SCOPE, `json store: ${this.profiles.size} profile(s) in ${this.profileFile.location}`);
    } catch (error) {
      logger.error(SCOPE, `json store: could not read profiles:`, error);
    }
  }

  async get(key: string): Promise<StoredProfile | null> {
    const profile = this.profiles.get(key);
    return profile ? clone(profile) : null;
  }

  async put(key: string, fields: ProfileFields, extras: MigrationFields = {}): Promise<void> {
    const existing = this.profiles.get(key) ?? ({} as StoredProfile);
    const merged: StoredProfile = { ...existing, ...fields, ...extras };
    for (const field of CLEARABLE_FIELDS) {
      if (!merged[field]) delete merged[field];
    }
    this.profiles.set(key, merged);
    await this.profileFile.write(this.profileDocument());
  }

  async insertIfAbsent(key: string, profile: ProfileFields & MigrationFields): Promise<boolean> {
    if (this.profiles.has(key)) return false;
    const stored: StoredProfile = { ...profile };
    for (const field of CLEARABLE_FIELDS) {
      if (!stored[field]) delete stored[field];
    }
    this.profiles.set(key, stored);
    await this.profileFile.write(this.profileDocument());
    return true;
  }

  async loadAll(): Promise<Map<string, StoredProfile>> {
    const out = new Map<string, StoredProfile>();
    for (const [key, profile] of this.profiles) out.set(key, clone(profile));
    return out;
  }

  async flush(timeoutMs = 10_000): Promise<boolean> {
    return this.profileFile.drain(timeoutMs);
  }

  /** The exit path: blocking, so it completes before the process goes. */
  flushSync(): void {
    this.profileFile.flushSync();
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private profileDocument(): ProfileDocument {
    return Object.fromEntries(this.profiles);
  }
}
