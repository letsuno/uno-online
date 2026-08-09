import { describe, expect, it } from 'vitest';
import { withRoomLifecycleLock } from '../../src/ws/room-lifecycle-lock';

describe('room lifecycle lock', () => {
  it('runs same-room tasks FIFO and releases the queue after an exception', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const entered = new Promise<void>(resolve => {
      firstEntered = resolve;
    });

    const first = withRoomLifecycleLock('LOCK1', async () => {
      order.push('first:start');
      firstEntered();
      await firstGate;
      order.push('first:end');
      throw new Error('expected');
    });
    await entered;

    const second = withRoomLifecycleLock('LOCK1', async () => {
      order.push('second');
    });
    await Promise.resolve();
    expect(order).toEqual(['first:start']);

    releaseFirst();
    await expect(first).rejects.toThrow('expected');
    await second;
    await withRoomLifecycleLock('LOCK1', () => {
      order.push('third');
    });
    expect(order).toEqual(['first:start', 'first:end', 'second', 'third']);
  });

  it('does not block lifecycle work in another room', async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });

    const blocked = withRoomLifecycleLock('LOCK_A', async () => {
      entered();
      await gate;
    });
    await started;

    let otherRoomRan = false;
    await withRoomLifecycleLock('LOCK_B', () => {
      otherRoomRan = true;
    });
    expect(otherRoomRan).toBe(true);

    release();
    await blocked;
  });
});
