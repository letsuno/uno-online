import { useEffect, useRef } from 'react';
import type { GameAction } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import { useGameLogStore } from '../stores/game-log-store';

export function useGameLogTracker(): void {
  const lastAction = useGameStore((s) => s.lastAction);
  const players = useGameStore((s) => s.players);
  const discardPile = useGameStore((s) => s.discardPile);
  const phase = useGameStore((s) => s.phase);
  const roundNumber = useGameStore((s) => s.roundNumber);

  const addLogEntry = useGameLogStore((s) => s.addEntry);
  const addRoundSeparator = useGameLogStore((s) => s.addRoundSeparator);
  const clearLog = useGameLogStore((s) => s.clear);

  const prevActionRef = useRef<GameAction | null>(null);

  // Map lastAction to game log entries
  useEffect(() => {
    if (!lastAction || lastAction === prevActionRef.current) return;
    prevActionRef.current = lastAction;

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
    if (phase === 'dealing') {
      if (roundNumber <= 1) {
        clearLog();
      } else {
        addRoundSeparator(roundNumber);
      }
    }
  }, [phase, roundNumber, clearLog, addRoundSeparator]);
}
