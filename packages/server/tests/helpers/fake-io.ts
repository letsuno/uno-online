import type { Server as SocketIOServer } from 'socket.io';

/**
 * In-memory socket.io doubles for driving the real setupSocketHandlers stack:
 * enough of the Socket/Server surface for connection, room membership,
 * broadcasts and ack-style calls — no network involved.
 */

export interface Emitted {
  target: string;
  event: string;
  payload: unknown;
}

type Handler = (...args: never[]) => unknown;

export class FakeSocket {
  id: string;
  data: {
    user: { userId: string; username: string; nickname: string; avatarUrl?: string | null; role: string; isBot?: boolean };
    roomCode: string | null;
    isSpectator: boolean;
  };
  rooms = new Set<string>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  /** Set by makeFakeIo: detaches this socket from the fake server registry. */
  detach: (() => void) | null = null;
  private handlers = new Map<string, Handler[]>();
  private hub: Emitted[];

  constructor(userId: string, nickname: string, hub: Emitted[]) {
    this.id = `sock_${userId}_${Math.random().toString(36).slice(2, 8)}`;
    this.data = {
      user: { userId, username: userId, nickname, avatarUrl: null, role: 'normal', isBot: false },
      roomCode: null,
      isSpectator: false,
    };
    this.hub = hub;
  }

  on(event: string, handler: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, payload?: unknown): boolean {
    this.emitted.push({ event, payload });
    return true;
  }

  to(target: string) {
    const hub = this.hub;
    return { emit(event: string, payload: unknown) { hub.push({ target, event, payload }); } };
  }

  join(room: string): void { this.rooms.add(room); }
  leave(room: string): void { this.rooms.delete(room); }

  async trigger(event: string, ...args: unknown[]): Promise<void> {
    // Mirror real socket.io: by the time 'disconnect' handlers run, the
    // socket has already left every room and is gone from fetchSockets().
    if (event === 'disconnect') this.detach?.();
    for (const handler of this.handlers.get(event) ?? []) {
      await handler(...(args as never[]));
    }
  }

  /** Server-initiated disconnect (e.g. multi-tab kick uses disconnect(true)). */
  disconnect(_close?: boolean): void {
    void this.trigger('disconnect');
  }

  /** Trigger an event whose last argument is an ack callback; resolves with the ack. */
  async call(event: string, ...args: unknown[]): Promise<any> {
    let result: unknown;
    await this.trigger(event, ...args, (res: unknown) => { result = res; });
    return result;
  }

  lastEmit(event: string): unknown {
    for (let i = this.emitted.length - 1; i >= 0; i--) {
      if (this.emitted[i]!.event === event) return this.emitted[i]!.payload;
    }
    return undefined;
  }
}

export function makeFakeIo() {
  const emitted: Emitted[] = [];
  const sockets = new Set<FakeSocket>();
  let connectionHandler: ((socket: FakeSocket) => unknown) | null = null;

  const io = {
    use(_mw: unknown) {},
    on(event: string, cb: (socket: FakeSocket) => unknown) {
      if (event === 'connection') connectionHandler = cb;
    },
    to(target: string) {
      return { emit(event: string, payload: unknown) { emitted.push({ target, event, payload }); } };
    },
    in(room: string) {
      return { fetchSockets: async () => [...sockets].filter(s => s.rooms.has(room)) };
    },
    fetchSockets: async () => [...sockets],
    sockets: { sockets: new Map<string, FakeSocket>() },
  } as unknown as SocketIOServer;

  async function connect(userId: string, nickname: string): Promise<FakeSocket> {
    if (!connectionHandler) throw new Error('connection handler not registered');
    const socket = new FakeSocket(userId, nickname, emitted);
    sockets.add(socket);
    const registry = (io as unknown as { sockets: { sockets: Map<string, FakeSocket> } }).sockets.sockets;
    registry.set(socket.id, socket);
    socket.detach = () => {
      sockets.delete(socket);
      registry.delete(socket.id);
      socket.rooms.clear();
    };
    await connectionHandler(socket);
    return socket;
  }

  function roomEmits(roomCode: string, event: string): Emitted[] {
    return emitted.filter(e => e.target === roomCode && e.event === event);
  }

  function lastRoomEmit(roomCode: string, event: string): unknown {
    const list = roomEmits(roomCode, event);
    return list.length > 0 ? list[list.length - 1]!.payload : undefined;
  }

  return { io, emitted, connect, roomEmits, lastRoomEmit };
}
