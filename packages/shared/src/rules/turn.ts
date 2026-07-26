import type { Direction } from '../types/game.js';

export function getNextPlayerIndex(
  currentIndex: number,
  playerCount: number,
  direction: Direction,
  skip: number = 0,
): number {
  const step = direction === 'clockwise' ? 1 : -1;
  const totalSteps = 1 + skip;
  return ((currentIndex + step * totalSteps) % playerCount + playerCount) % playerCount;
}

export function reverseDirection(direction: Direction): Direction {
  return direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
}

interface Seat {
  eliminated?: boolean;
}

/**
 * Next non-eliminated seat in turn order. `skip` counts alive players to
 * skip over (skip=1 → the seat after the next alive player), mirroring
 * getNextPlayerIndex semantics. Identical to getNextPlayerIndex when no
 * seat is eliminated; falls back to it if no alive seat exists.
 */
export function getNextAliveIndex(
  players: readonly Seat[],
  currentIndex: number,
  direction: Direction,
  skip: number = 0,
): number {
  const count = players.length;
  if (count === 0) return currentIndex;
  const step = direction === 'clockwise' ? 1 : -1;
  let remaining = 1 + skip;
  let idx = currentIndex;
  const maxSteps = count * (1 + skip) + count;
  for (let i = 0; i < maxSteps; i++) {
    idx = ((idx + step) % count + count) % count;
    if (!players[idx]!.eliminated) {
      remaining--;
      if (remaining === 0) return idx;
    }
  }
  return getNextPlayerIndex(currentIndex, count, direction, skip);
}

export function countAlivePlayers(players: readonly Seat[]): number {
  return players.reduce((n, p) => n + (p.eliminated ? 0 : 1), 0);
}

/**
 * Rotate hands one seat along the play direction, passing only between
 * alive players. Eliminated seats keep their (empty) hands.
 */
export function rotateHands<P extends Seat & { hand: unknown[] }>(
  players: readonly P[],
  direction: Direction,
): P[] {
  const hands = players.map(p => [...p.hand]);
  return players.map((p, i) => {
    if (p.eliminated) return { ...p };
    const sourceIdx = getNextAliveIndex(players, i, reverseDirection(direction));
    return { ...p, hand: hands[sourceIdx]! };
  });
}
