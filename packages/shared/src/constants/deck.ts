import type { Color } from '../types/card.js';

export const COLORS: readonly Color[] = ['red', 'blue', 'green', 'yellow'] as const;

export const INITIAL_HAND_SIZE = 7;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export const SEAT_COUNT = 10;
export const SWAP_COOLDOWN_MS = 5000;
export const SWAP_REQUEST_TIMEOUT_MS = 15000;

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
