import { describe, expect, it } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { getUserRoom, setUserRoom } from '../../src/plugins/core/room/store';
import { reconcileRoomRosterFromGameState } from '../../src/ws/room-roster-reconcile';
import { makeGameState, makePlayer } from '../helpers/test-utils';

class StaleMembershipReadStore extends MemoryKvStore {
  private staleKey: string | null = null;

  hideNextRead(key: string): void {
    this.staleKey = key;
  }

  revealReads(): void {
    this.staleKey = null;
  }

  override async get(key: string): Promise<string | null> {
    if (key === this.staleKey) {
      this.staleKey = null;
      return null;
    }
    return super.get(key);
  }
}

describe('room roster reconciliation', () => {
  it('does not overwrite a newer room mapping after a stale missing read', async () => {
    const kv = new StaleMembershipReadStore();
    const userId = 'reconcile_race_user';
    const staleRoom = 'OLD001';
    const newerRoom = 'NEW001';
    await setUserRoom(kv, userId, newerRoom);
    kv.hideNextRead(`user:${userId}:room`);

    await reconcileRoomRosterFromGameState(
      kv,
      staleRoom,
      makeGameState({
        phase: 'playing',
        players: [{ ...makePlayer(userId), name: 'RaceUser' }],
      }),
    );

    kv.revealReads();
    expect(await getUserRoom(kv, userId)).toBe(newerRoom);
    await kv.disconnect();
  });
});
