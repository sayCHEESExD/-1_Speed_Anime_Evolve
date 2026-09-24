import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { LEADERBOARD_SIZE } from '@anime/shared';
import { PlayerState } from './PlayerState.js';

/** One row of one board. */
export class LeaderEntry extends Schema {
  /** The row's KEY, derived from the account id. NEVER DRAWN. */
  @type('string') handle = '';
  /** THE NAME THE BOARD SHOWS: the portal's display name, or empty. */
  @type('string') name = '';
  @type('string') avatarUrl = '';
  @type('float64') value = 0;
}

/** The three boards on the left of the spawn. Fixed-length, written in place. */
export class LeaderboardState extends Schema {
  @type([LeaderEntry]) wins = rows();
  @type([LeaderEntry]) playtime = rows();
  @type([LeaderEntry]) rebirths = rows();
}

const rows = (): ArraySchema<LeaderEntry> => {
  const list = new ArraySchema<LeaderEntry>();
  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) list.push(new LeaderEntry());
  return list;
};

/** Root replicated state for one room. */
export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type('float64') elapsed = 0;
  /** The charm shop's restock window, and seconds until the next. */
  @type('float64') shopWindow = 0;
  @type('float32') shopSecondsLeft = 0;
  @type(LeaderboardState) leaderboard = new LeaderboardState();
}
