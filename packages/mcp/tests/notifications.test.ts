import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupNotifications } from '../src/notifications.js';
import type { GameEventCallback, UnoSocketClient } from '../src/socket-client.js';
import { McpUnoServer } from '../src/server.js';

describe('setupNotifications', () => {
  it('notifies MCP consumers when room membership ends', () => {
    let listener: GameEventCallback | undefined;
    const socketClient = {
      onGameEvent: vi.fn((callback: GameEventCallback) => {
        listener = callback;
        return () => {};
      }),
    } as unknown as UnoSocketClient;
    const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
    const server = { sendLoggingMessage } as unknown as Server;
    setupNotifications(socketClient, server, 'user-1');

    listener?.('room:membership_ended', { roomCode: 'ABC123', reason: 'kicked' });

    expect(sendLoggingMessage).toHaveBeenCalledWith({
      level: 'warning',
      data: JSON.stringify({
        type: 'room_membership_ended',
        roomCode: 'ABC123',
        reason: 'kicked',
      }),
    });
  });

  it('forwards the supported back-to-room lifecycle event', () => {
    let listener: GameEventCallback | undefined;
    const socketClient = {
      onGameEvent: vi.fn((callback: GameEventCallback) => {
        listener = callback;
        return () => {};
      }),
    } as unknown as UnoSocketClient;
    const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
    const server = { sendLoggingMessage } as unknown as Server;
    setupNotifications(socketClient, server, 'user-1');
    const waitingRoom = {
      room: {
        ownerId: 'owner',
        status: 'waiting' as const,
        settings: {
          turnTimeLimit: 30 as const,
          targetScore: 1000 as const,
          houseRules: { ...DEFAULT_HOUSE_RULES },
          allowSpectators: true,
          spectatorMode: 'hidden' as const,
        },
        createdAt: '2026-08-09T00:00:00.000Z',
        lastActivityAt: '2026-08-09T00:00:00.000Z',
      },
      seats: [],
      spectators: [],
    };

    listener?.('game:back_to_room', waitingRoom);

    expect(sendLoggingMessage).toHaveBeenCalledWith({
      level: 'info',
      data: JSON.stringify({ type: 'game_back_to_room', ...waitingRoom }),
    });
  });

  it('forwards spectator queue snapshots without legacy delta fields', () => {
    let listener: GameEventCallback | undefined;
    const socketClient = {
      onGameEvent: vi.fn((callback: GameEventCallback) => {
        listener = callback;
        return () => {};
      }),
    } as unknown as UnoSocketClient;
    const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
    const server = { sendLoggingMessage } as unknown as Server;
    setupNotifications(socketClient, server, 'user-1');

    listener?.('game:spectator_queue', {
      queue: [{ userId: 'spectator-1', nickname: '观众一号' }],
    });

    expect(sendLoggingMessage).toHaveBeenCalledWith({
      level: 'info',
      data: JSON.stringify({
        type: 'spectator_queue',
        queue: [{ userId: 'spectator-1', nickname: '观众一号' }],
      }),
    });
  });

  it('buffers discovery until the MCP initialized lifecycle activates delivery', async () => {
    let listener: GameEventCallback | undefined;
    const socketClient = {
      onGameEvent: vi.fn((callback: GameEventCallback) => {
        listener = callback;
        return () => {};
      }),
    } as unknown as UnoSocketClient;
    const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
    const server = { sendLoggingMessage } as unknown as Server;
    const notifications = setupNotifications(socketClient, server, 'user-1', { active: false });

    listener?.('room:membership_discovered', {
      roomCode: 'ABC123',
      requiresExplicitRejoin: true,
    });
    expect(sendLoggingMessage).not.toHaveBeenCalled();

    await notifications.activate();

    expect(sendLoggingMessage).toHaveBeenCalledWith({
      level: 'info',
      data: JSON.stringify({
        type: 'room_membership_discovered',
        roomCode: 'ABC123',
        requiresExplicitRejoin: true,
      }),
    });
  });

  it('uses a single drain when activation overlaps', async () => {
    let listener: GameEventCallback | undefined;
    const socketClient = {
      onGameEvent: vi.fn((callback: GameEventCallback) => {
        listener = callback;
        return () => {};
      }),
    } as unknown as UnoSocketClient;
    let releaseFirst!: () => void;
    const firstSend = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const sendLoggingMessage = vi
      .fn()
      .mockImplementationOnce(() => firstSend)
      .mockResolvedValue(undefined);
    const server = { sendLoggingMessage } as unknown as Server;
    const notifications = setupNotifications(socketClient, server, 'user-1', { active: false });
    listener?.('player:autopilot', { playerId: 'one', enabled: true });
    listener?.('player:autopilot', { playerId: 'two', enabled: false });

    const firstActivation = notifications.activate();
    const secondActivation = notifications.activate();
    expect(sendLoggingMessage).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.all([firstActivation, secondActivation]);

    expect(sendLoggingMessage).toHaveBeenCalledTimes(2);
    expect(sendLoggingMessage.mock.calls.map(([message]) => JSON.parse(message.data as string))).toEqual([
      { type: 'player_autopilot', playerId: 'one', enabled: true },
      { type: 'player_autopilot', playerId: 'two', enabled: false },
    ]);
  });

  it('bounds notifications buffered before initialization', async () => {
    let listener: GameEventCallback | undefined;
    const socketClient = {
      onGameEvent: vi.fn((callback: GameEventCallback) => {
        listener = callback;
        return () => {};
      }),
    } as unknown as UnoSocketClient;
    const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
    const server = { sendLoggingMessage } as unknown as Server;
    const notifications = setupNotifications(socketClient, server, 'user-1', { active: false });

    for (let sequence = 0; sequence <= 100; sequence += 1) {
      listener?.('player:timeout', { playerId: String(sequence) });
    }
    await notifications.activate();

    expect(sendLoggingMessage).toHaveBeenCalledTimes(100);
    expect(JSON.parse(sendLoggingMessage.mock.calls[0]![0].data as string)).toEqual({
      type: 'player_timeout',
      playerId: '1',
    });
  });

  it('activates buffered notifications from the MCP initialized callback', () => {
    vi.stubGlobal('__PKG_VERSION__', 'test');
    const unoServer = new McpUnoServer({
      apiKey: 'test-key',
      serverUrl: 'https://server.test',
      mode: 'stdio',
      httpPort: 3002,
    });
    const activate = vi.fn().mockResolvedValue(undefined);
    const internals = unoServer as unknown as {
      notificationController: { activate(): Promise<void> };
    };
    internals.notificationController = {
      activate,
    };

    expect(activate).not.toHaveBeenCalled();
    unoServer.mcpServer.server.oninitialized?.();

    expect(activate).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
