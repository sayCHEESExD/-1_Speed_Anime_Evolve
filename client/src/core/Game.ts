import {
  CHARM_COUNT,
  CHARM_SHOP,
  EVOLVE_SHRINE,
  MODE_NORMAL,
  SPAWN,
  STAGE_COUNT,
  WorldCollision,
  canUseTreadmill,
  characterBySlot,
  formatAmount,
  formatWins,
  levelCapFor,
  nextEvolution,
  stageAt,
  stageByIndex,
  treadmillAt,
  type NoticeMessage,
  type RespawnMessage,
  type StageAwardedMessage,
} from '@anime/shared';
import { Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { Bloxity } from '../bloxity/Bloxity.js';
import { identityFromLegion } from '../bloxity/identity.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { NamePlate } from '../player/NamePlate.js';
import { playerModelLoader, type PlayerModelReport } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { BloxityPanel } from '../ui/BloxityPanel.js';
import { Hud, type TileName } from '../ui/Hud.js';
import { ModelPortraits } from '../ui/ModelPortraits.js';
import { anyPanelOpen } from '../ui/Panel.js';
import {
  BackpackWindow,
  CharmShopWindow,
  EvolveWindow,
  RebirthWindow,
  RewardsWindow,
  TeleportWindow,
  anyWindowOpen,
  giftWaiting,
  type ViewState,
  type WindowActions,
} from '../ui/Windows.js';
import { logger } from '../util/logger.js';
import { CourseWorld } from '../world/CourseWorld.js';
import { HubWorld } from '../world/HubWorld.js';
import { Atmosphere } from '../world/japan/Atmosphere.js';
import { Backdrop } from '../world/japan/Backdrop.js';
import { Sky } from '../world/Sky.js';

const SCOPE = 'Game';

/** Seconds between "+N Speed" pops: gains inside one window merge into one pop. */
const POP_WINDOW = 0.3;
/** After a purchase, look for its grant at these delays (ms). */

const shortcutOf = (event: KeyboardEvent): string => {
  const code = event.code;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code) return code.toLowerCase();
  return (event.key || '').toLowerCase();
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const HEAD = new Vector3();

/**
 * Composition root. Owns every subsystem and the per-frame order - input,
 * prediction, pads, camera, network, render - and no gameplay rules: every
 * level, Win, purchase and claim is the server's.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly collision = new WorldCollision();
  private readonly remotePlayers: RemotePlayerManager;
  private hub!: HubWorld;
  private readonly course = new CourseWorld();
  private readonly sky = new Sky();
  private readonly backdrop = new Backdrop();
  private readonly atmosphere: Atmosphere;
  private readonly hud: Hud;
  private readonly portraits: ModelPortraits;
  private readonly backpack: BackpackWindow;
  private readonly charmShop: CharmShopWindow;
  private readonly evolveWindow: EvolveWindow;
  private readonly rebirthWindow: RebirthWindow;
  private readonly teleportWindow: TeleportWindow;
  private readonly rewardsWindow: RewardsWindow;
  private readonly audio = new AudioManager();
  private readonly playerAudio: PlayerAudio;
  private readonly bloxity: Bloxity;
  private readonly bloxityPanel: BloxityPanel;
  private readonly fpsReadout: HTMLDivElement;
  private readonly network: NetworkClient;
  private readonly container: HTMLElement;
  private fpsAccum = 0;
  private fpsFrames = 0;

  private localPlayer: LocalPlayer | null = null;
  /** Your own name and portrait over your own runner, as everyone else sees them. */
  private readonly localPlate = new NamePlate(0.6);
  private localSessionId: string | null = null;
  private local: NetPlayerState | null = null;
  private pendingRespawn: RespawnMessage | null = null;

  private lastLevel = -1;
  private lastRebirths = -1;
  private lastCharacter = -1;
  private lastTotalXp = -1;
  private popGain = 0;
  private popTimer = 0;
  private wasSprinting = false;
  /** Which pad the player last stood on, so each pad opens its window once per visit. */
  private onPadName = '';
  private hintTimer = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.portraits = new ModelPortraits(this.renderer.renderer);
    this.atmosphere = new Atmosphere(this.sceneManager, this.sky, this.backdrop);

    this.hud = new Hud(container, {
      tile: (name) => this.openTile(name),
      music: () => this.audio.toggleMuted(),
    });

    const actions: WindowActions = {
      equipCharacter: (slot) => this.network.equipCharacter(slot),
      evolve: () => this.network.evolve(),
      trail: (action, id) => this.network.trail(action, id),
      charm: (action, value) => this.network.charm(action, value),
      rebirth: () => this.network.requestRebirth(),
      teleport: (to) => this.network.teleport(to),
      claimGift: (index) => this.network.claimGift(index),
    };
    this.backpack = new BackpackWindow(container, this.portraits, actions);
    this.charmShop = new CharmShopWindow(container, actions);
    this.evolveWindow = new EvolveWindow(container, this.portraits, actions);
    this.rebirthWindow = new RebirthWindow(container, actions);
    this.teleportWindow = new TeleportWindow(container, actions);
    this.rewardsWindow = new RewardsWindow(container, actions);

    this.playerAudio = new PlayerAudio(this.audio);

    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.audio.setMasterVolume(level),
      setMusicVolume: (level) => this.audio.setMusicVolume(level),
      setGraphicsQuality: (level) => this.renderer.setQuality(level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.input.look.setSensitivityScale(scale),
      respawn: () => this.network.requestRespawn(),
      pointerLockChanged: (locked) => this.input.look.setCursorFree(!locked),
      // Every player runs as their anime evolution, never their portal avatar.
      avatarChanged: () => undefined,
    });

    this.fpsReadout = document.createElement('div');
    this.fpsReadout.className = 'aoe-fps aoe-font';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    this.bloxityPanel = new BloxityPanel(container, this.bloxity);

    window.addEventListener('keydown', this.onHotkey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });

    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
        const roomId = this.network.roomId;
        this.bloxity.updateRoom(roomId);
        this.bloxityPanel.setRoom(roomId);
      },
      onPlayerAdded: (sessionId, player) => this.onPlayerAdded(sessionId, player),
      onPlayerChanged: (sessionId, player) => this.onPlayerChanged(sessionId, player),
      onPlayerRemoved: (sessionId) => this.remotePlayers.remove(sessionId),
      onRespawn: (message) => {
        this.pendingRespawn = message;
        this.applyPendingRespawn();
      },
      onStageAwarded: (message) => this.onStageAwarded(message),
      onNotice: (message) => this.onNotice(message),
    });

    this.network.setTokenProvider(() => this.bloxity.getToken());
    this.network.setDisplayProvider(() => identityFromLegion(this.bloxity.getUser(), this.bloxity.getGuest()));
    this.bloxity.onUserChanged((user) => {
      this.network.sendAuth(this.bloxity.getToken());
      this.network.sendIdentity(identityFromLegion(user, this.bloxity.getGuest()));
    });
  }

  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) return;
    if (isTyping(event.target)) return;
    const tiles: Record<string, TileName> = { b: 'backpack', t: 'teleport', r: 'rebirth', e: 'evolve', g: 'rewards' };
    const key = shortcutOf(event);
    const tile = tiles[key];
    if (tile) {
      this.openTile(tile);
      return;
    }
    if (key === 'm') this.hud.pressMusic();
    if (key === 'escape') {
      this.closeAll();
      this.input.look.setCursorFree(true);
      this.bloxity.showPortalMenu(true);
    }
  };

  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  private windows(): { name: TileName | 'shop'; window: { isOpen: boolean; setOpen(open: boolean): void } }[] {
    return [
      { name: 'backpack', window: this.backpack },
      { name: 'shop', window: this.charmShop },
      { name: 'evolve', window: this.evolveWindow },
      { name: 'rebirth', window: this.rebirthWindow },
      { name: 'teleport', window: this.teleportWindow },
      { name: 'rewards', window: this.rewardsWindow },
    ];
  }

  private closeAll(): void {
    for (const entry of this.windows()) entry.window.setOpen(false);
  }

  /** A tile toggles its window and closes every other. */
  private openTile(name: TileName): void {
    const target = {
      backpack: this.backpack,
      teleport: this.teleportWindow,
      rebirth: this.rebirthWindow,
      evolve: this.evolveWindow,
      rewards: this.rewardsWindow,
    }[name];
    const opening = !target.isOpen;
    this.closeAll();
    if (opening) {
      this.pushState();
      target.setOpen(true);
    }
  }

  startBloxity(): void {
    this.bloxity.start();
    document.body.classList.toggle('aoe-portal-embedded', this.bloxity.embedded);
  }

  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  async initialise(): Promise<PlayerModelReport> {
    const scene = this.sceneManager.scene;
    const report = await playerModelLoader.load();
    this.hub = new HubWorld();
    scene.add(this.sky.root, this.backdrop.root, this.hub.root, this.course.root);

    this.localPlayer = new LocalPlayer(this.collision);
    scene.add(this.localPlayer.character.root);
    scene.add(this.localPlayer.character.worldRoot);
    this.localPlayer.character.root.add(this.localPlate.sprite);
    this.camera.snapTo(this.localPlayer.position);
    this.hub.setNextEvolution(2, 0);
    logger.info(SCOPE, 'world ready');
    return report;
  }

  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  stop(): void {
    this.input.detach();
    this.bloxity.gameplayEnd();
    this.bloxity.updateRoom('');
    void this.network.disconnect();
  }

  // ---------------------------------------------------------------- frame

  update(delta: number, _now: number): void {
    const player = this.localPlayer;
    this.input.setSuppressed(anyWindowOpen() || anyPanelOpen() || (player?.dead ?? false));
    const input = this.input.sample();

    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);
    this.camera.setZoom(this.input.look.zoom);

    if (player) {
      if (this.local) player.setParams(this.local.moveSpeed, this.local.jumpVelocity);
      const p = player.position;
      const belt = treadmillAt(p.x, p.y, p.z);
      const running = !!belt && !!this.local && canUseTreadmill(belt, this.local.rebirths);
      player.setTreadmill(running, running && belt ? player.maxRunSpeed * belt.multiplier : 0);
      player.update(delta, input, this.input.look.yaw);
      this.snapCameraIfPlaced();
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(player.position.x, player.position.y, player.position.z);
      this.flushInput();
      if (player.diedEdge) {
        this.audio.play('death');
        this.hud.burn();
      }
      const sprinting = player.sprint > 0.05;
      this.playerAudio.update(delta, {
        horizontalSpeed: player.horizontalSpeed,
        topSpeed: this.local?.maxSpeed ?? 16,
        isGrounded: player.isGrounded,
        running: player.isGrounded && player.horizontalSpeed < 2 && !!belt,
        jumpedEdge: player.jumpedEdge,
        landedEdge: player.landedEdge,
        sprintEdge: sprinting && !this.wasSprinting,
      });
      this.wasSprinting = sprinting;
      this.updatePads(player);
      this.updateHud(delta, player);
    }

    this.tickFps(delta);
    this.hub.scoreboard.update(this.network.leaderboard);
    const px = player?.position.x ?? SPAWN.x;
    const pz = player?.position.z ?? SPAWN.z;
    this.sky.follow(px, pz);
    this.backdrop.follow(pz);
    this.atmosphere.update(delta, pz);
    this.hub.update(delta);
    this.hub.setShopClock(this.network.shopClock.secondsLeft);
    this.course.update(delta, pz);
    this.remotePlayers.advance(delta, player?.position ?? null);
    this.camera.update(delta, player?.horizontalSpeed ?? 0);

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  // ----------------------------------------------------------------- pads

  /**
   * PADS: standing on one opens its window, once per visit. The evolution
   * ring opens Evolve, the shop's pad opens the Charm Shop. Claims are the
   * server's: it sees the claim pad underfoot by itself.
   */
  private updatePads(player: LocalPlayer): void {
    const p = player.position;
    let pad = '';
    if (Math.hypot(p.x - EVOLVE_SHRINE.x, p.z - EVOLVE_SHRINE.z) <= EVOLVE_SHRINE.padRadius && p.y < 1) pad = 'evolve';
    else if (Math.abs(p.x - CHARM_SHOP.x) <= CHARM_SHOP.padHalfX && Math.abs(p.z - CHARM_SHOP.padZ) <= CHARM_SHOP.padHalfZ && p.y < 1) pad = 'shop';
    if (pad === this.onPadName) return;
    const previous = this.onPadName;
    this.onPadName = pad;
    if (previous === 'shop' && this.charmShop.isOpen) this.charmShop.setOpen(false);
    if (previous === 'evolve' && this.evolveWindow.isOpen) this.evolveWindow.setOpen(false);
    if (pad === 'evolve') {
      this.closeAll();
      this.pushState();
      this.evolveWindow.setOpen(true);
    } else if (pad === 'shop') {
      this.closeAll();
      this.pushState();
      this.charmShop.setOpen(true);
    }
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(delta: number, player: LocalPlayer): void {
    const state = this.local;
    if (!state) return;
    const p = player.position;
    const stage = stageByIndex(stageAt(p.z));
    if (stage) {
      this.hud.setStage(`Stage ${stage.index}`, `Level Recommended: ${stage.recommended}`);
    } else {
      this.hud.setStage('');
    }

    // "+N Speed" pops, merged into one per window, over the runner's head.
    this.popTimer += delta;
    if (this.popGain > 0 && this.popTimer >= POP_WINDOW) {
      this.popTimer = 0;
      HEAD.set(p.x, p.y + player.character.height + 1.2, p.z).project(this.camera.camera);
      if (HEAD.z < 1) {
        const x = (HEAD.x * 0.5 + 0.5) * this.renderer.width + (Math.random() - 0.5) * 60;
        const y = (-HEAD.y * 0.5 + 0.5) * this.renderer.height;
        const gain = this.popGain;
        this.hud.pop(`+${gain < 10 ? (Math.round(gain * 10) / 10).toString() : formatAmount(gain)} Speed`, x, y);
      }
      this.popGain = 0;
    }

    this.hintTimer -= delta;
    if (this.hintTimer <= 0) {
      this.hintTimer = 0.5;
      this.hud.setHint(anyWindowOpen() ? '' : this.hintFor(state, player));
    }
  }

  private hintFor(state: NetPlayerState, player: LocalPlayer): string {
    const touch = document.body.classList.contains('aoe-touch-mode');
    const p = player.position;
    const belt = treadmillAt(p.x, p.y, p.z);
    if (belt && !canUseTreadmill(belt, state.rebirths)) return `This treadmill needs ${belt.rebirthsRequired} Rebirths`;
    if (player.mode !== MODE_NORMAL) return '';
    if (state.level >= state.levelCap && stageAt(p.z) === 0) return `Max level! Rebirth for a higher cap${touch ? '' : ' (R)'}`;
    const next = nextEvolution(state.ownedCharacters);
    if (next && state.wins >= next.cost && stageAt(p.z) === 0) return `You can evolve into ${next.name}! Step on the Evolve ring${touch ? '' : ' or press E'}`;
    if (state.bestStage === 0 && state.totalXp < 40) return touch ? 'Run to gain Speed! Jump twice for a double jump' : 'Run (WASD) to gain Speed! Space twice to double jump';
    if (state.bestStage === 0) return 'Head through the torii ahead: finish Stage 1 for Wins!';
    return '';
  }

  private tickFps(delta: number): void {
    if (this.fpsReadout.hidden) return;
    this.fpsAccum += delta;
    this.fpsFrames += 1;
    if (this.fpsAccum < 0.5) return;
    this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsAccum)} FPS`;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
  }

  private flushInput(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
  }

  private applyPendingRespawn(): void {
    const player = this.localPlayer;
    const message = this.pendingRespawn;
    if (!player || !message) return;
    this.pendingRespawn = null;
    player.teleport(message.x, message.y, message.z, message.rotationY);
    this.input.look.setYaw(message.rotationY);
  }

  private snapCameraIfPlaced(): void {
    const player = this.localPlayer;
    if (!player) return;
    const placement = player.consumePlacement();
    if (placement === 'none') return;
    this.camera.snapTo(player.position, placement === 'respawn');
  }

  // ---------------------------------------------------------------- state

  private onPlayerAdded(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.add(sessionId, state);
    this.bloxity.playerJoined(sessionId);
    this.bloxity.playerInRoom(sessionId);
  }

  private onPlayerChanged(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.update(sessionId, state);
  }

  private viewState(state: NetPlayerState): ViewState {
    const charms: number[] = [];
    for (let i = 0; i < CHARM_COUNT; i += 1) charms.push(state.charms[i] ?? 0);
    const equipped: number[] = [];
    for (let i = 0; i < state.equippedCharms.length; i += 1) equipped.push(state.equippedCharms[i] ?? 0);
    const clock = this.network.shopClock;
    const current = clock.window === state.shopWindow;
    return {
      wins: state.wins,
      rebirths: state.rebirths,
      level: state.level,
      levelCap: state.levelCap,
      xp: state.xp,
      xpNeeded: state.xpNeeded,
      characterSlot: state.characterSlot,
      ownedCharacters: state.ownedCharacters,
      trailId: state.trailId,
      ownedTrails: state.ownedTrails,
      charms,
      equippedCharms: equipped,
      shopWindow: clock.window,
      shopBought: current ? state.shopBought : 0,
      shopSecondsLeft: clock.secondsLeft,
      bestStage: state.bestStage,
      sessionSeconds: state.sessionSeconds,
      giftsClaimed: state.giftsClaimed,
    };
  }

  private pushState(): void {
    if (!this.local) return;
    const view = this.viewState(this.local);
    this.backpack.setState(view);
    this.charmShop.setState(view);
    this.evolveWindow.setState(view);
    this.rebirthWindow.setState(view);
    this.teleportWindow.setState(view);
    this.rewardsWindow.setState(view);
    this.hud.setTileReady('evolve', !!nextEvolution(view.ownedCharacters) && view.wins >= (nextEvolution(view.ownedCharacters)?.cost ?? Infinity));
    this.hud.setTileReady('rebirth', view.level >= levelCapFor(view.rebirths));
    this.hud.setTileReady('rewards', giftWaiting(view));
  }

  /** Everything the server says about the local player. It derives none of it. */
  private applyLocalState(state: NetPlayerState): void {
    const player = this.localPlayer;
    if (!player) return;
    this.local = state;

    player.setParams(state.moveSpeed, state.jumpVelocity);
    player.character.setCharacter(state.characterSlot);
    player.character.setTrail(state.trailId);
    this.localPlate.set(state.displayName, state.avatarUrl, player.character.height);

    if (state.ready) {
      player.reconcile({
        x: state.x,
        y: state.y,
        z: state.z,
        vx: state.velocityX,
        vy: state.velocityY,
        vz: state.velocityZ,
        yaw: state.rotationY,
        grounded: state.grounded,
        jumpLatched: state.jumpLatched,
        jumpCount: state.jumpCount,
        flipCount: state.flipCount,
        runTime: state.runTime,
        airJumpsUsed: state.airJumpsUsed,
        coyote: state.coyote,
        mode: state.mode,
        wallNx: state.wallNx,
        wallNz: state.wallNz,
        modeTime: state.modeTime,
        regrab: state.regrab,
        regrabNx: state.regrabNx,
        regrabNz: state.regrabNz,
        dead: state.dead,
        lastInputSeq: state.lastInputSeq,
      });
    }

    this.hud.setStats(state.rebirths, state.wins);
    this.hud.setSpeed(state.moveSpeed);
    this.hud.setLevel(state.level, state.xp, state.xpNeeded, state.levelCap);
    this.hub.setNextEvolution(nextEvolution(state.ownedCharacters)?.slot ?? 0, state.wins);
    this.hub.setRebirths(state.rebirths);

    if (this.lastTotalXp >= 0 && state.totalXp > this.lastTotalXp) this.popGain += state.totalXp - this.lastTotalXp;
    this.lastTotalXp = state.totalXp;

    if (this.lastLevel >= 0 && state.level > this.lastLevel && state.rebirths === this.lastRebirths) {
      this.audio.play('level');
      this.hud.levelUp(state.level, state.moveSpeed);
    }
    if (this.lastRebirths >= 0 && state.rebirths > this.lastRebirths) this.audio.play('rebirth');
    if (this.lastCharacter >= 0 && this.lastCharacter !== state.characterSlot) {
      const def = characterBySlot(state.characterSlot);
      if (def) this.hud.toast(`${def.name}!  x${def.multiplier} Speed`, 'gold');
    }
    this.lastCharacter = state.characterSlot;
    this.lastLevel = state.level;
    this.lastRebirths = state.rebirths;
    this.pushState();
  }

  private onNotice(message: NoticeMessage): void {
    switch (message.kind) {
      case 'bought':
      case 'evolved':
        this.audio.play('unlock');
        this.hud.toast(message.text, message.kind === 'evolved' ? 'gold' : 'good');
        break;
      case 'equipped':
        this.audio.play('buy');
        this.hud.toast(message.text, 'good');
        break;
      case 'rebirth':
        this.hud.toast(message.text, 'pink');
        break;
      case 'refused':
      case 'locked':
        this.audio.play('refuse');
        this.hud.toast(message.text, 'bad');
        break;
      case 'info':
        this.hud.toast(message.text, 'gold');
        break;
    }
  }

  /** A claim the SERVER granted: the fanfare; the server then sends us home. */
  private onStageAwarded(message: StageAwardedMessage): void {
    this.audio.play('win');
    this.hud.trophy(message.wins);
    this.hud.toast(`Stage ${message.stage} complete! +${formatWins(message.wins)} Win${message.wins === 1 ? '' : 's'}!`, 'gold');
    if (message.stage < STAGE_COUNT && this.local && message.stage >= this.local.bestStage) {
      this.hud.toast(`Stage ${message.stage + 1} unlocked in Teleport!`, 'good');
    }
    logger.info(SCOPE, `stage ${message.stage} banked: +${message.wins} wins`);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.stop();
    this.hud.dispose();
    for (const entry of this.windows()) (entry.window as { dispose?: () => void }).dispose?.();
    this.portraits.dispose();
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    this.bloxity.dispose();
    this.bloxityPanel.dispose();
    this.fpsReadout.remove();
    this.audio.dispose();
    this.remotePlayers.dispose();
    this.localPlate.dispose();
    this.hub?.dispose();
    this.course.dispose();
    this.sky.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
  }
}
