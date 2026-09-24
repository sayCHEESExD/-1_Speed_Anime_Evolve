/**
 * verify-run: a real player's first session, played by the route bot against
 * a RUNNING server, over the network, in real time.
 *
 *   - Stage 1 is run and claimed three times and Stage 2 once: every claim is
 *     paid by the SERVER from its own position (the client never asks), the
 *     runner is sent home, and the next stage unlocks in Teleport.
 *   - Running pays Speed XP; the level and the run speed follow it.
 *   - Falling into the lava sends the runner back to the spawn (no checkpoints).
 *   - With 5 Wins the runner evolves into Deku (x1.25), the Wins are spent,
 *     and a RECONNECT restores Deku, the Wins, the level and the stages.
 *
 * The bot predicts with the shared simulation and reconciles to the server's
 * motion exactly as the game client does.
 *
 * Needs a running server (`npm run dev`), default ws://localhost:2591.
 */
import { Client } from 'colyseus.js';
import * as S from '../shared/dist/index.js';
import { createRouteBot } from './lib/routeBot.mjs';

const ENDPOINT = process.env.ENDPOINT ?? `ws://localhost:${S.DEFAULT_SERVER_PORT}`;
const DT = 1 / 60;
let failures = 0;
const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const collision = new S.WorldCollision();
const MOTION_FIELDS = [
  ['x', 'x'], ['y', 'y'], ['z', 'z'], ['vx', 'velocityX'], ['vy', 'velocityY'], ['vz', 'velocityZ'], ['yaw', 'rotationY'],
  ['grounded', 'grounded'], ['jumpLatched', 'jumpLatched'], ['jumpCount', 'jumpCount'], ['flipCount', 'flipCount'],
  ['runTime', 'runTime'], ['airJumpsUsed', 'airJumpsUsed'], ['coyote', 'coyote'], ['mode', 'mode'], ['wallNx', 'wallNx'],
  ['wallNz', 'wallNz'], ['modeTime', 'modeTime'], ['regrab', 'regrab'], ['regrabNx', 'regrabNx'], ['regrabNz', 'regrabNz'], ['dead', 'dead'],
];

const join = async (playerId) => {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate(S.ROOM_NAME, { playerId });
  room.events = [];
  for (const type of ['respawn', 'stageAwarded', 'notice', 'authState']) room.onMessage(type, (message) => room.events.push({ type, message }));
  room.seq = 0;
  const started = Date.now();
  while (!room.state?.players?.get(room.sessionId)) {
    if (Date.now() - started > 5000) throw new Error('no state');
    await sleep(20);
  }
  return room;
};

const me = (room) => room.state.players.get(room.sessionId);
const lastEvent = (room, type) => [...room.events].reverse().find((event) => event.type === type)?.message;
const waitFor = async (predicate, label, ms = 6000) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const value = predicate();
    if (value) return value;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${label}`);
};

/** Teleport, then play a stage with the bot until the server pays it (or the lava wins). */
const playStage = async (room, index) => {
  const stage = S.stageByIndex(index);
  const eventsBefore = room.events.length;
  room.send(S.MessageType.Teleport, { to: `stage${index}` });
  const placed = await waitFor(() => room.events.slice(eventsBefore).find((e) => e.type === 'respawn')?.message, 'the stage teleport');
  const motion = S.createMotion();
  S.resetMotion(motion, placed.x, placed.y, placed.z, placed.rotationY);
  const events = S.createSimEvents();
  const params = S.createSimParams();
  const pending = [];
  let acked = -1;
  const bot = createRouteBot(stage);
  const started = performance.now();
  let steps = 0;
  const limitMs = ((stage.goalMaxZ - stage.startMinZ) / 4 + 40) * 1000;
  while (performance.now() - started < limitMs) {
    const self = me(room);
    params.moveSpeed = self.moveSpeed;
    params.jumpVelocity = self.jumpVelocity;
    // Reconcile to every new authoritative state, then replay what it has not seen.
    if (self.lastInputSeq !== acked && self.lastInputSeq > 0) {
      acked = self.lastInputSeq;
      for (const [local, remote] of MOTION_FIELDS) motion[local] = self[remote];
      while (pending.length && pending[0].seq <= acked) pending.shift();
      for (const entry of pending) S.stepPlayer(motion, entry.input, params, DT, collision, events);
    }
    const awarded = room.events.slice(eventsBefore).find((e) => e.type === 'stageAwarded');
    if (awarded) return { ok: true, seconds: (performance.now() - started) / 1000, wins: awarded.message.wins, stats: bot.stats };
    if (self.dead) return { ok: false, reason: `lava at z=${self.z.toFixed(1)}` };
    // Real time: as many 60 Hz steps as the clock says are due.
    const due = Math.floor(((performance.now() - started) / 1000) / DT);
    let sent = 0;
    while (steps < due && sent < 4) {
      const input = bot.decide(motion, params.moveSpeed);
      room.seq += 1;
      steps += 1;
      sent += 1;
      room.send(S.MessageType.Move, { seq: room.seq, dt: DT, ...input });
      S.stepPlayer(motion, input, params, DT, collision, events);
      pending.push({ seq: room.seq, input });
    }
    await sleep(8);
  }
  return { ok: false, reason: `timed out at z=${me(room).z.toFixed(1)}` };
};

/** Distance the SERVER moved the runner in 1.2 s of running on the spawn plaza (sprint included). */
const measureRun = async (room) => {
  const before = room.events.length;
  room.send(S.MessageType.Teleport, { to: 'spawn' });
  await waitFor(() => room.events.slice(before).some((e) => e.type === 'respawn'), 'spawn');
  await sleep(300);
  const z0 = me(room).z;
  for (let i = 0; i < 72; i += 1) {
    room.seq += 1;
    room.send(S.MessageType.Move, { seq: room.seq, dt: DT, moveX: 0, moveZ: 1, jump: false, cameraYaw: 0 });
    await sleep(1000 / 60);
  }
  await sleep(300);
  return { distance: me(room).z - z0, speed: me(room).moveSpeed, level: me(room).level };
};

const stamp = Date.now().toString(36);
const playerId = `run-${stamp}`;
console.log(`verify-run (${ENDPOINT})`);
let room = await join(playerId);
check(me(room).characterSlot === 1 && me(room).level === 1, 'a new runner starts as Luffy at Level 1');
const fresh = await measureRun(room);
check(Math.abs(fresh.speed - 16) < 0.01, `Level 1 runs at 16 (server moveSpeed ${fresh.speed.toFixed(2)}; ran ${fresh.distance.toFixed(1)} in 1.2 s)`);

// Locked stages cannot be teleported to.
room.send(S.MessageType.Teleport, { to: 'stage3' });
await sleep(400);
check(S.stageAt(me(room).z) === 0, 'Stage 3 is locked before Stage 2 is claimed');

let expectedWins = 0;
for (const index of [1, 1, 1, 2]) {
  const result = await playStage(room, index);
  check(result.ok, `Stage ${index} run and claimed${result.ok ? ` in ${result.seconds.toFixed(1)}s (+${result.wins} Win${result.wins === 1 ? '' : 's'})` : `: ${result.reason}`}`);
  if (!result.ok) break;
  expectedWins += S.stageReward(index);
  await waitFor(() => me(room).wins === expectedWins, `wins ${expectedWins}`);
  await waitFor(() => lastEvent(room, 'respawn')?.reason === 'claimed', 'the trip home');
  const home = await waitFor(() => S.stageAt(me(room).z) === 0, 'the runner at the spawn').catch(() => false);
  check(home, 'the claim sends the runner home to the spawn');
}
check(me(room).bestStage === 2, `bestStage is 2 (${me(room).bestStage})`);
check(me(room).totalXp > 100 && me(room).level > 1, `running paid Speed XP (${Math.floor(me(room).totalXp)} XP, Level ${me(room).level})`);
check(me(room).moveSpeed > 16, `the level raised the run speed (${me(room).moveSpeed.toFixed(1)})`);
const trained = await measureRun(room);
check(trained.distance > fresh.distance * 1.08, `at Level ${trained.level} the SERVER moves the runner physically further: ${trained.distance.toFixed(1)} vs ${fresh.distance.toFixed(1)} in the same 1.2 s`);

// Lava: off the side of Stage 1's start platform.
{
  const before = room.events.length;
  room.send(S.MessageType.Teleport, { to: 'stage1' });
  await waitFor(() => room.events.slice(before).some((e) => e.type === 'respawn'), 'stage 1 teleport');
  // Budgeted in SIMULATED time (the start platform is wide), with a wall-clock backstop.
  const start = Date.now();
  let simulated = 0;
  while (simulated < 8 && Date.now() - start < 20_000 && !room.events.slice(before).some((e) => e.type === 'respawn' && e.message.reason === 'lava')) {
    simulated += DT;
    room.seq += 1;
    room.send(S.MessageType.Move, { seq: room.seq, dt: DT, moveX: -1, moveZ: 0, jump: false, cameraYaw: 0 });
    await sleep(1000 / 60);
  }
  const lava = room.events.slice(before).find((e) => e.type === 'respawn' && e.message.reason === 'lava')?.message;
  check(!!lava && Math.abs(lava.z - S.SPAWN.z) < 0.01 && Math.abs(lava.x - S.SPAWN.x) < 0.01, 'the lava sends the runner back to the spawn, not a checkpoint');
}

// Evolve with the Wins.
check(me(room).wins >= 5, `enough Wins to evolve (${me(room).wins})`);
room.send(S.MessageType.Evolve, {});
await waitFor(() => me(room).characterSlot === 2, 'the evolution');
check(me(room).ownedCharacters === 3 && me(room).wins === expectedWins - 5, 'Deku is owned and worn; 5 Wins were spent');
check(Math.abs(me(room).multiplier - 1.25) < 1e-6, `Deku's x1.25 reaches the Speed multiplier (${me(room).multiplier})`);
const dekuSpeed = me(room).moveSpeed;
check(dekuSpeed > trained.speed, `and Deku runs physically faster than Luffy at the same level (${dekuSpeed.toFixed(2)} vs ${trained.speed.toFixed(2)})`);
room.send(S.MessageType.EquipCharacter, { slot: 1 });
await waitFor(() => me(room).characterSlot === 1, 'wearing Luffy again');
check(Math.abs(me(room).multiplier - 1) < 1e-6, 'wearing Luffy again drops the multiplier back to x1');
room.send(S.MessageType.EquipCharacter, { slot: 2 });
await waitFor(() => me(room).characterSlot === 2, 'wearing Deku');
room.send(S.MessageType.EquipCharacter, { slot: 7 });
await sleep(300);
check(me(room).characterSlot === 2, 'an unowned character cannot be worn');

// Reconnect: everything restored.
const snapshot = { ...['wins', 'level', 'xp', 'bestStage', 'characterSlot', 'ownedCharacters', 'rebirths'].reduce((o, k) => ({ ...o, [k]: me(room)[k] }), {}) };
await room.leave(true);
await sleep(500);
room = await join(playerId);
const restored = me(room);
check(
  restored.characterSlot === 2 && restored.ownedCharacters === snapshot.ownedCharacters && restored.wins === snapshot.wins && restored.bestStage === 2 && restored.level === snapshot.level,
  `a reconnect restores Deku, ${restored.wins} Wins, Level ${restored.level} and Stage 2`,
);
room.send(S.MessageType.Teleport, { to: 'stage3' });
await waitFor(() => S.stageAt(me(room).z) === 3, 'the stage 3 teleport');
check(true, 'Stage 3 unlocked in Teleport after claiming Stage 2');
await room.leave(true);

console.log(failures === 0 ? '\nverify-run: all checks passed' : `\nverify-run: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
