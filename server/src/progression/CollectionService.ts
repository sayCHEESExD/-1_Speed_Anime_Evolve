import {
  CHARM_COUNT,
  CHARM_SHOP,
  MAX_CHARM_INVENTORY,
  MAX_EQUIPPED_CHARMS,
  SHOP_SLOTS,
  bestCharms,
  characterBySlot,
  charmById,
  nextEvolution,
  ownsCharacter,
  ownsTrail,
  shopStock,
  trailById,
  type CharacterDef,
  type CharmDef,
  type TrailDef,
} from '@anime/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { ProgressionService } from './ProgressionService.js';
import { wallet } from './Wallet.js';

/** How near the charm shop's pad a purchase must be made from. */
const SHOP_REACH = 18;

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string; value?: T };

const fail = <T>(reason: string, value?: T): Outcome<T> =>
  value === undefined ? { ok: false, reason } : { ok: false, reason, value };

/**
 * EVERYTHING A PLAYER OWNS: characters (evolutions), trails and charms.
 *
 * Every purchase checks the SERVER's wallet (and for the charm shop, the
 * server's position of the player), spends through `Wallet`, then re-derives
 * through `ProgressionService.syncDerived` - so a change reaches the Speed
 * formula the moment it is made.
 */
export class CollectionService {
  // ------------------------------------------------------------ characters

  /** Evolve into the next character. */
  evolve(player: PlayerState, progression: ProgressionService): Outcome<CharacterDef> {
    const next = nextEvolution(player.ownedCharacters);
    if (!next) return fail('max');
    if (!wallet.spend(player, next.cost)) return fail('too-few-wins', next);
    player.ownedCharacters |= 1 << (next.slot - 1);
    player.characterSlot = next.slot;
    progression.syncDerived(player);
    return { ok: true, value: next };
  }

  wearCharacter(player: PlayerState, slot: unknown, progression: ProgressionService): Outcome<CharacterDef> {
    const def = characterBySlot(Number(slot));
    if (!def) return fail('unknown');
    if (!ownsCharacter(player.ownedCharacters, def.slot)) return fail('locked', def);
    player.characterSlot = def.slot;
    progression.syncDerived(player);
    return { ok: true, value: def };
  }

  // ---------------------------------------------------------------- trails

  trail(player: PlayerState, action: unknown, id: unknown, progression: ProgressionService): Outcome<{ trail: TrailDef; bought: boolean }> {
    const def = trailById(Number(id));
    if (!def) return fail('unknown');
    let bought = false;
    if (!ownsTrail(player.ownedTrails, def.id)) {
      if (action !== 'buy') return fail('locked');
      if (!wallet.spend(player, def.cost)) return fail('too-few-wins', { trail: def, bought: false });
      player.ownedTrails |= 1 << def.id;
      bought = true;
    }
    player.trailId = def.id;
    progression.syncDerived(player);
    return { ok: true, value: { trail: def, bought } };
  }

  // ---------------------------------------------------------------- charms

  /** Bring a player's shop bookkeeping into the current window. */
  normaliseShop(player: PlayerState, window: number): void {
    if (player.shopWindow === window) return;
    player.shopWindow = window;
    player.shopBought = 0;
  }

  heldCharms(player: PlayerState): number {
    let total = 0;
    for (let id = 0; id < CHARM_COUNT; id += 1) total += player.charms[id] ?? 0;
    return total;
  }

  buyCharm(player: PlayerState, card: unknown, window: number, progression: ProgressionService): Outcome<CharmDef> {
    this.normaliseShop(player, window);
    const index = Math.floor(Number(card));
    if (!(index >= 0 && index < SHOP_SLOTS)) return fail('unknown');
    if (Math.hypot(player.x - CHARM_SHOP.x, player.z - CHARM_SHOP.padZ) > SHOP_REACH) return fail('away');
    const charm = charmById(shopStock(window)[index] ?? -1);
    if (!charm) return fail('unknown');
    if ((player.shopBought & (1 << index)) !== 0) return fail('sold-out', charm);
    if (this.heldCharms(player) >= MAX_CHARM_INVENTORY) return fail('full', charm);
    if (!wallet.spend(player, charm.cost)) return fail('too-few-wins', charm);
    player.shopBought |= 1 << index;
    this.addCharm(player, charm.id, progression);
    return { ok: true, value: charm };
  }

  /** A charm added to the bag (a shop purchase). */
  addCharm(player: PlayerState, id: number, progression: ProgressionService): void {
    if (!charmById(id)) return;
    player.charms[id] = Math.min(999, (player.charms[id] ?? 0) + 1);
    // Free slots fill at once: a new charm is working the moment it lands.
    if (player.equippedCharms.length < MAX_EQUIPPED_CHARMS) player.equippedCharms.push(id);
    progression.syncDerived(player);
  }

  charmAction(player: PlayerState, action: unknown, value: unknown, progression: ProgressionService): Outcome<string> {
    const worn = Array.from(player.equippedCharms);
    if (action === 'equipBest') {
      this.setWorn(player, bestCharms(Array.from(player.charms)));
    } else if (action === 'unequipAll') {
      this.setWorn(player, []);
    } else if (action === 'equip' || action === 'unequip') {
      const id = Math.floor(Number(value));
      if (!charmById(id)) return fail('unknown');
      const wearing = worn.filter((entry) => entry === id).length;
      if (action === 'equip') {
        if (worn.length >= MAX_EQUIPPED_CHARMS) return fail('slots-full');
        if (wearing >= (player.charms[id] ?? 0)) return fail('none-left');
        worn.push(id);
      } else {
        const at = worn.indexOf(id);
        if (at < 0) return fail('not-worn');
        worn.splice(at, 1);
      }
      this.setWorn(player, worn);
    } else {
      return fail('unknown');
    }
    progression.syncDerived(player);
    return { ok: true, value: String(action) };
  }

  private setWorn(player: PlayerState, ids: readonly number[]): void {
    player.equippedCharms.clear();
    for (const id of ids.slice(0, MAX_EQUIPPED_CHARMS)) player.equippedCharms.push(id);
  }
}
