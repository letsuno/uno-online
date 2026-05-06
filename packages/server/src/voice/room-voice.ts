import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsParameters,
  MediaKind,
  RtpParameters,
} from 'mediasoup/types';
import { getOrCreateWorker, getMediaCodecs, getOrCreateWebRtcServer } from './media-worker';

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
    const webRtcServer = await getOrCreateWebRtcServer();

    const sendTransport = await router.createWebRtcTransport({
      webRtcServer,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    const recvTransport = await router.createWebRtcTransport({
      webRtcServer,
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
