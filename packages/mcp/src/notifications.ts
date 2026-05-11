import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { UnoSocketClient } from './socket-client.js';
import type { PlayerView } from '@uno-online/shared';
import { HOUSE_RULE_DESCRIPTIONS } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';

function formatActiveRules(settings: PlayerView['settings']): { key: string; value: unknown; description: string }[] {
  const rules: { key: string; value: unknown; description: string }[] = [];
  if (!settings?.houseRules) return rules;
  for (const [key, value] of Object.entries(settings.houseRules)) {
    if (value === false || value === null || value === undefined) continue;
    rules.push({ key, value, description: HOUSE_RULE_DESCRIPTIONS[key as keyof HouseRules] ?? key });
  }
  return rules;
}

function send(server: Server, level: 'info' | 'warning', data: Record<string, unknown>): void {
  server.sendLoggingMessage({ level, data: JSON.stringify(data) }).catch(() => {});
}

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

      case 'game:card_drawn': {
        send(server, 'info', { type: 'card_drawn', ...(data as Record<string, unknown>) });
        break;
      }

      case 'game:action_rejected': {
        send(server, 'warning', { type: 'action_rejected', ...(data as Record<string, unknown>) });
        break;
      }

      case 'game:round_end': {
        send(server, 'info', { type: 'round_ended', ...(data as Record<string, unknown>) });
        break;
      }

      case 'game:next_round_vote': {
        send(server, 'info', { type: 'next_round_vote', ...(data as Record<string, unknown>) });
        break;
      }

      case 'game:over': {
        send(server, 'info', { type: 'game_over', ...(data as Record<string, unknown>) });
        break;
      }

      case 'room:updated': {
        send(server, 'info', { type: 'room_updated', ...(data as Record<string, unknown>) });
        break;
      }

      case 'room:dissolved': {
        send(server, 'warning', { type: 'room_dissolved', ...(data as Record<string, unknown>) });
        break;
      }

      case 'player:disconnected': {
        send(server, 'info', { type: 'player_left', ...(data as Record<string, unknown>) });
        break;
      }

      case 'player:reconnected': {
        send(server, 'info', { type: 'player_joined', ...(data as Record<string, unknown>) });
        break;
      }
    }
  });
}
