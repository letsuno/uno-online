import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@uno-online/shared';

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_CHARS}]{${ROOM_CODE_LENGTH}}$`, 'u');

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasExactKeys(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    requiredKeys.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => requiredKeys.includes(key) || optionalKeys.includes(key))
  );
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}
