import { HUB_GROUND, LAVA_Y, STAGES, type Aabb, type StageLayout } from '@anime/shared';
import type { Group, Object3D } from 'three';
import type { PartBuilder, PartKind } from '../../render/PartBuilder.js';
import {
  CITYZ,
  CLOVER,
  CURSED,
  HERO,
  NINJA,
  PIRATE,
  PLAINS,
  SOUL,
  VOID,
  WALLED,
  WILD,
  WISTERIA,
  brokenTower,
  cityBlock,
  crystalCluster,
  cursedHall,
  cursedRift,
  darkTower,
  domeHouse,
  fightTower,
  floatingGrimoire,
  greatTree,
  heroAcademy,
  lighthouse,
  magicCastle,
  mesaCluster,
  mountainHouse,
  obelisk,
  officeTower,
  palmGrove,
  pineGrove,
  pirateShip,
  punchCrater,
  rockArch,
  roundHouses,
  soulSpire,
  townHouses,
  trainingField,
  voidCrystal,
  watchTower,
  waterTower,
  whiteCompound,
  whiteTower,
  wisteriaTree,
  type Piece,
} from '../worlds/SetPieces.js';
import { type IslandStyle, type Random } from './Kit.js';
import type { SurfaceKind } from './Surfaces.js';

/**
 * THE TWELVE ANIME WORLDS: the course is a journey through the worlds of the
 * characters the player evolves into, in evolution order - pirate isles, a
 * hero city, a cursed city at dusk, a ninja village, wisteria mountains, the
 * wild frontier, a walled city, a magic kingdom, City Z, rocky plains, the
 * infinite void and the soul realm. The worlds grow more dramatic as the
 * course goes on, and each is built from:
 *
 *   - ONE controlled palette: a base, a light variant and one strong accent
 *     (no random colour per object);
 *   - its own light and sky, lava, gate and wall-run architecture;
 *   - a FEW LARGE set-pieces on the banks (`worlds/SetPieces.ts`) with space
 *     between them, never a pile of props;
 *   - its own side boundary (`Boundary.ts`): cliffs, a city, a great wall...
 *
 * Each world spans two or three stages; `WORLD_STAGES` says which.
 */
export interface Atmosphere {
  readonly skyTop: number;
  readonly sky: number;
  /** Horizon and fog. */
  readonly fog: number;
  readonly sun: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly ambient: number;
  readonly cloud: number;
  readonly cloudShade: number;
  /** How far off the fog closes in. */
  readonly fogNear: number;
  readonly fogFar: number;
}

export type Backdrop = 'mountains' | 'city' | 'castle';

/** The architecture of a world's wall-run buildings. */
export type WallRunStyle = 'ship' | 'city' | 'temple' | 'dojo' | 'fort' | 'rock' | 'crystal';

/** The gateway over each start. */
export type GateStyle = 'arch' | 'frame' | 'torii' | 'towers' | 'rock';

/** A world's side boundary: what frames the course. */
export interface BoundaryLook {
  /** cliff: rock blocks; wall: a great fortified wall; city: a row of buildings; crystal: glowing void walls. */
  readonly kind: 'cliff' | 'wall' | 'city' | 'crystal';
  readonly body: number;
  readonly bodyAlt: number;
  readonly bodyKind: SurfaceKind;
  readonly cap: number;
  readonly capKind: PartKind;
  /** The one accent line along the top. */
  readonly trim: number;
  /** Base height of the wall/cliff. */
  readonly height: number;
  /** The large silhouettes standing on and behind it, far apart. */
  readonly skyline: readonly Piece[];
  /** A mountain ridge beyond, in these colours (none: the wall closes the view). */
  readonly ridge?: readonly number[];
  /** A sea beyond the cliffs, in this colour. */
  readonly ocean?: number;
  /** Waterfalls down some cliff faces. */
  readonly waterfalls?: boolean;
}

export interface Theme {
  readonly id: number;
  readonly name: string;
  /** The evolution this world belongs to: its statue stands beside every stage. */
  readonly character: number;
  readonly island: IslandStyle;
  /** The course's islands alternate between these (both contrast with the lava). */
  readonly islandColors: readonly number[];
  readonly start: IslandStyle;
  readonly bridge: IslandStyle;
  readonly climb: { readonly kind: SurfaceKind; readonly color: number; readonly cap: number };
  readonly wallRun: { readonly body: number; readonly face: number; readonly trim: number; readonly roof: number; readonly style: WallRunStyle };
  /** The world's one accent: auras, glows, trims. */
  readonly accent: number;
  readonly gate: { readonly style: GateStyle; readonly color: number; readonly beam: number };
  readonly terrace: IslandStyle;
  readonly lava: readonly [string, string, string];
  readonly atmosphere: Atmosphere;
  readonly backdrop: Backdrop;
  /** The bank set-pieces, taken in turn. */
  readonly pieces: readonly Piece[];
  readonly boundary: BoundaryLook;
  /** Which comic-burst look the wall-run tower shouts in. */
  readonly burst: number;
}

export interface DressContext {
  readonly b: PartBuilder;
  readonly group: Group;
  readonly random: Random;
  readonly add: (object: Object3D) => Object3D;
}

const style = (top: SurfaceKind, topColor: number, trim: number, rock: number, trimKind: PartKind = 'smooth'): IslandStyle => ({ top, topColor, trim, trimKind, rock });

const DAY: Atmosphere = {
  skyTop: 0x2f86ff,
  sky: 0x8fdcff,
  fog: 0xd8f2ff,
  sun: 0xfff8e8,
  sunIntensity: 2.0,
  hemiSky: 0xd8f0ff,
  hemiGround: 0xfff0dc,
  hemiIntensity: 1.25,
  ambient: 0.65,
  cloud: 0xffffff,
  cloudShade: 0xe2ecff,
  fogNear: 320,
  fogFar: 1150,
};

const ORANGE_LAVA = ['#ff7a1a', '#ffe84a', '#e8401a'] as const;

export const THEMES: readonly Theme[] = [
  {
    id: 0,
    name: 'Pirate Isles',
    character: 1,
    island: style('stone', 0x3fc6c0, PIRATE.woodDark, 0xc89a6a),
    islandColors: [0x3fc6c0, 0xf4e6c4],
    start: style('wood', 0xf4e6c4, PIRATE.red, 0xc89a6a),
    bridge: style('wood', PIRATE.woodDark, PIRATE.sail, 0xc89a6a),
    climb: { kind: 'wood', color: 0x9a6a3f, cap: PIRATE.red },
    wallRun: { body: PIRATE.wood, face: 0x3fc6c0, trim: PIRATE.woodDark, roof: PIRATE.red, style: 'ship' },
    accent: PIRATE.teal,
    gate: { style: 'arch', color: PIRATE.wood, beam: PIRATE.red },
    terrace: style('grass', PIRATE.sand, PIRATE.woodDark, 0xc89a6a),
    lava: ORANGE_LAVA,
    atmosphere: DAY,
    backdrop: 'mountains',
    pieces: [pirateShip, palmGrove, lighthouse, palmGrove],
    boundary: { kind: 'cliff', body: 0xd8b080, bodyAlt: 0xc8a070, bodyKind: 'rock', cap: 0x5ad84a, capKind: 'grass', trim: PIRATE.teal, height: 30, skyline: [palmGrove], ocean: 0x2ec4e8, waterfalls: true },
    burst: 1,
  },
  {
    id: 1,
    name: 'Hero City',
    character: 2,
    island: style('stone', HERO.white, HERO.green, 0x8a9ab0),
    islandColors: [HERO.white, 0x9ad8b8],
    start: style('stone', 0xe8eef6, HERO.green, 0x8a9ab0),
    bridge: style('stone', HERO.grey, HERO.green, 0x8a9ab0),
    climb: { kind: 'stone', color: 0xd8e4ee, cap: HERO.green },
    wallRun: { body: HERO.white, face: HERO.green, trim: HERO.navy, roof: HERO.navy, style: 'city' },
    accent: HERO.green,
    gate: { style: 'frame', color: HERO.white, beam: HERO.green },
    terrace: style('stone', 0xdfe6ee, HERO.green, 0x8a9ab0),
    lava: ORANGE_LAVA,
    atmosphere: { ...DAY, skyTop: 0x2f7aff, sky: 0x9ad8ff },
    backdrop: 'city',
    pieces: [heroAcademy, officeTower(HERO.green, HERO.glass), trainingField, officeTower(HERO.navy, HERO.white)],
    boundary: { kind: 'city', body: HERO.white, bodyAlt: HERO.glass, bodyKind: 'windows', cap: HERO.grey, capKind: 'smooth', trim: HERO.green, height: 44, skyline: [officeTower(HERO.green, HERO.glass), officeTower(HERO.navy, HERO.white)] },
    burst: 3,
  },
  {
    id: 2,
    name: 'Cursed City',
    character: 3,
    island: style('stone', 0xe0e4ff, CURSED.navy, CURSED.navy),
    islandColors: [0xe0e4ff, 0xa8b4f0],
    start: style('stone', 0xc8c8e8, CURSED.glow, CURSED.navy),
    bridge: style('stone', CURSED.slate, CURSED.glow, CURSED.navy, 'glow'),
    climb: { kind: 'stone', color: 0x6a6aa8, cap: CURSED.glow },
    wallRun: { body: CURSED.slate, face: 0x6a5ad8, trim: CURSED.navy, roof: CURSED.roof, style: 'city' },
    accent: CURSED.glow,
    gate: { style: 'torii', color: CURSED.navy, beam: CURSED.glow },
    terrace: style('stone', 0x5a5a8a, CURSED.glow, CURSED.navy, 'glow'),
    lava: ['#c05aff', '#ffc8ff', '#6a2ab8'],
    atmosphere: { ...DAY, skyTop: 0x2a2a7a, sky: 0x8a7ae8, fog: 0xc8b8f0, sun: 0xe8d8ff, sunIntensity: 1.7, hemiSky: 0xd0c8ff, hemiGround: 0x9a8ac8, hemiIntensity: 1.15, cloud: 0xe8e0ff, cloudShade: 0xb0a0e0, fogNear: 280, fogFar: 1050 },
    backdrop: 'city',
    pieces: [cursedHall, darkTower, cursedRift, darkTower],
    boundary: { kind: 'city', body: CURSED.slate, bodyAlt: CURSED.navy, bodyKind: 'windows', cap: CURSED.roof, capKind: 'smooth', trim: CURSED.glow, height: 42, skyline: [darkTower] },
    burst: 4,
  },
  {
    id: 3,
    name: 'Ninja Village',
    character: 4,
    island: style('stone', 0x6ab8e8, NINJA.wood, 0xb08a6a),
    islandColors: [0x6ab8e8, 0xf0dcb0],
    start: style('wood', 0xf0dcb0, NINJA.orange, 0xb08a6a),
    bridge: style('wood', NINJA.wood, NINJA.orange, 0xb08a6a),
    climb: { kind: 'wood', color: 0xb07a4a, cap: NINJA.orange },
    wallRun: { body: NINJA.wall, face: NINJA.orange, trim: NINJA.wood, roof: NINJA.roof, style: 'dojo' },
    accent: NINJA.orange,
    gate: { style: 'torii', color: NINJA.orange, beam: NINJA.wood },
    terrace: style('grass', 0x8ad45a, NINJA.wood, 0xb08a6a),
    lava: ORANGE_LAVA,
    atmosphere: { ...DAY, sky: 0xffd8a8, fog: 0xffecd0, sun: 0xfff0d0, hemiGround: 0xffe0b8, cloudShade: 0xffe0c8 },
    backdrop: 'mountains',
    pieces: [roundHouses, greatTree(NINJA.leaf, NINJA.leafDark), waterTower, roundHouses],
    boundary: { kind: 'cliff', body: 0xc8a07a, bodyAlt: 0xb8906a, bodyKind: 'rock', cap: NINJA.leaf, capKind: 'grass', trim: NINJA.orange, height: 34, skyline: [greatTree(NINJA.leaf, NINJA.leafDark, 1.6)], ridge: [0x8ac87a, 0x9ad88a], waterfalls: true },
    burst: 0,
  },
  {
    id: 4,
    name: 'Wisteria Mountains',
    character: 5,
    island: style('stone', 0x3fd1a6, WISTERIA.roof, 0x4a5a7a),
    islandColors: [0x3fd1a6, 0xd8c8f0],
    start: style('wood', 0xe8dcc8, WISTERIA.bloom, 0x4a5a7a),
    bridge: style('wood', WISTERIA.wood, WISTERIA.bloom, 0x4a5a7a),
    climb: { kind: 'wood', color: 0x6a4a3a, cap: WISTERIA.bloom },
    wallRun: { body: 0xe8dcc8, face: WISTERIA.teal, trim: WISTERIA.wood, roof: WISTERIA.roof, style: 'temple' },
    accent: WISTERIA.bloom,
    gate: { style: 'torii', color: 0x3a3a4a, beam: WISTERIA.teal },
    terrace: style('grass', 0x4a9a6a, WISTERIA.wood, 0x4a5a7a),
    lava: ['#ff6a3a', '#ffd86a', '#d0302a'],
    atmosphere: { ...DAY, skyTop: 0x2a3a8a, sky: 0x9a8ae0, fog: 0xe8c8e8, sun: 0xffd8c0, sunIntensity: 1.8, hemiSky: 0xd8c8ff, hemiGround: 0xa8c8b8, hemiIntensity: 1.15, cloud: 0xf8e8ff, cloudShade: 0xc8a8e0, fogNear: 280, fogFar: 1050 },
    backdrop: 'mountains',
    pieces: [wisteriaTree, mountainHouse, pineGrove(WISTERIA.green, 0x3a8a6a), wisteriaTree],
    boundary: { kind: 'cliff', body: 0x5a6a8a, bodyAlt: 0x4e5e7e, bodyKind: 'rock', cap: 0x3a8a6a, capKind: 'grass', trim: WISTERIA.bloom, height: 38, skyline: [pineGrove(WISTERIA.green, 0x3a8a6a), wisteriaTree], ridge: [0x6a7ab8, 0x7a88c8] },
    burst: 4,
  },
  {
    id: 5,
    name: 'Wild Frontier',
    character: 6,
    island: style('stone', 0xf0f0d0, WILD.dark, 0x8a7a5a),
    islandColors: [0xf0f0d0, 0x8ae86a],
    start: style('wood', 0xf4ecd0, WILD.dark, 0x8a7a5a),
    bridge: style('wood', 0x8a5a3a, WILD.green, 0x8a7a5a),
    climb: { kind: 'rock', color: 0xb8a888, cap: WILD.green },
    wallRun: { body: 0xb8a888, face: WILD.green, trim: 0x8a7a5a, roof: WILD.dark, style: 'rock' },
    accent: WILD.green,
    gate: { style: 'rock', color: 0xb8a888, beam: WILD.green },
    terrace: style('grass', 0x6ae05a, WILD.dark, 0x8a7a5a),
    lava: ORANGE_LAVA,
    atmosphere: { ...DAY, sky: 0xa8ecff, hemiGround: 0xe8f8d0 },
    backdrop: 'mountains',
    pieces: [greatTree(WILD.green, WILD.dark, 1.3), rockArch(0xb8a888, WILD.green)],
    boundary: { kind: 'cliff', body: 0xa89878, bodyAlt: 0x988868, bodyKind: 'rock', cap: WILD.green, capKind: 'grass', trim: WILD.dark, height: 36, skyline: [greatTree(WILD.green, WILD.dark, 2), fightTower, greatTree(0x7ae05a, WILD.dark, 1.7)], ridge: [0x7ac87a, 0x8ad8a0], waterfalls: true },
    burst: 3,
  },
  {
    id: 6,
    name: 'Walled City',
    character: 7,
    island: style('stone', 0xe8dcc0, WALLED.wood, WALLED.stoneDark),
    islandColors: [0xe8dcc0, 0xc8d8a8],
    start: style('stone', 0xf0e6cc, WALLED.green, WALLED.stoneDark),
    bridge: style('wood', WALLED.wood, WALLED.stone, WALLED.stoneDark),
    climb: { kind: 'ishigaki', color: WALLED.stone, cap: WALLED.stoneDark },
    wallRun: { body: WALLED.stone, face: WALLED.green, trim: WALLED.stoneDark, roof: WALLED.roof, style: 'fort' },
    accent: WALLED.green,
    gate: { style: 'towers', color: WALLED.stone, beam: WALLED.green },
    terrace: style('grass', 0xa8c870, WALLED.stoneDark, WALLED.stoneDark),
    lava: ORANGE_LAVA,
    atmosphere: { ...DAY, sky: 0xb8dcf0, fog: 0xeee4d4, hemiGround: 0xf0e0c8, cloudShade: 0xe8e0d8 },
    backdrop: 'castle',
    pieces: [townHouses, watchTower, townHouses, watchTower],
    boundary: { kind: 'wall', body: WALLED.stone, bodyAlt: 0xd0c0a0, bodyKind: 'ishigaki', cap: WALLED.stoneDark, capKind: 'smooth', trim: WALLED.green, height: 64, skyline: [] },
    burst: 3,
  },
  {
    id: 7,
    name: 'Clover Kingdom',
    character: 8,
    island: style('stone', 0xd8dde6, 0x2a3a2a, CLOVER.dark),
    islandColors: [0xd8dde6, 0x8ac88a],
    start: style('stone', 0xe4e8f0, CLOVER.gold, CLOVER.dark),
    bridge: style('stone', CLOVER.stone, CLOVER.gold, CLOVER.dark),
    climb: { kind: 'ishigaki', color: CLOVER.stone, cap: CLOVER.roof },
    wallRun: { body: CLOVER.stone, face: CLOVER.roof, trim: CLOVER.dark, roof: CLOVER.roof, style: 'fort' },
    accent: CLOVER.gold,
    gate: { style: 'towers', color: CLOVER.stone, beam: CLOVER.gold },
    terrace: style('grass', 0x5a9a5a, CLOVER.dark, CLOVER.dark),
    lava: ['#ff6a2a', '#ffe06a', '#c83a1a'],
    atmosphere: { ...DAY, skyTop: 0x3a7ad8, sky: 0xa8d8c8, fog: 0xdcecd8, hemiGround: 0xd8e8c8, cloudShade: 0xd8e4d8 },
    backdrop: 'castle',
    pieces: [magicCastle, crystalCluster(CLOVER.crystal), floatingGrimoire, crystalCluster(CLOVER.crystal)],
    boundary: { kind: 'cliff', body: 0x8a8e9a, bodyAlt: 0x7e828e, bodyKind: 'rock', cap: 0x4a8a4a, capKind: 'grass', trim: CLOVER.gold, height: 40, skyline: [magicCastle, pineGrove(0x2f6a4a, 0x3a7a5a)], ridge: [0x8a9aa8, 0x9aa8b0] },
    burst: 3,
  },
  {
    id: 8,
    name: 'City Z',
    character: 9,
    island: style('stone', CITYZ.white, CITYZ.red, CITYZ.grey),
    islandColors: [CITYZ.white, 0xd8e4f0],
    start: style('stone', 0xf4f4f4, CITYZ.yellow, CITYZ.grey),
    bridge: style('stone', CITYZ.grey, CITYZ.yellow, CITYZ.grey),
    climb: { kind: 'stone', color: 0xe8e8ec, cap: CITYZ.yellow },
    wallRun: { body: CITYZ.white, face: CITYZ.yellow, trim: CITYZ.grey, roof: CITYZ.red, style: 'city' },
    accent: CITYZ.yellow,
    gate: { style: 'frame', color: CITYZ.white, beam: CITYZ.red },
    terrace: style('stone', 0xe8e8ee, CITYZ.yellow, CITYZ.grey),
    lava: ORANGE_LAVA,
    atmosphere: { ...DAY, skyTop: 0x2a8aff, sky: 0x9ae0ff },
    backdrop: 'city',
    pieces: [cityBlock, punchCrater, brokenTower, cityBlock],
    boundary: { kind: 'city', body: CITYZ.white, bodyAlt: CITYZ.glass, bodyKind: 'windows', cap: CITYZ.grey, capKind: 'smooth', trim: CITYZ.yellow, height: 40, skyline: [brokenTower, officeTower(CITYZ.red, CITYZ.white)] },
    burst: 0,
  },
  {
    id: 9,
    name: 'Rocky Plains',
    character: 10,
    island: style('stone', 0x5ab8ff, 0x2a5ab8, 0xc87a4a),
    islandColors: [0x5ab8ff, 0xfff0d0],
    start: style('stone', 0xfff4dc, PLAINS.orange, 0xc87a4a),
    bridge: style('wood', 0x7a8ab8, PLAINS.orange, 0xc87a4a),
    climb: { kind: 'rock', color: PLAINS.rock, cap: PLAINS.grass },
    wallRun: { body: PLAINS.rock, face: PLAINS.blue, trim: 0xc87a4a, roof: PLAINS.grass, style: 'rock' },
    accent: PLAINS.orange,
    gate: { style: 'rock', color: PLAINS.rock, beam: PLAINS.blue },
    terrace: style('grass', PLAINS.grass, 0xc87a4a, PLAINS.rock),
    lava: ['#ff8a2a', '#fff06a', '#ff4a1a'],
    atmosphere: { ...DAY, skyTop: 0x1a7aff, sky: 0x7acdff, fog: 0xd8f2ff, sunIntensity: 2.2 },
    backdrop: 'mountains',
    pieces: [mesaCluster, domeHouse, mesaCluster, domeHouse],
    boundary: { kind: 'cliff', body: PLAINS.rock, bodyAlt: 0xd88a4a, bodyKind: 'rock', cap: PLAINS.grass, capKind: 'grass', trim: PLAINS.blue, height: 46, skyline: [mesaCluster], ridge: [0xe8a878, 0x9ac8f0] },
    burst: 0,
  },
  {
    id: 10,
    name: 'Infinite Void',
    character: 11,
    island: style('stone', 0xe8f4ff, VOID.cyan, VOID.deep, 'glow'),
    islandColors: [0xe8f4ff, 0x9ad8ff],
    start: style('stone', VOID.white, VOID.cyan, VOID.deep, 'glow'),
    bridge: style('stone', 0x6a6ab8, VOID.cyan, VOID.deep, 'glow'),
    climb: { kind: 'stone', color: 0x4a4a9a, cap: VOID.cyan },
    wallRun: { body: VOID.indigo, face: VOID.violet, trim: VOID.deep, roof: VOID.cyan, style: 'crystal' },
    accent: VOID.cyan,
    gate: { style: 'frame', color: VOID.indigo, beam: VOID.cyan },
    terrace: style('stone', 0x3a3a8a, VOID.cyan, VOID.deep, 'glow'),
    lava: ['#9a5aff', '#e8c8ff', '#4a1aa8'],
    atmosphere: { ...DAY, skyTop: 0x0e0e4a, sky: 0x4a3ab8, fog: 0x8a78e0, sun: 0xd8e8ff, sunIntensity: 1.7, hemiSky: 0xb8c8ff, hemiGround: 0x6a5ac8, hemiIntensity: 1.2, ambient: 0.7, cloud: 0xc8c0ff, cloudShade: 0x8a7ad8, fogNear: 280, fogFar: 1100 },
    backdrop: 'mountains',
    pieces: [obelisk, voidCrystal, obelisk, voidCrystal],
    boundary: { kind: 'crystal', body: VOID.indigo, bodyAlt: 0x24246a, bodyKind: 'stone', cap: VOID.deep, capKind: 'smooth', trim: VOID.cyan, height: 44, skyline: [obelisk] },
    burst: 1,
  },
  {
    id: 11,
    name: 'Soul Realm',
    character: 12,
    island: style('stone', 0xf4f0e8, SOUL.black, 0x8a8a9a),
    islandColors: [0xf4f0e8, 0x4a4a5a],
    start: style('stone', 0xf6f2ea, SOUL.orange, 0x8a8a9a),
    bridge: style('wood', 0x4a4a5a, SOUL.orange, 0x8a8a9a),
    climb: { kind: 'plaster', color: SOUL.white, cap: SOUL.black },
    wallRun: { body: SOUL.white, face: SOUL.orange, trim: SOUL.grey, roof: SOUL.black, style: 'temple' },
    accent: SOUL.orange,
    gate: { style: 'torii', color: SOUL.black, beam: SOUL.orange },
    terrace: style('stone', 0xf0ece4, SOUL.black, 0x8a8a9a),
    lava: ORANGE_LAVA,
    atmosphere: { ...DAY, skyTop: 0x3a7ae8, sky: 0xc8e4ff, fog: 0xf0f4ff, sunIntensity: 2.1 },
    backdrop: 'castle',
    pieces: [whiteCompound, whiteTower, whiteCompound, soulSpire],
    boundary: { kind: 'wall', body: SOUL.white, bodyAlt: 0xece8e0, bodyKind: 'plaster', cap: SOUL.black, capKind: 'roof', trim: SOUL.orange, height: 44, skyline: [whiteTower, soulSpire] },
    burst: 0,
  },
];

/** Which stages each world spans, in order: 12 worlds over 30 stages. */
export const WORLD_STAGES: readonly (readonly [number, number])[] = [
  [1, 3], [4, 5], [6, 8], [9, 10], [11, 13], [14, 15], [16, 18], [19, 20], [21, 23], [24, 25], [26, 28], [29, 30],
];

/** The world a stage belongs to. */
export const themeOfStage = (stage: number): Theme => {
  const i = WORLD_STAGES.findIndex(([a, b]) => stage >= a && stage <= b);
  return THEMES[i < 0 ? (stage < 1 ? 0 : THEMES.length - 1) : i]!;
};

/** The spawn town's air: the first world's bright day. */
export const HUB_THEME = THEMES[0]!;

/**
 * The z range a stage OWNS for its scenery: [start, next start). Stages sit
 * end to end, so each builds only its own stretch - no two stages ever lay
 * lava, banks or boundaries over the same ground (the overlap was the source
 * of flickering doubled surfaces at every stage seam).
 */
export const stageRange = (stage: StageLayout): [number, number] => {
  const first = stage.index === 1;
  const last = stage.index === STAGES.length;
  return [first ? HUB_GROUND.maxZ : stage.startMinZ, last ? stage.goalMaxZ + 80 : stage.goalMaxZ];
};

/**
 * A TERRACE (bank): a raised landmass beside the lava canyon, its rock face
 * running down into the lava. High enough (y 7+) that nobody mistakes it for
 * part of the course.
 */
export const terrace = (b: PartBuilder, area: Aabb, look: IslandStyle): void => {
  const w = area.maxX - area.minX;
  const d = area.maxZ - area.minZ;
  const cx = (area.minX + area.maxX) / 2;
  const cz = (area.minZ + area.maxZ) / 2;
  b.box(w, 0.8, d, look.topColor, look.top, { x: cx, y: area.maxY - 0.4, z: cz });
  b.box(w + 0.4, 1.4, d + 0.4, look.trim, look.trimKind, { x: cx, y: area.maxY - 1.5, z: cz });
  const height = area.maxY - 2.2 - (LAVA_Y - 2);
  b.box(w * 0.97, height, d * 0.97, look.rock, 'rock', { x: cx, y: area.maxY - 2.2 - height / 2, z: cz });
};

/** A terrace and which side of the course it is on (-1: the +X side, facing -X). */
export interface TerraceArea {
  readonly area: Aabb;
  readonly facing: number;
}

const yawToCourse = (facing: number): number => (facing < 0 ? -Math.PI / 2 : Math.PI / 2);

/**
 * Banks down both sides of a stage, inside its own range, each holding ONE
 * large set-piece (two on a long bank), with open ground between. Returns the
 * banks.
 */
export const dressStage = (ctx: DressContext, stage: StageLayout, theme: Theme): TerraceArea[] => {
  const areas: TerraceArea[] = [];
  const [from, to] = stageRange(stage);
  let turn = stage.index;
  for (const facing of [-1, 1]) {
    let z = Math.max(from, HUB_GROUND.maxZ + 6);
    while (z < to - 20) {
      const length = Math.min(60 + ctx.random() * 60, to - z);
      const innerX = 42 + ctx.random() * 6;
      const width = 34 + ctx.random() * 10;
      const top = 7 + ctx.random() * 5;
      const area: Aabb =
        facing < 0
          ? { minX: innerX, maxX: innerX + width, minY: LAVA_Y, maxY: top, minZ: z, maxZ: z + length }
          : { minX: -innerX - width, maxX: -innerX, minY: LAVA_Y, maxY: top, minZ: z, maxZ: z + length };
      terrace(ctx.b, area, theme.terrace);
      const spots = length > 95 ? [0.3, 0.72] : [0.5];
      for (const t of spots) {
        const piece = theme.pieces[turn % theme.pieces.length]!;
        turn += 1;
        const inset = Math.min(17, width * 0.42);
        const x = facing < 0 ? area.minX + inset : area.maxX - inset;
        piece({ b: ctx.b, random: ctx.random, add: ctx.add }, x, top, area.minZ + length * t, yawToCourse(facing));
      }
      areas.push({ area, facing });
      z += length + 3 + ctx.random() * 8;
    }
  }
  return areas;
};
