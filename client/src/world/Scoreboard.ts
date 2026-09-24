import { BOARDS, LEADERBOARD_SIZE, formatPlayTime, formatWins, visibleName } from '@anime/shared';
import {
  CanvasTexture,
  FrontSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import type { LeaderboardSnapshot, NetLeaderEntry } from '../net/netTypes.js';
import { PALETTE } from '../config/worldVisuals.js';
import { logger } from '../util/logger.js';
import { CanvasSign } from './CanvasSign.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { JP, curvedRoof } from './japan/Kit.js';
import { drawPortrait, portraitFor } from '../bloxity/Portraits.js';
import { maxTextureEdge } from '../config/device.js';

const SCOPE = 'Scoreboard';

type Category = 'wins' | 'playtime' | 'rebirths';

interface BoardSpec {
  readonly category: Category;
  readonly title: string;
  readonly heading: string;
  readonly titleFill: string;
  readonly titleStroke: string;
}

/** The three boards on the LEFT of the spawn, back to front. */
const SPECS: readonly BoardSpec[] = [
  { category: 'wins', title: 'TOP WINS', heading: 'MOST WINS', titleFill: '#ffd53d', titleStroke: '#5a3400' },
  { category: 'playtime', title: 'TOTAL PLAYTIME', heading: 'MOST TIME PLAYED', titleFill: '#7fe6ff', titleStroke: '#0a3a5a' },
  { category: 'rebirths', title: 'TOTAL REBIRTHS', heading: 'MOST REBIRTHS', titleFill: '#ff7ad9', titleStroke: '#5a0a3f' },
];

const FRAME = 1.2;
const DEPTH = 1.6;
const PIXELS_PER_UNIT = 46;
const RANK_COLOURS = ['#ffd53d', '#dfe6ef', '#ff9a3d'] as const;
const RANK_DEFAULT = '#ffffff';
const FONT = '"Fredoka", "Baloo 2", "Nunito", "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", "Consolas", "Roboto Mono", monospace';

/**
 * The three leaderboards on the left of the spawn, facing it: Wins, Total
 * Playtime and Total Rebirths - Japanese notice boards on their own posts,
 * standing clear of the wall behind them. Gold-framed slate panels, each
 * a canvas redrawn only when the standings change.
 */
export class Scoreboard {
  readonly root = new Group();

  private readonly panels: PanelSurface[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: (MeshBasicMaterial | MeshLambertMaterial)[] = [];
  private warnedMissing = false;

  constructor() {
    SPECS.forEach((spec, index) => {
      const group = new Group();
      // On the LEFT of the spawn (+X), turned to face it (-X).
      group.position.set(BOARDS.x, 0, BOARDS.z[index] ?? 0);
      group.rotation.y = -Math.PI / 2;

      const baseY = BOARDS.bottom;
      const midY = baseY + BOARDS.height / 2;
      const outerW = BOARDS.width + FRAME * 2;
      const outerH = BOARDS.height + FRAME * 2;

      // A Japanese notice board (kosatsu): lacquered frame on two posts, under its own little roof.
      const parts = new PartBuilder();
      parts.box(outerW, FRAME, DEPTH, JP.lacquer, 'smooth', { y: midY + BOARDS.height / 2 + FRAME / 2 });
      parts.box(outerW, FRAME, DEPTH, JP.lacquer, 'smooth', { y: midY - BOARDS.height / 2 - FRAME / 2 });
      for (const sx of [-1, 1]) {
        parts.box(FRAME, BOARDS.height, DEPTH, JP.lacquer, 'smooth', { x: sx * (BOARDS.width / 2 + FRAME / 2), y: midY });
        const postH = midY + outerH / 2 + 0.6;
        parts.box(1.3, postH, 1.3, JP.woodDark, 'wood', { x: sx * (BOARDS.width / 2 - 1), y: postH / 2, z: 0 });
        parts.box(2.2, 0.6, 2.2, JP.stoneDark, 'stone', { x: sx * (BOARDS.width / 2 - 1), y: 0.3, z: 0 });
      }
      parts.box(outerW - 1, 0.4, 0.5, JP.gold, 'smooth', { y: midY + BOARDS.height / 2 + FRAME + 0.2, z: DEPTH / 2 });
      parts.add(curvedRoof(outerW + 3, 4.6, 2.2), JP.roof, 'roof', { y: midY + outerH / 2 + 0.6, z: -0.2 });
      const built = parts.build(`board-${spec.category}`);
      built.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) this.geometries.push(mesh.geometry);
      });
      group.add(built);

      const surface = new PanelSurface(spec, BOARDS.width, BOARDS.height);
      surface.mesh.position.set(0, midY, DEPTH / 2 + 0.02);
      group.add(surface.mesh);
      this.panels.push(surface);

      const title = new CanvasSign(outerW, 5.5, [
        { text: spec.title, size: 1, fill: spec.titleFill, stroke: spec.titleStroke, strokeWidth: 0.14 },
      ]);
      title.mesh.position.set(0, midY + outerH / 2 + 5.8, DEPTH / 2 + 0.3);
      group.add(title.mesh);
      this.signs.push(title);

      this.root.add(group);
    });
  }

  update(board: LeaderboardSnapshot | null): void {
    if (!board) {
      if (!this.warnedMissing) {
        this.warnedMissing = true;
        logger.warn(SCOPE, 'the server sent no leaderboard: it is running an older build than this client.');
        for (const panel of this.panels) panel.showUnavailable();
      }
      return;
    }
    this.warnedMissing = false;
    for (const panel of this.panels) panel.apply(board[panel.category]);
  }

  dispose(): void {
    for (const panel of this.panels) panel.dispose();
    for (const sign of this.signs) sign.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }

}


class PanelSurface {
  readonly mesh: Mesh;
  readonly category: Category;

  private readonly spec: BoardSpec;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;
  private signature = '';
  private placeholder = 'No scores yet';

  constructor(spec: BoardSpec, width: number, height: number) {
    this.spec = spec;
    this.category = spec.category;
    this.canvas = document.createElement('canvas');
    const scale = Math.min(PIXELS_PER_UNIT, maxTextureEdge() / Math.max(width, height));
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);

    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;

    this.geometry = new PlaneGeometry(width, height);
    this.material = new MeshBasicMaterial({ map: this.texture, side: FrontSide });
    this.mesh = new Mesh(this.geometry, this.material);
    this.draw([]);
  }

  apply(rows: readonly NetLeaderEntry[]): void {
    const signature = rows.map((row) => `${row.handle}:${row.name}:${row.avatarUrl}:${row.value}`).join('|');
    if (signature === this.signature && this.placeholder === 'No scores yet') return;
    this.signature = signature;
    this.placeholder = 'No scores yet';
    this.draw(rows);
    this.texture.needsUpdate = true;
  }

  showUnavailable(): void {
    this.placeholder = 'Scores unavailable';
    this.signature = 'unavailable';
    this.draw([]);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.mesh.removeFromParent();
  }

  private portrait(url: string): HTMLImageElement | null {
    return portraitFor(url, () => {
      this.signature = 'portrait';
    });
  }

  private draw(rows: readonly NetLeaderEntry[]): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PALETTE.boardPanel;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = PALETTE.boardPanelEdge;
    ctx.lineWidth = width * 0.012;
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, width - ctx.lineWidth * 2, height - ctx.lineWidth * 2);

    const pad = width * 0.05;
    const headerH = height * 0.16;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    fitText(ctx, this.spec.heading, width - pad * 2, headerH * 0.62);
    ctx.lineWidth = headerH * 0.08;
    ctx.strokeStyle = PALETTE.boardInk;
    ctx.strokeText(this.spec.heading, width / 2, headerH * 0.62);
    ctx.fillStyle = PALETTE.boardHeading;
    ctx.fillText(this.spec.heading, width / 2, headerH * 0.62);

    ctx.fillStyle = PALETTE.boardHeading;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(pad, headerH * 0.97, width - pad * 2, Math.max(1, height * 0.004));
    ctx.globalAlpha = 1;

    const rowTop = headerH;
    const rowH = (height - headerH - pad * 0.6) / LEADERBOARD_SIZE;
    const rankX = pad;
    const handleX = pad + width * 0.13;
    const valueRight = width - pad;
    const handleRoom = valueRight - handleX - width * 0.22;

    if (!rows.some((row) => row && row.handle)) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.boardHeading;
      fitText(ctx, this.placeholder, width - pad * 2, rowH * 0.62);
      ctx.globalAlpha = 0.75;
      ctx.fillText(this.placeholder, width / 2, rowTop + rowH * 1.6);
      ctx.globalAlpha = 1;
      return;
    }

    for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
      const row = rows[i];
      const centreY = rowTop + rowH * (i + 0.5);
      const size = rowH * 0.58;
      if (i % 2 === 1) {
        ctx.fillStyle = PALETTE.boardStripe;
        ctx.fillRect(pad * 0.4, rowTop + rowH * i, width - pad * 0.8, rowH);
      }
      if (!row || !row.handle) continue;

      ctx.textAlign = 'left';
      ctx.lineWidth = size * 0.1;
      ctx.strokeStyle = PALETTE.boardInk;
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = RANK_COLOURS[i] ?? RANK_DEFAULT;
      const rank = `#${i + 1}`;
      ctx.strokeText(rank, rankX, centreY);
      ctx.fillText(rank, rankX, centreY);

      const face = row.avatarUrl ? this.portrait(row.avatarUrl) : null;
      const faceSize = rowH * 0.74;
      const nameX = handleX + faceSize + width * 0.012;
      if (face) drawPortrait(ctx, face, handleX, centreY, faceSize);

      const name = visibleName(row.name);
      fitText(ctx, name, handleRoom - (nameX - handleX), size, 'left');
      ctx.fillStyle = PALETTE.boardName;
      ctx.strokeText(name, nameX, centreY);
      ctx.fillText(name, nameX, centreY);

      const text = this.format(row.value);
      ctx.textAlign = 'right';
      fitText(ctx, text, width * 0.26, size, 'right', true);
      ctx.fillStyle = PALETTE.boardValue;
      ctx.strokeText(text, valueRight, centreY);
      ctx.fillText(text, valueRight, centreY);
    }
  }

  private format(value: number): string {
    if (this.category === 'playtime') return formatPlayTime(value);
    return formatWins(value);
  }
}

const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  room: number,
  preferred: number,
  align: CanvasTextAlign = 'center',
  mono = false,
): void => {
  ctx.textAlign = align;
  const family = mono ? MONO : FONT;
  let size = preferred;
  for (let pass = 0; pass < 4; pass += 1) {
    ctx.font = `700 ${size}px ${family}`;
    const drawn = ctx.measureText(text).width + size * 0.1;
    if (drawn <= room) break;
    size *= room / drawn;
  }
  ctx.font = `700 ${size}px ${family}`;
  ctx.lineWidth = size * 0.1;
};
