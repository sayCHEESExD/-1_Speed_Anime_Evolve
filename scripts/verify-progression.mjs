/**
 * verify-progression: every number the design pins, asserted against the
 * shared config AND the server's own services (run in-process, no network).
 *
 *   npm run verify:progression   (builds shared + server first)
 */
import * as S from '../shared/dist/index.js';
import { ProgressionService } from '../server/dist/progression/ProgressionService.js';
import { SpeedService } from '../server/dist/progression/SpeedService.js';
import { CollectionService } from '../server/dist/progression/CollectionService.js';
import { PlayerState } from '../server/dist/rooms/state/PlayerState.js';

let failures = 0;
const check = (ok, label) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ---------------------------------------------------------------- characters
const CHARACTERS = [
  ['Luffy', 'One Piece', 1.0, 0],
  ['Deku', 'My Hero Academia', 1.25, 5],
  ['Yuji Itadori', 'Jujutsu Kaisen', 1.5, 25],
  ['Naruto', 'Naruto', 1.75, 100],
  ['Tanjiro', 'Demon Slayer', 2.0, 400],
  ['Gon', 'Hunter x Hunter', 2.25, 1_500],
  ['Eren', 'Attack on Titan', 2.5, 5_000],
  ['Asta', 'Black Clover', 2.75, 15_000],
  ['Saitama', 'One Punch Man', 3.0, 50_000],
  ['Goku', 'Dragon Ball', 3.5, 150_000],
  ['Gojo', 'Jujutsu Kaisen', 4.0, 500_000],
  ['Ichigo', 'Bleach', 5.0, 2_000_000],
];
check(S.CHARACTERS.length === 12, '12 character evolutions');
CHARACTERS.forEach(([name, series, mult, cost], i) => {
  const c = S.CHARACTERS[i];
  check(c.name === name && c.series === series && c.multiplier === mult && c.cost === cost, `${i + 1}. ${name} - ${series} - ${mult.toFixed(2)}x - ${cost} Wins`);
});
check(S.nextEvolution(1)?.name === 'Deku' && S.nextEvolution((1 << 12) - 1) === undefined, 'evolution goes in order and ends at Ichigo');
// The starting state: the player's own Bloxity avatar (slot 0), and Luffy is its FREE first evolution.
check(S.AVATAR_SLOT === 0 && S.characterBySlot(0)?.name === 'Your Avatar' && S.ownsCharacter(0, 0), 'a new player IS their Bloxity avatar (slot 0, always owned)');
check(S.characterMultiplierOf(0, 0) === 1 && !S.ownsCharacter(0, 1), 'the avatar runs at x1 and owns no evolution yet');
check(S.nextEvolution(0)?.name === 'Luffy' && S.nextEvolution(0)?.cost === 0, 'the first evolution from the avatar is Luffy, for 0 Wins');

// ------------------------------------------------------------------- rebirth
const rebirthOk = [0, 1, 2, 3, 10, 100].every((r) => near(S.rebirthPower(r), 1 + 0.5 * r) && S.levelCapFor(r) === 15 + 15 * r);
check(near(S.rebirthPower(0), 1) && S.levelCapFor(0) === 15, 'R0: 1.0x Power, Level cap 15');
check(near(S.rebirthPower(1), 1.5) && S.levelCapFor(1) === 30, 'R1: 1.5x Power, Level cap 30');
check(near(S.rebirthPower(2), 2) && S.levelCapFor(2) === 45, 'R2: 2.0x Power, Level cap 45');
check(rebirthOk, 'every further rebirth: +0.5x Power, +15 cap (checked to R100)');
check(S.canRebirth(15, 0) && !S.canRebirth(14, 0) && S.canRebirth(30, 1), 'a rebirth needs the level cap');

// -------------------------------------------------------------------- trails
const TRAILS = [
  ['No Trail', 1.0, 0], ['Green', 1.0, 650], ['Red', 1.1, 2_000], ['Blue', 1.1, 4_500], ['67', 1.2, 9_500], ['Fire', 1.2, 15_000],
  ['Water', 1.4, 30_000], ['Void', 1.6, 50_000], ['Star', 1.9, 80_000], ['Galaxy', 2.1, 100_000], ['Rainbow', 2.5, 150_000],
];
check(S.TRAILS.length === 11, '11 trails');
TRAILS.forEach(([name, mult, cost], i) => {
  const t = S.TRAILS[i];
  check(t.name === name && t.multiplier === mult && t.cost === cost, `trail ${name}: ${mult}x, ${cost} Wins`);
});

// -------------------------------------------------------------------- charms
const charm = (name) => S.CHARMS.find((c) => c.name === name);
check(charm('Color Mask')?.rarity === 'epic' && charm('Color Mask').bonus === 9 && charm('Color Mask').cost === 4_000, 'Epic Color Mask: +9% Speed, 4K Wins');
check(charm('Kunai')?.rarity === 'rare' && charm('Kunai').bonus === 3 && charm('Kunai').cost === 50, 'Rare Kunai: +3% Speed, 50 Wins');
check(charm('Cursed Finger')?.rarity === 'rare' && charm('Cursed Finger').bonus === 3 && charm('Cursed Finger').cost === 150, 'Rare Cursed Finger: +3% Speed, 150 Wins');
check(S.MAX_EQUIPPED_CHARMS === 3, 'up to 3 charms equipped');
check(S.SHOP_RESTOCK_SECONDS === 300, 'the shop restocks every 5 minutes');
{
  const w = S.shopWindowAt(Date.now());
  const a = S.shopStock(w);
  check(a.length === 3 && new Set(a).size === 3, 'a restock is 3 distinct charms');
  check(JSON.stringify(a) === JSON.stringify(S.shopStock(w)), 'the stock is deterministic within a window (server and client agree)');
  let differs = false;
  for (let k = 1; k < 20 && !differs; k += 1) differs = JSON.stringify(S.shopStock(w + k)) !== JSON.stringify(a);
  check(differs, 'the stock changes between windows');
  const counts = Array(S.CHARM_COUNT).fill(0);
  counts[charm('Kunai').id] = 2;
  counts[charm('Color Mask').id] = 1;
  counts[charm('Cursed Finger').id] = 1;
  const best = S.bestCharms(counts).map((id) => S.charmById(id).name);
  check(best[0] === 'Color Mask' && best.length === 3, `Equip Best picks the three strongest (${best.join(', ')})`);
  check(near(S.charmMultiplierOf([charm('Color Mask').id, charm('Kunai').id, charm('Cursed Finger').id]), 1.15), 'charm bonuses add: 9% + 3% + 3% = x1.15');
}

// ---------------------------------------------------------------- treadmills
const normal = S.TREADMILLS.filter((t) => t.rebirthsRequired === 0);
check(normal.length === 2 && normal.every((t) => t.multiplier === 1), '2 normal treadmills, no rebirths needed');
check(S.TREADMILLS.some((t) => t.multiplier === 1.5 && t.rebirthsRequired === 2), 'a 1.5x Speed treadmill needing 2 rebirths');
check(S.TREADMILLS.some((t) => t.multiplier === 3 && t.rebirthsRequired === 3), 'a 3x Speed treadmill needing 3 rebirths');
check(S.TREADMILLS.every((t) => t.x < 0), 'the treadmills are on the RIGHT of the spawn (-X)');
check(S.BOARDS.x > 0, 'the scoreboards are on the LEFT of the spawn (+X)');
check(S.CHARM_SHOP.counterZ < S.SPAWN.z, 'the charm shop is BEHIND the spawn');

// -------------------------------------------------------------------- levels
check(S.xpToNext(24) === 129 && S.xpToNext(25) === 133, 'Level 24 needs 129 XP, Level 25 needs 133 XP');
let rising = true;
for (let l = 1; l < 1000; l += 1) rising &&= S.xpToNext(l + 1) > S.xpToNext(l);
check(rising, 'every level costs more than the last');
check(near(S.runSpeedForLevel(15), 27), 'Level 15 runs at 27 (MAX: 27)');
let faster = true;
for (let l = 1; l < 2000; l += 1) faster &&= S.runSpeedForLevel(l + 1) > S.runSpeedForLevel(l);
check(faster, 'EVERY level runs physically faster than the one before (checked to 2000)');
check(S.runSpeedFor(15, 1) === 27 && S.runSpeedFor(15, 1.25) > 27 && S.runSpeedFor(15, 5) > S.runSpeedFor(15, 1.25), 'the multiplier stack speeds up the legs (Deku > Luffy, Ichigo > Deku)');
check(S.runSpeedFor(5000, 1e9) === S.MAX_RUN_SPEED, `physical speed is capped at ${S.MAX_RUN_SPEED}`);
check(S.MOVEMENT.sprintDelay <= 0.8 && S.MOVEMENT.sprintDelay > 0.3, `the auto-sprint kicks in after a short run (${S.MOVEMENT.sprintDelay}s)`);
check(S.STAGES.every((st) => S.WORLD_SOLIDS.filter((b) => b.stage === st.index && ['platform', 'pillar', 'bridge'].includes(b.look)).every((b) => b.maxX - b.minX >= 10)), 'every island is at least 10 wide (platforms 28-40, pillars 12-16, bridges 10-13)');

// -------------------------------------------------------------------- stages
check(S.STAGE_COUNT === 30 && S.STAGES.length === 30, 'exactly 30 stages');
check(S.STAGES[2].recommended === 15 && S.STAGES[2].reward === 5, 'Stage 3: Level Recommended 15, +5 Wins');
check(S.STAGES.every((s, i) => i === 0 || (s.recommended > S.STAGES[i - 1].recommended && s.reward > S.STAGES[i - 1].reward)), 'each stage recommends more and pays more');
check(
  S.STAGES.every((s) => S.WORLD_SOLIDS.some((b) => b.stage === s.index && b.kind === 'wallrun') && S.WORLD_SOLIDS.some((b) => b.stage === s.index && b.kind === 'climb')),
  'every stage has a wall-run and a climbing wall',
);

// --------------------------------------------------- the server's services
const progression = new ProgressionService();
const speed = new SpeedService();
const collection = new CollectionService();
const player = new PlayerState();
player.sessionId = 'verify';
progression.initialise(player);
check(player.characterSlot === 0 && player.ownedCharacters === 0, 'a new player state starts as the avatar, no evolution owned');
check(player.level === 1 && player.levelCap === 15 && player.xpNeeded === 37, 'a new player: Level 1 of 15, 37 XP to Level 2');

// Running pays per stride of server-simulated distance.
speed.creditMovement(player, S.STRIDE_DISTANCE * 10, progression);
check(player.totalXp === 10, 'ten strides of running pay 10 Speed XP at x1');

// Level up through a grant, and stop at the cap.
progression.grantXp(player, 1e9);
check(player.level === 15 && player.xp === player.xpNeeded, 'XP levels up to the cap and the bar stops full');
check(near(player.maxSpeed, 27), 'the level raised the MAX speed to 27');
check(near(player.moveSpeed, 27), 'and the server simulates the runner at it');
const banked = player.totalXp;
progression.grantXp(player, 50);
check(player.totalXp === banked, 'at the cap no more XP is banked');

// Rebirth.
progression.resetForRebirth(player);
check(player.rebirths === 1 && player.level === 1 && player.xp === 0 && player.levelCap === 30, 'a rebirth resets the level, raises the cap to 30');
check(near(player.multiplier, 1.5), 'and multiplies Speed gain by 1.5x Power');
check(player.moveSpeed > 16 && near(player.moveSpeed, S.runSpeedFor(1, 1.5)), `and a rebirthed Level 1 runs faster than a new one (${player.moveSpeed.toFixed(2)} > 16)`);

// Every factor reaches the Speed formula.
player.wins = 2_000_000;
collection.evolve(player, progression); // Luffy - free
check(player.characterSlot === 1 && player.ownedCharacters === 1 && player.wins === 2_000_000, 'the avatar evolves into Luffy for free');
collection.evolve(player, progression); // Deku
collection.evolve(player, progression); // Yuji
check(player.characterSlot === 3 && player.wins === 2_000_000 - 30, 'evolving spends the Wins, in order (Luffy free, Deku, then Yuji)');
check(collection.wearCharacter(player, 0, progression).ok && player.characterSlot === 0 && near(player.multiplier, 1.5), 'the avatar can be worn again at any time (x1 character)');
collection.wearCharacter(player, 3, progression);
check(near(player.multiplier, 1.5 * 1.5), 'Yuji x1.5 multiplies with Power x1.5');
const yujiSpeed = player.moveSpeed;
collection.trail(player, 'buy', 10, progression);
check(player.trailId === 10 && near(player.multiplier, 1.5 * 1.5 * 2.5), 'the Rainbow trail x2.5 multiplies in');
check(player.moveSpeed > yujiSpeed, `and the trail makes the runner physically faster (${yujiSpeed.toFixed(2)} -> ${player.moveSpeed.toFixed(2)})`);
{
  let last = player.moveSpeed;
  let rising = true;
  for (let i = 0; i < 20; i += 1) {
    progression.grantXp(player, player.xpNeeded - player.xp);
    rising &&= player.moveSpeed > last;
    last = player.moveSpeed;
  }
  check(rising, `twenty level-ups on the server: every one raised moveSpeed (now L${player.level}, ${player.moveSpeed.toFixed(1)})`);
}
collection.addCharm(player, charm('Color Mask').id, progression);
check(near(player.multiplier, 1.5 * 1.5 * 2.5 * 1.09), 'a worn Color Mask adds its +9%');
check(!('speedPass' in player) && !('winsPass' in player) && S.PRODUCTS === undefined, 'no Bux products or passes exist: Wins are the only currency');
const before = player.totalXp;
speed.creditMovement(player, S.STRIDE_DISTANCE, progression);
check(near(player.totalXp - before, player.xpPerStride), 'one stride pays exactly the replicated XP per stride');

// Treadmills.
const pro = S.TREADMILLS.find((t) => t.multiplier === 1.5);
player.x = pro.x;
player.z = pro.z;
player.y = pro.top;
player.grounded = true;
const beltBefore = player.totalXp;
speed.tickTreadmill(1, player, progression);
check(player.treadmill === -1 && player.totalXp === beltBefore, 'the 1.5x treadmill is locked below 2 rebirths');
player.rebirths = 2;
progression.syncDerived(player);
speed.tickTreadmill(1, player, progression);
check(player.treadmill === pro.id && near(player.totalXp - beltBefore, S.TREADMILL_STRIDES_PER_SECOND * player.xpPerStride * 1.5), 'at 2 rebirths it runs for you: strides x 1.5');

// Charm slots.
collection.charmAction(player, 'unequipAll', undefined, progression);
check(player.equippedCharms.length === 0 && near(player.multiplier, 2 * 1.5 * 2.5), 'Unequip All removes every charm bonus');
for (const id of [charm('Kunai').id, charm('Kunai').id, charm('Cursed Finger').id]) collection.addCharm(player, id, progression);
collection.charmAction(player, 'unequipAll', undefined, progression);
collection.charmAction(player, 'equipBest', undefined, progression);
check(player.equippedCharms.length === 3 && Array.from(player.equippedCharms).includes(charm('Color Mask').id), 'Equip Best wears the best three owned');
const fourth = collection.charmAction(player, 'equip', charm('Kunai').id, progression);
check(!fourth.ok && player.equippedCharms.length === 3, 'a fourth charm is refused');

console.log(failures === 0 ? '\nverify-progression: all checks passed' : `\nverify-progression: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
