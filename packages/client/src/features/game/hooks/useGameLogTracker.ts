import { useEffect, useRef } from 'react';
import type { GameAction } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import type { PlayerInfo } from '../stores/game-store';
import { useGameLogStore } from '../stores/game-log-store';

function getActionKey(action: GameAction, players: PlayerInfo[]): string {
  switch (action.type) {
    case 'PLAY_CARD':
      return `${action.type}:${action.playerId}:${action.cardId}`;
    case 'DRAW_CARD': {
      const player = players.find((p) => p.id === action.playerId);
      return `${action.type}:${action.playerId}:${player?.handCount ?? ''}`;
    }
    case 'PASS':
    case 'CALL_UNO':
      return `${action.type}:${action.playerId}`;
    case 'CATCH_UNO':
      return `${action.type}:${action.catcherId}:${action.targetId}`;
    case 'CHALLENGE':
      return `${action.type}:${action.playerId}:${action.succeeded ?? ''}:${action.penaltyPlayerId ?? ''}:${action.penaltyCount ?? ''}`;
    case 'ACCEPT':
      return `${action.type}:${action.playerId}`;
    case 'CHOOSE_COLOR':
      return `${action.type}:${action.playerId}:${action.color}`;
    default:
      return JSON.stringify(action);
  }
}

export function useGameLogTracker(): void {
  const lastAction = useGameStore((s) => s.lastAction);
  const players = useGameStore((s) => s.players);
  const discardPile = useGameStore((s) => s.discardPile);
  const phase = useGameStore((s) => s.phase);
  const roundNumber = useGameStore((s) => s.roundNumber);

  const addLogEntry = useGameLogStore((s) => s.addEntry);
  const addRoundSeparator = useGameLogStore((s) => s.addRoundSeparator);
  const clearLog = useGameLogStore((s) => s.clear);

  const prevActionKeyRef = useRef<string | null>(null);
  const prevRoundNumberRef = useRef<number | null>(null);

  // Map lastAction to game log entries
  useEffect(() => {
    if (!lastAction) return;

    const actionKey = getActionKey(lastAction, players);
    if (actionKey === prevActionKeyRef.current) return;
    prevActionKeyRef.current = actionKey;

    const findPlayer = (id: string) => players.find((p) => p.id === id);

    if (lastAction.type === 'PLAY_CARD') {
      const player = findPlayer(lastAction.playerId);
      const topCard = discardPile[discardPile.length - 1];
      if (!player || !topCard) return;

      const typeMap: Record<
        string,
        | 'play_number'
        | 'play_skip'
        | 'play_reverse'
        | 'play_draw_two'
        | 'play_wild'
        | 'play_wild_draw_four'
      > = {
        number: 'play_number',
        skip: 'play_skip',
        reverse: 'play_reverse',
        draw_two: 'play_draw_two',
        wild: 'play_wild',
        wild_draw_four: 'play_wild_draw_four',
      };

      addLogEntry({
        type: typeMap[topCard.type] ?? 'play_number',
        playerId: lastAction.playerId,
        playerName: player.name,
        card: topCard,
      });
    } else if (lastAction.type === 'DRAW_CARD') {
      const player = findPlayer(lastAction.playerId);
      if (!player) return;
      addLogEntry({
        type: 'draw',
        playerId: lastAction.playerId,
        playerName: player.name,
      });
    } else if (lastAction.type === 'CALL_UNO') {
      const player = findPlayer(lastAction.playerId);
      if (!player) return;
      addLogEntry({
        type: 'call_uno',
        playerId: lastAction.playerId,
        playerName: player.name,
        extra: 'UNO!',
      });
    } else if (lastAction.type === 'CATCH_UNO') {
      const catcher = findPlayer(lastAction.catcherId);
      const target = findPlayer(lastAction.targetId);
      if (!catcher || !target) return;
      addLogEntry({
        type: 'catch_uno',
        playerId: lastAction.catcherId,
        playerName: catcher.name,
        targetId: lastAction.targetId,
        targetName: target.name,
        extra: '未喊 UNO!',
      });
    } else if (lastAction.type === 'CHALLENGE') {
      const player = findPlayer(lastAction.playerId);
      if (!player) return;
      addLogEntry({
        type: 'challenge',
        playerId: lastAction.playerId,
        playerName: player.name,
        extra: '质疑 +4',
      });
    }
  }, [lastAction, players, discardPile, addLogEntry]);

  // Round separator / clear logic
  useEffect(() => {
    if (!phase || roundNumber <= 0) return;

    const previousRound = prevRoundNumberRef.current;
    if (previousRound === roundNumber) return;
    prevRoundNumberRef.current = roundNumber;
    prevActionKeyRef.current = null;

    if (previousRound === null || roundNumber <= 1) {
      clearLog();
      return;
    }

    if (roundNumber > previousRound) {
      addRoundSeparator(roundNumber);
    }
  }, [phase, roundNumber, clearLog, addRoundSeparator]);
}
