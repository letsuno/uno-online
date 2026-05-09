import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useGatewayStore } from './gateway-store';
import { VoiceEngine } from './voice-engine';
import { createWebCodecsOpusEncoder, createWebCodecsOpusDecoder, canUseWebCodecsOpus } from './webcodecs-opus';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth-store';

const MUMBLE_SERVER_ID = 'uno';

function toMumbleUsername(name: string | undefined): string {
  const cleaned = name?.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32);
  return cleaned || `player_${Date.now()}`;
}

export default function VoicePanel() {
  const engineRef = useRef<VoiceEngine | null>(null);
  const encoderRef = useRef<ReturnType<typeof createWebCodecsOpusEncoder> | null>(null);
  const decodersRef = useRef<Map<number, ReturnType<typeof createWebCodecsOpusDecoder>>>(new Map());

  const status = useGatewayStore((s) => s.status);
  const gatewayStatus = useGatewayStore((s) => s.gatewayStatus);
  const usersById = useGatewayStore((s) => s.usersById);
  const speakingByUserId = useGatewayStore((s) => s.speakingByUserId);
  const selfUserId = useGatewayStore((s) => s.selfUserId);
  const init = useGatewayStore((s) => s.init);
  const connect = useGatewayStore((s) => s.connect);
  const disconnect = useGatewayStore((s) => s.disconnect);
  const setVoiceSink = useGatewayStore((s) => s.setVoiceSink);
  const sendMicOpus = useGatewayStore((s) => s.sendMicOpus);
  const sendMicEnd = useGatewayStore((s) => s.sendMicEnd);

  const connectError = useGatewayStore((s) => s.connectError);

  const [micEnabled, setMicEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState<Map<number, number>>(new Map());
  const voiceName = useAuthStore((s) => s.user?.nickname || s.user?.username);

  const connected = status === 'connected';
  const unsupported = !canUseWebCodecsOpus();

  useEffect(() => {
    init();
  }, [init]);

  const setupVoiceEngine = useCallback(() => {
    if (engineRef.current) return engineRef.current;

    const engine = new VoiceEngine({
      onMicPcm: (pcm, sampleRate) => {
        if (!encoderRef.current) {
          encoderRef.current = createWebCodecsOpusEncoder({
            sampleRate,
            channels: 1,
            bitrate: 24000,
            onOpus: (opus) => sendMicOpus(opus),
          });
        }
        encoderRef.current.encode(pcm);
      },
      onMicEnd: () => {
        sendMicEnd();
      },
    });

    engineRef.current = engine;
    return engine;
  }, [sendMicOpus, sendMicEnd]);

  useEffect(() => {
    if (!connected) return;

    const engine = setupVoiceEngine();

    const createDecoder = (userId: number) => {
      let decoder: ReturnType<typeof createWebCodecsOpusDecoder>;
      decoder = createWebCodecsOpusDecoder({
        sampleRate: 48000,
        channels: 1,
        onPcm: (pcm) => {
          engine.pushRemotePcm({
            userId,
            channels: 1,
            sampleRate: 48000,
            pcm,
          });
        },
        onError: () => {
          if (decodersRef.current.get(userId) === decoder) {
            decodersRef.current.delete(userId);
          }
        },
      });
      return decoder;
    };

    setVoiceSink((frame) => {
      let decoder = decodersRef.current.get(frame.userId);
      if (!decoder) {
        decoder = createDecoder(frame.userId);
        decodersRef.current.set(frame.userId, decoder);
      }
      const decoded = decoder.decode(frame.opus);
      if (!decoded && decodersRef.current.get(frame.userId) === decoder) {
        decodersRef.current.delete(frame.userId);
      }
    });

    return () => {
      setVoiceSink(null);
      for (const d of decodersRef.current.values()) d.close();
      decodersRef.current.clear();
    };
  }, [connected, setupVoiceEngine, setVoiceSink]);

  const joinVoice = useCallback(async (roomCode: string) => {
    if (unsupported) {
      console.warn('[voice] WebCodecs not supported');
      return;
    }
    console.log('[voice] joining voice, gateway status:', gatewayStatus, 'status:', status);
    const engine = setupVoiceEngine();
    await engine.enableAudio();
    connect({ serverId: MUMBLE_SERVER_ID, username: toMumbleUsername(voiceName) });
  }, [unsupported, setupVoiceEngine, connect, gatewayStatus, status, voiceName]);

  const leaveVoice = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.disableMic();
    }
    encoderRef.current?.close();
    encoderRef.current = null;
    for (const d of decodersRef.current.values()) d.close();
    decodersRef.current.clear();
    disconnect();
    setMicEnabled(false);
    setMuted(false);
  }, [disconnect]);

  const toggleMic = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (micEnabled) {
      engine.disableMic();
      setMicEnabled(false);
    } else {
      await engine.enableMic();
      setMicEnabled(true);
    }
  }, [micEnabled]);

  const toggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !muted;
    engine.setMuted(next);
    setMuted(next);
  }, [muted]);

  const setPeerVolume = useCallback((userId: number, volume: number) => {
    setPeerVolumes((prev) => {
      const next = new Map(prev);
      next.set(userId, volume);
      return next;
    });
  }, []);

  const otherUsers = Object.values(usersById).filter((u) => u.id !== selfUserId);
  const speakingCount = Object.values(speakingByUserId).filter(Boolean).length;

  const voiceBtn = (active: boolean) => cn(
    'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm cursor-pointer text-foreground',
    active
      ? 'bg-voice-active border-voice-active-border'
      : 'bg-voice-inactive border-voice-inactive-border'
  );

  return (
    <div className="fixed right-3 md:top-1/2 md:-translate-y-1/2 top-16 flex flex-col gap-2 z-fab">
      {!connected ? (
        <button
          onClick={() => joinVoice('default')}
          disabled={unsupported}
          className={cn(
            voiceBtn(false),
            unsupported && 'opacity-40 !cursor-not-allowed'
          )}
          title={unsupported ? '浏览器不支持 WebCodecs' : '加入语音'}
        >
          <Mic size={16} />
        </button>
      ) : (
        <>
          <button onClick={toggleMic} className={voiceBtn(micEnabled)} title={micEnabled ? '关闭麦克风' : '开启麦克风'}>
            {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button onClick={toggleMute} className={voiceBtn(!muted)} title={muted ? '打开扬声器' : '关闭扬声器'}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={leaveVoice}
            className={cn(voiceBtn(false), 'bg-voice-leave border-voice-leave-border')}
            title="退出语音"
          >
            <X size={16} />
          </button>
          {otherUsers.length > 0 && (
            <>
              <button
                onClick={() => setExpanded((e) => !e)}
                className={cn(voiceBtn(false), 'w-7 h-7')}
                title="展开/收起"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              <span className={cn(
                'text-xs text-center bg-black/40 rounded-lg px-1.5 py-0.5',
                speakingCount > 0 ? 'text-speaking' : 'text-muted-foreground'
              )}>
                {speakingCount > 0 && <Volume2 size={10} className="inline align-middle mr-0.5" />}{otherUsers.length + 1}人
              </span>
            </>
          )}
          {expanded && otherUsers.length > 0 && (
            <div className="bg-card/90 backdrop-blur-sm rounded-lg border border-white/10 p-2 flex flex-col gap-1.5 max-w-[160px]">
              {otherUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-1.5">
                  <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    speakingByUserId[user.id] ? 'bg-green-400' : 'bg-gray-500'
                  )} />
                  <span className="text-2xs text-foreground truncate flex-1">{user.name}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={peerVolumes.get(user.id) ?? 100}
                    onChange={(e) => setPeerVolume(user.id, Number(e.target.value))}
                    className="w-12 h-1 accent-primary"
                    title={`${user.name} 音量`}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {status === 'connecting' && (
        <span className="text-2xs text-muted-foreground text-center">连接中…</span>
      )}
      {status === 'reconnecting' && (
        <span className="text-2xs text-warning text-center">重连中…</span>
      )}
      {status === 'error' && (
        <span className="text-2xs text-error-text max-w-voice-error-max text-center">{connectError || '连接失败'}</span>
      )}
      {status !== 'idle' && status !== 'connected' && status !== 'error' && status !== 'connecting' && status !== 'reconnecting' && (
        <span className="text-2xs text-muted-foreground text-center">{status}</span>
      )}
    </div>
  );
}
