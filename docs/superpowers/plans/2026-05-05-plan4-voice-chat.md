# Plan 4: Voice Chat (mediasoup SFU) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time voice chat to UNO Online using mediasoup as an SFU, so players in a room can talk to each other during the game.

**Architecture:** Each room gets a mediasoup Router. When a player joins voice, the server creates send/receive WebRTC transports. The player's mic stream is sent via a Producer; other players' audio is received via Consumers. All signaling (transport parameters, DTLS, RTP capabilities) rides over the existing Socket.IO connection. Voice is completely independent of game logic — failure doesn't affect gameplay.

**Tech Stack:** mediasoup (server), mediasoup-client (browser), WebRTC, Opus codec

**Important:** mediasoup requires native compilation (C++ worker). Install with `pnpm add mediasoup` in the server package. On Linux, build tools (`python3`, `make`, `g++`) must be available.

---

## File Structure

```
packages/server/src/voice/
├── media-worker.ts       # Create & manage mediasoup Worker(s)
├── room-voice.ts         # Per-room Router + transport/producer/consumer management
└── voice-events.ts       # Socket.IO signaling handlers

packages/client/src/voice/
├── voice-client.ts       # mediasoup-client Device, transports, producer/consumer mgmt
└── VoicePanel.tsx         # UI: join/leave, mic toggle, speaker toggle, speaking indicators
```

---

### Task 1: Install mediasoup Dependencies

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/client/package.json`

- [ ] **Step 1: Install mediasoup on server**

```bash
cd /root/uno-online/packages/server && pnpm add mediasoup@3
```

- [ ] **Step 2: Install mediasoup-client on client**

```bash
cd /root/uno-online/packages/client && pnpm add mediasoup-client@3
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/package.json packages/client/package.json pnpm-lock.yaml
git commit -m "chore: install mediasoup and mediasoup-client"
```

---

### Task 2: mediasoup Worker Manager (Server)

**Files:**
- Create: `packages/server/src/voice/media-worker.ts`
- Create: `packages/server/tests/voice/media-worker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/tests/voice/media-worker.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { getOrCreateWorker, closeWorkers, getMediaCodecs } from '../../src/voice/media-worker.js';

afterAll(async () => {
  await closeWorkers();
});

describe('media-worker', () => {
  it('creates a mediasoup worker', async () => {
    const worker = await getOrCreateWorker();
    expect(worker).toBeDefined();
    expect(worker.pid).toBeGreaterThan(0);
  });

  it('returns the same worker on subsequent calls', async () => {
    const w1 = await getOrCreateWorker();
    const w2 = await getOrCreateWorker();
    expect(w1.pid).toBe(w2.pid);
  });

  it('provides audio media codecs', () => {
    const codecs = getMediaCodecs();
    expect(codecs.length).toBeGreaterThan(0);
    expect(codecs[0]!.mimeType.toLowerCase()).toContain('opus');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/voice/media-worker.test.ts
```

- [ ] **Step 3: Write implementation**

Create `packages/server/src/voice/media-worker.ts`:

```typescript
import * as mediasoup from 'mediasoup';
import type { Worker, RtpCodecCapability } from 'mediasoup/node/lib/types.js';

let worker: Worker | null = null;

export async function getOrCreateWorker(): Promise<Worker> {
  if (worker && !worker.closed) return worker;

  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });

  worker.on('died', () => {
    console.error('mediasoup Worker died, restarting...');
    worker = null;
  });

  return worker;
}

export async function closeWorkers(): Promise<void> {
  if (worker && !worker.closed) {
    worker.close();
    worker = null;
  }
}

export function getMediaCodecs(): RtpCodecCapability[] {
  return [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/voice/media-worker.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/voice/media-worker.ts packages/server/tests/voice/media-worker.test.ts
git commit -m "feat: add mediasoup worker manager with Opus codec config"
```

---

### Task 3: Room Voice Manager (Server)

**Files:**
- Create: `packages/server/src/voice/room-voice.ts`

- [ ] **Step 1: Create `packages/server/src/voice/room-voice.ts`**

```typescript
import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsParameters,
  MediaKind,
  RtpParameters,
} from 'mediasoup/node/lib/types.js';
import { getOrCreateWorker, getMediaCodecs } from './media-worker.js';

interface PeerTransports {
  sendTransport: WebRtcTransport;
  recvTransport: WebRtcTransport;
  producer: Producer | null;
  consumers: Map<string, Consumer>;
}

export class RoomVoice {
  private router: Router | null = null;
  private peers = new Map<string, PeerTransports>();

  async ensureRouter(): Promise<Router> {
    if (this.router && !this.router.closed) return this.router;
    const worker = await getOrCreateWorker();
    this.router = await worker.createRouter({ mediaCodecs: getMediaCodecs() });
    return this.router;
  }

  getRouterRtpCapabilities(): RtpCapabilities | null {
    return this.router?.rtpCapabilities ?? null;
  }

  async createTransports(peerId: string): Promise<{
    sendTransportOptions: Record<string, unknown>;
    recvTransportOptions: Record<string, unknown>;
  }> {
    const router = await this.ensureRouter();

    const sendTransport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: undefined }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    const recvTransport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: undefined }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    this.peers.set(peerId, {
      sendTransport,
      recvTransport,
      producer: null,
      consumers: new Map(),
    });

    return {
      sendTransportOptions: {
        id: sendTransport.id,
        iceParameters: sendTransport.iceParameters,
        iceCandidates: sendTransport.iceCandidates,
        dtlsParameters: sendTransport.dtlsParameters,
      },
      recvTransportOptions: {
        id: recvTransport.id,
        iceParameters: recvTransport.iceParameters,
        iceCandidates: recvTransport.iceCandidates,
        dtlsParameters: recvTransport.dtlsParameters,
      },
    };
  }

  async connectTransport(
    peerId: string,
    transportType: 'send' | 'recv',
    dtlsParameters: DtlsParameters,
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');
    const transport = transportType === 'send' ? peer.sendTransport : peer.recvTransport;
    await transport.connect({ dtlsParameters });
  }

  async produce(
    peerId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
  ): Promise<string> {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');

    const producer = await peer.sendTransport.produce({ kind, rtpParameters });
    peer.producer = producer;

    producer.on('transportclose', () => {
      peer.producer = null;
    });

    return producer.id;
  }

  async consume(
    consumerPeerId: string,
    producerPeerId: string,
    rtpCapabilities: RtpCapabilities,
  ): Promise<{
    id: string;
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
  } | null> {
    const producerPeer = this.peers.get(producerPeerId);
    const consumerPeer = this.peers.get(consumerPeerId);
    if (!producerPeer?.producer || !consumerPeer || !this.router) return null;

    if (!this.router.canConsume({
      producerId: producerPeer.producer.id,
      rtpCapabilities,
    })) {
      return null;
    }

    const consumer = await consumerPeer.recvTransport.consume({
      producerId: producerPeer.producer.id,
      rtpCapabilities,
      paused: false,
    });

    consumerPeer.consumers.set(producerPeerId, consumer);

    consumer.on('transportclose', () => {
      consumerPeer.consumers.delete(producerPeerId);
    });

    consumer.on('producerclose', () => {
      consumerPeer.consumers.delete(producerPeerId);
    });

    return {
      id: consumer.id,
      producerId: producerPeer.producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async removePeer(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.producer?.close();
    for (const consumer of peer.consumers.values()) {
      consumer.close();
    }
    peer.sendTransport.close();
    peer.recvTransport.close();
    this.peers.delete(peerId);

    if (this.peers.size === 0 && this.router && !this.router.closed) {
      this.router.close();
      this.router = null;
    }
  }

  getProducerPeerIds(): string[] {
    return Array.from(this.peers.entries())
      .filter(([_, p]) => p.producer !== null)
      .map(([id]) => id);
  }

  hasPeer(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  async close(): Promise<void> {
    for (const peerId of this.peers.keys()) {
      await this.removePeer(peerId);
    }
    if (this.router && !this.router.closed) {
      this.router.close();
      this.router = null;
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/voice/room-voice.ts
git commit -m "feat: add RoomVoice manager (router, transports, producer/consumer)"
```

---

### Task 4: Voice Signaling Events (Server)

**Files:**
- Create: `packages/server/src/voice/voice-events.ts`
- Modify: `packages/server/src/ws/socket-handler.ts`

- [ ] **Step 1: Create `packages/server/src/voice/voice-events.ts`**

```typescript
import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { DtlsParameters, MediaKind, RtpCapabilities, RtpParameters } from 'mediasoup/node/lib/types.js';
import { RoomVoice } from './room-voice.js';
import type { TokenPayload } from '../auth/jwt.js';

interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
}

const roomVoices = new Map<string, RoomVoice>();

function getOrCreateRoomVoice(roomCode: string): RoomVoice {
  let rv = roomVoices.get(roomCode);
  if (!rv) {
    rv = new RoomVoice();
    roomVoices.set(roomCode, rv);
  }
  return rv;
}

export function cleanupRoomVoice(roomCode: string): void {
  const rv = roomVoices.get(roomCode);
  if (rv) {
    rv.close();
    roomVoices.delete(roomCode);
  }
}

export async function removeVoicePeer(roomCode: string, peerId: string, io: SocketIOServer): Promise<void> {
  const rv = roomVoices.get(roomCode);
  if (!rv) return;
  if (!rv.hasPeer(peerId)) return;
  await rv.removePeer(peerId);
  io.to(roomCode).emit('voice:peer_left', { peerId });
  if (rv.getPeerCount() === 0) {
    roomVoices.delete(roomCode);
  }
}

export function registerVoiceEvents(socket: Socket, io: SocketIOServer) {
  const data = socket.data as SocketData;

  socket.on('voice:join', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });

    const rv = getOrCreateRoomVoice(roomCode);

    try {
      await rv.ensureRouter();
      const rtpCapabilities = rv.getRouterRtpCapabilities();
      const { sendTransportOptions, recvTransportOptions } = await rv.createTransports(data.user.userId);

      io.to(roomCode).emit('voice:peer_joined', { peerId: data.user.userId });

      callback?.({
        success: true,
        rtpCapabilities,
        sendTransportOptions,
        recvTransportOptions,
      });
    } catch (err) {
      console.error('voice:join error:', err);
      callback?.({ success: false, error: 'Failed to join voice' });
    }
  });

  socket.on('voice:connect-transport', async (
    payload: { transportType: 'send' | 'recv'; dtlsParameters: DtlsParameters },
    callback,
  ) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    const rv = roomVoices.get(roomCode);
    if (!rv) return callback?.({ success: false });

    try {
      await rv.connectTransport(data.user.userId, payload.transportType, payload.dtlsParameters);
      callback?.({ success: true });
    } catch (err) {
      console.error('voice:connect-transport error:', err);
      callback?.({ success: false });
    }
  });

  socket.on('voice:produce', async (
    payload: { kind: MediaKind; rtpParameters: RtpParameters },
    callback,
  ) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    const rv = roomVoices.get(roomCode);
    if (!rv) return callback?.({ success: false });

    try {
      const producerId = await rv.produce(data.user.userId, payload.kind, payload.rtpParameters);

      const existingProducers = rv.getProducerPeerIds().filter((id) => id !== data.user.userId);
      callback?.({ success: true, producerId, existingProducers });
    } catch (err) {
      console.error('voice:produce error:', err);
      callback?.({ success: false });
    }
  });

  socket.on('voice:consume', async (
    payload: { producerPeerId: string; rtpCapabilities: RtpCapabilities },
    callback,
  ) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    const rv = roomVoices.get(roomCode);
    if (!rv) return callback?.({ success: false });

    try {
      const consumerData = await rv.consume(
        data.user.userId,
        payload.producerPeerId,
        payload.rtpCapabilities,
      );

      if (!consumerData) return callback?.({ success: false });
      callback?.({ success: true, ...consumerData });
    } catch (err) {
      console.error('voice:consume error:', err);
      callback?.({ success: false });
    }
  });

  socket.on('voice:leave', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    await removeVoicePeer(roomCode, data.user.userId, io);
    callback?.({ success: true });
  });
}
```

- [ ] **Step 2: Update `packages/server/src/ws/socket-handler.ts`**

Add voice event registration and cleanup on disconnect. Read the current file first, then add:

1. Import at top:
```typescript
import { registerVoiceEvents, removeVoicePeer } from '../voice/voice-events.js';
```

2. In the `io.on('connection')` handler, after `registerGameEvents(...)`:
```typescript
registerVoiceEvents(socket, io);
```

3. In the `disconnect` handler, before the existing logic, add voice cleanup:
```typescript
// Clean up voice before room/game cleanup
if (roomCode) {
  await removeVoicePeer(roomCode, socket.data.user.userId, io);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/voice/voice-events.ts packages/server/src/ws/socket-handler.ts
git commit -m "feat: add voice signaling events and integrate into socket handler"
```

---

### Task 5: Voice Client (Browser)

**Files:**
- Create: `packages/client/src/voice/voice-client.ts`

- [ ] **Step 1: Create `packages/client/src/voice/voice-client.ts`**

```typescript
import { Device } from 'mediasoup-client';
import type {
  Transport,
  Producer,
  Consumer,
  RtpCapabilities,
} from 'mediasoup-client/lib/types.js';
import { getSocket } from '../socket.js';

export class VoiceClient {
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producer: Producer | null = null;
  private consumers = new Map<string, { consumer: Consumer; audio: HTMLAudioElement }>();
  private stream: MediaStream | null = null;
  private _isMuted = false;
  private _isSpeakerMuted = false;
  private _mutedPeers = new Set<string>();

  get isMuted(): boolean { return this._isMuted; }
  get isSpeakerMuted(): boolean { return this._isSpeakerMuted; }
  get isConnected(): boolean { return this.device !== null && this.sendTransport !== null; }

  async join(): Promise<void> {
    const socket = getSocket();

    const res = await new Promise<any>((resolve) => {
      socket.emit('voice:join', (r: any) => resolve(r));
    });

    if (!res.success) throw new Error(res.error || 'Failed to join voice');

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: res.rtpCapabilities });

    this.sendTransport = await this.createTransport('send', res.sendTransportOptions);
    this.recvTransport = await this.createTransport('recv', res.recvTransportOptions);

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const track = this.stream.getAudioTracks()[0]!;

    this.producer = await this.sendTransport.produce({ track });

    const produceRes = await new Promise<any>((resolve) => {
      socket.emit('voice:produce', {
        kind: 'audio',
        rtpParameters: this.producer!.rtpParameters,
      }, (r: any) => resolve(r));
    });

    if (produceRes.existingProducers) {
      for (const peerId of produceRes.existingProducers) {
        await this.consumePeer(peerId);
      }
    }

    socket.on('voice:peer_joined', async ({ peerId }: { peerId: string }) => {
      setTimeout(() => this.consumePeer(peerId), 1000);
    });

    socket.on('voice:peer_left', ({ peerId }: { peerId: string }) => {
      this.removeConsumer(peerId);
    });
  }

  private async createTransport(
    type: 'send' | 'recv',
    options: any,
  ): Promise<Transport> {
    const socket = getSocket();

    const transport = type === 'send'
      ? this.device!.createSendTransport(options)
      : this.device!.createRecvTransport(options);

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      socket.emit('voice:connect-transport', {
        transportType: type,
        dtlsParameters,
      }, (res: any) => {
        if (res.success) callback();
        else errback(new Error('Transport connect failed'));
      });
    });

    if (type === 'send') {
      transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        socket.emit('voice:produce', { kind, rtpParameters }, (res: any) => {
          if (res.success) callback({ id: res.producerId });
          else errback(new Error('Produce failed'));
        });
      });
    }

    return transport;
  }

  private async consumePeer(peerId: string): Promise<void> {
    if (!this.device || !this.recvTransport) return;

    const socket = getSocket();
    const res = await new Promise<any>((resolve) => {
      socket.emit('voice:consume', {
        producerPeerId: peerId,
        rtpCapabilities: this.device!.rtpCapabilities,
      }, (r: any) => resolve(r));
    });

    if (!res.success) return;

    const consumer = await this.recvTransport.consume({
      id: res.id,
      producerId: res.producerId,
      kind: res.kind,
      rtpParameters: res.rtpParameters,
    });

    const audio = new Audio();
    audio.srcObject = new MediaStream([consumer.track]);
    audio.volume = this._isSpeakerMuted || this._mutedPeers.has(peerId) ? 0 : 1;
    audio.play().catch(() => {});

    this.consumers.set(peerId, { consumer, audio });
  }

  private removeConsumer(peerId: string): void {
    const entry = this.consumers.get(peerId);
    if (!entry) return;
    entry.consumer.close();
    entry.audio.pause();
    entry.audio.srcObject = null;
    this.consumers.delete(peerId);
  }

  toggleMute(): boolean {
    this._isMuted = !this._isMuted;
    if (this.producer) {
      if (this._isMuted) this.producer.pause();
      else this.producer.resume();
    }
    return this._isMuted;
  }

  toggleSpeaker(): boolean {
    this._isSpeakerMuted = !this._isSpeakerMuted;
    for (const { audio } of this.consumers.values()) {
      audio.volume = this._isSpeakerMuted ? 0 : 1;
    }
    return this._isSpeakerMuted;
  }

  mutePeer(peerId: string, muted: boolean): void {
    if (muted) this._mutedPeers.add(peerId);
    else this._mutedPeers.delete(peerId);
    const entry = this.consumers.get(peerId);
    if (entry) {
      entry.audio.volume = muted || this._isSpeakerMuted ? 0 : 1;
    }
  }

  getConnectedPeerIds(): string[] {
    return Array.from(this.consumers.keys());
  }

  async leave(): Promise<void> {
    const socket = getSocket();
    socket.off('voice:peer_joined');
    socket.off('voice:peer_left');

    this.producer?.close();
    this.producer = null;

    for (const peerId of this.consumers.keys()) {
      this.removeConsumer(peerId);
    }

    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    this.device = null;
    this._isMuted = false;
    this._isSpeakerMuted = false;
    this._mutedPeers.clear();

    await new Promise<void>((resolve) => {
      socket.emit('voice:leave', () => resolve());
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/voice/voice-client.ts
git commit -m "feat: add VoiceClient (mediasoup-client transport/producer/consumer)"
```

---

### Task 6: Voice Panel UI (Client)

**Files:**
- Create: `packages/client/src/voice/VoicePanel.tsx`
- Modify: `packages/client/src/pages/GamePage.tsx`

- [ ] **Step 1: Create `packages/client/src/voice/VoicePanel.tsx`**

```tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { VoiceClient } from './voice-client.js';

export default function VoicePanel() {
  const clientRef = useRef<VoiceClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);

  useEffect(() => {
    return () => {
      clientRef.current?.leave().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      setPeerCount(clientRef.current?.getConnectedPeerIds().length ?? 0);
    }, 2000);
    return () => clearInterval(id);
  }, [connected]);

  const joinVoice = useCallback(async () => {
    setError(null);
    try {
      const client = new VoiceClient();
      clientRef.current = client;
      await client.join();
      setConnected(true);
    } catch (err) {
      setError((err as Error).message);
      clientRef.current = null;
    }
  }, []);

  const leaveVoice = useCallback(async () => {
    await clientRef.current?.leave();
    clientRef.current = null;
    setConnected(false);
    setMuted(false);
    setSpeakerMuted(false);
    setPeerCount(0);
  }, []);

  const toggleMute = useCallback(() => {
    const m = clientRef.current?.toggleMute();
    if (m !== undefined) setMuted(m);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const s = clientRef.current?.toggleSpeaker();
    if (s !== undefined) setSpeakerMuted(s);
  }, []);

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 36, height: 36, borderRadius: '50%', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, cursor: 'pointer',
    background: active ? 'rgba(34,197,94,0.3)' : 'rgba(148,163,184,0.2)',
    borderWidth: 2, borderStyle: 'solid',
    borderColor: active ? '#22c55e' : 'rgba(148,163,184,0.3)',
    color: 'var(--text-primary)',
  });

  return (
    <div style={{
      position: 'fixed', right: 12, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50,
    }}>
      {!connected ? (
        <button onClick={joinVoice} style={btnStyle(false)} title="加入语音">
          🎤
        </button>
      ) : (
        <>
          <button onClick={toggleMute} style={btnStyle(!muted)} title={muted ? '取消静音' : '静音'}>
            {muted ? '🔇' : '🎤'}
          </button>
          <button onClick={toggleSpeaker} style={btnStyle(!speakerMuted)} title={speakerMuted ? '打开扬声器' : '关闭扬声器'}>
            {speakerMuted ? '🔈' : '🔊'}
          </button>
          <button onClick={leaveVoice} style={{
            ...btnStyle(false),
            background: 'rgba(239,68,68,0.3)',
            borderColor: '#ef4444',
          }} title="退出语音">
            ✕
          </button>
          {peerCount > 0 && (
            <span style={{
              fontSize: 10, color: '#22c55e', textAlign: 'center',
              background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: '2px 6px',
            }}>
              {peerCount + 1}人
            </span>
          )}
        </>
      )}
      {error && (
        <span style={{ fontSize: 9, color: '#ef4444', maxWidth: 60, textAlign: 'center' }}>
          {error}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `packages/client/src/pages/GamePage.tsx`**

Read the current file first. Add the VoicePanel import and component:

1. Add import at top:
```typescript
import VoicePanel from '../voice/VoicePanel.js';
```

2. Inside the `game-layout` div, after `<ChatBox />`, add:
```tsx
<VoicePanel />
```

- [ ] **Step 3: Also add VoicePanel to RoomPage**

Read `packages/client/src/pages/RoomPage.tsx`. Add VoicePanel so players can join voice in the waiting room:

1. Add import:
```typescript
import VoicePanel from '../voice/VoicePanel.js';
```

2. Add `<VoicePanel />` before the closing `</div>`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/voice/ packages/client/src/pages/GamePage.tsx packages/client/src/pages/RoomPage.tsx
git commit -m "feat: add VoicePanel UI and integrate into game and room pages"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Type-check all packages**

```bash
cd /root/uno-online/packages/shared && npx tsc --noEmit
cd /root/uno-online/packages/server && npx tsc --noEmit
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
cd /root/uno-online && REDIS_URL="redis://:123456@localhost:6379" pnpm test
```

- [ ] **Step 3: Build client**

```bash
cd /root/uno-online/packages/client && npx vite build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: plan 4 complete — voice chat with mediasoup SFU"
```
