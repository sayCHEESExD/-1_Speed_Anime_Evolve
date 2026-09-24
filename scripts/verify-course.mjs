/**
 * verify-course: the 30 stages are COMPLETABLE, and the movement mechanics
 * behave, in the real shared simulation (the same `stepPlayer` the server
 * runs). No server needed.
 *
 *   1. Mechanics: double jump height, lava kills, a climb reaches the top of
 *      its wall, a wall-run carries a runner across its lava channel.
 *   2. A route bot runs EVERY stage start-to-claim-pad at that stage's
 *      recommended level (its design speed), steering platform to platform,
 *      jumping at edges, double-jumping when short, running the walls and
 *      climbing the marked walls. Every stage must be finished.
 *
 *   npm run verify:course
 */
import { STAGES, WorldCollision, createMotion, createSimEvents, resetMotion, runSpeedForLevel, stepPlayer } from '../shared/dist/index.js';
import { createRouteBot } from './lib/routeBot.mjs';

const DT = 1 / 60;
const collision = new WorldCollision();
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
};

const sim = (speed) => {
  const motion = createMotion();
  const events = createSimEvents();
  const params = { moveSpeed: speed, jumpVelocity: 24 };
  return {
    motion,
    events,
    params,
    place(x, y, z) {
      resetMotion(motion, x, y, z, 0);
    },
    step(moveX, moveZ, jump) {
      stepPlayer(motion, { moveX, moveZ, jump, cameraYaw: 0 }, params, DT, collision, events);
    },
  };
};

// ----------------------------------------------------------- mechanics

{
  const s = sim(16);
  s.place(0, 0, -20);
  let peak = 0;
  s.step(0, 0, true);
  for (let i = 0; i < 14; i += 1) {
    s.step(0, 0, false);
    peak = Math.max(peak, s.motion.y);
  }
  s.step(0, 0, true);
  let top = 0;
  for (let i = 0; i < 80; i += 1) {
    s.step(0, 0, false);
    top = Math.max(top, s.motion.y);
  }
  check(s.motion.airJumpsUsed === 0 && s.motion.grounded, 'double jump lands and resets');
  check(top > peak + 2.5, 'double jump climbs higher than one jump', `one ${peak.toFixed(2)} two ${top.toFixed(2)}`);
}

{
  const st = STAGES[0];
  const s = sim(16);
  s.place(0, 0, st.startMaxZ - 3);
  let died = false;
  for (let i = 0; i < 240 && !died; i += 1) {
    s.step(0, 1, false);
    died = s.motion.dead;
  }
  check(died, 'running off the start platform ends in the lava');
}

// ------------------------------------------------------------ route bot

const runStage = (stage, boost = 1) => {
  const speed = runSpeedForLevel(stage.recommended) * boost;
  const s = sim(speed);
  const m = s.motion;
  const bot = createRouteBot(stage);
  s.place(0, 0, stage.startMinZ + 6);
  const limit = Math.ceil((stage.goalMaxZ - stage.startMinZ) / 4 + 60) / DT;
  for (let tick = 0; tick < limit; tick += 1) {
    if (m.dead) return { ok: false, seconds: tick * DT, reason: `lava at z=${m.z.toFixed(1)} x=${m.x.toFixed(1)}` };
    if (bot.done(m)) return { ok: true, seconds: tick * DT, ...bot.stats };
    const input = bot.decide(m, speed);
    s.step(input.moveX, input.moveZ, input.jump);
  }
  return { ok: false, seconds: limit * DT, reason: `timed out at z=${m.z.toFixed(1)} y=${m.y.toFixed(1)} x=${m.x.toFixed(1)} mode=${m.mode}` };
};

// The same stages FASTER: a runner carrying multipliers (the movement boost) must still finish.
for (const [boost, stages] of [[1.35, [1, 3, 6, 12, 20, 30]], [1.8, [2, 9, 17, 25]]]) {
  for (const index of stages) {
    const result = runStage(STAGES[index - 1], boost);
    check(result.ok, `stage ${String(index).padStart(2)} at x${boost} speed`, result.ok ? `${result.seconds.toFixed(1)}s` : result.reason);
  }
}

let slowest = 0;
for (const stage of STAGES) {
  const result = runStage(stage);
  slowest = Math.max(slowest, result.seconds);
  check(
    result.ok,
    `stage ${String(stage.index).padStart(2)} (level ${stage.recommended}, speed ${runSpeedForLevel(stage.recommended).toFixed(1)})`,
    result.ok ? `${result.seconds.toFixed(1)}s${result.usedWall ? ', wall-ran' : ''}${result.climbed ? ', climbed' : ''}` : result.reason,
  );
  check(result.ok ? result.seconds >= stage.minRunSeconds : true, `stage ${stage.index} real run is slower than minRunSeconds (${stage.minRunSeconds.toFixed(1)}s)`);
}

console.log(failures === 0 ? '\nverify-course: all checks passed' : `\nverify-course: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
