import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useGatewayStore } from './gateway-store';
import { canUseWebCodecsOpus } from './webcodecs-opus';
import {
  closeVoiceDecoders,
  decodeVoiceFrame,
  getVoiceEngine,
  leaveVoiceSession,
  releaseVoiceAudio,
} from './voice-runtime';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSocket } from '@/shared/socket';
import type { SocketResult } from '@uno-online/shared';

const MUMBLE_SERVER_ID = 'uno';
const VOICE_CHANNEL_REQUEST_TIMEOUT_MS = 8_000;

function toMumbleUsername(name: string | undefined): string {
  const cleaned = name
    ?.trim()
    .replace(/[^\p{L}\p{N}_ .-]/gu, '')
    .slice(0, 32);
  if (!cleaned) throw new Error('当前用户没有可用的语音昵称');
  return cleaned;
}

function requestVoiceChannel(signal: AbortSignal): Promise<SocketResult<{ voiceChannelId: number | null }>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Voice join was cancelled', 'AbortError'));
      return;
    }
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new DOMException('Voice join was cancelled', 'AbortError')));
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error('获取房间语音频道超时')));
    }, VOICE_CHANNEL_REQUEST_TIMEOUT_MS);
    signal.addEventListener('abort', onAbort, { once: true });
    getSocket().emit('voice:channel:get', result => {
      finish(() => resolve(result));
    });
  });
}

export default function VoicePanel() {
  const status = useGatewayStore(s => s.status);
  const usersById = useGatewayStore(s => s.usersById);
  const speakingByUserId = useGatewayStore(s => s.speakingByUserId);
  const selfUserId = useGatewayStore(s => s.selfUserId);
  const selectedChannelId = useGatewayStore(s => s.selectedChannelId);
  const connect = useGatewayStore(s => s.connect);
  const joinChannel = useGatewayStore(s => s.joinChannel);
  const setVoiceSink = useGatewayStore(s => s.setVoiceSink);
  const sendMicOpus = useGatewayStore(s => s.sendMicOpus);
  const sendMicEnd = useGatewayStore(s => s.sendMicEnd);
  const micEnabled = useGatewayStore(s => s.micEnabled);
  const speakerMuted = useGatewayStore(s => s.speakerMuted);
  const setMicEnabled = useGatewayStore(s => s.setMicEnabled);
  const setSpeakerMuted = useGatewayStore(s => s.setSpeakerMuted);
  const selfSpeaking = useGatewayStore(s => s.selfSpeaking);

  const connectError = useGatewayStore(s => s.connectError);

  const [expanded, setExpanded] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState<Map<number, number>>(new Map());
  const [joinBusy, setJoinBusy] = useState(false);
  const joinAbortRef = useRef<AbortController | null>(null);
  const [micBusy, setMicBusy] = useState(false);
  const [roomVoiceChannelId, setRoomVoiceChannelId] = useState<number | null>(null);
  const voiceName = useAuthStore(s => s.user?.nickname || s.user?.username);
  const selfId = useAuthStore(s => s.user?.id);
  const playerVoicePresence = useGatewayStore(s => s.playerVoicePresence);
  const selfForceMuted = selfId ? (playerVoicePresence[selfId]?.forceMuted ?? false) : false;

  const connected = status === 'connected';
  const unsupported = !canUseWebCodecsOpus();

  const emitPresence = useCallback(
    (presence: { inVoice: boolean; micEnabled: boolean; speakerMuted: boolean; speaking: boolean }) => {
      getSocket().emit('voice:presence', presence);
    },
    [],
  );

  useEffect(() => {
    if (!connected || roomVoiceChannelId == null || selectedChannelId === roomVoiceChannelId) return;
    joinChannel(roomVoiceChannelId);
  }, [connected, roomVoiceChannelId, selectedChannelId, joinChannel]);

  useEffect(() => {
    if (!connected) return;

    setVoiceSink(frame => {
      decodeVoiceFrame(frame.userId, frame.opus, sendMicOpus, sendMicEnd);
    });

    return () => {
      setVoiceSink(null);
      closeVoiceDecoders();
    };
  }, [connected, setVoiceSink, sendMicOpus, sendMicEnd]);

  const joinVoice = useCallback(async () => {
    if (unsupported) {
      useGatewayStore.getState().setError('当前浏览器不支持语音所需的 WebCodecs');
      return;
    }
    const controller = new AbortController();
    joinAbortRef.current?.abort();
    joinAbortRef.current = controller;
    useGatewayStore.getState().resetError();
    setJoinBusy(true);
    try {
      const result = await requestVoiceChannel(controller.signal);
      if (!result.success) throw new Error(result.error || '无法获取房间语音频道');
      if (result.voiceChannelId == null) throw new Error('房间语音频道尚未就绪');
      if (controller.signal.aborted) return;

      setRoomVoiceChannelId(result.voiceChannelId);
      const engine = getVoiceEngine(sendMicOpus, sendMicEnd);
      await engine.enableAudio();
      if (controller.signal.aborted) return;
      engine.setMuted(speakerMuted);
      connect({ serverId: MUMBLE_SERVER_ID, username: toMumbleUsername(voiceName) });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[voice] Failed to join voice', error);
      setRoomVoiceChannelId(null);
      releaseVoiceAudio();
      const store = useGatewayStore.getState();
      store.disconnect();
      store.setError('加入语音失败，请检查网络和浏览器音频权限');
    } finally {
      if (joinAbortRef.current === controller) {
        joinAbortRef.current = null;
        setJoinBusy(false);
      }
    }
  }, [unsupported, connect, voiceName, sendMicOpus, sendMicEnd, speakerMuted]);

  const leaveVoice = useCallback(() => {
    joinAbortRef.current?.abort();
    joinAbortRef.current = null;
    setJoinBusy(false);
    emitPresence({ inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
    setRoomVoiceChannelId(null);
    leaveVoiceSession();
  }, [emitPresence]);

  const toggleMic = useCallback(async () => {
    if (micBusy || selfForceMuted) return;
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
        emitPresence({
          inVoice: connected,
          micEnabled: engine.micEnabled,
          speakerMuted,
          speaking: engine.micEnabled ? selfSpeaking : false,
        });
      }
    } catch (error) {
      console.error('[voice] Failed to change microphone state', error);
      setRoomVoiceChannelId(null);
      emitPresence({ inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
      releaseVoiceAudio();
      const store = useGatewayStore.getState();
      store.disconnect();
      store.setError('无法启用麦克风，请检查浏览器权限和输入设备');
    } finally {
      setMicBusy(false);
    }
  }, [
    micBusy,
    selfForceMuted,
    micEnabled,
    sendMicOpus,
    sendMicEnd,
    setMicEnabled,
    emitPresence,
    connected,
    speakerMuted,
    selfSpeaking,
  ]);

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

  useEffect(() => {
    if (status !== 'error') return;
    setRoomVoiceChannelId(null);
    releaseVoiceAudio();
    setMicEnabled(false);
    setSpeakerMuted(false);
    useGatewayStore.getState().setSelfSpeaking(false);
    emitPresence({ inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
  }, [status, setMicEnabled, setSpeakerMuted, emitPresence]);

  useEffect(() => {
    if (!selfForceMuted || !connected || !micEnabled) return;
    const engine = getVoiceEngine(sendMicOpus, sendMicEnd);
    engine.disableMic();
    setMicEnabled(false);
    useGatewayStore.getState().setSelfSpeaking(false);
    emitPresence({ inVoice: true, micEnabled: false, speakerMuted, speaking: false });
  }, [selfForceMuted, connected, micEnabled, sendMicOpus, sendMicEnd, setMicEnabled, emitPresence, speakerMuted]);

  const setPeerVolume = useCallback(
    (userId: number, volume: number) => {
      setPeerVolumes(prev => {
        const next = new Map(prev);
        next.set(userId, volume);
        return next;
      });
      getVoiceEngine(sendMicOpus, sendMicEnd).setUserVolume(userId, volume / 100);
    },
    [sendMicOpus, sendMicEnd],
  );

  useEffect(() => {
    if (!connected) {
      if (peerVolumes.size > 0) setPeerVolumes(new Map());
      return;
    }
    const userIds = new Set(Object.keys(usersById).map(Number));
    const removedUserIds = [...peerVolumes.keys()].filter(userId => !userIds.has(userId));
    if (removedUserIds.length === 0) return;
    setPeerVolumes(prev => {
      const next = new Map(prev);
      for (const userId of removedUserIds) next.delete(userId);
      return next;
    });
    getVoiceEngine(sendMicOpus, sendMicEnd).resetUserVolumes(removedUserIds);
  }, [connected, usersById, peerVolumes, sendMicOpus, sendMicEnd]);

  const otherUsers = Object.values(usersById).filter(u => u.id !== selfUserId);
  const speakingCount = Object.values(speakingByUserId).filter(Boolean).length;

  const voiceBtn = (active: boolean, speaking = false) =>
    cn(
      'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm cursor-pointer text-foreground transition-all duration-150',
      active ? 'bg-voice-active border-voice-active-border' : 'bg-voice-inactive border-voice-inactive-border',
      speaking &&
        'scale-105 ring-2 ring-speaking/90 shadow-[0_0_0_6px_color-mix(in_srgb,var(--color-speaking)_18%,transparent),0_0_28px_color-mix(in_srgb,var(--color-speaking)_85%,transparent)]',
    );

  return (
    <div className="fixed right-3 bottom-4 flex max-w-[9rem] flex-col items-center gap-2 z-fab">
      {!connected ? (
        joinBusy || status === 'connecting' || status === 'reconnecting' ? (
          <button
            onClick={leaveVoice}
            className={cn(voiceBtn(false), 'bg-voice-leave border-voice-leave-border')}
            title="取消语音连接"
          >
            <X size={16} />
          </button>
        ) : (
          <button
            onClick={joinVoice}
            disabled={unsupported}
            className={cn(voiceBtn(false), unsupported && 'opacity-40 !cursor-not-allowed')}
            title={unsupported ? '浏览器不支持 WebCodecs' : '加入语音'}
          >
            <Mic size={16} />
          </button>
        )
      ) : (
        <>
          <button
            onClick={toggleMic}
            disabled={micBusy || selfForceMuted}
            className={cn(
              voiceBtn(micEnabled, micEnabled && selfSpeaking),
              (micBusy || selfForceMuted) && 'opacity-40 cursor-not-allowed',
            )}
            title={selfForceMuted ? '已被房主静音' : micEnabled ? '关闭麦克风' : '开启麦克风'}
          >
            {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button
            onClick={toggleMute}
            className={voiceBtn(!speakerMuted)}
            title={speakerMuted ? '打开扬声器' : '关闭扬声器'}
          >
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
              <button onClick={() => setExpanded(e => !e)} className={cn(voiceBtn(false), 'w-7 h-7')} title="展开/收起">
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              <span
                className={cn(
                  'text-xs text-center bg-background/60 rounded-lg px-1.5 py-0.5',
                  speakingCount > 0 ? 'text-speaking' : 'text-muted-foreground',
                )}
              >
                {speakingCount > 0 && <Volume2 size={10} className="inline align-middle mr-0.5" />}
                {otherUsers.length + 1}人
              </span>
            </>
          )}
          {expanded && otherUsers.length > 0 && (
            <div className="glass-panel-sm p-2 flex flex-col gap-1.5 max-w-[160px]">
              {otherUsers.map(user => (
                <div key={user.id} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      speakingByUserId[user.id] ? 'bg-speaking' : 'bg-muted-foreground',
                    )}
                  />
                  <span className="text-2xs text-foreground truncate flex-1">{user.name}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={peerVolumes.get(user.id) ?? 100}
                    onChange={e => setPeerVolume(user.id, Number(e.target.value))}
                    className="w-12 h-1 accent-primary"
                    title={`${user.name} 音量`}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {status === 'connecting' && <span className="text-2xs text-muted-foreground text-center">连接中…</span>}
      {status === 'reconnecting' && <span className="text-2xs text-primary text-center">重连中…</span>}
      {status === 'error' && (
        <span className="text-2xs text-error-text max-w-voice-error-max text-center">{connectError}</span>
      )}
    </div>
  );
}
