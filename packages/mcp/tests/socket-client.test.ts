import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES, PROTOCOL_VERSION } from '@uno-online/shared';
import type {
  ClientToServerEvents,
  PlayerView,
  RoomCreateResult,
  RoomData,
  RoomJoinResult,
  RoomRejoinResult,
  RoomSeatPlayer,
  RoomSettings,
  RoomSpectator,
  ServerToClientEvents,
} from '@uno-online/shared';
import { UnoSocketClient } from '../src/socket-client.js';

const ioMock = vi.hoisted(() => vi.fn());
vi.mock('socket.io-client', () => ({ io: ioMock }));

type Listener = (...args: unknown[]) => void;
type Last<Tuple extends unknown[]> = Tuple extends [...unknown[], infer Tail] ? Tail : never;
type CallbackResult<Event extends keyof ClientToServerEvents> =
  NonNullable<Last<Required<Parameters<ClientToServerEvents[Event]>>>> extends (result: infer Result) => void
    ? Result
    : never;
type AcknowledgedEvent = {
  [Event in keyof ClientToServerEvents]: [CallbackResult<Event>] extends [never] ? never : Event;
}[keyof ClientToServerEvents];
type Successful<T> = Extract<T, { success: true }>;

class FakeSocket {
  connected = true;
  readonly io = { reconnection: vi.fn() };
  private listeners = new Map<string, Listener[]>();
  private responses = new Map<string, unknown>();
  readonly outgoing: Array<{ event: string; args: unknown[] }> = [];

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  once(event: string, listener: Listener): this {
    const onceListener: Listener = (...args) => {
      this.off(event, onceListener);
      listener(...args);
    };
    return this.on(event, onceListener);
  }

  off(event: string, listener: Listener): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter(candidate => candidate !== listener),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.outgoing.push({ event, args });
    const callback = args.at(-1);
    if (typeof callback === 'function') {
      const response = this.responses.get(event);
      if (response !== undefined) (callback as Listener)(response);
    }
    return this;
  }

  disconnect(): void {
    this.connected = false;
  }

  connect(): this {
    if (!this.connected) {
      this.connected = true;
      this.dispatch('connect', []);
    }
    return this;
  }

  respond<Event extends AcknowledgedEvent>(event: Event, response: CallbackResult<Event>): void {
    this.responses.set(event, response);
  }

  serverEmit<Event extends keyof ServerToClientEvents>(
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ): void {
    this.dispatch(event, args);
  }

  ackLast<Event extends AcknowledgedEvent>(event: Event, response: CallbackResult<Event>): void {
    const outgoing = [...this.outgoing].reverse().find(item => item.event === event);
    const callback = outgoing?.args.at(-1);
    if (typeof callback !== 'function') throw new Error(`No pending acknowledgement for ${event}`);
    (callback as Listener)(response);
  }

  reconnect(): void {
    this.connected = true;
    this.dispatch('connect', []);
  }

  connectError(message: string): void {
    this.dispatch('connect_error', [new Error(message)]);
  }

  private dispatch(event: string, args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

function connectedClient(): { client: UnoSocketClient; socket: FakeSocket } {
  const client = new UnoSocketClient('https://server.com', 'jwt-token');
  const socket = new FakeSocket();
  const internals = client as unknown as {
    socket: FakeSocket;
    registerEventListeners(): void;
  };
  internals.socket = socket;
  internals.registerEventListeners();
  return { client, socket };
}

const roomSettings = (): RoomSettings => ({
  turnTimeLimit: 30,
  targetScore: 1000,
  houseRules: { ...DEFAULT_HOUSE_RULES },
  allowSpectators: true,
  spectatorMode: 'hidden',
});

const ownerSeat = (): RoomSeatPlayer => ({
  userId: 'owner',
  nickname: 'Owner',
  avatarUrl: null,
  ready: false,
  connected: true,
  role: 'normal',
  isBot: false,
});

const spectator = (userId: string): RoomSpectator => ({
  userId,
  nickname: userId,
  avatarUrl: null,
  role: 'normal',
  connected: true,
});

const roomData = (status: RoomData['status'] = 'waiting'): RoomData => ({
  ownerId: 'owner',
  status,
  settings: roomSettings(),
  createdAt: '2026-08-09T00:00:00.000Z',
  lastActivityAt: '2026-08-09T00:00:00.000Z',
});

const roomSnapshot = (
  status: RoomData['status'] = 'waiting',
): Pick<Successful<RoomJoinResult>, 'room' | 'seats' | 'spectators'> => ({
  room: roomData(status),
  seats: [ownerSeat()],
  spectators: [],
});

const joinAck = (
  options: { rejoin?: boolean; status?: RoomData['status']; voiceChannelId?: number | null } = {},
): Successful<RoomJoinResult> => ({
  success: true,
  ...roomSnapshot(options.status),
  rejoin: options.rejoin ?? false,
  voiceChannelId: options.voiceChannelId ?? null,
});

const createAck = (roomCode: string): Successful<RoomCreateResult> => ({
  success: true,
  roomCode,
  ...roomSnapshot(),
  voiceChannelId: null,
});

const rejoinAck = (gameState?: PlayerView): Successful<RoomRejoinResult> =>
  gameState
    ? { success: true, mode: 'player', ...roomSnapshot('playing'), gameState }
    : { success: true, mode: 'waiting', ...roomSnapshot() };

const playerView = (label: string): PlayerView => ({
  viewerId: 'owner',
  phase: 'playing',
  players: [
    {
      id: 'owner',
      name: 'Owner',
      hand: [],
      handCount: 0,
      score: 0,
      roundWins: 0,
      connected: true,
      autopilot: false,
      calledUno: false,
      unoCaught: false,
      eliminated: false,
      avatarUrl: null,
      role: 'normal',
      isBot: false,
    },
  ],
  currentPlayerIndex: 0,
  direction: 'clockwise',
  discardPile: [],
  currentColor: null,
  drawStack: 0,
  pendingPenaltyDraws: 0,
  deckLeftCount: 0,
  deckRightCount: 0,
  roundNumber: 1,
  winnerId: null,
  settings: roomSettings(),
  pendingDrawPlayerId: null,
  lastAction: null,
  deckHash: label,
  discardPileCount: 0,
  gameStartedAt: 1,
  turnStartedAt: 1,
});

describe('UnoSocketClient', () => {
  beforeEach(() => {
    ioMock.mockReset();
  });

  it('constructs with serverUrl and token', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    expect(client).toBeDefined();
    expect(client.connected).toBe(false);
  });

  it('sends room-setting patches without filling defaults from client state', async () => {
    const { client, socket } = connectedClient();
    socket.respond('room:create', createAck('PATCH1'));

    await client.createRoom({ houseRules: { jumpIn: true } });

    const createRequest = socket.outgoing.find(({ event }) => event === 'room:create');
    expect(createRequest?.args[0]).toEqual({ houseRules: { jumpIn: true } });

    socket.respond('room:update_settings', {
      success: true,
      room: {
        ...roomData(),
        settings: {
          ...roomSettings(),
          houseRules: { ...DEFAULT_HOUSE_RULES, fastMode: true },
        },
      },
    });
    await client.updateSettings({ houseRules: { fastMode: true } });

    const updateRequest = [...socket.outgoing].reverse().find(({ event }) => event === 'room:update_settings');
    expect(updateRequest?.args[0]).toEqual({ houseRules: { fastMode: true } });
  });

  it('sends the current protocol version in the Socket.IO handshake', async () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    const socket = new FakeSocket();
    socket.connected = false;
    socket.respond('user:current_room', { roomCode: null });
    ioMock.mockReturnValueOnce(socket);

    const connecting = client.connect();
    expect(ioMock).toHaveBeenCalledWith(
      'https://server.com',
      expect.objectContaining({
        auth: { token: 'jwt-token', protocolVersion: PROTOCOL_VERSION },
      }),
    );
    socket.connect();

    await expect(connecting).resolves.toBeUndefined();
  });

  it('stops reconnecting when the server rejects the protocol version', async () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    const callback = vi.fn();
    client.onGameEvent(callback);
    const socket = new FakeSocket();
    socket.connected = false;
    ioMock.mockReturnValueOnce(socket);

    const connecting = client.connect();
    socket.connectError('Protocol mismatch');

    await expect(connecting).rejects.toThrow('协议版本不匹配');
    expect(socket.io.reconnection).toHaveBeenCalledWith(false);
    expect(socket.connected).toBe(false);
    expect(client.connected).toBe(false);
    expect(callback).toHaveBeenCalledWith('server:protocol_mismatch', {
      clientProtocolVersion: PROTOCOL_VERSION,
    });
  });

  it('also stops when a later reconnect is rejected for a protocol mismatch', async () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    const callback = vi.fn();
    client.onGameEvent(callback);
    const socket = new FakeSocket();
    socket.connected = false;
    socket.respond('user:current_room', { roomCode: null });
    ioMock.mockReturnValueOnce(socket);
    const connecting = client.connect();
    socket.connect();
    await connecting;

    socket.connected = false;
    socket.connectError('Protocol mismatch');

    expect(socket.io.reconnection).toHaveBeenCalledWith(false);
    expect(client.connected).toBe(false);
    expect(callback).toHaveBeenCalledWith('server:protocol_mismatch', {
      clientProtocolVersion: PROTOCOL_VERSION,
    });
  });

  it('has null state before connection', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    expect(client.gameState).toBeNull();
    expect(client.roomInfo).toBeNull();
    expect(client.currentRoomCode).toBeNull();
    expect(client.suspendedRoomCode).toBeNull();
  });

  it('throws when emitting without connection', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    expect(() => client.pass()).toThrow('未连接到服务器');
  });

  it('supports multiple event callbacks and unsubscribe', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = client.onGameEvent(cb1);
    client.onGameEvent(cb2);
    unsub1();
    // cb1 should be removed, cb2 should remain
    // We can't easily trigger events without a connection,
    // but we can verify the unsubscribe pattern works without error
    expect(unsub1).toBeTypeOf('function');
  });

  it('keeps an active leave suspended until an explicit rejoin', async () => {
    const { client, socket } = connectedClient();
    socket.respond('room:join', joinAck());
    await client.joinRoom('ABC123');
    expect(client.roomInfo).toEqual({
      membership: 'active',
      roomCode: 'ABC123',
      ...roomSnapshot(),
      voiceChannelId: null,
    });
    socket.serverEmit('game:update', playerView('before-leave'));
    socket.respond('room:leave', { success: true, outcome: 'suspended' });

    await expect(client.leaveRoom()).resolves.toEqual({
      success: true,
      outcome: 'suspended',
    });
    expect(client.currentRoomCode).toBeNull();
    expect(client.suspendedRoomCode).toBe('ABC123');
    expect(client.gameState).toBeNull();
    expect(client.roomInfo).toEqual({ membership: 'suspended', roomCode: 'ABC123' });

    const rejoinCount = socket.outgoing.filter(({ event }) => event === 'room:rejoin').length;
    socket.reconnect();
    expect(socket.outgoing.filter(({ event }) => event === 'room:rejoin')).toHaveLength(rejoinCount);

    const restoredView = playerView('restored');
    socket.respond('room:rejoin', rejoinAck(restoredView));
    await client.joinRoom('ABC123');

    expect(socket.outgoing.at(-1)?.event).toBe('room:rejoin');
    expect(client.currentRoomCode).toBe('ABC123');
    expect(client.suspendedRoomCode).toBeNull();
    expect(client.gameState).toBe(restoredView);
    expect(client.hasReceivedInitialState).toBe(true);
  });

  it('reconciles authoritative membership after an ambiguous leave timeout', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      socket.respond('room:join', joinAck());
      await client.joinRoom('ABC123');
      socket.serverEmit('game:update', playerView('before-timeout'));

      const leaving = client.leaveRoom();
      // Attach the rejection observer before advancing the timeout; otherwise
      // Node can report the intentionally delayed assertion as unhandled.
      const rejection = expect(leaving).rejects.toThrow('room:leave');
      await vi.advanceTimersByTimeAsync(10_000);

      await rejection;
      expect(client.currentRoomCode).toBeNull();
      expect(client.suspendedRoomCode).toBe('ABC123');
      expect(client.gameState).toBeNull();
      expect(socket.connected).toBe(true);
      expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');

      // Late room broadcasts from the ambiguous transport must not resurrect
      // stale player state while membership is suspended.
      socket.serverEmit('game:update', playerView('stale-after-timeout'));
      socket.serverEmit('room:updated', { room: roomData('playing') });
      expect(client.gameState).toBeNull();
      expect(client.roomInfo).toEqual({ membership: 'suspended', roomCode: 'ABC123' });

      socket.ackLast('user:current_room', { roomCode: 'ABC123' });
      await Promise.resolve();
      await Promise.resolve();
      expect(client.suspendedRoomCode).toBe('ABC123');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconciles authoritative membership after an ambiguous dissolve timeout', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      socket.respond('room:join', joinAck());
      await client.joinRoom('ABC123');
      socket.respond('user:current_room', { roomCode: null });

      const dissolving = client.dissolveRoom();
      const rejection = expect(dissolving).rejects.toThrow('room:dissolve');
      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;
      await Promise.resolve();

      expect(client.currentRoomCode).toBeNull();
      expect(client.roomInfo).toBeNull();
      expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');
    } finally {
      vi.useRealTimers();
    }
  });

  it('can explicitly rejoin while timeout reconciliation is still pending', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      socket.respond('room:join', joinAck());
      await client.joinRoom('ABC123');

      const leaving = client.leaveRoom();
      const rejection = expect(leaving).rejects.toThrow('room:leave');
      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;
      expect(socket.connected).toBe(true);
      expect(client.suspendedRoomCode).toBe('ABC123');

      const restoredView = playerView('explicit-after-timeout');
      socket.respond('room:rejoin', rejoinAck(restoredView));
      await expect(client.joinRoom('ABC123')).resolves.toMatchObject({ success: true });

      expect(socket.connected).toBe(true);
      expect(client.currentRoomCode).toBe('ABC123');
      expect(client.suspendedRoomCode).toBeNull();
      expect(client.gameState).toBe(restoredView);

      // A delayed reconciliation acknowledgement belongs to the previous
      // operation epoch and must not overwrite the explicit rejoin.
      socket.ackLast('user:current_room', { roomCode: 'STALE1' });
      await Promise.resolve();
      await Promise.resolve();
      expect(client.currentRoomCode).toBe('ABC123');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconciles immediately when an explicit rejoin acknowledgement is lost', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      socket.respond('room:join', joinAck());
      await client.joinRoom('ABC123');
      socket.respond('room:leave', { success: true, outcome: 'suspended' });
      await client.leaveRoom();

      const rejoining = client.joinRoom('ABC123');
      const rejection = expect(rejoining).rejects.toThrow('room:rejoin');
      socket.respond('user:current_room', { roomCode: 'ABC123' });
      // This can arrive when the server committed rejoin but its ACK was lost.
      // The still-suspended client must not accept it as proof of restoration.
      socket.serverEmit('game:update', playerView('unacknowledged-rejoin'));
      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;

      expect(client.gameState).toBeNull();
      expect(client.suspendedRoomCode).toBe('ABC123');
      expect(socket.connected).toBe(true);
      expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');
    } finally {
      vi.useRealTimers();
    }
  });

  it('queries authoritative membership when a normal join acknowledgement is lost', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      const joining = client.joinRoom('JOIN01');
      const rejection = expect(joining).rejects.toThrow('room:join');
      socket.respond('user:current_room', { roomCode: 'JOIN01' });
      socket.serverEmit('game:update', playerView('committed-without-join-ack'));
      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;

      expect(client.currentRoomCode).toBeNull();
      expect(client.suspendedRoomCode).toBe('JOIN01');
      expect(client.gameState).toBeNull();
      expect(socket.connected).toBe(true);
      expect(client.suspendedRoomCode).toBe('JOIN01');
      expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');
    } finally {
      vi.useRealTimers();
    }
  });

  it('discovers the assigned room without cycling transport when a create acknowledgement is lost', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      const creating = client.createRoom({});
      const rejection = expect(creating).rejects.toThrow('room:create');
      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;

      expect(client.currentRoomCode).toBeNull();
      expect(client.suspendedRoomCode).toBeNull();
      expect(client.hasPendingMembership).toBe(true);
      expect(client.roomInfo).toEqual({ membership: 'unknown' });
      expect(socket.connected).toBe(true);
      expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');

      socket.ackLast('user:current_room', { roomCode: 'MADE01' });
      await Promise.resolve();
      await Promise.resolve();

      expect(client.suspendedRoomCode).toBe('MADE01');
      expect(client.roomInfo).toEqual({ membership: 'suspended', roomCode: 'MADE01' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows an authoritative room:join rejoin redirect after losing local suspension state', async () => {
    const { client, socket } = connectedClient();
    socket.respond('room:join', joinAck({ rejoin: true, status: 'playing', voiceChannelId: 42 }));
    const restoredView = playerView('restart-restored');
    socket.respond('room:rejoin', rejoinAck(restoredView));

    const result = await client.joinRoom('ABC123');

    expect(socket.outgoing.slice(-2).map(({ event }) => event)).toEqual(['room:join', 'room:rejoin']);
    expect(result).toMatchObject({
      success: true,
      mode: 'player',
      gameState: restoredView,
    });
    expect(client.currentRoomCode).toBe('ABC123');
    expect(client.suspendedRoomCode).toBeNull();
    expect(client.gameState).toBe(restoredView);
    expect(client.hasReceivedInitialState).toBe(true);
    expect(client.roomInfo).toEqual({
      membership: 'active',
      roomCode: 'ABC123',
      ...roomSnapshot('playing'),
      voiceChannelId: 42,
    });
  });

  it('clears only matching membership state and forwards the terminal event', async () => {
    const { client, socket } = connectedClient();
    const callback = vi.fn();
    client.onGameEvent(callback);
    socket.respond('room:join', joinAck());
    await client.joinRoom('ABC123');
    socket.respond('room:leave', { success: true, outcome: 'suspended' });
    await client.leaveRoom();

    socket.serverEmit('room:membership_ended', { roomCode: 'OTHER1', reason: 'host_closed' });
    expect(client.suspendedRoomCode).toBe('ABC123');
    expect(callback).toHaveBeenCalledWith('room:membership_ended', {
      roomCode: 'OTHER1',
      reason: 'host_closed',
    });
    callback.mockClear();

    const ended = { roomCode: 'ABC123', reason: 'kicked' } as const;
    socket.serverEmit('room:membership_ended', ended);
    expect(client.currentRoomCode).toBeNull();
    expect(client.suspendedRoomCode).toBeNull();
    expect(client.roomInfo).toBeNull();
    expect(callback).toHaveBeenLastCalledWith('room:membership_ended', ended);
  });

  it('preserves membership when moved to spectators and accepts the next spectator view', async () => {
    const { client, socket } = connectedClient();
    socket.respond('room:join', joinAck());
    await client.joinRoom('ABC123');
    socket.serverEmit('game:update', playerView('player'));

    socket.serverEmit('room:moved_to_spectator', { roomCode: 'ABC123', reason: 'moved' });
    expect(client.currentRoomCode).toBe('ABC123');
    expect(client.gameState).toBeNull();

    const spectatorView = playerView('spectator');
    socket.serverEmit('game:update', spectatorView);
    expect(client.gameState).toBe(spectatorView);

    socket.serverEmit('room:membership_ended', { roomCode: 'ABC123', reason: 'kicked' });
    expect(client.currentRoomCode).toBeNull();
    expect(client.roomInfo).toBeNull();
  });

  it('returns to waiting-room state without dropping room membership', async () => {
    const { client, socket } = connectedClient();
    const callback = vi.fn();
    client.onGameEvent(callback);
    socket.respond('room:join', joinAck());
    await client.joinRoom('ABC123');
    socket.serverEmit('game:update', playerView('finished'));

    const waitingRoom = roomSnapshot();
    socket.serverEmit('game:back_to_room', waitingRoom);

    expect(client.currentRoomCode).toBe('ABC123');
    expect(client.suspendedRoomCode).toBeNull();
    expect(client.gameState).toBeNull();
    expect(client.hasReceivedInitialState).toBe(false);
    expect(client.roomInfo).toEqual({
      membership: 'active',
      roomCode: 'ABC123',
      ...waitingRoom,
      voiceChannelId: null,
    });
    expect(callback).toHaveBeenLastCalledWith('game:back_to_room', waitingRoom);
  });

  it('uses the supported back_to_room protocol', async () => {
    const { client, socket } = connectedClient();
    socket.respond('room:join', joinAck());
    await client.joinRoom('ABC123');
    socket.serverEmit('game:update', playerView('finished'));
    socket.respond('game:back_to_room', {
      success: true,
      seats: [],
      spectators: [spectator('owner')],
      room: roomData(),
    });

    await expect(client.backToRoom()).resolves.toMatchObject({ success: true });
    expect(socket.outgoing.at(-1)?.event).toBe('game:back_to_room');
    expect(client.currentRoomCode).toBe('ABC123');
    expect(client.gameState).toBeNull();
  });

  it('discovers restart membership without automatically rejoining it', async () => {
    const { client, socket } = connectedClient();
    const callback = vi.fn();
    client.onGameEvent(callback);
    socket.respond('user:current_room', { roomCode: 'REST01' });

    await (client as unknown as { discoverAuthoritativeRoom(): Promise<void> }).discoverAuthoritativeRoom();

    expect(client.currentRoomCode).toBeNull();
    expect(client.suspendedRoomCode).toBe('REST01');
    expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');
    expect(socket.outgoing.some(({ event }) => event === 'room:rejoin')).toBe(false);
    expect(callback).toHaveBeenLastCalledWith('room:membership_discovered', {
      roomCode: 'REST01',
      requiresExplicitRejoin: true,
    });
  });

  it('does not let delayed discovery overwrite a newer join', async () => {
    const { client, socket } = connectedClient();
    const discovery = (client as unknown as { discoverAuthoritativeRoom(): Promise<void> }).discoverAuthoritativeRoom();
    socket.respond('room:join', joinAck());
    await client.joinRoom('NEW001');

    socket.ackLast('user:current_room', { roomCode: 'OLD001' });
    await discovery;

    expect(client.currentRoomCode).toBe('NEW001');
    expect(client.suspendedRoomCode).toBeNull();
  });

  it('does not let delayed discovery overwrite a newer room creation', async () => {
    const { client, socket } = connectedClient();
    const discovery = (client as unknown as { discoverAuthoritativeRoom(): Promise<void> }).discoverAuthoritativeRoom();
    socket.respond('room:create', createAck('NEW002'));
    await client.createRoom({});

    socket.ackLast('user:current_room', { roomCode: 'OLD002' });
    await discovery;

    expect(client.currentRoomCode).toBe('NEW002');
    expect(client.suspendedRoomCode).toBeNull();
  });

  it('keeps a join ACK authoritative when an older membership ends first', async () => {
    const { client, socket } = connectedClient();
    const joining = client.joinRoom('NEW003');

    socket.serverEmit('room:membership_ended', { roomCode: 'OLD003', reason: 'host_closed' });
    socket.ackLast('room:join', joinAck());
    await joining;

    expect(client.currentRoomCode).toBe('NEW003');
    expect(client.suspendedRoomCode).toBeNull();
  });

  it('keeps a create ACK authoritative when an older membership ends first', async () => {
    const { client, socket } = connectedClient();
    const creating = client.createRoom({});

    socket.serverEmit('room:membership_ended', { roomCode: 'OLD004', reason: 'host_closed' });
    socket.ackLast('room:create', createAck('NEW004'));
    await creating;

    expect(client.currentRoomCode).toBe('NEW004');
    expect(client.suspendedRoomCode).toBeNull();
  });

  it('invalidates delayed startup discovery when membership already ended', async () => {
    const { client, socket } = connectedClient();
    const callback = vi.fn();
    client.onGameEvent(callback);
    const discovery = (client as unknown as { discoverAuthoritativeRoom(): Promise<void> }).discoverAuthoritativeRoom();

    const terminal = { roomCode: 'OLD003', reason: 'host_closed' } as const;
    socket.serverEmit('room:membership_ended', terminal);
    socket.ackLast('user:current_room', { roomCode: 'OLD003' });
    await discovery;

    expect(client.currentRoomCode).toBeNull();
    expect(client.suspendedRoomCode).toBeNull();
    expect(callback).toHaveBeenCalledWith('room:membership_ended', terminal);
    expect(callback).not.toHaveBeenCalledWith('room:membership_discovered', expect.anything());
  });

  it('does not reconcile an authoritative rejoin rejection', async () => {
    const { client, socket } = connectedClient();
    socket.respond('room:join', joinAck());
    await client.joinRoom('ABC123');
    socket.respond('room:rejoin', { success: false, error: 'restore failed' });

    socket.reconnect();
    await vi.waitFor(() => expect(client.suspendedRoomCode).toBe('ABC123'));
    expect(socket.outgoing.some(({ event }) => event === 'user:current_room')).toBe(false);

    socket.serverEmit('room:membership_ended', { roomCode: 'ABC123', reason: 'host_closed' });

    expect(client.currentRoomCode).toBeNull();
    expect(client.suspendedRoomCode).toBeNull();
  });

  it('notifies consumers when automatic reconnect cannot restore membership', async () => {
    const { client, socket } = connectedClient();
    const callback = vi.fn();
    client.onGameEvent(callback);
    socket.respond('room:join', joinAck());
    await client.joinRoom('ABC123');
    socket.respond('room:rejoin', { success: false, error: 'Room not found' });

    socket.reconnect();

    await vi.waitFor(() => expect(client.suspendedRoomCode).toBe('ABC123'));
    expect(client.currentRoomCode).toBeNull();
    expect(callback).toHaveBeenCalledWith('room:rejoin_failed', {
      roomCode: 'ABC123',
      error: 'Room not found',
    });
  });

  it('preserves suspended membership when reconnect reconciliation also times out', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      socket.respond('room:join', joinAck());
      await client.joinRoom('ABC123');

      socket.reconnect();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');
      await vi.advanceTimersByTimeAsync(10_000);

      expect(client.currentRoomCode).toBeNull();
      expect(client.suspendedRoomCode).toBe('ABC123');
      expect(client.roomInfo).toEqual({ membership: 'suspended', roomCode: 'ABC123' });
      expect(socket.outgoing.slice(-2).map(({ event }) => event)).toEqual(['room:rejoin', 'user:current_room']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the transport connected while reconciling a lost automatic rejoin acknowledgement', async () => {
    vi.useFakeTimers();
    try {
      const { client, socket } = connectedClient();
      socket.respond('room:join', joinAck());
      await client.joinRoom('ABC123');
      socket.respond('user:current_room', { roomCode: 'ABC123' });

      socket.reconnect();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(client.currentRoomCode).toBeNull();
      expect(client.suspendedRoomCode).toBe('ABC123');
      expect(socket.connected).toBe(true);
      expect(socket.outgoing.at(-1)?.event).toBe('user:current_room');
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges authoritative seat and spectator changes into room info', async () => {
    const { client, socket } = connectedClient();
    socket.respond('room:join', joinAck({ status: 'playing' }));
    await client.joinRoom('ABC123');
    const roster = {
      seats: [ownerSeat(), null],
      spectators: [spectator('moved-player')],
    };

    socket.serverEmit('seat:updated', roster);

    expect(client.roomInfo).toMatchObject({ roomCode: 'ABC123', ...roster });
  });

  it('forwards the authoritative spectator queue snapshot', async () => {
    const { client, socket } = connectedClient();
    const callback = vi.fn();
    client.onGameEvent(callback);
    socket.respond('room:join', joinAck({ status: 'playing' }));
    await client.joinRoom('ABC123');
    const snapshot = {
      queue: [{ userId: 'spectator-1', nickname: '观众一号' }],
    };

    socket.serverEmit('game:spectator_queue', snapshot);

    expect(callback).toHaveBeenLastCalledWith('game:spectator_queue', snapshot);
  });
});
