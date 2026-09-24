/**
 * Two real clients in one room: one RUNS, SPRINTS, JUMPS and DOUBLE JUMPS, the
 * other watches it replicate - the server's position, the sprint timer, every
 * jump and flip counted once, the Speed XP the running paid. Then the
 * refusals: nothing is bought or granted without the Wins, the position or
 * the level the server requires.
 *
 * Needs a running server (`npm run dev`), default ws://localhost:2591.
 */
import { Client } from 'colyseus.js';
import * as S from '../shared/dist/index.js';

const ENDPOINT = process.env.ENDPOINT ?? `ws://localhost:${S.DEFAULT_SERVER_PORT}`;
let failures = 0;
const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const join = async (id) => {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate(S.ROOM_NAME, { playerId: id });
  room.notices = [];
  for (const type of ['respawn', 'authState', 'stageAwarded']) room.onMessage(type, () => {});
  room.onMessage('notice', (message) => room.notices.push(message));
  return room;
};

const stamp = Date.now().toString(36);
const runner = await join(`mp-runner-${stamp}`);
const watcher = await join(`mp-watcher-${stamp}`);
await sleep(600);
check(runner.roomId === watcher.roomId, 'both clients share a room');

const self = () => runner.state.players.get(runner.sessionId);
const seen = () => watcher.state.players.get(runner.sessionId);

let seq = 0;
const move = async (seconds, moveX, moveZ, jumpAt = []) => {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    seq += 1;
    runner.send(S.MessageType.Move, { seq, dt: 1 / 60, moveX, moveZ, jump: jumpAt.includes(i), cameraYaw: 0 });
    await sleep(1000 / 60);
  }
};

// Standing still pays nothing.
const idleXp = self().totalXp;
await move(0.5, 0, 0);
await sleep(200);
check(self().totalXp === idleXp, 'standing still pays no Speed XP');

// Running: toward the course, long enough to break into the sprint.
const xpBefore = self().totalXp;
await move(2.6, 0, 1);
await sleep(250);
check(self().z > 20, `the server moved the runner (z ${self().z.toFixed(1)})`);
check(Math.abs(seen().z - self().z) < 0.01 && Math.abs(seen().x - self().x) < 0.01, 'the watcher sees the same position');
check(self().totalXp > xpBefore, `running paid Speed XP (+${(self().totalXp - xpBefore).toFixed(0)})`);
check(seen().runTime >= S.MOVEMENT.sprintDelay, `the watcher sees the sprint (runTime ${seen().runTime.toFixed(2)}s)`);
check(seen().speed > self().moveSpeed * 1.2, `the sprint is faster than the run (${seen().speed.toFixed(1)} vs ${self().moveSpeed.toFixed(1)})`);

// Jump, then a double jump.
const jumpsBefore = seen().jumpCount;
const flipsBefore = seen().flipCount;
await move(1.4, 0, -1, [2, 22]);
await sleep(250);
check(seen().jumpCount === jumpsBefore + 2, `the watcher saw both jumps once each (${seen().jumpCount - jumpsBefore})`);
check(seen().flipCount === flipsBefore + 1, 'the second jump was a double jump (one flip)');

// Physical speed is the server's: level x multipliers, nothing a client can set.
check(Math.abs(self().moveSpeed - S.runSpeedFor(self().level, self().multiplier)) < 1e-3, `the server runs the runner at its level's speed (${self().moveSpeed.toFixed(2)})`);

// Refusals.
runner.send(S.MessageType.Evolve, {});
runner.send(S.MessageType.Rebirth, {});
runner.send(S.MessageType.TrailAction, { action: 'buy', trail: 10 });
runner.send(S.MessageType.CharmAction, { action: 'buy', value: 0 });
runner.send(S.MessageType.CharmAction, { action: 'equip', value: 5 });
runner.send(S.MessageType.ClaimGift, { index: 7 });
runner.send(S.MessageType.Teleport, { to: 'stage9' });
await sleep(500);
const p = self();
check(p.ownedCharacters === 1 && p.characterSlot === 1, 'evolving without Wins is refused');
check(p.rebirths === 0, `a rebirth below the Level ${S.levelCapFor(0)} cap is refused`);
check(p.ownedTrails === 1 && p.trailId === 0, 'a trail without the Wins is refused');
check(Array.from(p.charms).every((n) => n === 0) && p.equippedCharms.length === 0, 'a charm away from the shop, or not owned, is refused');
check(p.giftsClaimed === 0, 'a gift before its time is refused');
check(S.stageAt(p.z) !== 9, 'a locked stage cannot be teleported to');
check(runner.notices.some((n) => n.kind === 'refused' || n.kind === 'locked'), 'the refusals are explained to the player');

// The charm shop is at the back of the spawn: from there the purchase is only a matter of Wins.
runner.send(S.MessageType.Teleport, { to: 'shop' });
await sleep(400);
runner.send(S.MessageType.CharmAction, { action: 'buy', value: 0 });
await sleep(400);
check(runner.notices.some((n) => /costs/.test(n.text)), 'at the shop, a charm without the Wins is refused for its price');

await runner.leave();
await watcher.leave();
console.log(failures === 0 ? '\nmultiplayer OK' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
