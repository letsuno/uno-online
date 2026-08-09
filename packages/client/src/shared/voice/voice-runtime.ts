import { VoiceEngine } from './voice-engine';
import { createWebCodecsOpusDecoder, createWebCodecsOpusEncoder } from './webcodecs-opus';
import { useGatewayStore } from './gateway-store';
import { useRoomStore } from '@/shared/stores/room-store';

type Encoder = ReturnType<typeof createWebCodecsOpusEncoder>;
type Decoder = ReturnType<typeof createWebCodecsOpusDecoder>;

let engine: VoiceEngine | null = null;
let encoder: Encoder | null = null;
const decoders = new Map<number, Decoder>();

function failVoiceRuntime(
  runtimeEngine: VoiceEngine,
  message: string,
  error: unknown,
  expectedEncoder?: Encoder,
): void {
  if (engine !== runtimeEngine || (expectedEncoder && encoder !== expectedEncoder)) return;
  console.error(`[voice] ${message}`, error);
  const store = useGatewayStore.getState();
  releaseVoiceAudio();
  store.disconnect();
  store.setError('麦克风音频编码失败');
}

export function getVoiceEngine(sendMicOpus: (opus: Uint8Array) => void, sendMicEnd: () => void): VoiceEngine {
  if (engine) return engine;

  const runtimeEngine = new VoiceEngine({
    onMicPcm: (pcm, sampleRate) => {
      if (engine !== runtimeEngine) return;
      try {
        if (!encoder) {
          let createdEncoder: Encoder | null = null;
          createdEncoder = createWebCodecsOpusEncoder({
            sampleRate,
            channels: 1,
            bitrate: 24000,
            onOpus: opus => {
              if (engine === runtimeEngine && encoder === createdEncoder) sendMicOpus(opus);
            },
            onError: error => {
              if (createdEncoder) failVoiceRuntime(runtimeEngine, 'Opus encoder failed', error, createdEncoder);
            },
          });
          encoder = createdEncoder;
        }
        const currentEncoder = encoder;
        currentEncoder.encode(pcm);
      } catch (error) {
        failVoiceRuntime(runtimeEngine, 'Failed to encode microphone audio', error, encoder ?? undefined);
      }
    },
    onMicEnd: () => {
      if (engine === runtimeEngine) sendMicEnd();
    },
    onPlaybackStats: stats => {
      if (engine === runtimeEngine) useGatewayStore.getState().setPlaybackStats(stats);
    },
    onCaptureStats: stats => {
      if (engine === runtimeEngine) useGatewayStore.getState().setCaptureStats(stats);
    },
  });
  engine = runtimeEngine;

  return runtimeEngine;
}

function resetVoiceEncoder(): void {
  const current = encoder;
  encoder = null;
  current?.close();
}

export function closeVoiceDecoders(): void {
  for (const decoder of decoders.values()) {
    decoder.close();
  }
  decoders.clear();
}

export function releaseVoiceAudio(): void {
  const current = engine;
  engine = null;
  current?.dispose();
  resetVoiceEncoder();
  closeVoiceDecoders();
}

export function leaveVoiceSession(): void {
  releaseVoiceAudio();
  const store = useGatewayStore.getState();
  store.disconnect();
  store.setMicEnabled(false);
  store.setSpeakerMuted(false);
  store.setSelfSpeaking(false);
  store.clearPlayerVoicePresence();
}

function isMumbleUserForceMuted(mumbleUserId: number): boolean {
  const { usersById, playerVoicePresence } = useGatewayStore.getState();
  const mumbleUser = usersById[mumbleUserId];
  if (!mumbleUser) return false;

  const forceMutedIds = Object.entries(playerVoicePresence)
    .filter(([, p]) => p.forceMuted)
    .map(([id]) => id);
  if (forceMutedIds.length === 0) return false;

  const normalize = (name: string) =>
    name
      .trim()
      .replace(/[^\p{L}\p{N}_ .-]/gu, '')
      .slice(0, 32)
      .toLocaleLowerCase();
  const mumbleName = normalize(mumbleUser.name);
  const { seats } = useRoomStore.getState();
  const seatedPlayers = seats.filter((s): s is NonNullable<typeof s> => s !== null);

  return forceMutedIds.some(gameUserId => {
    const player = seatedPlayers.find(p => p.userId === gameUserId);
    return player && normalize(player.nickname) === mumbleName;
  });
}

export function decodeVoiceFrame(
  userId: number,
  opus: Uint8Array,
  sendMicOpus: (opus: Uint8Array) => void,
  sendMicEnd: () => void,
): void {
  if (isMumbleUserForceMuted(userId)) return;
  const runtimeEngine = getVoiceEngine(sendMicOpus, sendMicEnd);

  const createDecoder = () => {
    let decoder: Decoder;
    decoder = createWebCodecsOpusDecoder({
      sampleRate: 48000,
      channels: 1,
      onPcm: pcm => {
        runtimeEngine.pushRemotePcm({
          userId,
          channels: 1,
          sampleRate: 48000,
          pcm,
        });
      },
      onError: error => {
        console.error(`[voice] Opus decoder failed for user ${userId}`, error);
        if (decoders.get(userId) === decoder) {
          decoders.delete(userId);
        }
      },
    });
    return decoder;
  };

  let decoder = decoders.get(userId);
  if (!decoder) {
    decoder = createDecoder();
    decoders.set(userId, decoder);
  }

  const decoded = decoder.decode(opus);
  if (!decoded && decoders.get(userId) === decoder) {
    decoders.delete(userId);
  }
}
