import { Device } from 'mediasoup-client';
import type {
  Transport,
  Producer,
  Consumer,
} from 'mediasoup-client/types';
import { getSocket } from '../socket';

export class VoiceClient {
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producer: Producer | null = null;
  private consumers = new Map<string, { consumer: Consumer; audio: HTMLAudioElement; analyser?: AnalyserNode }>();
  private stream: MediaStream | null = null;
  private _isMuted = false;
  private _isSpeakerMuted = false;
  private _mutedPeers = new Set<string>();
  private audioContext: AudioContext | null = null;
  private _reconnecting = false;
  private _onReconnectError: ((err: Error) => void) | null = null;

  get isMuted(): boolean { return this._isMuted; }
  get isSpeakerMuted(): boolean { return this._isSpeakerMuted; }
  get isConnected(): boolean { return this.device !== null && this.sendTransport !== null; }

  private static MAX_RETRIES = 3;
  private static RETRY_DELAY_MS = 2000;

  onReconnectError(cb: (err: Error) => void): void {
    this._onReconnectError = cb;
  }

  async join(): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < VoiceClient.MAX_RETRIES; attempt++) {
      try {
        await this._joinOnce();
        return;
      } catch (err) {
        lastError = err as Error;
        if (attempt < VoiceClient.MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, VoiceClient.RETRY_DELAY_MS));
        }
      }
    }
    throw lastError ?? new Error('Failed to join voice');
  }

  private async _joinOnce(): Promise<void> {
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

  private async createTransport(type: 'send' | 'recv', options: any): Promise<Transport> {
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

    transport.on('connectionstatechange', (state: string) => {
      if ((state === 'failed' || state === 'disconnected') && !this._reconnecting) {
        this.reconnect();
      }
    });

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

    let analyser: AnalyserNode | undefined;
    try {
      if (!this.audioContext) this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(new MediaStream([consumer.track]));
      analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
    } catch { /* audio analysis optional */ }

    this.consumers.set(peerId, { consumer, audio, analyser });
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

  private async reconnect(): Promise<void> {
    this._reconnecting = true;
    try {
      this.cleanupLocal();
      await this.join();
    } catch (err) {
      this._onReconnectError?.(err as Error);
    } finally {
      this._reconnecting = false;
    }
  }

  private cleanupLocal(): void {
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
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  getSpeakingPeers(): string[] {
    const speaking: string[] = [];
    for (const [peerId, entry] of this.consumers) {
      if (!entry.analyser) continue;
      const data = new Uint8Array(entry.analyser.frequencyBinCount);
      entry.analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      if (avg > 15) speaking.push(peerId);
    }
    return speaking;
  }

  async leave(): Promise<void> {
    this.cleanupLocal();
    this._isMuted = false;
    this._isSpeakerMuted = false;
    this._mutedPeers.clear();

    await new Promise<void>((resolve) => {
      getSocket().emit('voice:leave', () => resolve());
    });
  }
}
