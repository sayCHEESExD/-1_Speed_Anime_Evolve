import { injectHudStyles } from './hudStyles.js';

let injected = false;

/**
 * THE ANIME EVOLVE HUD's STYLESHEET (`ae-` classes), injected once.
 *
 * Built on the shared HUD unit `--u` (one pixel of a 1920x1080 design,
 * bounded both ways): every size below is `calc(N * var(--u))` with a pixel
 * floor where a touch target or text would otherwise get too small, so the
 * same layout serves a desktop and a phone held landscape.
 *
 * The look follows the reference: chunky white text with a dark outline,
 * studded plastic tiles with thick dark borders, and windows with a bright
 * header bar, a red X, and a dark translucent body.
 */
export const injectAnimeStyles = (): void => {
  if (injected) return;
  injected = true;
  injectHudStyles();
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
};

const STUDS =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect x='3' y='3' width='8' height='8' rx='1.5' fill='none' stroke='rgba(0,0,0,0.12)' stroke-width='1.5'/%3E%3Crect x='15' y='15' width='8' height='8' rx='1.5' fill='none' stroke='rgba(0,0,0,0.12)' stroke-width='1.5'/%3E%3Crect x='15' y='3' width='8' height='8' rx='1.5' fill='none' stroke='rgba(255,255,255,0.12)' stroke-width='1.5'/%3E%3Crect x='3' y='15' width='8' height='8' rx='1.5' fill='none' stroke='rgba(255,255,255,0.12)' stroke-width='1.5'/%3E%3C/svg%3E\")";

const CSS = `
:root {
  --ae-ink: #151a2a;
  --ae-outline: 0 0 0 transparent;
}
.ae-root { position: fixed; inset: 0; pointer-events: none; font-family: var(--gs-font); font-weight: 700; color: #fff; z-index: 20; }
.ae-root * { box-sizing: border-box; }
.ae-text {
  color: #fff;
  -webkit-text-stroke: max(1.5px, calc(5 * var(--u))) var(--ae-ink);
  paint-order: stroke fill;
  text-shadow: 0 calc(3 * var(--u)) 0 rgba(0, 0, 0, 0.35);
  letter-spacing: 0.01em;
}
.ae-studs { background-image: ${STUDS}; background-size: max(12px, calc(34 * var(--u))) max(12px, calc(34 * var(--u))); }
.ae-icon-img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; -webkit-user-drag: none; }

/* ---------------------------------------------------------------- left */
.ae-left {
  position: absolute;
  left: max(10px, calc(16 * var(--u)), env(safe-area-inset-left, 0px));
  top: max(64px, 16vh);
  display: flex; flex-direction: column; gap: calc(6 * var(--u));
}
.ae-stat { display: flex; align-items: center; gap: calc(10 * var(--u)); font-size: max(18px, calc(52 * var(--u))); line-height: 1; }
.ae-stat__icon { width: max(26px, calc(72 * var(--u))); height: max(26px, calc(72 * var(--u))); flex: none; }
.ae-tiles {
  margin-top: calc(6 * var(--u));
  display: grid; grid-template-columns: repeat(2, max(52px, calc(136 * var(--u)))); gap: max(6px, calc(14 * var(--u)));
  pointer-events: auto;
}
.ae-tile {
  position: relative; width: max(52px, calc(136 * var(--u))); height: max(52px, calc(136 * var(--u)));
  border: max(2px, calc(5 * var(--u))) solid var(--ae-ink); border-radius: calc(10 * var(--u));
  box-shadow: 0 calc(6 * var(--u)) 0 rgba(0, 0, 0, 0.3), inset 0 calc(4 * var(--u)) 0 rgba(255, 255, 255, 0.35);
  cursor: pointer; padding: 0; overflow: visible; font-family: var(--gs-font);
  transition: transform 80ms ease;
}
.ae-tile:hover { transform: translateY(calc(-2 * var(--u))) scale(1.03); }
.ae-tile:active { transform: translateY(calc(3 * var(--u))); }
.ae-tile__icon { position: absolute; left: 8%; right: 8%; top: 4%; bottom: 22%; display: grid; place-items: center; }
.ae-tile__icon svg, .ae-tile__icon img { width: 100%; height: 100%; }
.ae-tile__label {
  position: absolute; left: -6%; right: -6%; bottom: 3%; text-align: center;
  font-size: max(11px, calc(30 * var(--u))); line-height: 1;
}
.ae-tile__badge {
  position: absolute; right: calc(-14 * var(--u)); top: calc(-18 * var(--u));
  font-size: max(22px, calc(64 * var(--u))); color: #ff2a2a; line-height: 1; display: none;
  -webkit-text-stroke: max(1.5px, calc(5 * var(--u))) #fff; paint-order: stroke fill;
  animation: ae-bob 1s ease-in-out infinite;
}
.ae-tile.is-ready .ae-tile__badge { display: block; }
.ae-tile__key {
  position: absolute; left: calc(4 * var(--u)); top: calc(2 * var(--u)); font-size: max(9px, calc(18 * var(--u)));
  opacity: 0.85;
}
body.aoe-touch-mode .ae-tile__key { display: none; }
.ae-tile--backpack { background: linear-gradient(180deg, #e8c9a0, #c89a6a); }
.ae-tile--teleport { background: linear-gradient(180deg, #a98bff, #6a4ad8); }
.ae-tile--rebirth { background: linear-gradient(180deg, #ff6aa8, #e0306e); }
.ae-tile--evolve { background: linear-gradient(180deg, #d06aff, #9a2ae0); }
.ae-tile--rewards { background: linear-gradient(180deg, #5ad8ff, #1f8fe0); }
.ae-evolve-icon { filter: hue-rotate(58deg) saturate(1.6) brightness(1.1); }
@keyframes ae-bob { 0%, 100% { transform: translateY(0) rotate(8deg); } 50% { transform: translateY(calc(-6 * var(--u))) rotate(8deg); } }

/* -------------------------------------------------------------- bottom */
.ae-bottom {
  position: absolute; left: 50%; transform: translateX(-50%);
  bottom: max(8px, calc(12 * var(--u)), env(safe-area-inset-bottom, 0px));
  width: min(92vw, max(320px, calc(900 * var(--u))));
  display: flex; flex-direction: column; align-items: center; gap: calc(8 * var(--u));
}
.ae-level {
  position: relative; width: calc(100% - max(40px, calc(90 * var(--u)))); height: max(28px, calc(62 * var(--u)));
  border: max(2px, calc(4 * var(--u))) solid #2a2a14; background: #6a5a1a; overflow: hidden;
  box-shadow: 0 calc(4 * var(--u)) 0 rgba(0, 0, 0, 0.3);
}
.ae-level__fill { position: absolute; inset: 0 auto 0 0; width: 0%; background: linear-gradient(180deg, #fff27a, #ffd21f); transition: width 160ms linear; }
.ae-level.is-capped .ae-level__fill { width: 100% !important; background: linear-gradient(180deg, #fff27a, #ffd21f); }
.ae-level__text { position: absolute; inset: 0; display: grid; place-items: center; font-size: max(14px, calc(38 * var(--u))); white-space: nowrap; }
.ae-level__lvl { position: absolute; left: calc(12 * var(--u)); top: 50%; transform: translateY(-50%); font-size: max(12px, calc(28 * var(--u))); }

/* --------------------------------------------------------- centre / pops */
.ae-stagebar {
  position: absolute; top: max(8px, calc(14 * var(--u)), env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
  font-size: max(13px, calc(32 * var(--u))); white-space: nowrap; display: none;
}
.ae-stagebar.is-shown { display: block; }
.ae-stagebar small { font-size: 0.72em; color: #9fe0ff; }
.ae-toasts { position: absolute; top: max(44px, 12vh); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(8 * var(--u)); }
.ae-toast {
  font-size: max(15px, calc(38 * var(--u))); padding: calc(6 * var(--u)) calc(22 * var(--u)); border-radius: calc(10 * var(--u));
  background: rgba(20, 24, 40, 0.55); animation: ae-toast 2.6s ease forwards; white-space: nowrap;
}
.ae-toast--good { color: #7dff6a; }
.ae-toast--bad { color: #ff6a6a; }
.ae-toast--gold { color: #ffe14a; }
.ae-toast--pink { color: #ff8ae0; }
@keyframes ae-toast { 0% { opacity: 0; transform: translateY(calc(-10 * var(--u))) scale(0.9); } 8% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(calc(-14 * var(--u))); } }
.ae-pop {
  position: absolute; display: flex; align-items: center; gap: calc(6 * var(--u)); font-size: max(16px, calc(40 * var(--u)));
  color: #7dff6a; animation: ae-pop 1s ease-out forwards; white-space: nowrap; transform: translate(-50%, -50%);
}
.ae-pop img { width: max(22px, calc(52 * var(--u))); height: max(22px, calc(52 * var(--u))); }
@keyframes ae-pop { 0% { opacity: 0; margin-top: 0; } 12% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; margin-top: calc(-90 * var(--u)); } }
.ae-levelup {
  position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%); font-size: max(30px, calc(92 * var(--u)));
  color: #ffe14a; animation: ae-levelup 1.4s ease forwards; white-space: nowrap;
}
.ae-levelup small { display: block; text-align: center; font-size: 0.45em; color: #7dff6a; }
@keyframes ae-levelup { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); } 30% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
/* The trophy celebration on a claim: an overlay anchored at one point, everything centred on it. */
.ae-trophy { position: absolute; left: 50%; top: 40%; width: 0; height: 0; pointer-events: none; z-index: 30; --cup: max(150px, calc(270 * var(--u))); }
.ae-trophy__rays {
  position: absolute; left: 0; top: 0; width: calc(var(--cup) * 3.6); height: calc(var(--cup) * 3.6); border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(255, 225, 74, 0.6) 0deg 9deg, rgba(255, 225, 74, 0) 9deg 22deg);
  -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%); mask: radial-gradient(circle, #000 18%, transparent 68%);
  animation: ae-trophy-rays 1.9s ease-out both;
}
@keyframes ae-trophy-rays {
  0% { opacity: 0; transform: translate(-50%, -50%) rotate(0deg) scale(0.3); }
  15% { opacity: 1; transform: translate(-50%, -50%) rotate(18deg) scale(1); }
  70% { opacity: 0.9; }
  100% { opacity: 0; transform: translate(-50%, -50%) rotate(80deg) scale(1.08); }
}
.ae-trophy__glow {
  position: absolute; left: 0; top: 0; width: calc(var(--cup) * 1.9); height: calc(var(--cup) * 1.9); border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 214, 58, 0.7) 32%, rgba(255, 170, 30, 0) 70%);
  animation: ae-trophy-glow 1.5s ease-out both;
}
@keyframes ae-trophy-glow {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
  18% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  60% { opacity: 0.8; transform: translate(-50%, -50%) scale(0.95); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
}
.ae-trophy__fly { position: absolute; left: 0; top: 0; animation: ae-trophy-fly 0.5s cubic-bezier(0.55, -0.25, 0.8, 0.45) 1.15s both; }
@keyframes ae-trophy-fly { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(0.18); opacity: 0.35; } }
.ae-trophy__cup {
  width: var(--cup); height: var(--cup); margin: calc(var(--cup) / -2) 0 0 calc(var(--cup) / -2);
  filter: drop-shadow(0 0 calc(var(--cup) * 0.12) rgba(255, 210, 58, 0.95)) drop-shadow(0 calc(var(--cup) * 0.03) 0 rgba(20, 14, 40, 0.5));
  animation: ae-trophy-pop 0.65s cubic-bezier(0.2, 1.7, 0.45, 1) both, ae-trophy-wobble 0.5s ease-in-out 0.65s 1;
}
.ae-trophy__cup img, .ae-trophy__mini img { width: 100%; height: 100%; display: block; }
@keyframes ae-trophy-pop { 0% { transform: scale(0) rotate(-30deg); } 60% { transform: scale(1.2) rotate(8deg); } 100% { transform: scale(1) rotate(0deg); } }
@keyframes ae-trophy-wobble { 25% { transform: rotate(-9deg) scale(1.04); } 50% { transform: rotate(7deg); } 75% { transform: rotate(-4deg); } 100% { transform: rotate(0deg); } }
.ae-trophy__text {
  position: absolute; left: 0; top: calc(var(--cup) * 0.62); white-space: nowrap; color: #ffe14a;
  font-size: max(28px, calc(96 * var(--u))); animation: ae-trophy-text 1.6s ease-out both;
}
@keyframes ae-trophy-text {
  0% { opacity: 0; transform: translate(-50%, 30%) scale(0.4); }
  20% { opacity: 1; transform: translate(-50%, 0) scale(1.18); }
  32% { transform: translate(-50%, 0) scale(1); }
  78% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -40%) scale(1); }
}
.ae-trophy__bit {
  position: absolute; left: 0; top: 0; width: max(12px, calc(20 * var(--u))); height: max(18px, calc(32 * var(--u))); border-radius: 3px;
  box-shadow: 0 0 0 max(1px, calc(2 * var(--u))) rgba(20, 14, 40, 0.35); animation: ae-trophy-bit 1.25s cubic-bezier(0.15, 0.75, 0.4, 1) both;
}
@keyframes ae-trophy-bit {
  0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg) scale(0.4); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(var(--x) - 50%), calc(var(--y) - 50%)) rotate(var(--s)) scale(1); }
}
.ae-trophy__mini {
  position: absolute; left: 0; top: 0; width: calc(var(--cup) * 0.3); height: calc(var(--cup) * 0.3);
  filter: drop-shadow(0 0 calc(var(--cup) * 0.05) rgba(255, 210, 58, 0.9)); animation: ae-trophy-mini 0.8s cubic-bezier(0.5, 0, 0.75, 0.4) both;
}
@keyframes ae-trophy-mini {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
  25% { opacity: 1; transform: translate(calc(var(--mx) - 50%), calc(var(--my) - 50%)) scale(1); }
  100% { opacity: 1; transform: translate(calc(var(--dx) - 50%), calc(var(--dy) - 50%)) scale(0.55); }
}
.ae-stat { transform-origin: left center; }
.ae-stat.is-bump { animation: ae-stat-bump 0.32s ease-out; }
@keyframes ae-stat-bump { 0% { transform: scale(1); } 40% { transform: scale(1.22); filter: brightness(1.35); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .ae-trophy__rays, .ae-trophy__bit, .ae-trophy__mini { display: none; }
  .ae-trophy__cup { animation: ae-trophy-pop 0.3s ease-out both; }
}
.ae-hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: max(96px, calc(200 * var(--u))); font-size: max(13px, calc(30 * var(--u))); white-space: nowrap; opacity: 0.95; }
.ae-flash { position: absolute; inset: 0; background: radial-gradient(circle, rgba(255, 90, 0, 0) 40%, rgba(255, 60, 0, 0.55)); animation: ae-flash 0.9s ease forwards; }
@keyframes ae-flash { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
.ae-corner { position: absolute; right: max(10px, calc(16 * var(--u))); bottom: max(10px, calc(16 * var(--u))); pointer-events: auto; }
.ae-round {
  width: max(40px, calc(84 * var(--u))); height: max(40px, calc(84 * var(--u))); border-radius: 50%; padding: calc(8 * var(--u));
  border: max(2px, calc(4 * var(--u))) solid var(--ae-ink); background: linear-gradient(180deg, #7fd6ff, #2f8fe0); cursor: pointer;
}
.ae-round.is-off { filter: grayscale(1) brightness(0.8); }
.ae-round { position: relative; }
.ae-round__key {
  position: absolute; left: calc(-2 * var(--u)); top: calc(-6 * var(--u)); font-size: max(9px, calc(18 * var(--u)));
  opacity: 0.9; pointer-events: none;
}
body.aoe-touch-mode .ae-round__key { display: none; }
body.aoe-touch-mode .ae-corner { bottom: auto; top: max(8px, calc(12 * var(--u))); }

/* touch: the jump button sits right of the bottom bar: no lift needed */
body.aoe-touch-mode { --aoe-controls-lift: 0px; }

/* -------------------------------------------------------------- windows */
.ae-window {
  position: fixed; inset: 0; display: grid; place-items: center; background: rgba(8, 10, 20, 0.35); z-index: 40;
  pointer-events: auto; font-family: var(--gs-font); font-weight: 700; color: #fff;
}
.ae-window[hidden] { display: none; }
.ae-window__box {
  position: relative; width: min(94vw, max(320px, calc(840 * var(--u)))); max-height: min(92vh, max(300px, calc(900 * var(--u))));
  display: flex; flex-direction: column; border: max(2px, calc(5 * var(--u))) solid var(--ae-ink);
  background: rgba(40, 46, 66, 0.9); border-radius: calc(6 * var(--u));
  box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, 0.45);
  animation: ae-open 160ms ease-out;
}
@keyframes ae-open { from { transform: scale(0.9); opacity: 0; } to { transform: none; opacity: 1; } }
.ae-window__head {
  position: relative; display: flex; align-items: center; gap: calc(14 * var(--u));
  padding: calc(10 * var(--u)) calc(18 * var(--u)); min-height: max(46px, calc(96 * var(--u)));
  border-bottom: max(2px, calc(5 * var(--u))) solid var(--ae-ink);
}
.ae-window__icon { width: max(38px, calc(92 * var(--u))); height: max(38px, calc(92 * var(--u))); margin: calc(-24 * var(--u)) 0 calc(-24 * var(--u)) calc(-40 * var(--u)); flex: none; }
.ae-window__icon svg, .ae-window__icon img { width: 100%; height: 100%; }
.ae-window__title { font-size: max(20px, calc(52 * var(--u))); flex: 1; }
.ae-window__close {
  width: max(38px, calc(74 * var(--u))); height: max(38px, calc(74 * var(--u))); flex: none; cursor: pointer;
  border: max(2px, calc(4 * var(--u))) solid var(--ae-ink); border-radius: calc(4 * var(--u));
  background: linear-gradient(180deg, #ff5a7a, #e0204a); color: #fff; font-family: var(--gs-font); font-size: max(20px, calc(46 * var(--u)));
  box-shadow: inset 0 calc(3 * var(--u)) 0 rgba(255, 255, 255, 0.35);
}
.ae-window__body { overflow-y: auto; padding: calc(16 * var(--u)); display: flex; flex-direction: column; gap: calc(14 * var(--u)); overscroll-behavior: contain; }
.ae-window__body::-webkit-scrollbar { width: calc(12 * var(--u)); }
.ae-window__body::-webkit-scrollbar-thumb { background: #1a1f2e; border-radius: calc(6 * var(--u)); }
.ae-head--backpack { background: linear-gradient(180deg, #f2f2f2, #d6d8dc); }
.ae-head--backpack .ae-window__title { color: #fff; }
.ae-head--shop { background: linear-gradient(180deg, #ff3b4b, #d01f2e); }
.ae-head--evolve { background: linear-gradient(180deg, #e04dff, #b01fd8); }
.ae-head--rebirth { background: linear-gradient(180deg, #ff4a8a, #e01f5e); }
.ae-head--teleport { background: linear-gradient(180deg, #9b7bff, #5a3ad8); }
.ae-head--rewards { background: linear-gradient(180deg, #4fd0ff, #1f7fe0); }

.ae-tabs { display: flex; gap: calc(14 * var(--u)); margin-left: calc(40 * var(--u)); }
.ae-tab {
  position: relative; width: max(54px, calc(110 * var(--u))); height: max(54px, calc(110 * var(--u))); cursor: pointer; padding: 0;
  border: max(2px, calc(4 * var(--u))) solid var(--ae-ink); border-radius: calc(4 * var(--u)); overflow: hidden; font-family: var(--gs-font);
}
.ae-tab.is-active { outline: max(2px, calc(5 * var(--u))) solid var(--ae-ink); transform: scale(1.06); box-shadow: 0 0 0 max(3px, calc(7 * var(--u))) #ffffff; }
.ae-tab__art { position: absolute; inset: 0; display: grid; place-items: center; }
.ae-tab__art img, .ae-tab__art svg { width: 100%; height: 100%; object-fit: cover; }
.ae-tab__label { position: absolute; left: 0; right: 0; bottom: calc(2 * var(--u)); text-align: center; font-size: max(10px, calc(24 * var(--u))); }
.ae-backpack-head { display: flex; flex-direction: column; gap: calc(10 * var(--u)); flex: 1; }

.ae-section {
  display: flex; align-items: center; gap: calc(12 * var(--u)); padding: calc(8 * var(--u)) calc(16 * var(--u));
  border: max(2px, calc(4 * var(--u))) solid var(--ae-ink); font-size: max(18px, calc(46 * var(--u)));
}
.ae-section__art { width: max(34px, calc(74 * var(--u))); height: max(34px, calc(74 * var(--u))); }
.ae-section--anime { background: linear-gradient(90deg, #ff8a3d, #ff4a4a); }
.ae-section--trails { background: linear-gradient(90deg, #ff0000, #ff9a00, #ffe600, #33ff00, #00c2ff, #3a00ff, #d000ff); }
.ae-section--charms { background: linear-gradient(90deg, #b04dff, #5a2ae0); }
.ae-section__tools { margin-left: auto; display: flex; gap: calc(10 * var(--u)); font-size: max(12px, calc(26 * var(--u))); }

.ae-list { display: flex; flex-direction: column; gap: calc(14 * var(--u)); }
.ae-row {
  display: flex; align-items: center; gap: calc(16 * var(--u)); padding: calc(12 * var(--u));
  background-color: #b41fe0; border: max(2px, calc(5 * var(--u))) solid #3a0a4a; outline: max(2px, calc(4 * var(--u))) solid #e070ff; outline-offset: calc(-10 * var(--u));
}
.ae-row.is-locked { filter: saturate(0.5) brightness(0.8); }
.ae-row__art {
  width: max(64px, calc(160 * var(--u))); height: max(64px, calc(160 * var(--u))); flex: none; display: grid; place-items: center; overflow: hidden;
  border: max(2px, calc(6 * var(--u))) solid #7a7f8a; background: #e8e8ea;
}
.ae-row__art img, .ae-row__art svg { width: 100%; height: 100%; object-fit: contain; }
.ae-row__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: calc(4 * var(--u)); }
.ae-row__name { font-size: max(16px, calc(46 * var(--u))); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ae-row__sub { font-size: max(13px, calc(38 * var(--u))); }
.ae-row__small { font-size: max(11px, calc(24 * var(--u))); color: #ffe6ff; }

.ae-btn {
  min-width: max(90px, calc(190 * var(--u))); height: max(38px, calc(76 * var(--u))); padding: 0 calc(14 * var(--u)); flex: none;
  border: max(2px, calc(4 * var(--u))) solid var(--ae-ink); cursor: pointer; font-family: var(--gs-font); font-weight: 700;
  font-size: max(13px, calc(34 * var(--u))); color: #fff; display: inline-flex; align-items: center; justify-content: center; gap: calc(8 * var(--u));
  box-shadow: 0 calc(4 * var(--u)) 0 rgba(0, 0, 0, 0.3), inset 0 calc(4 * var(--u)) 0 rgba(255, 255, 255, 0.35);
  -webkit-text-stroke: max(1px, calc(4 * var(--u))) var(--ae-ink); paint-order: stroke fill;
}
.ae-btn:active { transform: translateY(calc(3 * var(--u))); }
.ae-btn:disabled { cursor: default; filter: grayscale(0.7) brightness(0.8); transform: none; }
.ae-btn.is-state:disabled { filter: none; }
.ae-btn img { width: 1.3em; height: 1.3em; }
.ae-btn--green { background: linear-gradient(180deg, #8cff3a, #3fcf1a); }
.ae-btn--yellow { background: linear-gradient(180deg, #ffe14a, #ffa81f); }
.ae-btn--orange { background: linear-gradient(180deg, #ffd23a, #ff8a1f); }
.ae-btn--purple { background: linear-gradient(180deg, #e04dff, #9a1fd8); }
.ae-btn--blue { background: linear-gradient(180deg, #5ad8ff, #1f7fe0); }
.ae-btn--grey { background: linear-gradient(180deg, #b8bcc6, #7a808c); }
.ae-btn--red { background: linear-gradient(180deg, #ff6a6a, #e02a2a); }
.ae-btn--small { min-width: 0; height: max(30px, calc(58 * var(--u))); font-size: max(11px, calc(26 * var(--u))); }

/* charm shop */
.ae-shop-top { display: flex; align-items: center; gap: calc(14 * var(--u)); font-size: max(14px, calc(34 * var(--u))); flex-wrap: wrap; }
.ae-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(14 * var(--u)); }
.ae-card {
  display: flex; flex-direction: column; align-items: center; gap: calc(8 * var(--u)); padding: calc(8 * var(--u)) calc(8 * var(--u)) calc(12 * var(--u));
  border: max(2px, calc(5 * var(--u))) solid var(--ae-ink); position: relative; overflow: hidden;
}
.ae-card::before { content: ''; position: absolute; inset: 0; background: repeating-conic-gradient(from 0deg at 50% 38%, rgba(255,255,255,0.14) 0deg 10deg, transparent 10deg 20deg); pointer-events: none; }
.ae-card > * { position: relative; }
.ae-card__rarity { font-size: max(18px, calc(48 * var(--u))); }
.ae-card__art { width: 70%; aspect-ratio: 1; }
.ae-card__art svg { width: 100%; height: 100%; }
.ae-card__name { font-size: max(13px, calc(32 * var(--u))); text-align: center; }
.ae-card__bonus { font-size: max(12px, calc(28 * var(--u))); color: #ffe14a; }
.ae-card .ae-btn { width: 100%; min-width: 0; }
.ae-card.is-sold { filter: grayscale(0.8) brightness(0.7); }

/* before / after (evolve, rebirth) */
.ae-compare { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: calc(14 * var(--u)); text-align: center; }
.ae-compare__label { font-size: max(16px, calc(40 * var(--u))); }
.ae-portrait { width: 100%; aspect-ratio: 1; border: max(2px, calc(6 * var(--u))) solid var(--ae-ink); border-radius: calc(22 * var(--u)); background: #6a6f7c; position: relative; overflow: hidden; }
.ae-portrait img { width: 100%; height: 100%; object-fit: cover; }
.ae-portrait__name { position: absolute; left: 0; right: 0; bottom: calc(10 * var(--u)); font-size: max(16px, calc(44 * var(--u))); }
.ae-arrows { display: flex; flex-direction: column; gap: calc(24 * var(--u)); }
.ae-arrow { width: max(28px, calc(64 * var(--u))); height: max(28px, calc(64 * var(--u))); }
.ae-stat-box { padding: calc(10 * var(--u)); border: max(2px, calc(5 * var(--u))) solid var(--ae-ink); font-size: max(15px, calc(40 * var(--u))); }
.ae-stat-box--power { background: linear-gradient(180deg, #ffe14a, #ffb21f); }
.ae-stat-box--cap { background: linear-gradient(180deg, #8cff3a, #3fcf1a); }
.ae-warn { color: #ff3b5a; text-align: center; font-size: max(15px, calc(38 * var(--u))); -webkit-text-stroke-color: #fff; }
.ae-progress { position: relative; height: max(30px, calc(64 * var(--u))); border: max(2px, calc(5 * var(--u))) solid var(--ae-ink); background: #1a3a6a; overflow: hidden; }
.ae-progress__fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(180deg, #5ad8ff, #1f9fff); }
.ae-progress__text { position: absolute; inset: 0; display: grid; place-items: center; font-size: max(14px, calc(34 * var(--u))); }
.ae-actions { display: flex; justify-content: center; gap: calc(22 * var(--u)); }
.ae-actions .ae-btn { width: 60%; height: max(48px, calc(100 * var(--u))); font-size: max(18px, calc(48 * var(--u))); position: relative; }

.ae-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(max(110px, calc(240 * var(--u))), 1fr)); gap: calc(12 * var(--u)); }
.ae-place {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(4 * var(--u)); padding: calc(10 * var(--u));
  min-height: max(64px, calc(130 * var(--u))); border: max(2px, calc(4 * var(--u))) solid var(--ae-ink); cursor: pointer; font-family: var(--gs-font); font-weight: 700; color: #fff;
  background: linear-gradient(180deg, #7a8cff, #4a5ad8); font-size: max(14px, calc(34 * var(--u)));
  -webkit-text-stroke: max(1px, calc(4 * var(--u))) var(--ae-ink); paint-order: stroke fill;
  box-shadow: 0 calc(4 * var(--u)) 0 rgba(0, 0, 0, 0.3), inset 0 calc(3 * var(--u)) 0 rgba(255, 255, 255, 0.3);
}
.ae-place small { font-size: 0.7em; }
.ae-place--stage { background: linear-gradient(180deg, #7dff6a, #2fbf2a); }
.ae-place:disabled { cursor: default; background: linear-gradient(180deg, #8a8f9a, #5a5f6a); }
.ae-help { font-size: max(12px, calc(26 * var(--u))); color: #d8e4ff; text-align: center; }
`;
