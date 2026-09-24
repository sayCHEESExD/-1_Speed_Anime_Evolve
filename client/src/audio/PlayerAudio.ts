import type { AudioManager } from './AudioManager.js';

const MIN_AUDIBLE_SPEED = 2.5;
const STRIDE_DISTANCE = 2.6;
const MAX_STEPS_PER_SECOND = 7;

export interface PlayerAudioInput {
  readonly horizontalSpeed: number;
  readonly topSpeed: number;
  readonly isGrounded: boolean;
  readonly running: boolean;
  readonly jumpedEdge: boolean;
  readonly landedEdge: boolean;
  readonly sprintEdge: boolean;
}

/**
 * The local player's movement sounds: the supplied footsteps looped while
 * running (their rate following the pace), the jump, the landing and the
 * whoosh of the sprint kicking in.
 */
export class PlayerAudio {
  private stride = 0;
  private sinceBeat = 0;

  constructor(private readonly audio: AudioManager) {}

  update(delta: number, player: PlayerAudioInput): void {
    if (player.jumpedEdge) this.audio.play('jump');
    if (player.landedEdge) this.audio.play('land', 0.7);
    if (player.sprintEdge) this.audio.play('whoosh');

    const active = player.running || (player.isGrounded && player.horizontalSpeed >= MIN_AUDIBLE_SPEED);
    const pace = player.running ? 0.6 : player.horizontalSpeed / Math.max(16, player.topSpeed);
    if (this.audio.setFootsteps(active, pace)) return;

    // No recording: a synthesised footfall per stride.
    this.sinceBeat += delta;
    if (!active) {
      this.stride = 0;
      return;
    }
    this.stride += Math.max(player.horizontalSpeed, 12) * delta;
    if (this.stride < STRIDE_DISTANCE) return;
    this.stride = 0;
    if (this.sinceBeat < 1 / MAX_STEPS_PER_SECOND) return;
    this.sinceBeat = 0;
    this.audio.play('step', 0.5);
  }
}
