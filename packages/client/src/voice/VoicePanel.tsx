import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { VoiceClient } from './voice-client.js';

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
        <button onClick={joinVoice} disabled={unsupported} style={{
          ...btnStyle(false),
          ...(unsupported ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        }} title={unsupported ? (error ?? '不支持语音') : '加入语音'}>
          <Mic size={16} />
        </button>
      ) : (
        <>
          <button onClick={toggleMute} style={btnStyle(!muted)} title={muted ? '取消静音' : '静音'}>
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button onClick={toggleSpeaker} style={btnStyle(!speakerMuted)} title={speakerMuted ? '打开扬声器' : '关闭扬声器'}>
            {speakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button onClick={leaveVoice} style={{
            ...btnStyle(false),
            background: 'rgba(239,68,68,0.3)',
            borderColor: '#ef4444',
          }} title="退出语音">
            <X size={16} />
          </button>
          {peerCount > 0 && (
            <span style={{
              fontSize: 10, color: speakingCount > 0 ? '#22c55e' : 'var(--text-secondary)', textAlign: 'center',
              background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: '2px 6px',
            }}>
              {speakingCount > 0 && <Volume2 size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />}{peerCount + 1}人
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
