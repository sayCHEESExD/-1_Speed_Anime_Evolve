/**
 * @anime/shared - the single source of truth for anything that must be
 * byte-for-byte identical between the client and the authoritative server.
 *
 * Nothing in here may import from `three`, `colyseus`, or the DOM.
 */
export * from './constants/network.js';
export * from './constants/world.js';
export * from './config/accounts.js';
export * from './config/camera.js';
export * from './config/characters.js';
export * from './config/charms.js';
export * from './config/format.js';
export * from './config/handles.js';
export * from './config/leveling.js';
export * from './config/map.js';
export * from './config/movement.js';
export * from './config/rebirth.js';
export * from './config/rewards.js';
export * from './config/speed.js';
export * from './config/trails.js';
export * from './types/identity.js';
export * from './types/math.js';
export * from './types/messages.js';
export * from './types/player.js';
export * from './sim/WorldCollision.js';
export * from './sim/PlayerSim.js';

/** Largest Wins total that can be held (float64 on the wire, exact to here). */
export const MAX_WINS = Number.MAX_SAFE_INTEGER;
/** Largest Speed XP total held (float64 on the wire; saturates here). */
export const MAX_XP = 1e30;
