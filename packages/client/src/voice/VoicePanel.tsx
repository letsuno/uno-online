import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { VoiceClient } from './voice-client';
import { cn } from '@/lib/utils';

function checkVoiceSupport(): string | null {
  if (!navigator.mediaDevices?.getUserMedia) return '浏览器不支持麦克风';
  if (!window.RTCPeerConnection) return '浏览器不支持WebRTC';
  return null;
}

export default function VoicePanel() {
  const clientRef = useRef<VoiceClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [error, setError] = useState<string | null>(() => checkVoiceSupport());
  const [peerCount, setPeerCount] = useState(0);
  const [speakingCount, setSpeakingCount] = useState(0);
  const unsupported = checkVoiceSupport() !== null;

  useEffect(() => {
    return () => {
      clientRef.current?.leave().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      setPeerCount(clientRef.current?.getConnectedPeerIds().length ?? 0);
      setSpeakingCount(clientRef.current?.getSpeakingPeers().length ?? 0);
    }, 500);
    return () => clearInterval(id);
  }, [connected]);

  const joinVoice = useCallback(async () => {
    const supportErr = checkVoiceSupport();
    if (supportErr) { setError(supportErr); return; }
    setError(null);
    try {
      const client = new VoiceClient();
      client.onReconnectError((err) => {
        setError('语音重连失败: ' + err.message);
        setConnected(false);
        clientRef.current = null;
      });
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

  const voiceBtn = (active: boolean) => cn(
    'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm cursor-pointer text-foreground',
    active
      ? 'bg-[rgba(34,197,94,0.3)] border-[#22c55e]'
      : 'bg-[rgba(148,163,184,0.2)] border-[rgba(148,163,184,0.3)]'
  );

  return (
    <div className="fixed right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-50">
      {!connected ? (
        <button
          onClick={joinVoice}
          disabled={unsupported}
          className={cn(
            voiceBtn(false),
            unsupported && 'opacity-40 !cursor-not-allowed'
          )}
          title={unsupported ? (error ?? '不支持语音') : '加入语音'}
        >
          <Mic size={16} />
        </button>
      ) : (
        <>
          <button onClick={toggleMute} className={voiceBtn(!muted)} title={muted ? '取消静音' : '静音'}>
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button onClick={toggleSpeaker} className={voiceBtn(!speakerMuted)} title={speakerMuted ? '打开扬声器' : '关闭扬声器'}>
            {speakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={leaveVoice}
            className={cn(voiceBtn(false), 'bg-[rgba(239,68,68,0.3)] border-[#ef4444]')}
            title="退出语音"
          >
            <X size={16} />
          </button>
          {peerCount > 0 && (
            <span className={cn(
              'text-[10px] text-center bg-black/40 rounded-lg px-1.5 py-0.5',
              speakingCount > 0 ? 'text-[#22c55e]' : 'text-muted-foreground'
            )}>
              {speakingCount > 0 && <Volume2 size={10} className="inline align-middle mr-0.5" />}{peerCount + 1}人
            </span>
          )}
        </>
      )}
      {error && (
        <span className="text-[9px] text-[#ef4444] max-w-[60px] text-center">
          {error}
        </span>
      )}
    </div>
  );
}
