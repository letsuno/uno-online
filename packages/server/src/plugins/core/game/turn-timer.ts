export class TurnTimer {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  start(roomCode: string, seconds: number, onTimeout: (roomCode: string) => void): void {
    this.stop(roomCode);
    const handle = setTimeout(() => {
      this.timers.delete(roomCode);
      onTimeout(roomCode);
    }, seconds * 1000);
    this.timers.set(roomCode, handle);
  }

  stop(roomCode: string): void {
    const handle = this.timers.get(roomCode);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(roomCode);
    }
  }

  stopAll(): void {
    for (const handle of this.timers.values()) {
      clearTimeout(handle);
    }
    this.timers.clear();
  }

  isRunning(roomCode: string): boolean {
    return this.timers.has(roomCode);
  }
}
