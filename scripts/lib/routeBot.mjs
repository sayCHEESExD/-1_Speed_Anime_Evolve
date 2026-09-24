/**
 * THE ROUTE BOT: a controller that plays a stage the way a player does - a
 * stick and a jump button, nothing else - steering platform to platform,
 * jumping at edges, double-jumping only when a landing would fall short,
 * running the glass walls and walking into the marked climbing walls.
 *
 * Shared by verify-course (the shared simulation, offline) and verify-run
 * (the live server, over the network).
 */
import { MODE_CLIMB, MODE_WALLRUN, WORLD_SOLIDS, onPad, sprintFactor } from '../../shared/dist/index.js';

const G = 70;

/** Route boxes of a stage in course order (what a runner stands on). */
export const routeOf = (stage) =>
  WORLD_SOLIDS.filter((b) => b.stage === stage.index && ['start', 'platform', 'pillar', 'bridge', 'climb', 'goal'].includes(b.look)).sort(
    (a, b) => a.minZ - b.minZ,
  );
const wallsOf = (stage) => WORLD_SOLIDS.filter((b) => b.stage === stage.index && b.look === 'wall');

/**
 * A controller for one stage. `decide(m, speed)` reads the runner's motion
 * and returns this step's input; `done(m)` says whether it stands on the
 * claim pad.
 */
export const createRouteBot = (stage) => {
  const route = routeOf(stage);
  const walls = wallsOf(stage);
  let jumpHeld = false;
  let target = null;
  let airTicks = 0;
  let wallSide = 1;
  const stats = { usedWall: false, climbed: false };
  const standingOn = (m) =>
    route.find((b) => m.x > b.minX - 0.9 && m.x < b.maxX + 0.9 && m.z >= b.minZ - 0.9 && m.z <= b.maxZ + 0.9 && Math.abs(m.y - b.maxY) < 0.3);
  const after = (box) => route.find((b) => b.minZ >= box.maxZ - 0.01 && b !== box);

  const decide = (m, speed) => {
    if (m.mode === MODE_CLIMB) stats.climbed = true;
    if (m.mode === MODE_WALLRUN) stats.usedWall = true;
    const here = m.grounded ? standingOn(m) : null;
    if (here) {
      target = here.look === 'goal' ? here : (after(here) ?? here);
      airTicks = 0;
    } else {
      airTicks += 1;
    }
    let jump = false;
    let moveZ = 1;
    let tx = 0;
    let tz = m.z + 10;
    if (here?.look === 'goal' || (m.grounded && m.z > stage.goalMinZ - 1)) {
      tx = stage.claimPad.x;
      tz = stage.claimPad.z;
    } else if (target) {
      tx = Math.max(target.minX + 1.5, Math.min(target.maxX - 1.5, (target.minX + target.maxX) / 2));
      tz = target.minZ + Math.min(6, (target.maxZ - target.minZ) / 2);
    }
    // Camera yaw 0: right is -X, so +X needs a NEGATIVE moveX.
    let moveX = Math.max(-1, Math.min(1, -(tx - m.x) / Math.max(tz - m.z, 3)));
    if (here?.look === 'goal' || (m.grounded && m.z > stage.goalMinZ - 1)) {
      const dx = tx - m.x;
      const dz = tz - m.z;
      const d = Math.max(Math.hypot(dx, dz), 1e-3);
      const k = Math.min(1, d / 2);
      moveX = (-dx / d) * k;
      moveZ = (dz / d) * k;
    }

    const right = walls.find((w) => w.minX > 0 && m.z > w.minZ - 60 && m.z < w.maxZ + 2);
    const inChannel = right && m.z > right.minZ - 3 && m.z < right.maxZ + 1;
    if (right && here && here.maxZ <= right.minZ + 0.1 && target && target.minZ >= right.maxZ) {
      // Line up close to the nearer wall on the take-off pad, then leap for it.
      wallSide = m.x >= 0 ? 1 : -1;
      const lane = wallSide * (right.minX - 3);
      moveX = Math.max(-1, Math.min(1, -(lane - m.x) / 4));
      if (m.z > here.maxZ - Math.max(1.5, speed * 0.1)) {
        jump = true;
        moveX = -0.6 * wallSide;
      }
    } else if (m.mode === MODE_WALLRUN) {
      moveX = m.wallNx < 0 ? -0.35 : 0.35;
      if (m.z > right.maxZ - Math.max(3, speed * 0.2)) jump = true;
    } else if (inChannel && !m.grounded && m.z < right.maxZ - 2) {
      moveX = -0.9 * wallSide;
    } else if (here && target && target.look === 'climb' && m.mode !== MODE_CLIMB) {
      moveX = m.x / 6;
      const gap = target.minZ - here.maxZ;
      if (gap > 1 && m.z > here.maxZ - Math.max(1.2, speed * 0.07)) jump = true;
    } else if (m.mode === MODE_CLIMB) {
      moveX = 0;
    } else if (here && target && target !== here) {
      const gap = target.minZ - here.maxZ;
      const rise = target.maxY - here.maxY;
      if ((gap > 0.2 || rise > 0.9) && m.z > here.maxZ - Math.max(1.0, speed * 0.06)) jump = true;
    }
    if (!jump && !m.grounded && m.mode === 0 && m.airJumpsUsed === 0 && airTicks > 8 && target && target !== here) {
      const top = target.maxY;
      const disc = m.vy * m.vy + 2 * G * (m.y - top);
      const t = disc >= 0 ? (m.vy + Math.sqrt(disc)) / G : 0;
      const landing = m.z + m.vz * t;
      if (disc < 0 || landing < target.minZ + 1.2) jump = true;
    }
    if (!m.grounded && m.mode === 0 && target && !(inChannel && m.z < right.maxZ - 2)) {
      const disc = m.vy * m.vy + 2 * G * (m.y - target.maxY);
      if (disc >= 0) {
        const t = Math.max(0.05, (m.vy + Math.sqrt(disc)) / G);
        const now = speed * sprintFactor(m.runTime);
        const aimZ = target.look === 'goal' ? stage.claimPad.z : target.minZ + Math.min(4 + now * 0.1, (target.maxZ - target.minZ) * 0.5);
        moveZ = Math.max(-1, Math.min(1, (aimZ - m.z) / t / now));
        moveX = Math.max(-1, Math.min(1, -((tx - m.x) / t) / now));
      }
    }
    const length = Math.hypot(moveX, moveZ);
    if (length > 1) {
      moveX /= length;
      moveZ /= length;
    }
    const press = jump && !jumpHeld;
    jumpHeld = press;
    return { moveX, moveZ, jump: press, cameraYaw: 0 };
  };

  const done = (m) => m.grounded && onPad(stage.claimPad, m.x, m.y, m.z);
  return { decide, done, stats };
};
