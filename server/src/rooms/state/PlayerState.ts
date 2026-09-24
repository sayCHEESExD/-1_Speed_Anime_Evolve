import { ArraySchema, Schema, type } from '@colyseus/schema';
import { CHARM_COUNT, JUMP_VELOCITY, SPAWN, runSpeedForLevel } from '@anime/shared';

const zeros = (length: number): ArraySchema<number> => {
  const list = new ArraySchema<number>();
  for (let i = 0; i < length; i += 1) list.push(0);
  return list;
};

/**
 * Replicated per-player state.
 *
 * Every field is written by the SERVER: the motion block by the authoritative
 * simulation (EVERY field of `PlayerMotion`, so a client replay starts from
 * exactly the server's state), progression and inventories by their own
 * service. Nothing is ever copied from a client message.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  // ---- motion: the whole `PlayerMotion`
  @type('float32') x: number = SPAWN.x;
  @type('float32') y: number = SPAWN.y;
  @type('float32') z: number = SPAWN.z;
  @type('float32') rotationY: number = SPAWN.yaw;
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('boolean') grounded = true;
  @type('boolean') jumpLatched = false;
  @type('uint32') jumpCount = 0;
  @type('uint32') flipCount = 0;
  @type('float32') runTime = 0;
  @type('uint8') airJumpsUsed = 0;
  @type('float32') coyote = 0;
  @type('uint8') mode = 0;
  @type('int8') wallNx = 0;
  @type('int8') wallNz = 0;
  @type('float32') modeTime = 0;
  @type('float32') regrab = 0;
  @type('int8') regrabNx = 0;
  @type('int8') regrabNz = 0;
  @type('boolean') dead = false;
  @type('uint32') lastInputSeq = 0;
  /** Horizontal speed, for remote animation. */
  @type('float32') speed = 0;

  @type('string') displayName = '';
  @type('string') avatarUrl = '';

  // ---- progression: every figure is the server's own
  @type('uint16') level = 1;
  /** XP into the current level. */
  @type('float64') xp = 0;
  /** XP the current level needs. */
  @type('float64') xpNeeded = 0;
  /** Speed XP earned, ever: what the "+N Speed" popups follow. */
  @type('float64') totalXp = 0;
  @type('uint16') levelCap = 15;
  @type('uint32') rebirths = 0;
  /** Written through `Wallet` only. */
  @type('float64') wins = 0;
  @type('float64') lifetimeWins = 0;
  /** Speed XP one stride pays right now. */
  @type('float64') xpPerStride = 1;
  /** Every factor of the Speed formula multiplied: the HUD's boost. */
  @type('float32') multiplier = 1;
  /** The level's max run speed (the Custom Speed box's MAX). */
  @type('float32') maxSpeed: number = runSpeedForLevel(1);
  /** What the simulation runs this player at. */
  @type('float32') moveSpeed: number = runSpeedForLevel(1);
  @type('float32') jumpVelocity = JUMP_VELOCITY;

  @type('uint8') characterSlot = 1;
  @type('uint16') ownedCharacters = 1;
  @type('uint8') trailId = 0;
  @type('uint16') ownedTrails = 1;
  /** Charms held, counted by id. */
  @type(['uint16']) charms = zeros(CHARM_COUNT);
  /** Charm ids worn, up to three. */
  @type(['uint8']) equippedCharms = new ArraySchema<number>();

  /** Cards bought in the current shop window, as a bitmask. */
  @type('uint8') shopBought = 0;
  @type('float64') shopWindow = 0;

  /** Highest stage ever claimed: the Teleport menu reaches one past it. */
  @type('uint8') bestStage = 0;
  /** The stage whose start the player last reached this run (0 = hub). Claims only: deaths always go to the spawn. */
  @type('uint8') checkpoint = 0;
  /** Treadmill underfoot and running (-1 = none). */
  @type('int8') treadmill = -1;

  @type('float64') playSeconds = 0;
  /** Seconds in THIS session: the playtime gifts. */
  @type('float32') sessionSeconds = 0;
  /** Gifts opened this session, as a bitmask. */
  @type('uint16') giftsClaimed = 0;

  /** True once the server has simulated at least one input for this player. */
  @type('boolean') ready = false;
}
