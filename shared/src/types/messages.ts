/**
 * Client -> server input (MessageType.Move).
 *
 * INPUT ONLY. No position, velocity or target: the server simulates movement
 * from intent and owns the result.
 */
export interface MoveMessage {
  /** Monotonically increasing input sequence number. */
  seq: number;
  /** Seconds this input covers. Clamped and rate-limited server-side. */
  dt: number;
  /** -1..1, camera-relative. */
  moveX: number;
  /** -1..1, camera-relative. */
  moveZ: number;
  /** The jump control, held. Only a fresh press jumps. */
  jump: boolean;
  /** Yaw the camera faced: movement is camera-relative. */
  cameraYaw: number;
}

/** Why a player was placed. */
export type RespawnReason = 'manual' | 'join' | 'teleport' | 'rebirth' | 'lava' | 'claimed';

/** Server -> client authoritative placement (MessageType.Respawn). */
export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

export interface TeleportMessage {
  /** A `TeleportId` (spawn, treadmills, shop, boards) or `stageN`. */
  to: string;
}

/** Server -> client: a stage reward landed. Presentation only. */
export interface StageAwardedMessage {
  stage: number;
  wins: number;
  total: number;
}

export interface EquipCharacterMessage {
  slot: number;
}

export type TrailActionKind = 'buy' | 'equip';

export interface TrailActionMessage {
  action: TrailActionKind;
  trail: number;
}

export type CharmActionKind = 'buy' | 'equip' | 'unequip' | 'equipBest' | 'unequipAll';

export interface CharmActionMessage {
  action: CharmActionKind;
  /** 'buy': the shop card index. 'equip' / 'unequip': the charm id. */
  value?: number;
}

export interface ClaimGiftMessage {
  index: number;
}

/** Server -> client: what happened to a request, so the UI can say so. */
export interface NoticeMessage {
  kind: 'bought' | 'equipped' | 'refused' | 'rebirth' | 'locked' | 'info' | 'evolved';
  text: string;
}

export interface SetIdentityMessage {
  displayName: string;
  avatarUrl: string;
}

/** Client -> server: the portal's game TOKEN, or null when signed out. */
export interface SetAuthMessage {
  token: string | null;
}

export type AuthStatus = 'account' | 'guest' | 'unavailable';

export interface AuthStateMessage {
  status: AuthStatus;
  note?: string;
}
