let offset = 0;

export function setServerTimeOffset(serverTimestamp: number): void {
  offset = serverTimestamp - Date.now();
}

export function serverNow(): number {
  return Date.now() + offset;
}
