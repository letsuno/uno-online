import { describe, it, expect } from 'vitest';
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
  });

  it('throws when emitting without connection', () => {
    const client = new UnoSocketClient('https://server.com', 'jwt-token');
    expect(() => client.pass()).toThrow('未连接到服务器');
  });
});
