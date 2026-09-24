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
  /** The Wins row: where the celebration's trophies fly to. */
  private winsStat!: HTMLElement;
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
    this.winsStat = stat(ICON.trophy, this.winsText);
    left.append(stat(ICON.rebirth, this.rebirthText), this.winsStat, stat(ICON.shoe, this.speedText));
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

  /**
   * THE TROPHY CELEBRATION for a claimed stage: a golden trophy bursts onto
   * the screen in a burst of rays and confetti with "+N WINS!", bounces and
   * wobbles, then flies into the Wins counter - with a stream of little
   * trophies behind it - and the counter pops as each one lands. Pure CSS
   * animation over the HUD: no assets, nothing per frame in script.
   */
  trophy(wins: number): void {
    this.root.querySelector('.ae-trophy')?.remove();
    const overlay = el('div', 'ae-trophy');
    const fly = el('div', 'ae-trophy__fly');
    const cup = el('div', 'ae-trophy__cup', ICON.trophy);
    fly.append(cup);
    const label = el('div', 'ae-trophy__text ae-text');
    label.textContent = '+' + formatWins(wins) + (wins === 1 ? ' WIN!' : ' WINS!');
    overlay.append(el('div', 'ae-trophy__rays'), el('div', 'ae-trophy__glow'), fly, label);

    // Confetti, bursting out and falling a little, sized to the screen.
    const reach = Math.min(window.innerWidth, window.innerHeight);
    const colors = ['#ffe14a', '#ffb21f', '#ffffff', '#7fd8ff', '#ff6fae', '#8cf05a'];
    for (let i = 0; i < 30; i += 1) {
      const a = (i / 30) * Math.PI * 2 + Math.random() * 0.25;
      const r = reach * (0.16 + Math.random() * 0.2);
      const bit = el('span', 'ae-trophy__bit');
      bit.style.setProperty('--x', Math.cos(a) * r + 'px');
      bit.style.setProperty('--y', Math.sin(a) * r + reach * 0.08 + 'px');
      bit.style.setProperty('--s', Math.round(Math.random() * 720 - 360) + 'deg');
      bit.style.background = colors[i % colors.length]!;
      bit.style.animationDelay = (Math.random() * 0.08).toFixed(2) + 's';
      overlay.append(bit);
    }
    this.root.append(overlay);

    // From the trophy's centre to the Wins icon.
    const target = (this.winsStat.querySelector('.ae-stat__icon') as HTMLElement | null) ?? this.winsStat;
    const from = overlay.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - from.left + 'px';
    const dy = to.top + to.height / 2 - from.top + 'px';
    fly.style.setProperty('--dx', dx);
    fly.style.setProperty('--dy', dy);
    fly.addEventListener('animationend', () => this.bumpWins());

    const minis = Math.min(7, 3 + Math.floor(Math.log10(wins + 1) * 2));
    for (let k = 0; k < minis; k += 1) {
      const mini = el('div', 'ae-trophy__mini', ICON.trophy);
      const a = Math.random() * Math.PI * 2;
      mini.style.setProperty('--mx', Math.cos(a) * reach * 0.12 + 'px');
      mini.style.setProperty('--my', Math.sin(a) * reach * 0.08 + 'px');
      mini.style.setProperty('--dx', dx);
      mini.style.setProperty('--dy', dy);
      mini.style.animationDelay = (0.5 + k * 0.09).toFixed(2) + 's';
      mini.addEventListener('animationend', () => {
        mini.remove();
        this.bumpWins();
      });
      overlay.append(mini);
    }
    setTimeout(() => overlay.remove(), 2400);
  }

  /** The Wins counter pops (restarting the pop if one is still playing). */
  private bumpWins(): void {
    this.winsStat.classList.remove('is-bump');
    void this.winsStat.offsetWidth;
    this.winsStat.classList.add('is-bump');
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
