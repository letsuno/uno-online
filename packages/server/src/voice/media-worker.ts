import * as mediasoup from 'mediasoup';
import type { Worker, RouterRtpCodecCapability, WebRtcServer } from 'mediasoup/types';

let worker: Worker | null = null;
let webRtcServer: WebRtcServer | null = null;

const RTC_PORT = parseInt(process.env['RTC_PORT'] ?? '40000', 10);

export async function getOrCreateWorker(): Promise<Worker> {
  if (worker && !worker.closed) return worker;

  worker = await mediasoup.createWorker({
    logLevel: 'warn',
  });

  worker.on('died', () => {
    console.error('mediasoup Worker died, restarting...');
    worker = null;
    webRtcServer = null;
  });

  return worker;
}

export async function getOrCreateWebRtcServer(): Promise<WebRtcServer> {
  if (webRtcServer && !webRtcServer.closed) return webRtcServer;

  const w = await getOrCreateWorker();
  webRtcServer = await w.createWebRtcServer({
    listenInfos: [
      { protocol: 'udp', ip: '0.0.0.0', port: RTC_PORT },
      { protocol: 'tcp', ip: '0.0.0.0', port: RTC_PORT },
    ],
  });

  return webRtcServer;
}

export async function closeWorkers(): Promise<void> {
  if (worker && !worker.closed) {
    worker.close();
    worker = null;
  }
}

export function getMediaCodecs(): RouterRtpCodecCapability[] {
  return [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
  ];
}
