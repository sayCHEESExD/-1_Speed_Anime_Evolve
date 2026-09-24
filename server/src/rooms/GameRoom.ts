import { Client, Room, ServerError } from '@colyseus/core';
import {
  MAX_PLAYERS_PER_ROOM,
  MessageType,
  SPAWN,
  STAGE_COUNT,
  TELEPORTS,
  accountKeyFor,
  canRebirth,
  formatMultiplier,
  formatWins,
  giftReady,
  giftWins,
  isAccountKey,
  isValidGuestId,
  levelCapFor,
  rebirthPower,
  sanitizeIdentity,
  shopSecondsLeft,
  shopWindowAt,
  stageEntry,
  type AuthStateMessage,
  type AuthStatus,
  type CharmActionMessage,
  type ClaimGiftMessage,
  type EquipCharacterMessage,
  type MoveMessage,
  type NoticeMessage,
  type Placement,
  type RespawnMessage,
  type RespawnReason,
  type SetAuthMessage,
  type SetIdentityMessage,
  type StageAwardedMessage,
  type TeleportMessage,
  type TrailActionMessage,
} from '@anime/shared';
import { tokenHash, verifyGameToken } from '../auth/BloxityAuth.js';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService } from '../movement/MovementService.js';
import { hasProgress, progressOf, type ProfileFields, type StoredProfile } from '../persistence/index.js';
import { CollectionService } from '../progression/CollectionService.js';
import { leaderboardService } from '../progression/LeaderboardService.js';
import { profileStore } from '../progression/ProfileStore.js';
import { ProgressionService } from '../progression/ProgressionService.js';
import { SpeedService } from '../progression/SpeedService.js';
import { StageService } from '../progression/StageService.js';
import { wallet } from '../progression/Wallet.js';
import { logger } from '../util/logger.js';
import { GameState } from './state/GameState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GameRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 15;
/** Re-verification backoff for a token Bloxity could not be asked about. */
const REVERIFY_FIRST_MS = 15_000;
const REVERIFY_MAX_MS = 120_000;
/** How long a mid-session switch waits for the leaving profile to land before staying put. */
const SWITCH_SAVE_TIMEOUT_MS = 8000;
/** How long a leave or a dispose waits for its save to land before moving on. */
const LEAVE_SAVE_TIMEOUT_MS = 5000;
/** Longest token accepted. Bloxity's are a few hundred bytes. */
const MAX_TOKEN_LENGTH = 4096;
/** How long after a claim the player is sent home (the trophy celebration plays meanwhile). */
const CLAIM_HOME_DELAY_MS = 1400;
/** How long a player burns in the lava before they are sent back to the spawn. */
const LAVA_RESPAWN_MS = 900;
/** Milliseconds between two repeatable notices to one player. */
const NOTICE_GAP_MS = 2500;

/** Join refusals. The client's retry/backoff recognises STORAGE_UNAVAILABLE. */
export const JOIN_ERROR = {
  ROOM_FULL: 4103,
  BAD_PLAYER_ID: 4104,
  STORAGE_UNAVAILABLE: 4105,
} as const;

interface JoinOptions {
  /** The browser's own guest id. NEVER an account id; the prefix is refused. */
  playerId?: string;
  /** The portal's game token, or nothing. Verified with Bloxity, never trusted. */
  token?: string | null;
  identity?: SetIdentityMessage;
}

/** What `onAuth` resolves and hands to `onJoin`. */
interface ResolvedProfile {
  readonly key: string;
  readonly guestKey: string;
  readonly accountKey: string | null;
  readonly token: string | null;
  readonly tokenHash: string;
  readonly status: AuthStatus;
  readonly profile: StoredProfile | null;
  readonly migrated: boolean;
}

/** Per-session bookkeeping the replicated state must not carry. */
interface Session {
  key: string;
  guestKey: string;
  accountKey: string | null;
  token: string | null;
  tokenHash: string;
  status: AuthStatus;
  /** True while a login change is being applied: autosaves hold off. */
  switching: boolean;
  queued: SetAuthMessage | null;
  reverifyAt: number;
  reverifyDelay: number;
  lastNoticeAt: number;
}

/**
 * The authoritative room.
 *
 * Composition only: every rule lives in a service, and this decides the order
 * they run in. The one hard rule: nothing a client sends is ever copied into
 * state. A Move is simulated, a purchase is checked against the server's
 * wallet (and position), a claim is detected from the server's own position -
 * and each produces a result the server writes itself.
 *
 * WHOSE PROGRESS A SESSION PLAYS ON is decided here too: the client sends its
 * browser id and the portal's TOKEN, Bloxity is asked whose token it is, and
 * the profile is READ FROM STORAGE in `onAuth`. A read that fails refuses the
 * join - a player is never seated on an empty profile that would autosave
 * over their real one.
 */
export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override autoDispose = true;

  private readonly movement = new MovementService();
  private readonly progression = new ProgressionService();
  private readonly speed = new SpeedService();
  private readonly stages = new StageService();
  private readonly collection = new CollectionService();

  /** Session id -> the profile key it currently plays on. The boards read it. */
  private readonly playerIds = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();

  /** Players burning in the lava, and when the server sends them back to the spawn. */
  private readonly burning = new Map<string, number>();
  /** Players who just claimed, and when the server sends them home. */
  private readonly goingHome = new Map<string, number>();

  private autosaveTimer = 0;

  override onCreate(): void {
    this.state = new GameState();
    this.setPatchRate(serverConfig.patchRateMs);
    this.refreshShopClock();

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => this.onMove(client, message));
    this.onMessage(MessageType.Evolve, (client) => this.onEvolve(client));
    this.onMessage(MessageType.EquipCharacter, (client, message: EquipCharacterMessage) => this.onEquipCharacter(client, message));
    this.onMessage(MessageType.TrailAction, (client, message: TrailActionMessage) => this.onTrail(client, message));
    this.onMessage(MessageType.CharmAction, (client, message: CharmActionMessage) => this.onCharm(client, message));
    this.onMessage(MessageType.ClaimGift, (client, message: ClaimGiftMessage) => this.onClaimGift(client, message));
    this.onMessage(MessageType.Rebirth, (client) => this.onRebirth(client));
    this.onMessage(MessageType.Teleport, (client, message: TeleportMessage) => this.onTeleport(client, message));
    this.onMessage(MessageType.RequestRespawn, (client) => {
      if (!this.burning.has(client.sessionId)) this.placeAt(client, SPAWN, 'manual');
    });
    this.onMessage(MessageType.SetIdentity, (client, message: SetIdentityMessage) => this.onSetIdentity(client, message));
    this.onMessage(MessageType.SetAuth, (client, message: SetAuthMessage) => {
      void this.switchAuth(client, message, false);
    });

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), serverConfig.patchRateMs);
    logger.info(SCOPE, `room ${this.roomId} created (capacity ${MAX_PLAYERS_PER_ROOM})`);
  }

  override async onAuth(client: Client, options: JoinOptions = {}): Promise<ResolvedProfile> {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      logger.warn(SCOPE, `refused a join: room ${this.roomId} is full (${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`);
      throw new ServerError(JOIN_ERROR.ROOM_FULL, 'room is full');
    }
    const guestKey = readGuestKey(options.playerId);
    const token = readToken(options.token);
    try {
      return await this.resolveProfile(guestKey, token, null);
    } catch (error) {
      logger.error(SCOPE, `refused a join: storage unreachable for ${client.sessionId}:`, error);
      throw new ServerError(JOIN_ERROR.STORAGE_UNAVAILABLE, 'storage unavailable, try again shortly');
    }
  }

  override onJoin(client: Client, options: JoinOptions = {}, auth?: ResolvedProfile): void {
    const resolved: ResolvedProfile = auth ?? {
      key: '',
      guestKey: '',
      accountKey: null,
      token: null,
      tokenHash: '',
      status: 'guest',
      profile: null,
      migrated: false,
    };

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    const now = Date.now();
    this.sessions.set(client.sessionId, {
      key: resolved.key,
      guestKey: resolved.guestKey,
      accountKey: resolved.accountKey,
      token: resolved.token,
      tokenHash: resolved.tokenHash,
      status: resolved.status,
      switching: false,
      queued: null,
      reverifyAt: now + REVERIFY_FIRST_MS,
      reverifyDelay: REVERIFY_FIRST_MS,
      lastNoticeAt: 0,
    });
    if (resolved.key) this.playerIds.set(client.sessionId, resolved.key);

    // Restore BEFORE any service initialises: everything derived is derived from it.
    profileStore.applyTo(player, resolved.profile);
    this.state.players.set(client.sessionId, player);
    this.initialiseServices(client.sessionId, player);

    if (options.identity) {
      const identity = sanitizeIdentity(options.identity);
      if (identity.displayName) {
        player.displayName = identity.displayName;
        player.avatarUrl = identity.avatarUrl;
      }
    }

    this.placeAt(client, SPAWN, 'join');
    this.sendAuthState(client, resolved.status);

    logger.info(
      SCOPE,
      `join ${client.sessionId} as ${describe(resolved)} (${resolved.profile ? 'restored' : 'new'}) ` +
        `level=${player.level} rebirths=${player.rebirths} wins=${player.wins} character=${player.characterSlot}`,
    );
  }

  override async onLeave(client: Client): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    const key = this.sessions.get(client.sessionId)?.key;

    this.state.players.delete(client.sessionId);
    this.goingHome.delete(client.sessionId);
    this.burning.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.forgetServices(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.playerIds.delete(client.sessionId);

    logger.info(SCOPE, `leave ${client.sessionId}`);
    if (player && key) await this.saveBounded(key, player);
  }

  override async onDispose(): Promise<void> {
    const saves: Promise<void>[] = [];
    for (const [sessionId, player] of this.state.players) {
      const key = this.sessions.get(sessionId)?.key;
      if (key) saves.push(this.saveBounded(key, player));
    }
    await Promise.all(saves);
    logger.info(SCOPE, `room ${this.roomId} disposed`);
  }

  // ------------------------------------------------------------- identity

  /**
   * WHOSE PROFILE, and the profile itself, read from storage now.
   *
   * With a token, Bloxity is asked. Verified -> the account key; the
   * account's own profile always wins. If the account has none and this
   * browser's guest has real progress, the guest's progress becomes the
   * account's - insert-only, so two pods racing for the same first login
   * create one profile - and the guest is then retired.
   *
   * Rejected -> a guest. Unavailable -> a guest FOR NOW, re-asked on a backoff.
   * Throws when storage cannot be read. Callers refuse or stay put.
   */
  private async resolveProfile(guestKey: string, token: string | null, live: ProfileFields | null): Promise<ResolvedProfile> {
    let status: AuthStatus = 'guest';
    let accountKey: string | null = null;
    const hash = token ? tokenHash(token) : '';
    if (token) {
      const outcome = await verifyGameToken(token);
      if (outcome.status === 'verified') {
        accountKey = accountKeyFor(outcome.accountId);
        status = 'account';
      } else if (outcome.status === 'unavailable') {
        status = 'unavailable';
      }
    }

    if (accountKey) {
      let profile = await profileStore.load(accountKey);
      let migrated = false;
      if (!profile && guestKey) {
        const guest = await profileStore.load(guestKey);
        const retired = Boolean(guest?.migratedTo);
        const source: ProfileFields | null =
          live ??
          (guest
            ? { ...progressOf(guest), displayName: guest.displayName, avatarUrl: guest.avatarUrl, updatedAt: guest.updatedAt }
            : null);
        if (!retired && source && hasProgress(source)) {
          const created = { ...source, updatedAt: Date.now(), migratedFrom: guestKey };
          if (await profileStore.insertIfAbsent(accountKey, created)) {
            // Only AFTER the account holds it is the guest copy retired.
            await profileStore.retireGuest(guestKey, accountKey, progressOf(source), {
              displayName: source.displayName,
              avatarUrl: source.avatarUrl,
            });
            profile = created;
            migrated = true;
            logger.info(SCOPE, `migrated guest ${guestKey} into ${accountKey} (wins=${source.wins})`);
          } else {
            logger.info(SCOPE, `lost the first-login race for ${accountKey}; loading the winner`);
            profile = await profileStore.load(accountKey);
          }
        }
      }
      return { key: accountKey, guestKey, accountKey, token, tokenHash: hash, status, profile, migrated };
    }

    const profile = guestKey ? await profileStore.load(guestKey) : null;
    return { key: guestKey, guestKey, accountKey: null, token, tokenHash: hash, status, profile, migrated: false };
  }

  /**
   * A LOGIN CHANGE ON THE LIVE SESSION: sign-in, sign-out, account switch, or
   * a re-ask about a token Bloxity was unavailable for. Save the profile being
   * left, resolve the new one, apply it exactly as a join does. Only the
   * newest login counts.
   */
  private async switchAuth(client: Client, message: SetAuthMessage, reverify: boolean): Promise<void> {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    const token = readToken(message?.token);
    if (session.switching) {
      session.queued = { token };
      return;
    }
    const hash = token ? tokenHash(token) : '';
    if (!reverify && hash === session.tokenHash) return;

    session.switching = true;
    try {
      const leavingKey = session.key;
      const wasGuest = session.accountKey === null;
      const live = profileStore.snapshot(player);

      if (leavingKey) {
        const landed = await withTimeout(profileStore.save(leavingKey, player), SWITCH_SAVE_TIMEOUT_MS);
        if (!landed) {
          logger.warn(SCOPE, `${client.sessionId}: storage did not take the leaving save; staying on ${leavingKey}`);
          this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
          return;
        }
      }

      let target: ResolvedProfile;
      try {
        target = await this.resolveProfile(session.guestKey, token, wasGuest ? live : null);
      } catch (error) {
        logger.warn(SCOPE, `${client.sessionId}: storage unreachable during a login change; staying put:`, error);
        this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
        return;
      }

      session.token = target.token;
      session.tokenHash = target.tokenHash;
      if (target.status === 'unavailable') {
        session.reverifyDelay = Math.min(REVERIFY_MAX_MS, session.reverifyDelay * 2);
        session.reverifyAt = Date.now() + session.reverifyDelay;
      } else {
        session.reverifyDelay = REVERIFY_FIRST_MS;
      }

      if (target.key === session.key) {
        session.status = target.status;
        this.sendAuthState(client, target.status);
        return;
      }

      profileStore.applyTo(player, target.profile, true);
      session.key = target.key;
      session.accountKey = target.accountKey;
      session.status = target.status;
      if (target.key) this.playerIds.set(client.sessionId, target.key);
      else this.playerIds.delete(client.sessionId);

      this.forgetServices(client.sessionId);
      this.initialiseServices(client.sessionId, player);
      this.placeAt(client, SPAWN, 'join');

      if (target.key) await this.saveBounded(target.key, player);
      this.sendAuthState(client, target.status);
      leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
      logger.info(
        SCOPE,
        `${client.sessionId} switched ${leavingKey || '(none)'} -> ${describe(target)}` +
          `${target.migrated ? ' [migrated]' : ''} level=${player.level} wins=${player.wins}`,
      );
    } finally {
      session.switching = false;
      const queued = session.queued;
      session.queued = null;
      if (queued) void this.switchAuth(client, queued, false);
    }
  }

  private initialiseServices(sessionId: string, player: PlayerState): void {
    if (!this.movement.has(sessionId)) this.movement.initialise(player);
    this.collection.normaliseShop(player, this.state.shopWindow);
    this.progression.initialise(player);
  }

  /** Everything but movement, whose simulation state belongs to the connection. */
  private forgetServices(sessionId: string): void {
    this.progression.forget(sessionId);
    this.speed.forget(sessionId);
    this.stages.forget(sessionId);
  }

  private sendAuthState(client: Client, status: AuthStatus, note?: string): void {
    const message: AuthStateMessage = note ? { status, note } : { status };
    client.send(MessageType.AuthState, message);
  }

  // ---------------------------------------------------------------- input

  private onMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.movement.applyInput(client.sessionId, player, message)) return;
    const report = this.movement.report;
    // RUNNING PAYS: the distance the server just simulated.
    if (report.runDistance > 0) this.speed.creditMovement(player, report.runDistance, this.progression);
    if (report.died && !this.burning.has(client.sessionId)) {
      this.burning.set(client.sessionId, Date.now() + LAVA_RESPAWN_MS);
      this.goingHome.delete(client.sessionId);
    }
  }

  private onEvolve(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.collection.evolve(player, this.progression);
    if (!result.ok) {
      if (result.reason === 'max') this.notify(client, { kind: 'info', text: 'You are fully evolved!' });
      else if (result.value) this.notify(client, { kind: 'refused', text: `${result.value.name} needs ${formatWins(result.value.cost)} Wins` });
      return;
    }
    this.announceEvolution(client, player, result.value.name, result.value.multiplier);
  }

  private announceEvolution(client: Client, player: PlayerState, name: string, multiplier: number): void {
    this.persist(client.sessionId, player);
    this.notify(client, { kind: 'evolved', text: `Evolved into ${name}! ${formatMultiplier(multiplier)} Speed` });
    logger.info(SCOPE, `${client.sessionId} evolved into ${name} (wins left ${player.wins})`);
  }

  private onEquipCharacter(client: Client, message: EquipCharacterMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.collection.wearCharacter(player, message?.slot, this.progression);
    if (!result.ok) return;
    this.persist(client.sessionId, player);
    this.notify(client, { kind: 'equipped', text: `Now running as ${result.value.name}` });
  }

  private onTrail(client: Client, message: TrailActionMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.collection.trail(player, message?.action, message?.trail, this.progression);
    if (!result.ok) {
      if (result.reason === 'too-few-wins' && result.value) {
        this.notify(client, { kind: 'refused', text: `${result.value.trail.name} Trail costs ${formatWins(result.value.trail.cost)} Wins` });
      }
      return;
    }
    this.persist(client.sessionId, player);
    const { trail, bought } = result.value;
    this.notify(client, {
      kind: bought ? 'bought' : 'equipped',
      text: bought ? `Unlocked the ${trail.name} Trail! ${formatMultiplier(trail.multiplier)} Speed` : `Equipped ${trail.name}`,
    });
  }

  private onCharm(client: Client, message: CharmActionMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (message?.action === 'buy') {
      const result = this.collection.buyCharm(player, message.value, this.state.shopWindow, this.progression);
      if (!result.ok) {
        const texts: Record<string, string> = {
          away: 'Walk up to the Charm Shop to buy charms.',
          'sold-out': 'Sold out! Wait for the restock.',
          full: 'Your charm bag is full.',
          'too-few-wins': result.value ? `${result.value.name} costs ${formatWins(result.value.cost)} Wins` : 'Not enough Wins',
        };
        const text = texts[result.reason];
        if (text) this.notify(client, { kind: 'refused', text });
        return;
      }
      this.persist(client.sessionId, player);
      this.notify(client, { kind: 'bought', text: `Bought ${result.value.name}! +${result.value.bonus}% Speed` });
      return;
    }
    const result = this.collection.charmAction(player, message?.action, message?.value, this.progression);
    if (!result.ok) {
      if (result.reason === 'slots-full') this.notify(client, { kind: 'refused', text: 'All 3 charm slots are full. Unequip one first.' });
      return;
    }
    this.persist(client.sessionId, player);
  }

  private onClaimGift(client: Client, message: ClaimGiftMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const index = Math.floor(Number(message?.index));
    if (!(index >= 0 && index < 16) || (player.giftsClaimed & (1 << index)) !== 0) return;
    if (!giftReady(index, player.sessionSeconds)) return;
    player.giftsClaimed |= 1 << index;
    const wins = wallet.add(player, giftWins(index, player.rebirths));
    this.persist(client.sessionId, player);
    this.notify(client, { kind: 'bought', text: `Gift opened! +${formatWins(wins)} Wins` });
  }

  private onRebirth(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!canRebirth(player.level, player.rebirths)) {
      this.notify(client, { kind: 'refused', text: `Reach Level ${levelCapFor(player.rebirths)} to Rebirth` });
      return;
    }
    this.rebirth(client, player);
  }

  private rebirth(client: Client, player: PlayerState): void {
    this.progression.resetForRebirth(player);
    this.placeAt(client, SPAWN, 'rebirth');
    this.persist(client.sessionId, player);
    this.notify(client, {
      kind: 'rebirth',
      text: `Rebirth ${player.rebirths}! ${rebirthPower(player.rebirths).toFixed(1)}x Power, Level cap ${levelCapFor(player.rebirths)}`,
    });
    leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
    logger.info(SCOPE, `${client.sessionId} rebirthed to ${player.rebirths}`);
  }

  /** A teleport is to a NAMED place the server knows, and a stage only once it is open to this player. */
  private onTeleport(client: Client, message: TeleportMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.burning.has(client.sessionId)) return;
    const to = String(message?.to ?? '');
    const match = /^stage(\d{1,2})$/.exec(to);
    if (match) {
      const stage = Number(match[1]);
      if (stage >= 1 && stage <= STAGE_COUNT && stage <= player.bestStage + 1) this.placeAt(client, stageEntry(stage), 'teleport', stage);
      else this.notify(client, { kind: 'locked', text: `Claim Stage ${stage - 1} to unlock Stage ${stage}` });
      return;
    }
    if (to in TELEPORTS) this.placeAt(client, TELEPORTS[to as keyof typeof TELEPORTS], 'teleport');
  }

  private onSetIdentity(client: Client, message: SetIdentityMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const identity = sanitizeIdentity(message);
    if (player.displayName === identity.displayName && player.avatarUrl === identity.avatarUrl) return;
    player.displayName = identity.displayName;
    player.avatarUrl = identity.avatarUrl;
    this.persist(client.sessionId, player);
    leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
  }

  private notify(client: Client, notice: NoticeMessage): void {
    client.send(MessageType.Notice, notice);
  }

  /** A notice a player could trigger every tick: at most one per NOTICE_GAP_MS. */
  private notifyOnce(client: Client, notice: NoticeMessage): void {
    const session = this.sessions.get(client.sessionId);
    const now = Date.now();
    if (session) {
      if (now - session.lastNoticeAt < NOTICE_GAP_MS) return;
      session.lastNoticeAt = now;
    }
    this.notify(client, notice);
  }

  private clientOf(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  // ----------------------------------------------------------------- clock

  private refreshShopClock(): void {
    const now = Date.now();
    const window = shopWindowAt(now);
    if (this.state.shopWindow !== window) this.state.shopWindow = window;
    this.state.shopSecondsLeft = shopSecondsLeft(now);
  }

  private tick(delta: number): void {
    this.state.elapsed += delta;
    this.refreshShopClock();
    leaderboardService.update(delta, this.state.leaderboard, this.state.players, this.playerIds);
    this.tickSessions();

    const now = Date.now();
    for (const [sessionId, player] of this.state.players) {
      if (player.ready) {
        player.playSeconds += delta;
        player.sessionSeconds += delta;
      }
      this.collection.normaliseShop(player, this.state.shopWindow);
      const client = this.clientOf(sessionId);
      if (!client) continue;

      const belt = this.speed.tickTreadmill(delta, player, this.progression);
      if (belt && player.treadmill !== belt.id) {
        this.notifyOnce(client, { kind: 'locked', text: `${belt.name} needs ${belt.rebirthsRequired} Rebirths` });
      }

      const claim = this.stages.tick(player);
      if (claim) {
        const wins = wallet.add(player, claim.reward);
        if (claim.index > player.bestStage) player.bestStage = claim.index;
        const payload: StageAwardedMessage = { stage: claim.index, wins, total: player.wins };
        client.send(MessageType.StageAwarded, payload);
        this.goingHome.set(sessionId, now + CLAIM_HOME_DELAY_MS);
        this.persist(sessionId, player);
        leaderboardService.rebuild(this.state.leaderboard, this.state.players, this.playerIds);
        logger.info(SCOPE, `stage ${claim.index} claimed by ${sessionId} (+${wins}, total ${player.wins})`);
      }

      const burnt = this.burning.get(sessionId);
      if (burnt !== undefined && now >= burnt) {
        this.burning.delete(sessionId);
        // No checkpoints: every death starts the run again from the spawn.
        this.placeAt(client, SPAWN, 'lava');
      }
      const home = this.goingHome.get(sessionId);
      if (home !== undefined && now >= home) {
        this.goingHome.delete(sessionId);
        this.placeAt(client, SPAWN, 'claimed');
      }
    }

    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      for (const [sessionId, player] of this.state.players) this.persist(sessionId, player);
    }
  }

  /** Re-asks about tokens Bloxity was unavailable for. */
  private tickSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.switching) continue;
      if (session.status === 'unavailable' && session.token && now >= session.reverifyAt) {
        session.reverifyAt = now + session.reverifyDelay;
        const client = this.clientOf(sessionId);
        if (client) void this.switchAuth(client, { token: session.token }, true);
      }
    }
  }

  // ------------------------------------------------------------- placement

  /** THE one way a player is placed. `stage` > 0 (a teleport) makes that stage the current run at once. */
  private placeAt(client: Client, placement: Placement, reason: RespawnReason, stage = 0): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.goingHome.delete(client.sessionId);
    this.burning.delete(client.sessionId);
    this.movement.teleport(client.sessionId, player, placement.x, placement.y, placement.z, placement.yaw);
    this.stages.placed(player, stage);
    const message: RespawnMessage = { x: placement.x, y: placement.y, z: placement.z, rotationY: placement.yaw, reason };
    client.send(MessageType.Respawn, message);
    if (reason !== 'join') logger.info(SCOPE, `place ${client.sessionId} (${reason}) -> ${placement.x}, ${placement.z}`);
  }

  // ----------------------------------------------------------------- saves

  /** A routine save. Held while the session is changing login. */
  private persist(sessionId: string, player: PlayerState): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.key || session.switching) return;
    void this.saveQuietly(session.key, player);
  }

  private async saveQuietly(key: string, player: PlayerState): Promise<void> {
    try {
      await profileStore.save(key, player);
    } catch (error) {
      logger.error(SCOPE, `save of ${key} failed:`, error);
    }
  }

  /** A save that is waited for only so long; it stays queued and retried regardless. */
  private async saveBounded(key: string, player: PlayerState): Promise<void> {
    const landed = await withTimeout(this.saveQuietly(key, player), LEAVE_SAVE_TIMEOUT_MS);
    if (!landed) logger.warn(SCOPE, `save of ${key} is queued; it lands when storage is back`);
  }
}

/** A guest key from a join option: valid, or empty when none was sent. Refuses the account prefix. */
const readGuestKey = (raw: unknown): string => {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string' && isAccountKey(raw)) {
    logger.warn(SCOPE, `refused a join: browser id carries the account prefix`);
    throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  }
  if (!isValidGuestId(raw)) {
    logger.warn(SCOPE, `refused a join: malformed browser id`);
    throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  }
  return raw;
};

const readToken = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_TOKEN_LENGTH ? raw : null;

const describe = (resolved: ResolvedProfile): string => {
  if (resolved.accountKey) return `account ${resolved.accountKey}`;
  const key = resolved.guestKey || '(no id)';
  return resolved.status === 'unavailable' ? `guest ${key} (bloxity unavailable, will re-ask)` : `guest ${key}`;
};

/** True if the promise settled within the deadline; it keeps running either way. */
const withTimeout = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
