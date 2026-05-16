import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, ClipboardPaste, Music, Volume2, VolumeX, ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { useRoomStore } from '@/shared/stores/room-store';
import { SEAT_COUNT } from '@uno-online/shared';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { loadCardPack, clearCardPack, isPackLoaded } from '@/shared/utils/card-images';
import { getSocket, connectSocket } from '@/shared/socket';
import { Button } from '@/shared/components/ui/Button';
import { ServerSelectModal } from '@/shared/components/ServerSelectModal';
import { useBgm } from '@/shared/sound/useBgm';
import TutorialModal from '@/shared/components/TutorialModal';
import BgmToast from '@/shared/components/BgmToast';
import MusicHallModal from '@/shared/components/MusicHallModal';
import GamePageShell from '@/shared/components/GamePageShell';
import GameTopBar from '@/shared/components/GameTopBar';
import ServerStatusBar from '@/shared/components/ServerStatusBar';
import { openChangelog } from '@/shared/components/ChangelogModal';
import { useLobbyStore } from '../stores/lobby-store';

export default function LobbyPage() {
  const setRoom = useRoomStore((s) => s.setRoom);
  const { bgmEnabled, toggleBgm, cardImagePack, setCardImagePack } = useSettingsStore();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const activeRooms = useLobbyStore((s) => s.activeRooms);
  const songName = useBgm('lobby');
  const [musicHall, setMusicHall] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('tutorialShown')) {
      setShowTutorial(true);
    }
  }, []);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    let cancelled = false;
    const checkRoom = () => {
      socket.emit('user:current_room', (res) => {
        if (cancelled || !res.roomCode) return;
        localStorage.setItem('lastRoomCode', res.roomCode);
        navigate(`/room/${res.roomCode}`);
      });
    };
    if (socket.connected) checkRoom();
    else socket.once('connect', checkRoom);
    return () => {
      cancelled = true;
      socket.off('connect', checkRoom);
    };
  }, []);

  const handleCreate = () => {
    setLoading(true);
    connectSocket();
    getSocket().emit('room:create', {}, (res: any) => {
      setLoading(false);
      if (res.success && res.roomCode) {
        setRoom(res.roomCode, Array.from({ length: SEAT_COUNT }, () => null), [], res.room as any ?? { ownerId: '', status: 'waiting', settings: {} });
        navigate(`/room/${res.roomCode}`);
      }
    });
  };

  const extractRoomCode = (input: string): string => {
    const urlMatch = input.match(/\/(?:room|game)\/([A-Za-z0-9]{6})/);
    if (urlMatch) return urlMatch[1]!.toUpperCase();
    return input.trim().toUpperCase();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const code = extractRoomCode(text);
      setJoinCode(code);
      setError('');
    } catch {
      setError('无法读取剪贴板');
    }
  };

  const handleJoin = () => {
    const code = extractRoomCode(joinCode);
    if (code !== joinCode) setJoinCode(code);
    if (code.length !== 6) { setError('请输入 6 位房间码'); return; }
    setLoading(true);
    connectSocket();
    getSocket().emit('room:join', code, (res: any) => {
      setLoading(false);
      if (res.success) {
        setRoom(code, Array.from({ length: SEAT_COUNT }, () => null), [], res.room as any ?? { ownerId: '', status: 'waiting', settings: {} });
        navigate(res.rejoin ? `/game/${code}` : `/room/${code}`);
      } else {
        setError(res.error || '加入失败');
      }
    });
  };

  const ctrlIconBase =
    'w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-base cursor-pointer text-[#475569] transition-all hover:bg-white/[0.08] hover:text-[#94a3b8]';
  const ctrlIconActive =
    'text-[#fbbf24] bg-[rgba(251,191,36,0.08)] border-[rgba(251,191,36,0.15)]';

  return (
    <GamePageShell>
      {/* Top bar */}
      <GameTopBar
        leftControls={
          <>
            {/* Music toggle */}
            <button
              onClick={toggleBgm}
              className={`${ctrlIconBase} ${bgmEnabled ? ctrlIconActive : ''}`}
              title={bgmEnabled ? '关闭背景音乐' : '开启背景音乐'}
            >
              {bgmEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Music hall */}
            <button
              onClick={() => setMusicHall(true)}
              className={ctrlIconBase}
              title="音乐厅"
            >
              <Music size={16} />
            </button>

            {/* Card pack */}
            {cardImagePack && isPackLoaded() ? (
              <button
                onClick={() => { clearCardPack(); setCardImagePack(false); }}
                className={ctrlIconBase}
                title="卸载资源包"
              >
                <X size={16} />
              </button>
            ) : (
              <label className={`${ctrlIconBase}`} title="加载卡面资源包">
                <Upload size={16} />
                <input
                  type="file"
                  accept=".zip"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await loadCardPack(file);
                      setCardImagePack(true);
                    } catch {
                      setCardImagePack(false);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            )}

            {/* Tutorial */}
            <button
              onClick={() => setShowTutorial(true)}
              className={ctrlIconBase}
              title="游戏教程"
            >
              <BookOpen size={16} />
            </button>

            {/* Changelog */}
            <button
              onClick={openChangelog}
              className={ctrlIconBase}
              title="更新日志"
            >
              <Sparkles size={16} />
            </button>
          </>
        }
      />

      {/* Center content */}
      <div className="flex flex-col items-center justify-center relative z-[1]">
        {/* Brand */}
        <div className="text-center mb-16">
          <h1
            className="font-game text-[88px] font-black text-primary tracking-[10px]"
            style={{ textShadow: '5px 6px 0px rgba(0,0,0,0.3), 0 0 80px rgba(251,191,36,0.1)' }}
          >
            &#9824; UNO
          </h1>
          <div className="text-[15px] text-[#3e4a63] tracking-[8px] font-medium mt-3">
            ONLINE CARD GAME
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-[22px] w-[440px] max-w-[90vw]">
          {/* Create room */}
          <Button
            variant="game"
            size="lg"
            className="w-full tracking-[6px] text-2xl py-6"
            onClick={handleCreate}
            disabled={loading}
            sound="ready"
          >
            {loading ? '创建中...' : '创 建 房 间'}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-4 w-full">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />
            <span className="text-[13px] text-[#3e4a63] tracking-[2px]">或加入房间</span>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />
          </div>

          {/* Join row */}
          <div className="flex gap-2.5 w-full">
            <input
              value={joinCode}
              onChange={(e) => { setJoinCode(extractRoomCode(e.target.value)); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="房间码或链接"
              maxLength={100}
              className="glass-input flex-1 text-center uppercase tracking-[5px] text-lg"
            />
            <button
              onClick={handlePaste}
              className="w-[58px] flex-shrink-0 border border-white/[0.08] rounded-[18px] bg-white/[0.04] text-[#475569] text-[22px] cursor-pointer transition-all flex items-center justify-center hover:bg-white/[0.08] hover:text-[#94a3b8] hover:border-white/[0.12]"
              title="从剪贴板粘贴"
            >
              <ClipboardPaste size={20} />
            </button>
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-[62px] flex-shrink-0 border border-[rgba(251,191,36,0.2)] rounded-[18px] bg-[rgba(251,191,36,0.08)] text-[#fbbf24] text-2xl cursor-pointer transition-all flex items-center justify-center hover:bg-[rgba(251,191,36,0.15)] hover:border-[rgba(251,191,36,0.35)] hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
              title="加入房间"
            >
              <ArrowRight size={22} />
            </button>
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
      </div>

      {/* Floating live games panel */}
      {activeRooms.length > 0 && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-[280px] glass-panel p-5 z-[5]">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-4 px-1">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.4)] animate-pulse" />
            <span className="text-sm font-semibold text-[#94a3b8]">正在进行的对战</span>
            <span className="ml-auto text-xs text-[#475569] bg-white/[0.04] px-2.5 py-0.5 rounded-xl">
              {activeRooms.length} 场
            </span>
          </div>
          {/* List */}
          <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto">
            {activeRooms.map((room) => (
              <div
                key={room.roomCode}
                className="group bg-white/[0.03] rounded-[14px] p-3.5 cursor-pointer transition-all border border-transparent hover:bg-white/[0.06] hover:border-[rgba(251,191,36,0.1)]"
                onClick={() => {
                  connectSocket();
                  getSocket().emit('room:spectate', room.roomCode, (res: any) => {
                    if (res.success) navigate(`/game/${room.roomCode}?spectate=true`);
                    else {
                      setError(res.error || '无法观战');
                    }
                  });
                }}
              >
                <div className="text-sm font-semibold text-[#cbd5e1]">
                  {room.players.map(p => p.nickname).join(' vs ')}
                </div>
                <div className="text-xs text-[#475569] mt-1 flex justify-between items-center">
                  <span>{room.playerCount} 人 · {room.spectatorCount} 人观战</span>
                  <span className="text-[#fbbf24] text-xs font-semibold opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                    观战 ›
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom left: server status */}
      <ServerStatusBar />

      {/* Bottom right: GitHub */}
      <a
        href="https://github.com/letsuno/uno-online"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-6 right-8 z-[5] flex items-center gap-2 px-3.5 py-2 rounded-[14px] bg-white/[0.02] border border-white/[0.04] transition-all hover:bg-white/[0.04] hover:border-white/[0.08] text-[#64748b] hover:text-[#94a3b8] text-xs font-medium"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
        GitHub
      </a>

      {/* Modals */}
      <ServerSelectModal />
      <TutorialModal open={showTutorial} onClose={() => { setShowTutorial(false); localStorage.setItem('tutorialShown', 'true'); }} />
      <BgmToast song={songName} />
      <MusicHallModal open={musicHall} onClose={() => setMusicHall(false)} currentScene="lobby" />
    </GamePageShell>
  );
}
