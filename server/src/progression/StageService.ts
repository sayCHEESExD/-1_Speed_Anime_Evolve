import { START_HALF_X, onPad, stageAt, stageByIndex, type StageLayout } from '@anime/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

interface Run {
  /** When the player reached the current run's start (ms). */
  enteredAt: number;
  /** A claim is being paid: no second one until the player is placed again. */
  claimed: boolean;
}

/**
 * STAGES: runs and claims, decided from the SERVER's position alone.
 *
 * There are NO CHECKPOINTS: a death always sends the player back to the spawn.
 * Standing on a stage's start platform starts a RUN of it (`player.checkpoint`
 * records which stage, for claims only). Standing on its goal's claim pad pays its Wins
 * - but only for the stage whose start was reached in this run, and no sooner
 * than a real run of it could take (`minRunSeconds`).
 */
export class StageService {
  private readonly runs = new Map<string, Run>();

  forget(sessionId: string): void {
    this.runs.delete(sessionId);
  }

  /** A new placement: the claim latch opens again, and a stage placement (a teleport) starts its run. */
  placed(player: PlayerState, stage: number): void {
    player.checkpoint = stage;
    this.runs.set(player.sessionId, { enteredAt: Date.now(), claimed: false });
  }

  /** A claim due this tick, if any. */
  tick(player: PlayerState): StageLayout | null {
    if (player.dead || !player.grounded) return null;
    const index = stageAt(player.z);
    const stage = stageByIndex(index);
    if (!stage) return null;
    let run = this.runs.get(player.sessionId);
    if (!run) {
      run = { enteredAt: Date.now(), claimed: false };
      this.runs.set(player.sessionId, run);
    }
    const onStart = player.z >= stage.startMinZ && player.z <= stage.startMaxZ && Math.abs(player.x) <= START_HALF_X + 0.5;
    if (onStart && player.checkpoint !== index) {
      player.checkpoint = index;
      run.enteredAt = Date.now();
      run.claimed = false;
    }
    if (run.claimed || player.checkpoint !== index) return null;
    if (!onPad(stage.claimPad, player.x, player.y, player.z)) return null;
    if (Date.now() - run.enteredAt < stage.minRunSeconds * 1000) return null;
    run.claimed = true;
    return stage;
  }
}
