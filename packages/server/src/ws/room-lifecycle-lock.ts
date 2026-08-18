const roomLifecycleTails = new Map<string, Promise<void>>();

/** Wait until every room operation that has already entered the queue finishes. */
export async function drainRoomLifecycleLocks(): Promise<void> {
  while (roomLifecycleTails.size > 0) {
    await Promise.allSettled([...roomLifecycleTails.values()]);
  }
}

/**
 * Serialize lifecycle transitions for one room while allowing unrelated rooms
 * to continue independently. The queue is FIFO, exception-safe, and removes
 * idle room keys after the final waiter releases the lock.
 *
 * This lock is deliberately non-reentrant. Callers that already hold it must
 * invoke an unlocked implementation rather than nesting another acquisition.
 */
export async function withRoomLifecycleLock<T>(roomCode: string, task: () => Promise<T> | T): Promise<T> {
  const previous = roomLifecycleTails.get(roomCode) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  roomLifecycleTails.set(roomCode, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (roomLifecycleTails.get(roomCode) === tail) {
      roomLifecycleTails.delete(roomCode);
    }
  }
}
