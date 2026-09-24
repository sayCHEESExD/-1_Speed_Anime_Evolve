import { formatAmount, formatWins } from '@anime/shared';
import { injectAnimeStyles } from './animeStyles.js';
import { ICON } from './icons.js';

export type TileName = 'backpack' | 'teleport' | 'rebirth' | 'evolve' | 'rewards';

export interface HudHandlers {
  tile(name: TileName): void;
  music(): boolean;
}

const TILES: readonly { name: TileName; label: string; icon: string; key: string }[] = [
  { name: 'backpack', label: 'Backpack', icon: ICON.backpack, key: 'B' },
  { name: 'teleport', label: 'Teleport', icon: ICON.teleport, key: 'T' },
  { name: 'rebirth', label: 'Rebirth', icon: ICON.rebirth, key: 'R' },
  { name: 'evolve', label: 'Evolve', icon: ICON.evolve, key: 'E' },
  { name: 'rewards', label: 'Rewards', icon: ICON.gift, key: 'G' },
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
};

/**
 * THE HUD, laid out as the reference:
 *
 *   LEFT      Rebirths and Wins, then the tile grid (Backpack, Teleport,
 *             Rebirth, Evolve, Rewards).
 *   BOTTOM    the level bar (Level, XP / needed, or "Rebirth To Level Up!" at
 *             the cap).
 *   CENTRE    stage banner, toasts, "+N Speed" pops, the level-up flash.
 *
 * Draws only what the server replicated; every button is a REQUEST.
 */
export class Hud {
  private readonly root = el('div', 'ae-root');
  private readonly rebirthText = el('span', 'ae-text');
  private readonly winsText = el('span', 'ae-text');
  private readonly speedText = el('span', 'ae-text');
  private readonly tiles = new Map<TileName, HTMLButtonElement>();
  private readonly level = el('div', 'ae-level');
  private readonly levelFill = el('div', 'ae-level__fill');
  private readonly levelText = el('div', 'ae-level__text ae-text');
  private readonly levelTag = el('div', 'ae-level__lvl ae-text');
  private readonly stagebar = el('div', 'ae-stagebar ae-text');
  private readonly toasts = el('div', 'ae-toasts');
  private readonly pops = el('div');
  private readonly hint = el('div', 'ae-hint ae-text');
  private readonly music: HTMLButtonElement;
  private lastStage = '';
  private lastLevel = '';

  constructor(parent: HTMLElement, private readonly handlers: HudHandlers) {
    injectAnimeStyles();

    // ---------------------------------------------------------- left
    const left = el('div', 'ae-left');
    const stat = (icon: string, text: HTMLElement): HTMLElement => {
      const row = el('div', 'ae-stat');
      row.append(el('span', 'ae-stat__icon', icon), text);
      return row;
    };
    left.append(stat(ICON.rebirth, this.rebirthText), stat(ICON.trophy, this.winsText), stat(ICON.shoe, this.speedText));
    const grid = el('div', 'ae-tiles');
    for (const tile of TILES) {
      const button = el('button', `ae-tile ae-tile--${tile.name} ae-studs`);
      button.type = 'button';
      button.setAttribute('aria-label', tile.label);
      button.append(
        el('span', 'ae-tile__icon', tile.icon),
        el('span', 'ae-tile__label ae-text', tile.label),
        el('span', 'ae-tile__badge', '!'),
        el('span', 'ae-tile__key ae-text', tile.key),
      );
      button.addEventListener('click', () => this.handlers.tile(tile.name));
      grid.append(button);
      this.tiles.set(tile.name, button);
    }
    left.append(grid);

    // -------------------------------------------------------- bottom
    const bottom = el('div', 'ae-bottom');
    this.level.append(this.levelFill, this.levelText, this.levelTag);
    bottom.append(this.level);

    const corner = el('div', 'ae-corner');
    this.music = el('button', 'ae-round', ICON.sound);
    this.music.type = 'button';
    this.music.setAttribute('aria-label', 'Mute sound (M)');
    this.music.title = 'Mute / unmute (M)';
    // The keyboard shortcut, badged like the side tiles' (hidden on touch).
    this.music.append(el('span', 'ae-round__key ae-text', 'M'));
    this.music.addEventListener('click', () => this.music.classList.toggle('is-off', this.handlers.music()));
    corner.append(this.music);

    this.root.append(left, bottom, this.stagebar, this.toasts, this.pops, this.hint, corner);
    parent.appendChild(this.root);
  }

  setStats(rebirths: number, wins: number): void {
    const r = `${formatWins(rebirths)} Rebirth${rebirths === 1 ? '' : 's'}`;
    const w = `${formatWins(wins)} Win${wins === 1 ? '' : 's'}`;
    if (this.rebirthText.textContent !== r) this.rebirthText.textContent = r;
    if (this.winsText.textContent !== w) this.winsText.textContent = w;
  }

  /** The run speed the server simulates this player at: it rises with every level and every multiplier. */
  setSpeed(speed: number): void {
    const text = `${(Math.round(speed * 10) / 10).toFixed(1)} Speed`;
    if (this.speedText.textContent !== text) this.speedText.textContent = text;
  }

  /** The level bar: progress to the next level, or "Rebirth To Level Up!" at the cap. */
  setLevel(level: number, xp: number, needed: number, cap: number): void {
    const capped = level >= cap;
    const key = `${level}:${Math.floor(xp)}:${needed}:${cap}`;
    if (key === this.lastLevel) return;
    this.lastLevel = key;
    this.level.classList.toggle('is-capped', capped);
    this.levelFill.style.width = `${Math.min(100, needed > 0 ? (xp / needed) * 100 : 100)}%`;
    this.levelText.textContent = capped ? 'Rebirth To Level Up!' : `Level ${level}  -  ${formatAmount(xp)} / ${formatAmount(needed)} XP`;
    this.levelTag.textContent = capped ? `Lvl ${level}` : '';
  }

  setTileReady(name: TileName, ready: boolean): void {
    this.tiles.get(name)?.classList.toggle('is-ready', ready);
  }

  pressTile(name: TileName): void {
    this.tiles.get(name)?.click();
  }

  pressMusic(): void {
    this.music.click();
  }

  /** The stage banner: "Stage 3 - Level Recommended: 15" while on the course. */
  setStage(text: string, detail = ''): void {
    const key = `${text}|${detail}`;
    if (key === this.lastStage) return;
    this.lastStage = key;
    this.stagebar.classList.toggle('is-shown', text.length > 0);
    this.stagebar.innerHTML = text ? `${text}${detail ? ` <small>${detail}</small>` : ''}` : '';
  }

  setHint(text: string): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  toast(text: string, tone: 'good' | 'bad' | 'gold' | 'pink' = 'good'): void {
    const node = el('div', `ae-toast ae-toast--${tone} ae-text`);
    node.textContent = text;
    this.toasts.prepend(node);
    while (this.toasts.childElementCount > 4) this.toasts.lastElementChild?.remove();
    setTimeout(() => node.remove(), 2700);
  }

  /** "+N Speed" rising from a screen point. */
  pop(text: string, x: number, y: number): void {
    if (this.pops.childElementCount > 6) this.pops.firstElementChild?.remove();
    const node = el('div', 'ae-pop ae-text', `${ICON.shoe}<span></span>`);
    (node.lastElementChild as HTMLElement).textContent = text;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    this.pops.append(node);
    setTimeout(() => node.remove(), 1000);
  }

  levelUp(level: number, speed: number): void {
    const node = el('div', 'ae-levelup ae-text');
    node.innerHTML = `LEVEL ${level}!<small>Speed ${speed.toFixed(1)}</small>`;
    this.root.append(node);
    setTimeout(() => node.remove(), 1400);
  }

  /** The screen flushes orange as the lava takes the runner. */
  burn(): void {
    const node = el('div', 'ae-flash');
    this.root.append(node);
    setTimeout(() => node.remove(), 900);
  }

  dispose(): void {
    this.root.remove();
  }
}
