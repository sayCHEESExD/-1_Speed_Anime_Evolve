import type { MapSchema } from '@colyseus/schema';
import type { AvatarAppearance, AvatarProportions } from '@anime/shared';

/**
 * Client-side TYPE mirror of the server's Colyseus schema.
 *
 * Types only - colyseus.js builds the concrete schema instances at runtime
 * from the handshake reflection.
 */
export interface NetPlayerState {
  sessionId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  grounded: boolean;
  jumpLatched: boolean;
  jumpCount: number;
  flipCount: number;
  runTime: number;
  airJumpsUsed: number;
  coyote: number;
  mode: number;
  wallNx: number;
  wallNz: number;
  modeTime: number;
  regrab: number;
  regrabNx: number;
  regrabNz: number;
  dead: boolean;
  lastInputSeq: number;
  speed: number;

  displayName: string;
  avatarUrl: string;
  /** The Bloxity avatar they are drawn as, while they wear slot 0. */
  avatar?: AvatarAppearance & AvatarProportions;

  level: number;
  xp: number;
  xpNeeded: number;
  totalXp: number;
  levelCap: number;
  rebirths: number;
  wins: number;
  lifetimeWins: number;
  xpPerStride: number;
  multiplier: number;
  maxSpeed: number;
  moveSpeed: number;
  jumpVelocity: number;

  characterSlot: number;
  ownedCharacters: number;
  trailId: number;
  ownedTrails: number;
  charms: ArrayLike<number>;
  equippedCharms: ArrayLike<number>;
  shopBought: number;
  shopWindow: number;

  bestStage: number;
  checkpoint: number;
  treadmill: number;
  playSeconds: number;
  sessionSeconds: number;
  giftsClaimed: number;
  ready: boolean;
}

export interface NetLeaderEntry {
  handle: string;
  name: string;
  avatarUrl: string;
  value: number;
}

export interface NetLeaderboardState {
  wins: ArrayLike<NetLeaderEntry>;
  playtime: ArrayLike<NetLeaderEntry>;
  rebirths: ArrayLike<NetLeaderEntry>;
}

export interface NetGameState {
  players: MapSchema<NetPlayerState>;
  elapsed: number;
  shopWindow: number;
  shopSecondsLeft: number;
  leaderboard: NetLeaderboardState;
}

/** A leaderboard flattened into plain data, ready to draw. */
export interface LeaderboardSnapshot {
  wins: readonly NetLeaderEntry[];
  playtime: readonly NetLeaderEntry[];
  rebirths: readonly NetLeaderEntry[];
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
