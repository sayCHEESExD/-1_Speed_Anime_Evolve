import type { CharmIcon } from '@anime/shared';

/**
 * The HUD's icons: the supplied images where there is one (shop, backpack,
 * rebirth, trophy, shoe, sound, aura) and small inline SVGs for the rest -
 * teleport, gifts, the pencil, and every charm. No icon costs a
 * download beyond the supplied set.
 */
const img = (src: string, alt: string, extra = ''): string =>
  `<img class="ae-icon-img ${extra}" src="${src}" alt="${alt}" draggable="false" />`;

export const ICON = {
  shop: img('/ui/shop.png', 'Store'),
  backpack: img('/ui/inventory.png', 'Backpack'),
  rebirth: img('/ui/rebirth.png', 'Rebirth'),
  evolve: img('/ui/aura.png', 'Evolve', 'ae-evolve-icon'),
  trophy: img('/ui/trophy.png', 'Wins'),
  shoe: img('/ui/shoe.png', 'Speed'),
  sound: img('/ui/Sound.png', 'Music'),
  upgrades: img('/ui/Upgrades.png', 'Charms'),
  teleport:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="40" width="44" height="16" rx="5" fill="#7a5ad8" stroke="#141a2a" stroke-width="3.5"/>' +
    '<rect x="29" y="18" width="6" height="26" fill="#3a2a6a" stroke="#141a2a" stroke-width="3"/><circle cx="32" cy="16" r="11" fill="#ff3b4b" stroke="#141a2a" stroke-width="3.5"/>' +
    '<circle cx="28" cy="12" r="3.5" fill="#ffb0b8"/><circle cx="18" cy="48" r="3" fill="#ffd23a"/><circle cx="46" cy="48" r="3" fill="#3bff7a"/></svg>',
  gift:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="28" width="44" height="30" rx="3" fill="#3b8bff" stroke="#141a2a" stroke-width="3.5"/>' +
    '<rect x="6" y="20" width="52" height="12" rx="3" fill="#5ab0ff" stroke="#141a2a" stroke-width="3.5"/><rect x="28" y="20" width="8" height="38" fill="#ffd23a" stroke="#141a2a" stroke-width="3"/>' +
    '<path d="M32 20c-4-10-16-12-16-4 0 5 10 5 16 4zm0 0c4-10 16-12 16-4 0 5-10 5-16 4z" fill="#ff8a1f" stroke="#141a2a" stroke-width="3"/></svg>',
  pencil:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M44 6l14 14-30 30-16 4 4-16z" fill="#ffd23a" stroke="#141a2a" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M44 6l14 14-6 6-14-14z" fill="#ff6a8a" stroke="#141a2a" stroke-width="3"/><path d="M16 38l10 10-12 4z" fill="#f2d9b0" stroke="#141a2a" stroke-width="3"/></svg>',
  lock:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="28" width="40" height="30" rx="5" fill="#ffd23a" stroke="#141a2a" stroke-width="4"/>' +
    '<path d="M20 28v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#141a2a" stroke-width="6"/><circle cx="32" cy="42" r="4" fill="#141a2a"/></svg>',
  arrows:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 10l24 22L8 54z" fill="#fff" stroke="#6a8ac8" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M32 10l24 22-24 22z" fill="#fff" stroke="#6a8ac8" stroke-width="3" stroke-linejoin="round"/></svg>',
  trail:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 40c10-12 20-4 28-14" stroke="#5aff6a" stroke-width="10" fill="none" stroke-linecap="round"/>' +
    '<path d="M4 50c12-10 22-2 30-12" stroke="#3bb8ff" stroke-width="8" fill="none" stroke-linecap="round"/>' +
    '<circle cx="44" cy="14" r="7" fill="#ffd23a" stroke="#141a2a" stroke-width="3"/><path d="M44 22l-4 16 8 8M40 30l12-4M40 38l-8 10" stroke="#ffb21f" stroke-width="6" fill="none" stroke-linecap="round"/></svg>',
  sword:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M50 4l10 0 0 10-30 30-10-10z" fill="#dfe6ee" stroke="#141a2a" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M12 36l16 16-4 4-16-16z" fill="#ff3b4b" stroke="#141a2a" stroke-width="3.5"/><path d="M10 50l4 4-8 8-4-4z" fill="#8a5a33" stroke="#141a2a" stroke-width="3"/></svg>',
  flame:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4c6 10 20 18 20 34a20 20 0 0 1-40 0c0-8 4-12 8-16 0 6 4 10 8 10-2-10 0-20 4-28z" fill="#c24dff" stroke="#2a0a4a" stroke-width="3.5"/>' +
    '<path d="M32 30c4 6 10 8 10 16a10 10 0 0 1-20 0c0-6 6-8 10-16z" fill="#f2c2ff"/></svg>',
} as const;

const svg = (body: string): string => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const S = 'stroke="#141a2a" stroke-width="3.5" stroke-linejoin="round"';

/** A charm's art, in its two colours. */
export const charmArt = (icon: CharmIcon, colors: readonly [string, string]): string => {
  const [a, b] = colors;
  switch (icon) {
    case 'mask':
      return svg(
        `<path d="M32 4c14 0 24 10 24 26 0 16-10 30-24 30S8 46 8 30C8 14 18 4 32 4z" fill="${a}" ${S}/>` +
          `<path d="M16 26c4-3 10-3 13 2-4 5-10 5-13-2zM48 26c-4-3-10-3-13 2 4 5 10 5 13-2z" fill="#141a2a"/>` +
          `<path d="M20 44h24M24 44v8M32 44v9M40 44v8" stroke="#141a2a" stroke-width="3"/><path d="M14 16c6 2 8 8 6 14M50 16c-6 2-8 8-6 14" stroke="${b}" stroke-width="4" fill="none"/>`,
      );
    case 'kunai':
      return svg(
        `<path d="M50 6 58 14 30 42 22 34z" fill="#c9d2de" ${S}/><path d="M22 34l8 8-6 6-8-8z" fill="${a}" ${S}/>` +
          `<path d="M16 40l8 8-8 8-8-8z" fill="${b}" ${S}/><circle cx="10" cy="54" r="5" fill="none" stroke="#141a2a" stroke-width="3"/>`,
      );
    case 'finger':
      return svg(
        `<path d="M22 58c-4-14 0-40 6-50 4-4 10-2 10 4 2 14 4 30 2 46z" fill="${a}" ${S}/>` +
          `<path d="M26 18h10M26 30h12M26 42h12" stroke="${b}" stroke-width="3"/><path d="M28 8c2-3 6-3 8 0" stroke="#e8d9c8" stroke-width="3" fill="none"/>`,
      );
    case 'headband':
      return svg(
        `<path d="M6 26c16-8 36-8 52 0v12c-16-8-36-8-52 0z" fill="${a}" ${S}/><rect x="20" y="22" width="24" height="16" rx="3" fill="${b}" ${S}/>` +
          `<path d="M26 32c2-6 10-6 12 0-4 2-8 2-12 0z" fill="none" stroke="#141a2a" stroke-width="2.5"/><path d="M58 32l4 16M56 34l-2 16" stroke="${a}" stroke-width="4"/>`,
      );
    case 'hat':
      return svg(`<ellipse cx="32" cy="40" rx="28" ry="10" fill="${a}" ${S}/><path d="M16 38c0-18 32-18 32 0z" fill="${a}" ${S}/><path d="M17 32c8 4 22 4 30 0v6c-8 4-22 4-30 0z" fill="${b}"/>`);
    case 'star':
      return svg(`<path d="M32 4l7 21h22L43 38l7 22-18-13-18 13 7-22L3 25h22z" fill="${a}" ${S}/><circle cx="32" cy="32" r="6" fill="${b}" ${S}/>`);
    case 'orb':
      return svg(`<circle cx="32" cy="32" r="26" fill="${a}" ${S}/><circle cx="24" cy="22" r="7" fill="#fff" opacity=".6"/><path d="M32 24l3 7h7l-6 5 2 7-6-4-6 4 2-7-6-5h7z" fill="${b}"/>`);
    case 'blade':
      return svg(
        `<path d="M56 4 60 8 22 46 18 42z" fill="${b}" ${S}/><rect x="10" y="40" width="14" height="6" transform="rotate(-45 17 43)" fill="${a}" ${S}/>` +
          `<path d="M14 46l6 6-10 10-6-6z" fill="${a}" ${S}/>`,
      );
    case 'key':
      return svg(`<circle cx="22" cy="22" r="14" fill="${a}" ${S}/><circle cx="22" cy="22" r="5" fill="${b}"/><path d="M30 30l26 26M44 44l6-6M50 50l6-6" stroke="${a}" stroke-width="7" stroke-linecap="round"/><path d="M30 30l26 26" stroke="#141a2a" stroke-width="2"/>`);
    case 'book':
      return svg(
        `<rect x="10" y="8" width="44" height="50" rx="4" fill="${a}" ${S}/><path d="M32 18c-4 4-10 4-10 10s6 8 10 4c4 4 10 2 10-4s-6-6-10-10z" fill="${b}"/>` +
          `<path d="M32 30v12" stroke="${b}" stroke-width="3"/><path d="M14 8v50" stroke="#fff" stroke-width="2" opacity=".4"/>`,
      );
    case 'blindfold':
      return svg(
        `<circle cx="32" cy="34" r="24" fill="#f4f6ff" ${S}/><rect x="6" y="24" width="52" height="14" rx="4" fill="${a}" ${S}/>` +
          `<path d="M14 14l6 8M26 8l2 12M40 8l-2 12M52 14l-6 8" stroke="#141a2a" stroke-width="3"/><circle cx="32" cy="31" r="3" fill="${b}"/>`,
      );
    case 'sword':
      return svg(
        `<path d="M14 50 50 6c6 0 8 4 8 8L22 56z" fill="#dde2ea" ${S}/><path d="M18 54l-4-4-6 6 6 6z" fill="${a}" ${S}/>` +
          `<path d="M22 56 50 12" stroke="${b}" stroke-width="3"/>`,
      );
  }
};
