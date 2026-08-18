const nextRoundExclusions = new Map<string, Set<string>>();

export function excludeFromNextRound(roomCode: string, userId: string): void {
  const excluded = nextRoundExclusions.get(roomCode) ?? new Set<string>();
  excluded.add(userId);
  nextRoundExclusions.set(roomCode, excluded);
}

export function isNextRoundExcluded(roomCode: string, userId: string): boolean {
  return nextRoundExclusions.get(roomCode)?.has(userId) ?? false;
}

export function getNextRoundExclusions(roomCode: string): string[] {
  return [...(nextRoundExclusions.get(roomCode) ?? [])];
}

export function restoreNextRoundExclusions(roomCode: string, userIds: readonly string[]): void {
  const excluded = new Set(userIds);
  if (excluded.size === 0) {
    nextRoundExclusions.delete(roomCode);
  } else {
    nextRoundExclusions.set(roomCode, excluded);
  }
}

export function clearNextRoundExclusions(roomCode: string): void {
  nextRoundExclusions.delete(roomCode);
}
