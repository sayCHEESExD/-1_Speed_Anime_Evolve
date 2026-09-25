/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'animeevolve';

/**
 * Default server port. Override with the PORT env var on the server.
 *
 * Deliberately NOT 2567: the earlier games in this series occupy 2567-2586 on
 * the same machine, and sharing a port means whichever server starts first
 * silently serves both clients.
 */
export const DEFAULT_SERVER_PORT = 2591;

/**
 * Most players in ONE room.
 *
 * The matchmaker locks a room at this figure and opens another, so a
 * sixteenth player gets a new room rather than a refusal.
 */
export const MAX_PLAYERS_PER_ROOM = 15;

/**
 * How many OTHER players are drawn at once. A RENDERING limit only: every
 * player in the room is tracked and synchronised on every patch.
 */
export const VISIBLE_REMOTE_PLAYERS = 10;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;

/** Milliseconds between server ticks. */
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/**
 * Client->server and server->client message identifiers.
 *
 * A const object rather than an enum so it survives `verbatimModuleSyntax`.
 */
export const MessageType = {
  /** Client -> server: one frame of INPUT. Never a transform. */
  Move: 'move',
  /** Server -> client: authoritative placement. */
  Respawn: 'respawn',
  /** Client -> server: "put me back at the spawn". */
  RequestRespawn: 'requestRespawn',
  /** Client -> server: teleport to a named, UNLOCKED place. */
  Teleport: 'teleport',
  /** Server -> client: a stage reward was granted. */
  StageAwarded: 'stageAwarded',
  /** Client -> server: evolve into the next character (spends Wins). */
  Evolve: 'evolve',
  /** Client -> server: wear an owned character. */
  EquipCharacter: 'equipCharacter',
  /** Client -> server: buy or equip a trail. */
  TrailAction: 'trailAction',
  /** Client -> server: buy / equip / unequip charms. */
  CharmAction: 'charmAction',
  /** Client -> server: open a playtime gift. */
  ClaimGift: 'claimGift',
  /** Client -> server: "rebirth me". Carries nothing. */
  Rebirth: 'rebirth',
  /** Server -> client: the outcome of a request, for feedback. */
  Notice: 'notice',
  /** Client -> server: the player's Bloxity DISPLAY NAME and portrait. */
  SetIdentity: 'setIdentity',
  /** Client -> server: the portal's game TOKEN, or null when signed out. */
  SetAuth: 'setAuth',
  /** Client -> server: the player's Bloxity avatar look (cosmetic ids + proportions). */
  SetAvatar: 'setAvatar',
  /** Server -> client: whose progress this session is now playing on. */
  AuthState: 'authState',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
