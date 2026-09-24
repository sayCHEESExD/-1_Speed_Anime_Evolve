import {
  MAX_SIM_DELTA,
  MODE_CLIMB,
  MODE_WALLRUN,
  WorldCollision,
  createMotion,
  createSimEvents,
  createSimParams,
  horizontalSpeed,
  resetMotion,
  sanitiseInput,
  stepPlayer,
  type MoveMessage,
  type PlayerMotion,
  type SimEvents,
  type SimParams,
} from '@anime/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** Simulated seconds a client may bank per real second. */
const MAX_TIME_BUDGET_RATIO = 1.5;
/** Seconds of simulated time a fresh client starts with, to absorb bursts. */
const INITIAL_BUDGET = 0.5;
/** Largest jump in sequence number the server will follow. */
const MAX_SEQ_JUMP = 600;

export type RejectReason = 'malformed' | 'stale-seq' | 'seq-jump' | 'budget';

interface Sim {
  motion: PlayerMotion;
  events: SimEvents;
  params: SimParams;
  lastSeq: number;
  budget: number;
  lastRefill: number;
}

/** What the last accepted step did, for the Speed service. */
export interface StepReport {
  /** Distance that counts as running: along the ground, along a wall, up a climb. */
  runDistance: number;
  died: boolean;
}

/**
 * Server-authoritative movement.
 *
 * The client sends INPUT and nothing else; this runs the shared simulation and
 * the result becomes the player's replicated motion - EVERY field of
 * `PlayerMotion`, so a client that replays its unacknowledged inputs starts
 * from exactly what the server had. The run speed and the jump come from the
 * player's SERVER state, never from the message.
 */
export class MovementService {
  private readonly sims = new Map<string, Sim>();
  readonly collision = new WorldCollision();
  readonly report: StepReport = { runDistance: 0, died: false };

  private lastReject: RejectReason | null = null;

  initialise(player: PlayerState): void {
    const sim: Sim = {
      motion: createMotion(),
      events: createSimEvents(),
      params: createSimParams(),
      lastSeq: 0,
      budget: INITIAL_BUDGET,
      lastRefill: Date.now(),
    };
    this.sims.set(player.sessionId, sim);
    this.publish(player, sim);
  }

  has(sessionId: string): boolean {
    return this.sims.has(sessionId);
  }

  forget(sessionId: string): void {
    this.sims.delete(sessionId);
  }

  get rejectReason(): RejectReason | null {
    return this.lastReject;
  }

  /** Teleport authoritatively. Only the server calls this. */
  teleport(sessionId: string, player: PlayerState, x: number, y: number, z: number, yaw: number): void {
    const sim = this.sims.get(sessionId);
    if (!sim) return;
    resetMotion(sim.motion, x, y, z, yaw);
    this.publish(player, sim);
  }

  /** Consume one input and advance the authoritative simulation. */
  applyInput(sessionId: string, player: PlayerState, message: MoveMessage): boolean {
    this.lastReject = null;
    this.report.runDistance = 0;
    this.report.died = false;
    const sim = this.sims.get(sessionId);
    if (!sim) return false;

    const seq = message?.seq;
    const dt = message?.dt;
    if (typeof seq !== 'number' || !Number.isFinite(seq) || typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) {
      this.lastReject = 'malformed';
      return false;
    }
    if (seq <= sim.lastSeq) {
      this.lastReject = 'stale-seq';
      return false;
    }
    if (seq > sim.lastSeq + MAX_SEQ_JUMP) {
      this.lastReject = 'seq-jump';
      return false;
    }

    const step = Math.min(dt, MAX_SIM_DELTA);
    this.refill(sim);
    if (step > sim.budget) {
      this.lastReject = 'budget';
      return false;
    }
    sim.budget -= step;
    sim.lastSeq = seq;

    sim.params.moveSpeed = player.moveSpeed;
    sim.params.jumpVelocity = player.jumpVelocity;

    const m = sim.motion;
    const fromX = m.x;
    const fromY = m.y;
    const fromZ = m.z;
    const wasGrounded = m.grounded;
    const wasMode = m.mode;
    stepPlayer(m, sanitiseInput(message), sim.params, step, this.collision, sim.events);

    const across = Math.hypot(m.x - fromX, m.z - fromZ);
    if (m.mode === MODE_CLIMB || wasMode === MODE_CLIMB) this.report.runDistance = Math.abs(m.y - fromY);
    else if ((wasGrounded && m.grounded) || m.mode === MODE_WALLRUN) this.report.runDistance = across;
    this.report.died = sim.events.died;
    this.publish(player, sim);
    return true;
  }

  private publish(player: PlayerState, sim: Sim): void {
    const m = sim.motion;
    player.x = m.x;
    player.y = m.y;
    player.z = m.z;
    player.rotationY = m.yaw;
    player.velocityX = m.vx;
    player.velocityY = m.vy;
    player.velocityZ = m.vz;
    player.grounded = m.grounded;
    player.jumpLatched = m.jumpLatched;
    player.jumpCount = m.jumpCount;
    player.flipCount = m.flipCount;
    player.runTime = m.runTime;
    player.airJumpsUsed = m.airJumpsUsed;
    player.coyote = m.coyote;
    player.mode = m.mode;
    player.wallNx = m.wallNx;
    player.wallNz = m.wallNz;
    player.modeTime = m.modeTime;
    player.regrab = m.regrab;
    player.regrabNx = m.regrabNx;
    player.regrabNz = m.regrabNz;
    player.dead = m.dead;
    player.speed = horizontalSpeed(m);
    player.lastInputSeq = sim.lastSeq;
    player.ready = true;
  }

  private refill(sim: Sim): void {
    const now = Date.now();
    const elapsed = Math.max(0, (now - sim.lastRefill) / 1000);
    sim.lastRefill = now;
    sim.budget = Math.min(sim.budget + elapsed * MAX_TIME_BUDGET_RATIO, MAX_SIM_DELTA * 20);
  }
}
