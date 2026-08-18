import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { GameEventCallback, McpGameEventData, UnoSocketClient } from './socket-client.js';
import { formatActiveRules } from './utils.js';

type NotificationMessage = {
  level: 'info' | 'warning';
  data: { type: string };
};

export interface NotificationController {
  activate(): Promise<void>;
}

const MAX_PENDING_NOTIFICATIONS = 100;

async function sendNow(server: Server, message: NotificationMessage): Promise<void> {
  await server.sendLoggingMessage({
    level: message.level,
    data: JSON.stringify(message.data),
  });
}

type CustomNotificationEvent = 'game:state' | 'game:rejoin_state' | 'game:update';
type ForwardedNotificationEvent = Exclude<keyof McpGameEventData, CustomNotificationEvent>;

const forwardMap: Record<ForwardedNotificationEvent, { type: string; level: 'info' | 'warning' }> = {
  'game:card_drawn': { type: 'card_drawn', level: 'info' },
  'game:round_end': { type: 'round_ended', level: 'info' },
  'game:next_round_vote': { type: 'next_round_vote', level: 'info' },
  'game:spectator_queue': { type: 'spectator_queue', level: 'info' },
  'game:over': { type: 'game_over', level: 'info' },
  'game:back_to_room': { type: 'game_back_to_room', level: 'info' },
  'room:updated': { type: 'room_updated', level: 'info' },
  'room:membership_ended': { type: 'room_membership_ended', level: 'warning' },
  'room:moved_to_spectator': { type: 'room_moved_to_spectator', level: 'warning' },
  'room:membership_discovered': { type: 'room_membership_discovered', level: 'info' },
  'room:discovery_failed': { type: 'room_discovery_failed', level: 'warning' },
  'room:rejoin_failed': { type: 'room_rejoin_failed', level: 'warning' },
  'room:membership_reconciled': { type: 'room_membership_reconciled', level: 'info' },
  'room:membership_unknown': { type: 'room_membership_unknown', level: 'warning' },
  'server:protocol_mismatch': { type: 'protocol_mismatch', level: 'warning' },
  'seat:updated': { type: 'seat_updated', level: 'info' },
  'player:disconnected': { type: 'player_left', level: 'info' },
  'player:reconnected': { type: 'player_joined', level: 'info' },
  'player:timeout': { type: 'player_timeout', level: 'warning' },
  'player:autopilot': { type: 'player_autopilot', level: 'info' },
  'auth:kicked': { type: 'auth_kicked', level: 'warning' },
};

export function setupNotifications(
  socketClient: UnoSocketClient,
  server: Server,
  myUserId: string,
  options: { active?: boolean } = {},
): NotificationController {
  let active = options.active ?? true;
  const pending: NotificationMessage[] = [];
  let drainPromise: Promise<void> | null = null;
  let enqueueVersion = 0;

  const enqueue = (message: NotificationMessage): void => {
    if (pending.length >= MAX_PENDING_NOTIFICATIONS) pending.shift();
    pending.push(message);
    enqueueVersion += 1;
  };

  const drain = (): Promise<void> => {
    if (!active) return Promise.resolve();
    if (drainPromise) return drainPromise;

    let failedAtVersion: number | null = null;
    const run = (async () => {
      while (active && pending.length > 0) {
        const message = pending.shift()!;
        try {
          await sendNow(server, message);
        } catch {
          pending.unshift(message);
          if (pending.length > MAX_PENDING_NOTIFICATIONS) pending.pop();
          failedAtVersion = enqueueVersion;
          return;
        }
      }
    })();

    const tracked = run.finally(() => {
      if (drainPromise !== tracked) return;
      drainPromise = null;
      // A message may be enqueued between the drain loop finishing and this
      // finalizer. Retry that new work, but do not spin on an unchanged failed
      // transport.
      if (active && pending.length > 0 && (failedAtVersion === null || enqueueVersion !== failedAtVersion)) {
        void drain();
      }
    });
    drainPromise = tracked;
    return tracked;
  };

  const send = <Data extends { type: string }>(level: 'info' | 'warning', data: Data): void => {
    const message = { level, data } satisfies NotificationMessage;
    enqueue(message);
    if (active) void drain();
  };

  const handleEvent: GameEventCallback = (...[event, data]) => {
    switch (event) {
      case 'game:state': {
        const view = data;
        const myPlayer = view.players.find(p => p.id === view.viewerId);
        send('info', {
          type: 'game_started',
          hand: myPlayer?.hand ?? [],
          players: view.players.map(p => ({ id: p.id, name: p.name, handCount: p.handCount })),
          activeHouseRules: formatActiveRules(view.settings),
        });
        break;
      }

      case 'game:rejoin_state': {
        const view = data;
        const myPlayer = view.players.find(p => p.id === view.viewerId);
        const isMyTurn = view.players[view.currentPlayerIndex]?.id === myUserId;
        send('info', {
          type: 'game_reconnected',
          phase: view.phase,
          hand: myPlayer?.hand ?? [],
          isMyTurn,
          players: view.players.map(p => ({ id: p.id, name: p.name, handCount: p.handCount })),
          currentColor: view.currentColor,
          drawStack: view.drawStack,
          activeHouseRules: formatActiveRules(view.settings),
        });
        break;
      }

      case 'game:update': {
        const view = data;
        const isMyTurn = view.players[view.currentPlayerIndex]?.id === myUserId;
        if (isMyTurn && view.phase === 'playing') {
          const myPlayer = view.players.find(p => p.id === view.viewerId);
          send('info', {
            type: 'your_turn',
            hand: myPlayer?.hand ?? [],
            topCard: view.discardPile[view.discardPile.length - 1] ?? null,
            currentColor: view.currentColor,
            drawStack: view.drawStack,
            lastAction: view.lastAction,
            players: view.players.map(p => ({ id: p.id, name: p.name, handCount: p.handCount })),
          });
        } else {
          send('info', {
            type: 'game_action',
            lastAction: view.lastAction,
            currentPlayerIndex: view.currentPlayerIndex,
            players: view.players.map(p => ({ id: p.id, name: p.name, handCount: p.handCount })),
          });
        }
        break;
      }

      default: {
        const mapping = forwardMap[event];
        send(mapping.level, { type: mapping.type, ...data });
        break;
      }
    }
  };
  socketClient.onGameEvent(handleEvent);

  return {
    async activate() {
      active = true;
      await drain();
    },
  };
}
