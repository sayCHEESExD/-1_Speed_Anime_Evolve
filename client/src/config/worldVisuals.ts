/**
 * THE PALETTE: a bright, studded toy world with a Japanese identity - pale
 * blue-white tiled plazas, sandy paths, lime grass, tan studded cliffs with
 * grass caps, vermilion torii and pillars, dark tiled roofs, paper lanterns,
 * bamboo and sakura. Bright and readable; never dark or muddy.
 *
 * COLOUR ONLY. Every coordinate lives in `@anime/shared`'s map config.
 */
export const PALETTE = {
  /** The spawn plaza: pale ice-blue tiles. */
  plaza: '#e9f3fb',
  plazaLine: '#b9d8ee',
  plazaChevron: '#9fd0f2',
  /** Sandy paths. */
  path: '#e9d3a2',
  pathDark: '#d4b97d',
  /** Grass. */
  grass: '#63d043',
  grassDark: '#45a82f',
  /** Cliffs: tan studded dirt with a grass cap. */
  cliff: '#c9a778',
  cliffDark: '#a9875c',
  cliffCap: '#5fcf3a',

  /** Japanese architecture. */
  vermilion: 0xe0342b,
  vermilionDark: 0xa81f1c,
  roof: 0x2b3448,
  roofEdge: 0x3c4a66,
  wood: 0x8a5a33,
  woodDark: 0x5e3b20,
  plaster: 0xf4efe3,
  stone: 0xb9bcc4,
  stoneDark: 0x8e929c,
  gold: 0xf2c14e,
  paper: 0xfff1c9,
  lanternGlow: 0xffc766,

  /** Nature. */
  bamboo: 0x7ccf45,
  bambooDark: 0x4f9a2c,
  sakura: 0xff9fd0,
  sakuraDark: 0xf06fb3,
  pine: 0x2f9e4f,
  pineDark: 0x237a3c,
  trunk: 0x7a4a2a,
  water: 0x4fc3f7,
  waterDeep: 0x2d8fd8,

  /** Pads. */
  stageFloor: '#f3eee4',
  stageTrim: 0x2b2f3d,
  padIdle: 0x2a2e3a,
  padLocked: 0xc2362f,
  padReady: 0x3fe05a,
  padOwned: 0xf0c040,
  padWorn: 0x62e6ff,

  /** Boards. */
  boardFrame: 0xd33a2c,
  boardFrameDark: 0x8e2019,
  boardPanel: '#161d2e',
  boardPanelEdge: '#2b3553',
  boardStripe: 'rgba(255, 224, 138, 0.06)',
  boardInk: '#050912',
  boardHeading: '#ffe08a',
  boardName: '#ffffff',
  boardValue: '#7fe6ff',

  /** Sky and fog. */
  skyTop: 0x3f94ea,
  sky: 0x8fd0ff,
  fog: 0xd6ecff,
  skyCloud: 0xffffff,
  skyCloudShade: 0xd9e8f7,
} as const;

/** Fog band. */
export const WORLD_FOG = {
  near: 220,
  far: 820,
} as const;

/** Yaw correction for the supplied player FBX. It already faces +Z. */
export const PLAYER_MODEL_YAW_OFFSET = 0;
