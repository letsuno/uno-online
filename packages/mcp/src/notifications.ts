import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { UnoSocketClient } from './socket-client.js';
import type { PlayerView } from '@uno-online/shared';
import { formatActiveRules } from './utils.js';

function send(server: Server, level: 'info' | 'warning', data: Record<string, unknown>): void {
  server.sendLoggingMessage({ level, data: JSON.stringify(data) }).catch(() => {});
}

const forwardMap: Record<string, { type: string; level: 'info' | 'warning' }> = {
  'game:card_drawn': { type: 'card_drawn', level: 'info' },
  'game:action_rejected': { type: 'action_rejected', level: 'warning' },
  'game:round_end': { type: 'round_ended', level: 'info' },
  'game:next_round_vote': { type: 'next_round_vote', level: 'info' },
  'game:over': { type: 'game_over', level: 'info' },
  'room:updated': { type: 'room_updated', level: 'info' },
  'room:dissolved': { type: 'room_dissolved', level: 'warning' },
  'player:disconnected': { type: 'player_left', level: 'info' },
  'player:reconnected': { type: 'player_joined', level: 'info' },
  'player:timeout': { type: 'player_timeout', level: 'warning' },
  'player:autopilot': { type: 'player_autopilot', level: 'info' },
  'game:kicked': { type: 'game_kicked', level: 'warning' },
  'auth:kicked': { type: 'auth_kicked', level: 'warning' },
};

export function setupNotifications(
  socketClient: UnoSocketClient,
  server: Server,
  myUserId: string,
): void {
  socketClient.onGameEvent((event, data) => {
    switch (event) {
      case 'game:state': {
        const view = data as PlayerView;
        const myPlayer = view.players.find((p) => p.id === view.viewerId);
        send(server, 'info', {
          type: 'game_started',
          hand: myPlayer?.hand ?? [],
          players: view.players.map((p) => ({ id: p.id, name: p.name, handCount: p.handCount })),
          activeHouseRules: formatActiveRules(view.settings),
        });
        break;
      }

      case 'game:rejoin_state': {
        const view = data as PlayerView;
        const myPlayer = view.players.find((p) => p.id === view.viewerId);
        const isMyTurn = view.players[view.currentPlayerIndex]?.id === myUserId;
        send(server, 'info', {
          type: 'game_reconnected',
          phase: view.phase,
          hand: myPlayer?.hand ?? [],
          isMyTurn,
          players: view.players.map((p) => ({ id: p.id, name: p.name, handCount: p.handCount })),
          currentColor: view.currentColor,
          drawStack: view.drawStack,
          activeHouseRules: formatActiveRules(view.settings),
        });
        break;
      }

      case 'game:update': {
        const view = data as PlayerView;
        const isMyTurn = view.players[view.currentPlayerIndex]?.id === myUserId;
        if (isMyTurn && view.phase === 'playing') {
          const myPlayer = view.players.find((p) => p.id === view.viewerId);
          send(server, 'info', {
            type: 'your_turn',
            hand: myPlayer?.hand ?? [],
            topCard: view.discardPile[view.discardPile.length - 1] ?? null,
            currentColor: view.currentColor,
            drawStack: view.drawStack,
            lastAction: view.lastAction,
            players: view.players.map((p) => ({ id: p.id, name: p.name, handCount: p.handCount })),
          });
        } else {
          send(server, 'info', {
            type: 'game_action',
            lastAction: view.lastAction,
            currentPlayerIndex: view.currentPlayerIndex,
            players: view.players.map((p) => ({ id: p.id, name: p.name, handCount: p.handCount })),
          });
        }
        break;
      }

      default: {
        const mapping = forwardMap[event];
        if (mapping) {
          send(server, mapping.level, { type: mapping.type, ...(data as Record<string, unknown>) });
        }
        break;
      }
    }
  });
}
