export class TurnTimer {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();

  start(roomCode: string, seconds: number, onTimeout: (roomCode: string) => void | Promise<void>): number {
    const previous = this.timers.get(roomCode);
    if (previous) clearTimeout(previous);
    const generation = (this.generations.get(roomCode) ?? 0) + 1;
    this.generations.set(roomCode, generation);
    const handle = setTimeout(() => {
      if (this.timers.get(roomCode) !== handle || !this.isGenerationCurrent(roomCode, generation)) return;
      this.timers.delete(roomCode);
      try {
        Promise.resolve(onTimeout(roomCode)).catch((error: unknown) => {
          console.error(`[turnTimer] Timeout handler failed for room ${roomCode}:`, error);
        });
      } catch (error) {
        console.error(`[turnTimer] Timeout handler failed for room ${roomCode}:`, error);
      }
    }, seconds * 1000);
    this.timers.set(roomCode, handle);
    return generation;
  }

  stop(roomCode: string): void {
    const handle = this.timers.get(roomCode);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(roomCode);
    }
    this.generations.set(roomCode, (this.generations.get(roomCode) ?? 0) + 1);
  }

  stopAll(): void {
    for (const [roomCode, handle] of this.timers) {
      clearTimeout(handle);
      this.generations.set(roomCode, (this.generations.get(roomCode) ?? 0) + 1);
    }
    this.timers.clear();
  }

  isRunning(roomCode: string): boolean {
    return this.timers.has(roomCode);
  }

  /** True until this room's timer is restarted or explicitly stopped. */
  isGenerationCurrent(roomCode: string, generation: number): boolean {
    return this.generations.get(roomCode) === generation;
  }
}
