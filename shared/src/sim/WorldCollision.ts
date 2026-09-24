import { KILL_Y, WORLD_BOUNDS, WORLD_SOLIDS, onHubGround, type CourseBox, type SurfaceKind } from '../config/map.js';
import { MOVEMENT } from '../config/movement.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../constants/world.js';
import type { Aabb } from '../types/math.js';

/** Grid cell for the broad phase, in world units. */
const CELL = 16;
const EPS = 1e-4;
/** No floor at all: the course has lava, not ground. */
export const NO_FLOOR = -1e6;

/** A face a player is touching: its outward normal (axis aligned) and the surface's top. */
export interface WallContact {
  nx: number;
  nz: number;
  top: number;
  found: boolean;
}

export const createWallContact = (): WallContact => ({ nx: 0, nz: 0, top: 0, found: false });

/**
 * THE WORLD AS THE SIMULATION SEES IT: axis-aligned boxes, shared by the
 * server (authority) and the client (prediction), so the two collide against
 * the exact same shapes.
 *
 * The player is a box of `PLAYER_RADIUS` half-width and `PLAYER_HEIGHT`
 * height. Horizontal moves resolve one axis at a time; a face no higher than
 * `MOVEMENT.stepHeight` is stepped onto. Only the hub has ground: off it, the
 * floor is lava (`inLava`).
 *
 * Every box has a SURFACE KIND. 'wallrun' and 'climb' boxes collide exactly
 * like solids; the simulation additionally asks `touching` whether the player
 * is against one, which is what starts a wall-run or a climb.
 */
export class WorldCollision {
  private readonly solids: CourseBox[] = [];
  private readonly grid = new Map<number, number[]>();
  private readonly bounds: Aabb;
  private readonly seen: number[] = [];
  private stamp = 1;
  private readonly marks: number[] = [];

  constructor(solids: readonly CourseBox[] = WORLD_SOLIDS) {
    for (const solid of solids) this.add(solid);
    this.bounds = WORLD_BOUNDS;
  }

  /** Every solid, for diagnostics and the verification scripts. */
  get boxes(): readonly CourseBox[] {
    return this.solids;
  }

  private add(box: CourseBox): void {
    const index = this.solids.length;
    this.solids.push(box);
    this.marks.push(0);
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx += 1) {
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz += 1) {
        const key = cellKey(cx, cz);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(index);
      }
    }
  }

  /** Candidate solids overlapping an XZ rectangle, each once. Reuses one array. */
  private query(minX: number, maxX: number, minZ: number, maxZ: number): readonly number[] {
    const out = this.seen;
    out.length = 0;
    this.stamp += 1;
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
        const list = this.grid.get(cellKey(cx, cz));
        if (!list) continue;
        for (const index of list) {
          if (this.marks[index] === this.stamp) continue;
          this.marks[index] = this.stamp;
          const b = this.solids[index]!;
          if (b.maxX <= minX || b.minX >= maxX || b.maxZ <= minZ || b.minZ >= maxZ) continue;
          out.push(index);
        }
      }
    }
    return out;
  }

  /** True when a player box standing at (x, y, z) overlaps any solid. */
  private blocked(x: number, y: number, z: number): boolean {
    const r = PLAYER_RADIUS;
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.maxY > y + EPS && b.minY < y + PLAYER_HEIGHT - EPS) return true;
    }
    return false;
  }

  /**
   * Move horizontally along one axis, stepping up low faces. Writes the new
   * coordinate into `out.value`, a raised `y` into `out.y`, and whether a wall
   * stopped the move into `out.hit`.
   */
  moveAxis(axis: 'x' | 'z', x: number, y: number, z: number, delta: number, out: { value: number; y: number; hit: boolean }): void {
    out.y = y;
    out.hit = false;
    const r = PLAYER_RADIUS;
    let nx = axis === 'x' ? x + delta : x;
    let nz = axis === 'z' ? z + delta : z;
    let ny = y;

    for (let pass = 0; pass < 3; pass += 1) {
      let collided = false;
      for (const index of this.query(nx - r, nx + r, nz - r, nz + r)) {
        const b = this.solids[index]!;
        if (b.maxY <= ny + EPS || b.minY >= ny + PLAYER_HEIGHT - EPS) continue;
        const rise = b.maxY - ny;
        if (rise <= MOVEMENT.stepHeight && !this.blocked(nx, b.maxY, nz)) {
          ny = b.maxY;
          collided = true;
          break;
        }
        if (axis === 'x') nx = delta > 0 ? b.minX - r - EPS : b.maxX + r + EPS;
        else nz = delta > 0 ? b.minZ - r - EPS : b.maxZ + r + EPS;
        out.hit = true;
        collided = true;
        break;
      }
      if (!collided) break;
    }
    if (axis === 'x') {
      if ((delta > 0 && nx < x) || (delta < 0 && nx > x)) nx = x;
    } else if ((delta > 0 && nz < z) || (delta < 0 && nz > z)) nz = z;

    out.value = axis === 'x' ? nx : nz;
    out.y = ny;
  }

  /** The highest floor under the footprint at or below `y + tolerance`: a box top, the hub ground, or NO_FLOOR. */
  floorBelow(x: number, y: number, z: number, tolerance = EPS): number {
    const r = PLAYER_RADIUS * 0.92;
    let floor = onHubGround(x, z) ? 0 : NO_FLOOR;
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.maxY <= y + tolerance && b.maxY > floor) floor = b.maxY;
    }
    return floor;
  }

  /** The lowest ceiling above a head at `headY`, or +Infinity. */
  ceilingAbove(x: number, headY: number, z: number): number {
    const r = PLAYER_RADIUS * 0.92;
    let ceiling = Number.POSITIVE_INFINITY;
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.minY >= headY - EPS && b.minY < ceiling) ceiling = b.minY;
    }
    return ceiling;
  }

  /**
   * Is the player's body against a face of a `kind` surface, within `reach`?
   * Writes the face's outward normal (the side the player is on) and the
   * surface's top. The nearest face wins.
   */
  touching(x: number, y: number, z: number, kind: SurfaceKind, reach: number, out: WallContact): boolean {
    out.found = false;
    const r = PLAYER_RADIUS;
    let best = reach + EPS;
    for (const index of this.query(x - r - reach, x + r + reach, z - r - reach, z + r + reach)) {
      const b = this.solids[index]!;
      if (b.kind !== kind) continue;
      // The body must overlap the face vertically, below its top.
      if (b.minY > y + PLAYER_HEIGHT * 0.7 || b.maxY < y + 0.35) continue;
      const alongZ = z + r * 0.5 > b.minZ && z - r * 0.5 < b.maxZ;
      const alongX = x + r * 0.5 > b.minX && x - r * 0.5 < b.maxX;
      if (alongZ) {
        const east = x - r - b.maxX;
        if (east >= -0.05 && east < best) {
          best = east;
          out.nx = 1;
          out.nz = 0;
          out.top = b.maxY;
          out.found = true;
        }
        const west = b.minX - (x + r);
        if (west >= -0.05 && west < best) {
          best = west;
          out.nx = -1;
          out.nz = 0;
          out.top = b.maxY;
          out.found = true;
        }
      }
      if (alongX) {
        const north = z - r - b.maxZ;
        if (north >= -0.05 && north < best) {
          best = north;
          out.nx = 0;
          out.nz = 1;
          out.top = b.maxY;
          out.found = true;
        }
        const south = b.minZ - (z + r);
        if (south >= -0.05 && south < best) {
          best = south;
          out.nx = 0;
          out.nz = -1;
          out.top = b.maxY;
          out.found = true;
        }
      }
    }
    return out.found;
  }

  /** Off the hub ground and below the lava line: burned. */
  inLava(x: number, y: number, z: number): boolean {
    return y < KILL_Y && !onHubGround(x, z);
  }

  /** Keep a position inside the world, whatever displacement produced it. */
  clampToBounds(position: { x: number; z: number }): void {
    const r = PLAYER_RADIUS;
    const b = this.bounds;
    if (position.x < b.minX + r) position.x = b.minX + r;
    if (position.x > b.maxX - r) position.x = b.maxX - r;
    if (position.z < b.minZ + r) position.z = b.minZ + r;
    if (position.z > b.maxZ - r) position.z = b.maxZ - r;
  }
}

const cellKey = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096);
