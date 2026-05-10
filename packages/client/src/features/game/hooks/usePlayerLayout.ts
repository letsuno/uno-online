import { useMemo, useCallback } from 'react';
import type { PlayerInfo } from '../stores/game-store';

export interface Position {
  x: number;
  y: number;
}

export function usePlayerLayout(
  dimensions: { width: number; height: number },
  players: PlayerInfo[],
  userId: string | null | undefined,
) {
  const playerPositions = useMemo(() => {
    const { width, height } = dimensions;
    if (width === 0 || height === 0 || players.length === 0) return [];

    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.38;
    const ry = height * 0.38;
    const n = players.length;

    // Find my index
    const myIndex = players.findIndex((p) => p.id === userId);
    const safeMyIndex = myIndex >= 0 ? myIndex : 0;

    const positions: Position[] = [];

    for (let i = 0; i < n; i++) {
      // My position is at bottom (angle = PI/2)
      // Other players distributed clockwise from there
      const offset = i - safeMyIndex;
      const angle = Math.PI / 2 + (offset * 2 * Math.PI) / n;
      positions.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      });
    }

    return positions;
  }, [dimensions, players, userId]);

  const getPlayerPosition = useCallback((playerId: string): Position | null => {
    const idx = players.findIndex((p) => p.id === playerId);
    if (idx < 0 || idx >= playerPositions.length) return null;
    return playerPositions[idx];
  }, [players, playerPositions]);

  return { playerPositions, getPlayerPosition };
}
