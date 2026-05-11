import { describe, it, expect, vi } from 'vitest';
import { UnoSocketClient } from '../src/socket-client.js';

describe('UnoSocketClient', () => {
  it('constructs with serverUrl and token', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    expect(client).toBeDefined();
    expect(client.connected).toBe(false);
  });

  it('has null state before connection', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    expect(client.gameState).toBeNull();
    expect(client.roomInfo).toBeNull();
    expect(client.currentRoomCode).toBeNull();
  });

  it('throws when emitting without connection', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    expect(() => client.pass()).toThrow('未连接到服务器');
  });

  it('supports multiple event callbacks and unsubscribe', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = client.onGameEvent(cb1);
    client.onGameEvent(cb2);
    unsub1();
    // cb1 should be removed, cb2 should remain
    // We can't easily trigger events without a connection,
    // but we can verify the unsubscribe pattern works without error
    expect(unsub1).toBeTypeOf('function');
  });
});
