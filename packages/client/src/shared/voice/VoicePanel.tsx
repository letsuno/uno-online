import { useState, useCallback, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useGatewayStore } from './gateway-store';
import { canUseWebCodecsOpus } from './webcodecs-opus';
import { closeVoiceDecoders, decodeVoiceFrame, getVoiceEngine, leaveVoiceSession } from './voice-runtime';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSocket } from '@/shared/socket';

const MUMBLE_SERVER_ID = 'uno';

function toMumbleUsername(name: string | undefined): string {
  const cleaned = name?.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32);
  return cleaned || `player_${Date.now()}`;
}

export default function VoicePanel() {
  const status = useGatewayStore((s) => s.status);
  const gatewayStatus = useGatewayStore((s) => s.gatewayStatus);
  const usersById = useGatewayStore((s) => s.usersById);
  const speakingByUserId = useGatewayStore((s) => s.speakingByUserId);
  const selfUserId = useGatewayStore((s) => s.selfUserId);
  const init = useGatewayStore((s) => s.init);
  const connect = useGatewayStore((s) => s.connect);
  const setVoiceSink = useGatewayStore((s) => s.setVoiceSink);
  const sendMicOpus = useGatewayStore((s) => s.sendMicOpus);
  const sendMicEnd = useGatewayStore((s) => s.sendMicEnd);
  const micEnabled = useGatewayStore((s) => s.micEnabled);
  const speakerMuted = useGatewayStore((s) => s.speakerMuted);
  const setMicEnabled = useGatewayStore((s) => s.setMicEnabled);
  const setSpeakerMuted = useGatewayStore((s) => s.setSpeakerMuted);
  const selfSpeaking = useGatewayStore((s) => s.selfSpeaking);

  const connectError = useGatewayStore((s) => s.connectError);

  const [expanded, setExpanded] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState<Map<number, number>>(new Map());
  const [micBusy, setMicBusy] = useState(false);
  const voiceName = useAuthStore((s) => s.user?.nickname || s.user?.username);

  const connected = status === 'connected';
  const unsupported = !canUseWebCodecsOpus();

  const emitPresence = useCallback((presence: { inVoice: boolean; micEnabled: boolean; speakerMuted: boolean; speaking: boolean }) => {
    getSocket().emit('voice:presence', presence);
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!connected) return;

    setVoiceSink((frame) => {
      decodeVoiceFrame(frame.userId, frame.opus, sendMicOpus, sendMicEnd);
    });

    return () => {
      setVoiceSink(null);
      closeVoiceDecoders();
    };
  }, [connected, setVoiceSink, sendMicOpus, sendMicEnd]);

  const joinVoice = useCallback(async () => {
    if (unsupported) {
      console.warn('[voice] WebCodecs not supported');
      return;
    }
    console.log('[voice] joining voice, gateway status:', gatewayStatus, 'status:', status);
    const engine = getVoiceEngine(sendMicOpus, sendMicEnd);
    await engine.enableAudio();
    engine.setMuted(speakerMuted);
    connect({ serverId: MUMBLE_SERVER_ID, username: toMumbleUsername(voiceName) });
  }, [unsupported, connect, gatewayStatus, status, voiceName, sendMicOpus, sendMicEnd, speakerMuted]);

  const leaveVoice = useCallback(() => {
    emitPresence({ inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
    leaveVoiceSession();
  }, [emitPresence]);

  const toggleMic = useCallback(async () => {
    if (micBusy) return;
    setMicBusy(true);
    const engine = getVoiceEngine(sendMicOpus, sendMicEnd);
    try {
      if (micEnabled) {
        engine.disableMic();
        setMicEnabled(false);
        useGatewayStore.getState().setSelfSpeaking(false);
        emitPresence({ inVoice: connected, micEnabled: false, speakerMuted, speaking: false });
      } else {
        await engine.enableMic();
        setMicEnabled(engine.micEnabled);
        emitPresence({ inVoice: connected, micEnabled: engine.micEnabled, speakerMuted, speaking: engine.micEnabled ? selfSpeaking : false });
      }
    } finally {
      setMicBusy(false);
    }
  }, [micBusy, micEnabled, sendMicOpus, sendMicEnd, setMicEnabled, emitPresence, connected, speakerMuted, selfSpeaking]);

  const toggleMute = useCallback(() => {
    const engine = getVoiceEngine(sendMicOpus, sendMicEnd);
    const next = !speakerMuted;
    engine.setMuted(next);
    setSpeakerMuted(next);
    emitPresence({ inVoice: connected, micEnabled, speakerMuted: next, speaking: selfSpeaking });
  }, [speakerMuted, sendMicOpus, sendMicEnd, setSpeakerMuted, emitPresence, connected, micEnabled, selfSpeaking]);

  useEffect(() => {
    if (!connected) return;
    emitPresence({ inVoice: true, micEnabled, speakerMuted, speaking: selfSpeaking });
  }, [connected, micEnabled, speakerMuted, selfSpeaking, emitPresence]);

  const setPeerVolume = useCallback((userId: number, volume: number) => {
    setPeerVolumes((prev) => {
      const next = new Map(prev);
      next.set(userId, volume);
      return next;
    });
  }, []);

  const otherUsers = Object.values(usersById).filter((u) => u.id !== selfUserId);
  const speakingCount = Object.values(speakingByUserId).filter(Boolean).length;

  const voiceBtn = (active: boolean, speaking = false) => cn(
    'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm cursor-pointer text-foreground transition-all duration-150',
    active
      ? 'bg-voice-active border-voice-active-border'
      : 'bg-voice-inactive border-voice-inactive-border',
    speaking && 'scale-105 ring-2 ring-green-300/90 shadow-[0_0_0_6px_rgba(34,197,94,0.18),0_0_28px_rgba(34,197,94,0.85)]'
  );

  return (
    <div className="fixed right-3 bottom-4 flex max-w-[9rem] flex-col items-center gap-2 z-fab">
      {!connected ? (
        <button
          onClick={joinVoice}
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
          <button onClick={toggleMic} disabled={micBusy} className={cn(voiceBtn(micEnabled, micEnabled && selfSpeaking), micBusy && 'opacity-70 cursor-wait')} title={micEnabled ? '关闭麦克风' : '开启麦克风'}>
            {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button onClick={toggleMute} className={voiceBtn(!speakerMuted)} title={speakerMuted ? '打开扬声器' : '关闭扬声器'}>
            {speakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
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
