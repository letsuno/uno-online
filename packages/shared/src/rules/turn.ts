import type { Direction } from '../types/game';

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
