import {
  AVATAR_CHARACTER,
  AVATAR_SLOT,
  CHARACTERS,
  CHARMS,
  GIFTS,
  MAX_EQUIPPED_CHARMS,
  RARITY,
  SHOP_SLOTS,
  STAGE_COUNT,
  TRAILS,
  charmById,
  formatAmount,
  formatBoost,
  formatClock,
  formatWins,
  giftWins,
  levelCapFor,
  nextEvolution,
  ownsCharacter,
  ownsTrail,
  rebirthPower,
  highestOwnedSlot,
  characterBySlot,
  shopStock,
  stageByIndex,
  type CharmActionKind,
  type TrailActionKind,
} from '@anime/shared';
import { injectAnimeStyles } from './animeStyles.js';
import { charmArt, ICON } from './icons.js';
import type { ModelPortraits } from './ModelPortraits.js';

let openWindows = 0;
/** True while any window owns the screen: movement is suppressed. */
export const anyWindowOpen = (): boolean => openWindows > 0;

/** Everything the windows draw, straight from replicated state. */
export interface ViewState {
  wins: number;
  rebirths: number;
  level: number;
  levelCap: number;
  xp: number;
  xpNeeded: number;
  characterSlot: number;
  ownedCharacters: number;
  /** The player's portal portrait: the picture of their Bloxity avatar. */
  avatarUrl: string;
  trailId: number;
  ownedTrails: number;
  charms: readonly number[];
  equippedCharms: readonly number[];
  shopWindow: number;
  shopBought: number;
  shopSecondsLeft: number;
  bestStage: number;
  sessionSeconds: number;
  giftsClaimed: number;
}

export interface WindowActions {
  equipCharacter(slot: number): void;
  evolve(): void;
  trail(action: TrailActionKind, id: number): void;
  charm(action: CharmActionKind, value?: number): void;
  rebirth(): void;
  teleport(to: string): void;
  claimGift(index: number): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
};

const button = (className: string, html: string, onClick: () => void, disabled = false): HTMLButtonElement => {
  const node = el('button', `ae-btn ${className}`, html);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
};

/** A modal window: header bar (icon, title, red X), scrolling body over a dim backdrop. */
class Window {
  readonly root = el('div', 'ae-window');
  protected readonly head: HTMLDivElement;
  protected readonly body = el('div', 'ae-window__body');
  protected state: ViewState | null = null;
  private open = false;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, variant: string, title: string, icon: string) {
    injectAnimeStyles();
    this.root.hidden = true;
    const box = el('div', 'ae-window__box');
    this.head = el('div', `ae-window__head ae-head--${variant} ae-studs`);
    const close = el('button', 'ae-window__close ae-text', 'X');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.setOpen(false));
    this.head.append(el('span', 'ae-window__icon', icon), el('span', 'ae-window__title ae-text', title), close);
    box.append(this.head, this.body);
    this.root.append(box);
    this.root.addEventListener('pointerdown', (event) => {
      if (event.target === this.root) this.setOpen(false);
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.hidden = !open;
    openWindows += open ? 1 : -1;
    if (open) this.render();
    else this.onClose?.();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setState(state: ViewState): void {
    this.state = state;
    if (this.open && this.changed(state)) this.render();
  }

  private signature = '';

  /** Redraw only when what this window shows has changed. */
  protected changed(state: ViewState): boolean {
    const next = this.signatureOf(state);
    if (next === this.signature) return false;
    this.signature = next;
    return true;
  }

  protected signatureOf(state: ViewState): string {
    return JSON.stringify(state);
  }

  protected render(): void {
    // Each window draws itself.
  }

  dispose(): void {
    if (this.open) openWindows -= 1;
    this.root.remove();
  }
}

// ------------------------------------------------------------------ backpack

type BackpackTab = 'anime' | 'trails' | 'charms';

export class BackpackWindow extends Window {
  private tab: BackpackTab = 'anime';
  private readonly tabs = new Map<BackpackTab, HTMLButtonElement>();

  constructor(parent: HTMLElement, private readonly portraits: ModelPortraits, private readonly actions: WindowActions) {
    super(parent, 'backpack', 'Backpack', ICON.backpack);
    const tabs = el('div', 'ae-tabs');
    const make = (tab: BackpackTab, label: string, art: string, background: string): void => {
      const node = el('button', 'ae-tab');
      node.type = 'button';
      node.style.background = background;
      node.append(el('span', 'ae-tab__art', art), el('span', 'ae-tab__label ae-text', label));
      node.addEventListener('click', () => this.show(tab));
      tabs.append(node);
      this.tabs.set(tab, node);
    };
    make('anime', 'Anime', '', 'linear-gradient(180deg,#ffd9a0,#e08a3a)');
    make('trails', 'Trails', ICON.trail, 'linear-gradient(135deg,#ff3b3b,#ffd23b,#3bff5a,#3bb8ff,#c23bff)');
    make('charms', 'Charms', ICON.sword, 'linear-gradient(180deg,#ff8a7a,#c8402e)');
    this.head.insertBefore(tabs, this.head.lastElementChild);
    this.head.querySelector('.ae-window__title')?.classList.add('ae-backpack-title');
  }

  show(tab: BackpackTab): void {
    this.tab = tab;
    if (!this.isOpen) this.setOpen(true);
    else this.render();
  }

  get currentTab(): BackpackTab {
    return this.tab;
  }

  protected override signatureOf(s: ViewState): string {
    return [this.tab, s.wins, s.characterSlot, s.ownedCharacters, s.avatarUrl, s.trailId, s.ownedTrails, s.charms.join(','), s.equippedCharms.join(',')].join('|');
  }

  protected override render(): void {
    const s = this.state;
    const animeArt = this.tabs.get('anime')?.querySelector('.ae-tab__art');
    if (animeArt && !animeArt.innerHTML) {
      const url = this.portraits.character(1);
      if (url) animeArt.innerHTML = `<img src="${url}" alt="" />`;
    }
    for (const [tab, node] of this.tabs) node.classList.toggle('is-active', tab === this.tab);
    this.body.replaceChildren();
    if (!s) return;
    if (this.tab === 'anime') this.renderAnime(s);
    else if (this.tab === 'trails') this.renderTrails(s);
    else this.renderCharms(s);
  }

  private section(kind: string, title: string, art: string, tools?: HTMLElement): void {
    const bar = el('div', `ae-section ae-section--${kind} ae-studs`);
    bar.append(el('span', 'ae-section__art', art), el('span', 'ae-text', title));
    if (tools) bar.append(tools);
    this.body.append(bar);
  }

  private row(art: string, name: string, sub: string, small: string, action: HTMLElement, locked = false): HTMLElement {
    const row = el('div', `ae-row ae-studs${locked ? ' is-locked' : ''}`);
    const info = el('div', 'ae-row__info');
    info.append(el('div', 'ae-row__name ae-text'), el('div', 'ae-row__sub ae-text'));
    (info.children[0] as HTMLElement).textContent = name;
    (info.children[1] as HTMLElement).textContent = sub;
    if (small) {
      const note = el('div', 'ae-row__small ae-text');
      note.textContent = small;
      info.append(note);
    }
    row.append(el('div', 'ae-row__art', art), info, action);
    return row;
  }

  private renderAnime(s: ViewState): void {
    this.section('anime', 'Anime', ICON.evolve);
    const list = el('div', 'ae-list');
    const next = nextEvolution(s.ownedCharacters);
    const avatarArt = `<img src="${s.avatarUrl}" alt="" referrerpolicy="no-referrer" />`;
    const avatarAction =
      s.characterSlot === AVATAR_SLOT
        ? button('ae-btn--green is-state', 'EQUIPPED', () => undefined, true)
        : button('ae-btn--blue', 'EQUIP', () => this.actions.equipCharacter(AVATAR_SLOT));
    list.append(this.row(avatarArt, AVATAR_CHARACTER.name, `${formatBoost(AVATAR_CHARACTER.multiplier)} Boost`, AVATAR_CHARACTER.series, avatarAction, false));
    for (const def of CHARACTERS) {
      const owned = ownsCharacter(s.ownedCharacters, def.slot);
      const url = this.portraits.character(def.slot);
      const art = url ? `<img src="${url}" alt="" />` : ICON.lock;
      let action: HTMLElement;
      if (owned && s.characterSlot === def.slot) action = button('ae-btn--green is-state', 'EQUIPPED', () => undefined, true);
      else if (owned) action = button('ae-btn--blue', 'EQUIP', () => this.actions.equipCharacter(def.slot));
      else if (next && next.slot === def.slot) action = button('ae-btn--yellow', `${ICON.trophy}${formatWins(def.cost)}`, () => this.actions.evolve(), s.wins < def.cost);
      else action = button('ae-btn--grey', `${ICON.lock}`, () => undefined, true);
      list.append(this.row(art, def.name, `${formatBoost(def.multiplier)} Boost`, owned ? def.series : `${def.series} - ${formatWins(def.cost)} Wins`, action, !owned));
    }
    this.body.append(list);
  }

  private renderTrails(s: ViewState): void {
    this.section('trails', 'Trails', ICON.trail);
    const list = el('div', 'ae-list');
    for (const def of TRAILS) {
      const owned = ownsTrail(s.ownedTrails, def.id);
      const swatch =
        def.colors.length === 0
          ? ''
          : `<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#9af29a"/>${def.colors
              .map((c, i) => `<path d="M${4 + i * 3} ${46 - i * 6}c14-14 26-2 40-18" stroke="#${c.toString(16).padStart(6, '0')}" stroke-width="${9 - i}" fill="none" stroke-linecap="round"/>`)
              .join('')}<circle cx="50" cy="16" r="7" fill="#ffd23a" stroke="#141a2a" stroke-width="3"/></svg>`;
      let action: HTMLElement;
      if (owned && s.trailId === def.id) action = button('ae-btn--green is-state', 'EQUIPPED', () => undefined, true);
      else if (owned) action = button('ae-btn--blue', 'EQUIP', () => this.actions.trail('equip', def.id));
      else action = button('ae-btn--green', `${formatWins(def.cost)} Wins`, () => this.actions.trail('buy', def.id), s.wins < def.cost);
      list.append(this.row(swatch, def.name, `${formatBoost(def.multiplier)} Boost`, '', action));
    }
    this.body.append(list);
  }

  private renderCharms(s: ViewState): void {
    const tools = el('div', 'ae-section__tools');
    tools.append(
      button('ae-btn--green ae-btn--small', 'Equip Best', () => this.actions.charm('equipBest')),
      button('ae-btn--red ae-btn--small', 'Unequip All', () => this.actions.charm('unequipAll')),
    );
    const worn = s.equippedCharms.length;
    this.section('charms', `Charms ${worn}/${MAX_EQUIPPED_CHARMS}`, ICON.sword, tools);
    const list = el('div', 'ae-list');
    let any = false;
    for (const def of CHARMS) {
      const count = s.charms[def.id] ?? 0;
      if (count <= 0) continue;
      any = true;
      const wearing = s.equippedCharms.filter((id) => id === def.id).length;
      const actions = el('div', 'ae-section__tools');
      if (wearing > 0) actions.append(button('ae-btn--red ae-btn--small', 'Unequip', () => this.actions.charm('unequip', def.id)));
      if (wearing < count) actions.append(button('ae-btn--green ae-btn--small', 'Equip', () => this.actions.charm('equip', def.id), worn >= MAX_EQUIPPED_CHARMS));
      const rarity = RARITY[def.rarity];
      const row = this.row(charmArt(def.icon, def.colors), `${def.name}${count > 1 ? ` x${count}` : ''}`, `+${def.bonus}% Speed`, `${rarity.label}${wearing > 0 ? ` - Equipped ${wearing}` : ''}`, actions);
      (row.querySelector('.ae-row__art') as HTMLElement).style.background = rarity.color;
      list.append(row);
    }
    if (!any) {
      const note = el('div', 'ae-help ae-text');
      note.textContent = 'No charms yet! Buy them at the Charm Shop behind the spawn.';
      list.append(note);
    }
    this.body.append(list);
  }
}

// ---------------------------------------------------------------- charm shop

export class CharmShopWindow extends Window {
  constructor(parent: HTMLElement, private readonly actions: WindowActions) {
    super(parent, 'shop', 'Charm Shop', ICON.sword);
  }

  protected override signatureOf(s: ViewState): string {
    return [s.wins, s.shopWindow, s.shopBought, Math.floor(s.shopSecondsLeft)].join('|');
  }

  protected override render(): void {
    const s = this.state;
    this.body.replaceChildren();
    if (!s) return;
    const top = el('div', 'ae-shop-top');
    const clock = el('span', 'ae-text');
    clock.textContent = `Restocks in ${formatClock(s.shopSecondsLeft)}`;
    top.append(clock);
    this.body.append(top);

    const cards = el('div', 'ae-cards');
    const stock = shopStock(s.shopWindow);
    for (let i = 0; i < SHOP_SLOTS; i += 1) {
      const def = charmById(stock[i] ?? -1);
      if (!def) continue;
      const rarity = RARITY[def.rarity];
      const sold = (s.shopBought & (1 << i)) !== 0;
      const card = el('div', `ae-card ae-studs${sold ? ' is-sold' : ''}`);
      card.style.background = `linear-gradient(180deg, ${rarity.color}, ${rarity.dark})`;
      const name = el('div', 'ae-card__name ae-text');
      name.textContent = def.name;
      const bonus = el('div', 'ae-card__bonus ae-text');
      bonus.textContent = `+${def.bonus}% Speed`;
      card.append(
        el('div', 'ae-card__rarity ae-text', rarity.label),
        el('div', 'ae-card__art', charmArt(def.icon, def.colors)),
        name,
        bonus,
        button('ae-btn--orange', sold ? 'SOLD' : `${ICON.trophy}${formatAmount(def.cost)}`, () => this.actions.charm('buy', i), sold || s.wins < def.cost),
      );
      cards.append(card);
    }
    this.body.append(cards);
    const help = el('div', 'ae-help ae-text');
    help.textContent = 'New charms every 5 minutes. Wear up to 3 from your Backpack - their bonuses stack!';
    this.body.append(help);
  }
}

// ------------------------------------------------------------------- evolve

export class EvolveWindow extends Window {
  constructor(parent: HTMLElement, private readonly portraits: ModelPortraits, private readonly actions: WindowActions) {
    super(parent, 'evolve', 'Evolve', ICON.flame);
  }

  protected override signatureOf(s: ViewState): string {
    return [s.wins, s.ownedCharacters, s.avatarUrl].join('|');
  }

  private portrait(slot: number): HTMLElement {
    const def = characterBySlot(slot)!;
    // The avatar's picture is the player's own portal portrait; an evolution is rendered from its model.
    const url = slot === AVATAR_SLOT ? (this.state?.avatarUrl ?? '') : this.portraits.character(slot);
    const node = el('div', 'ae-portrait ae-studs', url ? `<img src="${url}" alt="" />` : '');
    const name = el('div', 'ae-portrait__name ae-text');
    name.textContent = def.name.split(' ')[0] ?? def.name;
    node.append(name);
    return node;
  }

  protected override render(): void {
    const s = this.state;
    this.body.replaceChildren();
    if (!s) return;
    const current = highestOwnedSlot(s.ownedCharacters);
    const next = nextEvolution(s.ownedCharacters);
    const compare = el('div', 'ae-compare');
    const side = (label: string, slot: number): HTMLElement => {
      const column = el('div');
      const def = characterBySlot(slot)!;
      const speed = el('div', 'ae-compare__label ae-text');
      speed.textContent = `x${def.multiplier.toFixed(2)} Speed`;
      column.append(el('div', 'ae-compare__label ae-text', label), this.portrait(slot), speed);
      return column;
    };
    if (!next) {
      compare.append(side('Now', current), el('div', 'ae-arrows'), el('div', 'ae-compare__label ae-text', 'Fully Evolved!'));
      this.body.append(compare);
      return;
    }
    const arrows = el('div', 'ae-arrows');
    arrows.append(el('span', 'ae-arrow', ICON.arrows), el('span', 'ae-arrow', ICON.arrows));
    compare.append(side('Before', current), arrows, side('After', next.slot));
    this.body.append(compare);
    const actions = el('div', 'ae-actions');
    actions.append(button('ae-btn--orange', `${ICON.trophy} ${formatWins(next.cost)}`, () => this.actions.evolve(), s.wins < next.cost));
    this.body.append(actions);
    const help = el('div', 'ae-help ae-text');
    help.textContent = `${next.name} (${next.series}) multiplies every step of Speed you earn.`;
    this.body.append(help);
  }
}

// ------------------------------------------------------------------ rebirth

export class RebirthWindow extends Window {
  constructor(parent: HTMLElement, private readonly actions: WindowActions) {
    super(parent, 'rebirth', 'Rebirth', ICON.rebirth);
  }

  protected override signatureOf(s: ViewState): string {
    return [s.level, s.rebirths].join('|');
  }

  protected override render(): void {
    const s = this.state;
    this.body.replaceChildren();
    if (!s) return;
    const cap = levelCapFor(s.rebirths);
    const compare = el('div', 'ae-compare');
    const column = (label: string, rebirths: number): HTMLElement => {
      const node = el('div');
      node.style.display = 'grid';
      node.style.gap = 'calc(12 * var(--u))';
      node.append(
        el('div', 'ae-compare__label ae-text', label),
        el('div', 'ae-stat-box ae-stat-box--power ae-text', `${rebirthPower(rebirths).toFixed(1)}x Power`),
        el('div', 'ae-stat-box ae-stat-box--cap ae-text', `Lvl ${levelCapFor(rebirths)} Cap`),
      );
      return node;
    };
    const arrows = el('div', 'ae-arrows');
    arrows.append(el('span', 'ae-arrow', ICON.arrows), el('span', 'ae-arrow', ICON.arrows));
    compare.append(column('Before:', s.rebirths), arrows, column('After', s.rebirths + 1));
    this.body.append(compare, el('div', 'ae-warn ae-text', 'Rebirthing Resets your Level!'));
    const progress = el('div', 'ae-progress');
    const fill = el('div', 'ae-progress__fill');
    fill.style.width = `${Math.min(100, (s.level / cap) * 100)}%`;
    progress.append(fill, el('div', 'ae-progress__text ae-text', `Lvl ${s.level}/${cap}`));
    this.body.append(progress);
    const actions = el('div', 'ae-actions');
    actions.append(button('ae-btn--green', 'Rebirth', () => this.actions.rebirth(), s.level < cap));
    this.body.append(actions);
  }
}

// ----------------------------------------------------------------- teleport

export class TeleportWindow extends Window {
  constructor(parent: HTMLElement, private readonly actions: WindowActions) {
    super(parent, 'teleport', 'Teleport', ICON.teleport);
  }

  protected override signatureOf(s: ViewState): string {
    return String(s.bestStage);
  }

  protected override render(): void {
    const s = this.state;
    this.body.replaceChildren();
    const places = el('div', 'ae-grid');
    const place = (label: string, sub: string, to: string, stage: boolean, locked = false): void => {
      const node = el('button', `ae-place${stage ? ' ae-place--stage' : ''}`);
      node.type = 'button';
      node.disabled = locked;
      node.append(document.createTextNode(label));
      if (sub) node.append(el('small', '', sub));
      node.addEventListener('click', () => {
        this.actions.teleport(to);
        this.setOpen(false);
      });
      places.append(node);
    };
    place('Spawn', 'Evolve here', 'spawn', false);
    place('Treadmills', 'Auto Speed', 'treadmills', false);
    place('Charm Shop', 'Restocks 5m', 'shop', false);
    place('Leaderboards', 'Top players', 'boards', false);
    const best = s?.bestStage ?? 0;
    for (let stage = 1; stage <= STAGE_COUNT; stage += 1) {
      const def = stageByIndex(stage)!;
      const open = stage <= best + 1;
      place(`Stage ${stage}`, open ? `Lvl ${def.recommended}  -  ${formatWins(def.reward)} Wins` : 'Locked', `stage${stage}`, true, !open);
    }
    this.body.append(places);
  }
}

// ------------------------------------------------------------------ rewards

export class RewardsWindow extends Window {
  constructor(parent: HTMLElement, private readonly actions: WindowActions) {
    super(parent, 'rewards', 'Rewards', ICON.gift);
  }

  protected override signatureOf(s: ViewState): string {
    return [Math.floor(s.sessionSeconds), s.giftsClaimed, s.rebirths].join('|');
  }

  protected override render(): void {
    const s = this.state;
    this.body.replaceChildren();
    const grid = el('div', 'ae-grid');
    GIFTS.forEach((gift, index) => {
      const claimed = s ? (s.giftsClaimed & (1 << index)) !== 0 : false;
      const left = Math.max(0, gift.minutes * 60 - (s?.sessionSeconds ?? 0));
      const node = el('div', 'ae-card ae-studs');
      node.style.background = claimed ? 'linear-gradient(180deg,#8a8f9a,#5a5f6a)' : 'linear-gradient(180deg,#5ad8ff,#1f7fe0)';
      const wins = el('div', 'ae-card__bonus ae-text');
      wins.textContent = `+${formatWins(giftWins(index, s?.rebirths ?? 0))} Wins`;
      node.append(
        el('div', 'ae-card__art', ICON.gift),
        wins,
        claimed
          ? button('ae-btn--grey ae-btn--small', 'Claimed', () => undefined, true)
          : left > 0
            ? button('ae-btn--grey ae-btn--small', formatClock(left), () => undefined, true)
            : button('ae-btn--green ae-btn--small', 'Claim!', () => this.actions.claimGift(index)),
      );
      grid.append(node);
    });
    const help = el('div', 'ae-help ae-text');
    help.textContent = 'Gifts open the longer you play this session.';
    this.body.append(grid, help);
  }
}

/** True when a gift is ready to open (for the Rewards tile's "!"). */
export const giftWaiting = (s: ViewState): boolean =>
  GIFTS.some((gift, index) => (s.giftsClaimed & (1 << index)) === 0 && s.sessionSeconds >= gift.minutes * 60);
