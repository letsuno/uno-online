import type { Color } from '../types/card';

export const COLORS: readonly Color[] = ['red', 'blue', 'green', 'yellow'] as const;

export const INITIAL_HAND_SIZE = 7;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
