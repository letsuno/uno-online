import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import {
  clearRoomVoteState,
  emitTerminalStateIfNeeded,
  getRoundEndVoteState,
  getRoundEndAt,
  markTerminalHandled,
} from '../../src/ws/game-events';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  takeSeat,
  addSpectatorToRoom,
  pickNextOwner,
  markAllMembersDisconnected,
  createRoom,
  setUserRoom,
  getUserRoom,
  setSeatPlayerConnected,
  setRoomSeats,
  getSeatedPlayers,
  RoomStateCorruptionError,
} from '../../src/plugins/core/room/store';
import { saveGameState, loadGameState, GameStatePersister } from '../../src/plugins/core/game/state-store';
import { GameSession } from '../../src/plugins/core/game/session';
import { TurnTimer } from '../../src/plugins/core/game/turn-timer';
import {
  rearmBlitzAfterRestore,
  enforceBlitzDeadline,
  filterAiProviderInfos,
  emitGameUpdate,
} from '../../src/ws/room-events';
import { cancelOwnerTransfer, scheduleOwnerTransfer } from '../../src/ws/owner-transfer';
import type { MumbleIceConfig } from '../../src/config';
import type { AiProviderSummary } from '../../src/ai/model-registry';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';
import { makeGameState, makePlayer } from '../helpers/test-utils';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';

class TerminalFailingKvStore extends MemoryKvStore {
  failNextSnapshot = false;
  finishedStatusFailuresRemaining = 0;
  finishedStatusAttempts = 0;

  override async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.failNextSnapshot && key.startsWith('game:') && key.endsWith(':state')) {
      this.failNextSnapshot = false;
      throw new Error('injected terminal snapshot failure');
    }
    await super.set(key, value, ttlSeconds);
  }

  override async hset(key: string, fields: Record<string, string>): Promise<void> {
    if (fields['status'] === 'finished') {
      this.finishedStatusAttempts += 1;
    }
    if (this.finishedStatusFailuresRemaining > 0 && fields['status'] === 'finished') {
      this.finishedStatusFailuresRemaining -= 1;
      throw new Error('injected finished status failure');
    }
    await super.hset(key, fields);
  }
}

// Regressions for the 2026-07 lifecycle audit fixes: restart reconciliation,
// all-disconnect grace, TOCTOU start/next-round guards, terminal-state
// idempotency, orphaned-session writes, owner-transfer fallback.

const kv = new MemoryKvStore();
const fake = makeFakeIo();
const mumbleIce: MumbleIceConfig = {
  enabled: false,
  host: '',
  port: 0,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'test',
};
const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);

afterAll(() => {
  handlers.turnTimer.stopAll();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function createWaitingRoom(owner: FakeSocket, second: FakeSocket): Promise<string> {
  const created = await owner.call('room:create', {});
  expect(created.success).toBe(true);
  const roomCode = created.roomCode as string;
  expect((await second.call('room:join', roomCode)).success).toBe(true);
  expect((await second.call('seat:take', 1)).success).toBe(true);
  return roomCode;
}

async function readyAndStart(owner: FakeSocket, others: FakeSocket[]): Promise<void> {
  for (const s of others) expect((await s.call('room:ready', true)).success).toBe(true);
  expect((await owner.call('room:ready', true)).success).toBe(true);
  expect((await owner.call('game:start')).success).toBe(true);
}

describe('room settings protocol validation', () => {
  it('rejects unknown and out-of-domain settings without corrupting the room', async () => {
    const owner = await fake.connect('settings_guard_owner', 'SettingsOwner');

    expect(
      await owner.call('room:create', {
        turnTimeLimit: 45,
        removedLegacyOption: true,
      }),
    ).toEqual({ success: false, error: '房间设置无效' });
    expect(owner.data.roomCode).toBeNull();

    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    const before = await getRoom(kv, roomCode);

    expect(
      await owner.call('room:update_settings', {
        houseRules: { handLimit: 16 },
      }),
    ).toEqual({ success: false, error: '房间设置无效' });
    expect(await getRoom(kv, roomCode)).toEqual(before);

    expect(
      await owner.call('room:update_settings', {
        houseRules: { handLimit: 15 },
      }),
    ).toMatchObject({ success: true });
    expect((await getRoom(kv, roomCode))?.settings.houseRules.handLimit).toBe(15);
  });
});

describe('current socket payload validation', () => {
  it('rejects malformed room codes before entering lifecycle locks', async () => {
    const socket = await fake.connect('payload_room_user', 'PayloadRoom');

    await expect(socket.call('room:join', null)).resolves.toEqual({
      success: false,
      error: '房间码无效',
    });
    await expect(socket.call('room:rejoin', [])).resolves.toEqual({
      success: false,
      error: '房间码无效',
    });
  });

  it('rejects non-integer seat targets without changing the roster', async () => {
    const owner = await fake.connect('payload_seat_owner', 'PayloadSeat');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    const before = await getRoomSeats(kv, roomCode);

    for (const seatIndex of [Number.NaN, 1.5]) {
      await expect(owner.call('seat:take', seatIndex)).resolves.toEqual({
        success: false,
        error: '无效座位编号',
      });
    }
    expect(await getRoomSeats(kv, roomCode)).toEqual(before);
  });

  it('does not silently relocate bots requested for an invalid or occupied seat', async () => {
    const owner = await fake.connect('payload_bot_owner', 'PayloadBot');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;

    await expect(
      owner.call('room:add_bot', {
        difficulty: 'easy',
        seatIndex: 1.5,
      }),
    ).resolves.toEqual({ success: false, error: '人机配置无效' });
    await expect(
      owner.call('room:add_bot', {
        difficulty: 'easy',
        seatIndex: 0,
      }),
    ).resolves.toEqual({ success: false, error: '座位已被占用' });
    expect(getSeatedPlayers(await getRoomSeats(kv, roomCode))).toHaveLength(1);
  });

  it('rejects null and extra-key object payloads instead of dereferencing or spreading them', async () => {
    const owner = await fake.connect('payload_shape_owner', 'PayloadShape');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;

    await expect(owner.call('room:add_bot', null)).resolves.toEqual({
      success: false,
      error: '人机配置无效',
    });
    await expect(
      owner.call('voice:presence', {
        inVoice: true,
        micEnabled: true,
        speakerMuted: false,
        speaking: false,
        legacyFlag: true,
      }),
    ).resolves.toEqual({ success: false, error: '语音状态无效' });
    await expect(owner.call('throw:item', null)).resolves.toEqual({
      success: false,
      error: '互动请求无效',
    });
    await expect(owner.call('game:play_card', null)).resolves.toEqual({
      success: false,
      error: '出牌请求无效',
    });
    expect((await getRoom(kv, roomCode))?.ownerId).toBe('payload_shape_owner');
  });
});

describe('waiting-room stale actions', () => {
  it('does not let a disconnected seat become ready through a queued stale socket action', async () => {
    const owner = await fake.connect('ready_owner', 'ReadyOwner');
    const other = await fake.connect('ready_offline', 'ReadyOffline');
    const roomCode = await createWaitingRoom(owner, other);
    await setSeatPlayerConnected(kv, roomCode, 'ready_offline', false);

    expect(await other.call('room:ready', true)).toMatchObject({
      success: false,
      error: '掉线玩家无法准备，请先重连',
    });
    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'ready_offline')?.ready).toBe(false);
  });
});

describe('owner-transfer scheduling', () => {
  it('keeps the earliest deadline when the same disconnected owner is scheduled repeatedly', () => {
    vi.useFakeTimers();
    const roomCode = 'OWNER_DEADLINE';
    const before = fake.roomEmits(roomCode, 'room:owner_transfer_pending').length;

    scheduleOwnerTransfer(roomCode, 'deadline_owner');
    const first = fake.lastRoomEmit(roomCode, 'room:owner_transfer_pending') as { transferAt: number };
    vi.advanceTimersByTime(1_000);
    scheduleOwnerTransfer(roomCode, 'deadline_owner');

    expect(fake.roomEmits(roomCode, 'room:owner_transfer_pending')).toHaveLength(before + 1);
    expect(fake.lastRoomEmit(roomCode, 'room:owner_transfer_pending')).toEqual(first);
    cancelOwnerTransfer(roomCode);
  });
});

describe('restart recovery reconciliation', () => {
  it('preserves a recoverable room when lazy roster reconciliation has a transient KV failure', async () => {
    const owner = await fake.connect('f_restore_retry_owner', 'RestoreRetryOwner');
    const other = await fake.connect('f_restore_retry_other', 'RestoreRetryOther');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);
    handlers.turnTimer.stop(roomCode);
    handlers.sessions.delete(roomCode);

    const originalBatch = kv.batchStrings.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'batchStrings').mockImplementation(async operations => {
      if (!injected && operations.some(operation => operation.key === `room:${roomCode}:seats`)) {
        injected = true;
        throw new Error('injected transient restore failure');
      }
      await originalBatch(operations);
    });

    await expect(owner.call('room:rejoin', roomCode)).resolves.toMatchObject({
      success: false,
      error: '游戏状态恢复失败，请重试',
    });
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect(await loadGameState(kv, roomCode)).not.toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);

    await expect(owner.call('room:rejoin', roomCode)).resolves.toMatchObject({ success: true });
    expect(handlers.sessions.has(roomCode)).toBe(true);
  });

  it.each([
    ['malformed JSON', '{'],
    [
      'a current state missing players',
      JSON.stringify({
        snapshotVersion: 1,
        gameState: { phase: 'playing' },
        lifecycle: { excludedFromNextRound: [], pendingSpectatorJoins: [] },
      }),
    ],
  ])('dissolves a room when lazy restore reads %s', async (_label, rawSnapshot) => {
    const suffix = rawSnapshot === '{' ? 'json' : 'players';
    const owner = await fake.connect(`f_corrupt_${suffix}_owner`, 'CorruptOwner');
    const other = await fake.connect(`f_corrupt_${suffix}_other`, 'CorruptOther');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);
    handlers.turnTimer.stop(roomCode);
    handlers.sessions.delete(roomCode);
    await kv.set(`game:${roomCode}:state`, rawSnapshot);

    await expect(owner.call('room:rejoin', roomCode)).resolves.toMatchObject({
      success: false,
      error: '游戏状态已损坏，房间已清理',
    });
    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(await kv.get(`game:${roomCode}:state`)).toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);
  });

  it('classifies a session-construction failure as deterministic snapshot corruption', async () => {
    const owner = await fake.connect('f_construct_owner', 'ConstructOwner');
    const other = await fake.connect('f_construct_other', 'ConstructOther');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);
    handlers.turnTimer.stop(roomCode);
    handlers.sessions.delete(roomCode);
    vi.spyOn(GameSession, 'fromState').mockImplementationOnce(() => {
      throw new TypeError('injected invalid persisted session structure');
    });

    await expect(owner.call('room:rejoin', roomCode)).resolves.toMatchObject({
      success: false,
      error: '游戏状态已损坏，房间已清理',
    });
    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(await kv.get(`game:${roomCode}:state`)).toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);
  });

  it('rejects duplicate active roster entries instead of repairing them from a snapshot', async () => {
    const roomCode = 'DUPRST';
    const player = {
      userId: 'duplicate-player',
      nickname: 'DuplicatePlayer',
      avatarUrl: null,
      role: 'normal',
      ready: false,
      connected: true,
      isBot: false,
    };
    await setRoomSeats(kv, roomCode, [player, { ...player }, ...Array.from({ length: 8 }, () => null)]);

    await expect(getRoomSeats(kv, roomCode)).rejects.toBeInstanceOf(RoomStateCorruptionError);
    await kv.del(`room:${roomCode}:seats`);
  });

  it('dissolves a non-waiting room when its live session and snapshot are both missing', async () => {
    const owner = await fake.connect('f0_owner', 'F0Owner');
    const other = await fake.connect('f0_other', 'F0Other');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);

    handlers.turnTimer.stop(roomCode);
    await handlers.persister.cleanup(roomCode);
    await kv.del(`game:${roomCode}:state`);
    handlers.sessions.delete(roomCode);

    const result = await owner.call('room:rejoin', roomCode);
    expect(result).toMatchObject({ success: false, error: '游戏状态已失效，房间已清理' });
    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(await getUserRoom(kv, 'f0_owner')).toBeNull();
    expect(await getUserRoom(kv, 'f0_other')).toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);
  });

  it('ghost connected:true players from a crashed process are auto-voted after restore', async () => {
    const owner = await fake.connect('f1_owner', 'F1Owner');
    const ghost = await fake.connect('f1_ghost', 'F1Ghost');
    const roomCode = await createWaitingRoom(owner, ghost);
    await readyAndStart(owner, [ghost]);

    // Crash mid round_end: the snapshot froze BOTH players as connected:true
    // even though no socket survives a restart. Before the fix the ghost was
    // never auto-voted (connected:true skips the reseed) and could never
    // disconnect — the vote deadlocked at 1/2 forever.
    const persisted = makeGameState({
      phase: 'round_end',
      players: [makePlayer('f1_owner'), makePlayer('f1_ghost')],
    });
    await saveGameState(kv, roomCode, persisted);
    handlers.sessions.delete(roomCode);

    const res = await owner.call('room:rejoin', roomCode);
    expect(res.success).toBe(true);

    const vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as {
      votes: number;
      required: number;
      voters: string[];
    };
    expect(vote.voters).toContain('f1_ghost');
    expect(vote.voters).not.toContain('f1_owner');
  });

  it('a restored game whose snapshot points at an offline player still gets a turn driver', async () => {
    const owner = await fake.connect('f2_owner', 'F2Owner');
    const away = await fake.connect('f2_away', 'F2Away');
    const roomCode = await createWaitingRoom(owner, away);
    await readyAndStart(owner, [away]);

    // Crash while it was the (now offline) opponent's turn. Before the fix
    // the rejoin gated startTurnTimer on connectedCount >= 2, so a pure
    // two-human game froze forever — nobody could act, no timer, no driver.
    const persisted = makeGameState({
      phase: 'playing',
      currentPlayerIndex: 1,
      players: [makePlayer('f2_owner'), { ...makePlayer('f2_away'), connected: false }],
    });
    await saveGameState(kv, roomCode, persisted);
    handlers.sessions.delete(roomCode);
    handlers.turnTimer.stop(roomCode);

    expect((await owner.call('room:rejoin', roomCode)).success).toBe(true);
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(true);

    handlers.turnTimer.stop(roomCode);
    handlers.sessions.delete(roomCode);
  });

  it('markAllMembersDisconnected resets human flags but spares bots and live users', async () => {
    const roomCode = 'RECON1';
    await createRoom(kv, roomCode, 'r_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    await takeSeat(kv, roomCode, 0, {
      userId: 'r_owner',
      nickname: 'O',
      avatarUrl: null,
      ready: true,
      connected: true,
      role: 'normal',
      isBot: false,
    });
    await takeSeat(kv, roomCode, 1, {
      userId: 'r_bot',
      nickname: 'B',
      avatarUrl: null,
      ready: true,
      connected: true,
      role: 'normal',
      isBot: true,
      botConfig: { difficulty: 'normal', personality: 'balanced' },
    });
    await takeSeat(kv, roomCode, 2, {
      userId: 'r_live',
      nickname: 'L',
      avatarUrl: null,
      ready: true,
      connected: true,
      role: 'normal',
      isBot: false,
    });
    await addSpectatorToRoom(kv, roomCode, {
      userId: 'r_spec',
      nickname: 'S',
      avatarUrl: null,
      role: 'normal',
      connected: true,
    });

    await markAllMembersDisconnected(kv, roomCode, uid => uid === 'r_live');

    const seats = await getRoomSeats(kv, roomCode);
    const ownerSeat = seats.find(s => s?.userId === 'r_owner')!;
    expect(ownerSeat.connected).toBe(false);
    expect(ownerSeat.ready).toBe(false);
    // Bots have no socket to lose; live users already reconnected.
    expect(seats.find(s => s?.userId === 'r_bot')!.connected).toBe(true);
    expect(seats.find(s => s?.userId === 'r_live')!.connected).toBe(true);

    const spec = (await getRoomSpectators(kv, roomCode)).find(s => s.userId === 'r_spec')!;
    expect(spec.connected).toBe(false);
  });
});

describe('review-pass regressions', () => {
  it('only lists AI providers compatible with the requested player count and current rules', () => {
    const provider = (id: string, minPlayers: number, supportedHouseRules: 'all' | string[]): AiProviderSummary => ({
      id,
      displayName: id,
      version: '1.0.0',
      source: 'community',
      usesOnnx: false,
      dataAccess: [],
      fairness: 'fair',
      capabilities: { minPlayers, maxPlayers: 10, supportedHouseRules },
      enabled: true,
    });
    const providers = [
      provider('universal', 2, 'all'),
      provider('four-player-only', 4, 'all'),
      provider('jump-in-only', 2, ['jumpIn']),
    ];
    const rules = { ...DEFAULT_HOUSE_RULES, stackDrawTwo: true };

    expect(filterAiProviderInfos(providers, 2, rules).map(item => item.id)).toEqual(['universal']);
    expect(filterAiProviderInfos(providers, 4, DEFAULT_HOUSE_RULES).map(item => item.id)).toEqual([
      'universal',
      'four-player-only',
      'jump-in-only',
    ]);
  });

  it('a terminal snapshot restored by a non-owner schedules an owner transfer', async () => {
    const owner = await fake.connect('f6_owner', 'F6Owner');
    const other = await fake.connect('f6_other', 'F6Other');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);

    const persisted = makeGameState({
      phase: 'round_end',
      players: [makePlayer('f6_owner'), makePlayer('f6_other')],
    });
    await saveGameState(kv, roomCode, persisted);
    handlers.sessions.delete(roomCode);
    owner.detach?.();

    // The owner never returns. Every exit from the scoreboard is
    // owner-gated, so without a scheduled transfer the room deadlocks.
    expect((await other.call('room:rejoin', roomCode)).success).toBe(true);
    expect(fake.lastRoomEmit(roomCode, 'room:owner_transfer_pending')).toBeDefined();
    cancelOwnerTransfer(roomCode);
  });

  it('a restored blitz game recovers its total-time deadline', async () => {
    vi.useFakeTimers();
    const roomCode = 'BLITZR1';
    await createRoom(kv, roomCode, 'b_a', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    const state = makeGameState({
      phase: 'round_end',
      gameStartedAt: Date.now() - 3600_000,
      players: [makePlayer('b_a'), makePlayer('b_b')],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, blitzTimeLimit: 120 },
        allowSpectators: true,
        spectatorMode: 'hidden',
      },
    });
    const session = GameSession.fromState(state);
    handlers.sessions.set(roomCode, session);

    rearmBlitzAfterRestore(fake.io, kv, roomCode, session, handlers.sessions, handlers.turnTimer, handlers.persister);
    // Deadline expired an hour ago — the next round boundary must end the
    // game instead of dealing a round that should never exist.
    const ended = await enforceBlitzDeadline(
      fake.io,
      kv,
      roomCode,
      session,
      handlers.sessions,
      handlers.turnTimer,
      handlers.persister,
    );
    expect(ended).toBe(true);
    expect(session.getFullState().phase).toBe('game_over');
    handlers.sessions.delete(roomCode);
  });

  it('a blitz force-game-over with an offline owner schedules an owner transfer', async () => {
    vi.useFakeTimers();
    const roomCode = 'BLITZOWN';
    await createRoom(kv, roomCode, 'bo_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    const state = makeGameState({
      phase: 'round_end',
      gameStartedAt: Date.now() - 3600_000,
      players: [{ ...makePlayer('bo_owner'), connected: false }, makePlayer('bo_other')],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, blitzTimeLimit: 120 },
        allowSpectators: true,
        spectatorMode: 'hidden',
      },
    });
    const session = GameSession.fromState(state);
    handlers.sessions.set(roomCode, session);
    rearmBlitzAfterRestore(fake.io, kv, roomCode, session, handlers.sessions, handlers.turnTimer, handlers.persister);

    expect(
      await enforceBlitzDeadline(
        fake.io,
        kv,
        roomCode,
        session,
        handlers.sessions,
        handlers.turnTimer,
        handlers.persister,
      ),
    ).toBe(true);
    // Without this the game_over scoreboard is owner-gated forever: the
    // anchor short-circuits the live path's owner check.
    expect(fake.lastRoomEmit(roomCode, 'room:owner_transfer_pending')).toBeDefined();
    cancelOwnerTransfer(roomCode);
    handlers.sessions.delete(roomCode);
  });

  it('a blitz timeout reaches a durable terminal scoreboard after an immediate snapshot failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const roomCode = 'BLITZ_FLUSH';
    const store = new TerminalFailingKvStore();
    const localPersister = new GameStatePersister(store);
    const localTimer = new TurnTimer();
    await createRoom(store, roomCode, 'bf_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    const session = GameSession.fromState(
      makeGameState({
        phase: 'round_end',
        gameStartedAt: Date.now() - 121_000,
        players: [makePlayer('bf_owner'), makePlayer('bf_other')],
        settings: {
          turnTimeLimit: 30,
          targetScore: 500,
          houseRules: { ...DEFAULT_HOUSE_RULES, blitzTimeLimit: 120 },
          allowSpectators: true,
          spectatorMode: 'hidden',
        },
      }),
    );
    const localSessions = new Map([[roomCode, session]]);
    rearmBlitzAfterRestore(fake.io, store, roomCode, session, localSessions, localTimer, localPersister);
    store.failNextSnapshot = true;

    try {
      await expect(
        enforceBlitzDeadline(fake.io, store, roomCode, session, localSessions, localTimer, localPersister),
      ).resolves.toBe(true);
      expect(session.getFullState().phase).toBe('game_over');
      expect(fake.lastRoomEmit(roomCode, 'game:over')).toMatchObject({ reason: 'blitz_timeout' });
      expect(getRoundEndAt(roomCode)).not.toBeNull();
      expect((await getRoom(store, roomCode))?.status).toBe('finished');
      await expect(localPersister.flushNow(roomCode)).resolves.toBeUndefined();
      expect((await loadGameState(store, roomCode))?.phase).toBe('game_over');
    } finally {
      clearRoomVoteState(roomCode);
      localSessions.delete(roomCode);
      localTimer.stopAll();
    }
  });

  it('rejects robot roster packets once the game has started without mutating the session', async () => {
    const owner = await fake.connect('f7_owner', 'F7Owner');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    await expect(owner.call('room:add_bot', { difficulty: 'rl' })).resolves.toMatchObject({
      success: false,
      error: 'RL AI 必须选择具体的 AI 引擎',
    });
    await expect(
      owner.call('room:add_bot', {
        difficulty: 'easy',
        aiProviderId: 'builtin-rl-v1',
      }),
    ).resolves.toMatchObject({
      success: false,
      error: '普通人机不能指定 AI 引擎',
    });
    const added = await owner.call('room:add_bot', { difficulty: 'easy' });
    expect(added.success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    const session = handlers.sessions.get(roomCode)!;
    const before = session.getFullState();
    const botId = before.players.find(p => p.id !== 'f7_owner')!.id;

    await expect(owner.call('room:add_bot', { difficulty: 'easy' })).resolves.toMatchObject({
      success: false,
      error: '只能在等待房间添加机器人',
    });
    await expect(owner.call('room:remove_bot', { botId })).resolves.toMatchObject({
      success: false,
      error: '只能在等待房间移除机器人',
    });
    await expect(owner.call('room:set_bot_difficulty', { botId, difficulty: 'hard' })).resolves.toMatchObject({
      success: false,
      error: '只能在等待房间修改机器人',
    });
    await expect(owner.call('room:set_bot_ai', { botId, providerId: 'builtin-rl-v1' })).resolves.toMatchObject({
      success: false,
      error: '只能在等待房间修改机器人',
    });
    // A human id sent through remove_bot must be equally harmless.
    expect((await owner.call('room:remove_bot', { botId: 'f7_owner' })).success).toBe(false);

    const after = session.getFullState();
    expect(after.phase).toBe(before.phase);
    expect(after.players.map(player => [player.id, player.hand.length])).toEqual(
      before.players.map(player => [player.id, player.hand.length]),
    );
    expect(await getRoomSeats(kv, roomCode)).toHaveLength(10);
    expect(getRoundEndAt(roomCode)).toBeNull();
    expect((await getRoom(kv, roomCode))!.status).toBe('playing');
    handlers.turnTimer.stop(roomCode);
  });

  it('getRoom rejects a partial room hash', async () => {
    await kv.hset('room:POISON1', { ownerId: 'ghost' });
    await expect(getRoom(kv, 'POISON1')).rejects.toBeInstanceOf(RoomStateCorruptionError);
    await kv.del('room:POISON1');
  });
});

describe('waiting-room owner projection', () => {
  it('does not re-project the departed owner when a post-transfer room read fails', async () => {
    const ownerId = 'f3_projection_owner';
    const nextOwnerId = 'f3_projection_next';
    const owner = await fake.connect(ownerId, 'ProjectionOwner');
    const nextOwner = await fake.connect(nextOwnerId, 'ProjectionNext');
    const roomCode = await createWaitingRoom(owner, nextOwner);
    const roomKey = `room:${roomCode}`;
    const emittedBeforeLeave = fake.emitted.length;
    const originalHset = kv.hset.bind(kv);
    const originalHgetall = kv.hgetall.bind(kv);
    let ownerTransferCommitted = false;
    let postCommitRoomReads = 0;

    vi.spyOn(kv, 'hset').mockImplementation(async (key, fields) => {
      await originalHset(key, fields);
      if (key === roomKey && fields['ownerId'] === nextOwnerId) {
        ownerTransferCommitted = true;
      }
    });
    vi.spyOn(kv, 'hgetall').mockImplementation(async key => {
      if (key === roomKey && ownerTransferCommitted) {
        postCommitRoomReads += 1;
        if (postCommitRoomReads === 2) {
          throw new Error('injected post-transfer projection read failure');
        }
      }
      return originalHgetall(key);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(owner.call('room:leave')).resolves.toMatchObject({
      success: true,
      outcome: 'left',
    });

    const projectedOwners = fake.emitted
      .slice(emittedBeforeLeave)
      .filter(event => event.target === roomCode && event.event === 'room:updated')
      .map(event => (event.payload as { room: { ownerId: string } }).room.ownerId);
    expect(postCommitRoomReads).toBeGreaterThanOrEqual(2);
    expect(projectedOwners).toEqual([nextOwnerId]);

    vi.restoreAllMocks();
    expect((await getRoom(kv, roomCode))?.ownerId).toBe(nextOwnerId);
    expect((await nextOwner.call('room:dissolve')).success).toBe(true);
  });
});

describe('all-disconnect grace (5 minutes, not 30 seconds)', () => {
  it('keeps a persistent waiting-room owner for the full grace instead of dissolving at 10 seconds', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('f3_wait_owner', 'WaitOwner3');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await owner.call('room:add_bot', { difficulty: 'easy' })).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);
    handlers.sessions.get(roomCode)!.forceGameOver('f3_wait_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    expect((await owner.call('game:back_to_room')).success).toBe(true);

    await owner.trigger('disconnect');
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await getRoom(kv, roomCode))?.ownerId).toBe('f3_wait_owner');

    await vi.advanceTimersByTimeAsync(5 * 60_000 - 10_002);
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('transfers a waiting persistent owner only to an actually online human', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('f3_transfer_owner', 'TransferOwner3');
    const watcher = await fake.connect('f3_transfer_watch', 'TransferWatch3');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await watcher.call('room:join', roomCode)).success).toBe(true);
    expect((await owner.call('room:add_bot', { difficulty: 'easy' })).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);
    handlers.sessions.get(roomCode)!.forceGameOver('f3_transfer_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    expect((await owner.call('game:back_to_room')).success).toBe(true);

    await owner.trigger('disconnect');
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await getRoom(kv, roomCode))?.ownerId).toBe('f3_transfer_watch');
    expect((await watcher.call('room:dissolve')).success).toBe(true);
  });

  it('a game where every human dropped survives the 30s per-player timers', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('f3_owner', 'F3Owner');
    const other = await fake.connect('f3_other', 'F3Other');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);

    await owner.trigger('disconnect');
    await other.trigger('disconnect');

    // t+31s: both 30s reconnect windows expired. Before the fix the first
    // window's callback saw "no connected humans" and dissolved on the spot,
    // capping the 5-minute all-disconnect grace at ~30s.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(true);

    // The grace is a bound, not immortality: the 5-minute timer still fires.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);
  });
});

describe('game:start concurrency lock', () => {
  it('rejects a pending seat swap that races the game start commit', async () => {
    const owner = await fake.connect('f4_swap_owner', 'SwapOwner4');
    const player = await fake.connect('f4_swap_player', 'SwapPlayer4');
    const roomCode = await createWaitingRoom(owner, player);
    expect((await owner.call('seat:swap_request', 'f4_swap_player')).success).toBe(true);
    expect((await player.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);

    const [started, swapped] = await Promise.all([
      owner.call('game:start'),
      player.call('seat:swap_respond', { requesterId: 'f4_swap_owner', accept: true }),
    ]);
    expect(started.success).toBe(true);
    expect(swapped).toMatchObject({ success: false, error: '游戏进行中无法换座' });
    const seats = await getRoomSeats(kv, roomCode);
    expect(seats[0]?.userId).toBe('f4_swap_owner');
    expect(seats[1]?.userId).toBe('f4_swap_player');
    handlers.turnTimer.stop(roomCode);
  });

  it('persists a complete snapshot before committing room status to playing', async () => {
    let snapshotPresentAtPlayingCommit = false;
    const originalHset = kv.hset.bind(kv);
    kv.hset = async (key: string, fields: Record<string, string>) => {
      if (fields['status'] === 'playing') {
        const roomCode = key.slice('room:'.length);
        snapshotPresentAtPlayingCommit = (await kv.get(`game:${roomCode}:state`)) !== null;
      }
      await originalHset(key, fields);
    };

    try {
      const owner = await fake.connect('f4_order_owner', 'OrderOwner4');
      const player = await fake.connect('f4_order_player', 'OrderPlayer4');
      const created = await owner.call('room:create', {});
      const roomCode = created.roomCode as string;
      expect((await player.call('room:join', roomCode)).success).toBe(true);
      expect((await player.call('seat:take', 1)).success).toBe(true);
      expect((await player.call('room:ready', true)).success).toBe(true);
      expect((await owner.call('room:ready', true)).success).toBe(true);
      expect((await owner.call('game:start')).success).toBe(true);

      expect(snapshotPresentAtPlayingCommit).toBe(true);
      expect(await kv.get(`game:${roomCode}:state`)).not.toBeNull();
      handlers.turnTimer.stop(roomCode);
    } finally {
      kv.hset = originalHset;
    }
  });

  it('two interleaved game:start events deal exactly one game', async () => {
    const owner = await fake.connect('f4_owner', 'F4Owner');
    const other = await fake.connect('f4_other', 'F4Other');
    const roomCode = await createWaitingRoom(owner, other);
    for (const s of [other, owner]) expect((await s.call('room:ready', true)).success).toBe(true);

    // Both handlers pass the status/sessions checks before either reaches
    // sessions.set — only the synchronous startingRooms entry separates them.
    const [r1, r2] = await Promise.all([owner.call('game:start'), owner.call('game:start')]);
    const successes = [r1, r2].filter(r => r.success);
    expect(successes.length).toBe(1);
    expect([r1, r2].find(r => !r.success)!.error).toBe('游戏已开始');
    // One deck dealt: every socket saw exactly one game:state.
    expect(owner.emitted.filter(e => e.event === 'game:state').length).toBe(1);
    expect(other.emitted.filter(e => e.event === 'game:state').length).toBe(1);
  });
});

describe('seat:take race keeps the loser a spectator', () => {
  it('losing a seat race must not strip spectator membership', async () => {
    const owner = await fake.connect('f5_owner', 'F5Owner');
    const other = await fake.connect('f5_other', 'F5Other');
    const roomCode = await createWaitingRoom(owner, other);

    const specA = await fake.connect('f5_specA', 'F5SpecA');
    const specB = await fake.connect('f5_specB', 'F5SpecB');
    expect((await specA.call('room:join', roomCode)).success).toBe(true);
    expect((await specB.call('room:join', roomCode)).success).toBe(true);

    const [rA, rB] = await Promise.all([specA.call('seat:take', 3), specB.call('seat:take', 3)]);
    const winners = [rA, rB].filter(r => r.success);
    expect(winners.length).toBe(1);

    const loser = rA.success ? specB : specA;
    const loserId = loser.data.user.userId;
    const seats = await getRoomSeats(kv, roomCode);
    const spectators = await getRoomSpectators(kv, roomCode);
    // Before the fix the loser was removed from spectators BEFORE takeSeat
    // threw, leaving them with neither identity — invisible and permanently
    // rejected by the "你不在该房间中" precheck. (data.isSpectator is an
    // in-game-only flag and stays false in waiting rooms for everyone.)
    expect(seats.some(s => s?.userId === loserId)).toBe(false);
    expect(spectators.some(s => s.userId === loserId)).toBe(true);
  });
});

describe('terminal-state idempotency and orphan guard', () => {
  it('announces round_end even when the immediate snapshot flush fails', async () => {
    const roomCode = 'TERM_FLUSH_RETRY';
    const store = new TerminalFailingKvStore();
    const localPersister = new GameStatePersister(store);
    const localTimer = new TurnTimer();
    const session = GameSession.fromState(
      makeGameState({
        phase: 'round_end',
        players: [makePlayer('term_flush_owner'), makePlayer('term_flush_other')],
      }),
    );
    const localSessions = new Map([[roomCode, session]]);
    await createRoom(store, roomCode, 'term_flush_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    localPersister.markDirty(roomCode, session.getFullState());
    store.failNextSnapshot = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        emitTerminalStateIfNeeded(fake.io, roomCode, session, localTimer, store, localSessions, localPersister),
      ).resolves.toBe(true);
      expect(fake.roomEmits(roomCode, 'game:round_end')).toHaveLength(1);
      expect(getRoundEndAt(roomCode)).not.toBeNull();

      // flushNow restored the failed snapshot; an explicit retry proves the
      // terminal event did not trade away durability.
      await expect(localPersister.flushNow(roomCode)).resolves.toBeUndefined();
      expect((await loadGameState(store, roomCode))?.phase).toBe('round_end');
    } finally {
      clearRoomVoteState(roomCode);
      localSessions.delete(roomCode);
      localTimer.stopAll();
    }
  });

  it('retries the finished room projection after the scoreboard is announced', async () => {
    vi.useFakeTimers();
    const roomCode = 'TERM_STATUS_RETRY';
    const store = new TerminalFailingKvStore();
    const localPersister = new GameStatePersister(store);
    const localTimer = new TurnTimer();
    const session = GameSession.fromState(
      makeGameState({
        phase: 'game_over',
        players: [makePlayer('term_status_owner'), makePlayer('term_status_other')],
      }),
    );
    const localSessions = new Map([[roomCode, session]]);
    await createRoom(store, roomCode, 'term_status_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    localPersister.markDirty(roomCode, session.getFullState());
    await localPersister.flushNow(roomCode);
    store.finishedStatusFailuresRemaining = 2;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(
        emitTerminalStateIfNeeded(fake.io, roomCode, session, localTimer, store, localSessions, localPersister),
      ).resolves.toBe(true);
      expect(fake.roomEmits(roomCode, 'game:over')).toHaveLength(1);
      expect((await getRoom(store, roomCode))?.status).toBe('waiting');
      expect(store.finishedStatusAttempts).toBe(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(store.finishedStatusAttempts).toBe(2);
      expect((await getRoom(store, roomCode))?.status).toBe('waiting');
      await vi.advanceTimersByTimeAsync(1_999);
      expect(store.finishedStatusAttempts).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(store.finishedStatusAttempts).toBe(3);
      expect((await getRoom(store, roomCode))?.status).toBe('finished');
    } finally {
      clearRoomVoteState(roomCode);
      localSessions.delete(roomCode);
      localTimer.stopAll();
    }
  });

  it('a second emitTerminalStateIfNeeded pass neither re-broadcasts nor moves the anchor', async () => {
    const roomCode = 'IDEM1';
    const state = makeGameState({
      phase: 'round_end',
      players: [makePlayer('i_a'), { ...makePlayer('i_b'), connected: false }],
    });
    const session = GameSession.fromState(state);
    handlers.sessions.set(roomCode, session);

    const first = await emitTerminalStateIfNeeded(
      fake.io,
      roomCode,
      session,
      handlers.turnTimer,
      kv,
      handlers.sessions,
      handlers.persister,
    );
    expect(first).toBe(true);
    const anchor = getRoundEndAt(roomCode);
    const votesAfterFirst = getRoundEndVoteState(roomCode, session)!.votes;
    expect(votesAfterFirst).toBe(1);
    const broadcasts = fake.roomEmits(roomCode, 'game:round_end').length;

    await new Promise(r => setTimeout(r, 5));
    const second = await emitTerminalStateIfNeeded(
      fake.io,
      roomCode,
      session,
      handlers.turnTimer,
      kv,
      handlers.sessions,
      handlers.persister,
    );
    expect(second).toBe(true);
    expect(getRoundEndAt(roomCode)).toBe(anchor);
    expect(getRoundEndVoteState(roomCode, session)!.votes).toBe(votesAfterFirst);
    expect(fake.roomEmits(roomCode, 'game:round_end').length).toBe(broadcasts);

    handlers.sessions.delete(roomCode);
  });

  it('an orphaned session (room dissolved mid-callback) announces nothing', async () => {
    const roomCode = 'ORPHAN1';
    const state = makeGameState({
      phase: 'round_end',
      players: [makePlayer('o_a'), makePlayer('o_b')],
    });
    const session = GameSession.fromState(state);
    // Deliberately NOT in handlers.sessions — the room was dissolved while a
    // timer callback still held this reference.
    const handled = await emitTerminalStateIfNeeded(
      fake.io,
      roomCode,
      session,
      handlers.turnTimer,
      kv,
      handlers.sessions,
      handlers.persister,
    );
    expect(handled).toBe(true);
    expect(fake.roomEmits(roomCode, 'game:round_end').length).toBe(0);
    expect(getRoundEndAt(roomCode)).toBeNull();
  });

  it('stops driving an orphaned session even while its phase is still playing', async () => {
    const roomCode = 'ORPHAN2';
    const session = GameSession.fromState(
      makeGameState({
        phase: 'playing',
        players: [makePlayer('o2_a'), makePlayer('o2_b')],
      }),
    );

    const handled = await emitTerminalStateIfNeeded(
      fake.io,
      roomCode,
      session,
      handlers.turnTimer,
      kv,
      handlers.sessions,
      handlers.persister,
    );

    expect(handled).toBe(true);
    expect(fake.roomEmits(roomCode, 'game:round_end')).toHaveLength(0);
    expect(fake.roomEmits(roomCode, 'game:over')).toHaveLength(0);
  });

  it('a generic game update cannot recreate a deleted room hash from an orphaned game-over session', async () => {
    const roomCode = 'ORPHAN3';
    const session = GameSession.fromState(
      makeGameState({
        phase: 'game_over',
        players: [makePlayer('o3_a'), makePlayer('o3_b')],
      }),
    );

    await expect(emitGameUpdate(fake.io, roomCode, session, kv)).rejects.toThrow(
      `Room ${roomCode} is missing during game update`,
    );

    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(await kv.hgetall(`room:${roomCode}`)).toEqual({});
    expect(await kv.keys(`room:${roomCode}`)).toHaveLength(0);
  });
});

describe('persister tombstone', () => {
  it('markDirty after cleanup cannot resurrect a dissolved room state', async () => {
    const store = new MemoryKvStore();
    const persister = new GameStatePersister(store);
    const state = makeGameState({});

    persister.markDirty('TOMB1', state);
    await persister.flushNow('TOMB1');
    expect(await loadGameState(store, 'TOMB1')).not.toBeNull();

    await store.del('game:TOMB1:state');
    await persister.cleanup('TOMB1');
    // The zombie write a timer callback issues after dissolveRoom.
    persister.markDirty('TOMB1', state);
    await persister.flushNow('TOMB1');
    expect(await loadGameState(store, 'TOMB1')).toBeNull();

    // A new game on a reused code lifts the tombstone.
    persister.revive('TOMB1');
    persister.markDirty('TOMB1', state);
    await persister.flushNow('TOMB1');
    expect(await loadGameState(store, 'TOMB1')).not.toBeNull();
  });
});

describe('owner transfer candidates', () => {
  it('never promotes an offline human and still selects an online one', () => {
    const seats = [
      null,
      {
        userId: 'grace_user',
        nickname: 'G',
        avatarUrl: null,
        ready: false,
        connected: false,
        role: 'normal',
        isBot: false,
      },
      {
        userId: 'a_bot',
        nickname: 'B',
        avatarUrl: null,
        ready: true,
        connected: true,
        role: 'normal',
        isBot: true,
        botConfig: { difficulty: 'normal', personality: 'balanced' },
      },
      {
        userId: 'live_user',
        nickname: 'L',
        avatarUrl: null,
        ready: true,
        connected: true,
        role: 'normal',
        isBot: false,
      },
      null,
      null,
      null,
      null,
      null,
    ];
    expect(pickNextOwner(seats as never, [], 'leaving_owner')).toBe('live_user');
    expect(pickNextOwner(seats.slice(0, 3) as never, [], 'leaving_owner')).toBeNull();
  });
});

describe('startup disconnect governance', () => {
  it('rebuilds waiting-seat eviction timers while preserving a member who rejoins', async () => {
    vi.useFakeTimers();
    let releaseKeys!: () => void;
    const keysGate = new Promise<void>(resolve => {
      releaseKeys = resolve;
    });
    class DelayedKeysKv extends MemoryKvStore {
      override async keys(pattern: string): Promise<string[]> {
        await keysGate;
        return super.keys(pattern);
      }
    }
    const restartKv = new DelayedKeysKv();
    await createRoom(restartKv, 'RSET55', 'restart_live', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    await takeSeat(restartKv, 'RSET55', 0, {
      userId: 'restart_live',
      nickname: 'RestartLive',
      avatarUrl: null,
      ready: false,
      connected: true,
      role: 'normal',
      isBot: false,
    });
    await takeSeat(restartKv, 'RSET55', 1, {
      userId: 'restart_ghost',
      nickname: 'RestartGhost',
      avatarUrl: null,
      ready: false,
      connected: true,
      role: 'normal',
      isBot: false,
    });
    await Promise.all([
      setUserRoom(restartKv, 'restart_live', 'RSET55'),
      setUserRoom(restartKv, 'restart_ghost', 'RSET55'),
    ]);

    const restartFake = makeFakeIo();
    const restartHandlers = setupSocketHandlers(restartFake.io, restartKv, 'test-secret', 60 * 60_000, mumbleIce);
    const live = await restartFake.connect('restart_live', 'RestartLive');
    await restartFake.connect('restart_ghost', 'RestartGhost');
    releaseKeys();
    expect((await live.call('room:rejoin', 'RSET55')).success).toBe(true);

    await vi.advanceTimersByTimeAsync(31_000);
    const seats = await getRoomSeats(restartKv, 'RSET55');
    expect(seats.some(seat => seat?.userId === 'restart_live')).toBe(true);
    expect(seats.some(seat => seat?.userId === 'restart_ghost')).toBe(false);
    expect(await getRoom(restartKv, 'RSET55')).not.toBeNull();
    restartHandlers.turnTimer.stopAll();
    await restartKv.disconnect();
  });

  it('restores the five-minute timer for a room where nobody reconnects', async () => {
    vi.useFakeTimers();
    const restartKv = new MemoryKvStore();
    await createRoom(restartKv, 'RESTART5', 'restart_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    await takeSeat(restartKv, 'RESTART5', 0, {
      userId: 'restart_owner',
      nickname: 'RestartOwner',
      avatarUrl: null,
      ready: true,
      connected: true,
      role: 'normal',
      isBot: false,
    });
    await restartKv.hset('room:RESTART5', { status: 'playing' });

    const restartFake = makeFakeIo();
    const restartHandlers = setupSocketHandlers(restartFake.io, restartKv, 'test-secret', 60 * 60_000, mumbleIce);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(await getRoom(restartKv, 'RESTART5')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await getRoom(restartKv, 'RESTART5')).toBeNull();
    restartHandlers.turnTimer.stopAll();
    await restartKv.disconnect();
  });
});
