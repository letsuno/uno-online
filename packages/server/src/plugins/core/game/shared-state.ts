import type { GameSession } from './session';

export const sessions = new Map<string, GameSession>();
export const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const autoPlayIntervals = new Map<string, ReturnType<typeof setInterval>>();
export const gameStartTimes = new Map<string, number>();
export const persistedGames = new Set<string>();
export const chatTimestamps = new Map<string, number[]>();
