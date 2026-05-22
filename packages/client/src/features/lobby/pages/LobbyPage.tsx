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
import FitScaler from '@/shared/components/FitScaler';
import ServerStatusBar from '@/shared/components/ServerStatusBar';
import { openChangelog } from '@/shared/components/ChangelogModal';
import { useLobbyStore } from '../stores/lobby-store';
import { useElapsedTimer, formatElapsed } from '@/features/game/hooks/useElapsedTimer';

function GameDuration({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsedTimer(startedAt);
  if (elapsed === null) return null;
  return <span>{formatElapsed(elapsed)}</span>;
}

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
      if (cancelled) return;
      socket.emit('user:current_room', (res) => {
        if (cancelled || !res.roomCode) return;
        localStorage.setItem('lastRoomCode', res.roomCode);
        navigate(`/room/${res.roomCode}`);
      });
    };
    if (socket.connected) checkRoom();
    socket.on('connect', checkRoom);
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
        setRoom(code, res.seats ?? Array.from({ length: SEAT_COUNT }, () => null), res.spectators ?? [], res.room as any ?? { ownerId: '', status: 'waiting', settings: {} });
        navigate(res.rejoin ? `/game/${code}` : `/room/${code}`);
      } else {
        setError(res.error || '加入失败');
      }
    });
  };

  const ctrlIconBase =
    'w-14 h-14 max-sm:w-12 max-sm:h-12 shrink-0 rounded-[18px] max-sm:rounded-[14px] bg-white/[0.045] border border-white/[0.12] flex items-center justify-center cursor-pointer text-[#c7d0ec] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_22px_rgba(0,0,0,0.26)] hover:text-[var(--gold)] hover:border-[rgba(246,190,62,0.46)] hover:shadow-[0_0_24px_rgba(246,190,62,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]';
  const ctrlIconActive =
    'text-[var(--gold)] border-[rgba(246,190,62,0.46)] shadow-[0_0_24px_rgba(246,190,62,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]';
  const ctrlHideMobile = 'max-sm:hidden';

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
              {bgmEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>

            {/* Music hall */}
            <button
              onClick={() => setMusicHall(true)}
              className={ctrlIconBase}
              title="音乐厅"
            >
              <Music size={24} />
            </button>

            {/* Card pack (hidden on mobile — file picker is impractical there) */}
            {cardImagePack && isPackLoaded() ? (
              <button
                onClick={() => { clearCardPack(); setCardImagePack(false); }}
                className={`${ctrlIconBase} ${ctrlHideMobile}`}
                title="卸载资源包"
              >
                <X size={24} />
              </button>
            ) : (
              <label className={`${ctrlIconBase} ${ctrlHideMobile}`} title="加载卡面资源包">
                <Upload size={24} />
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
              <BookOpen size={24} />
            </button>

            {/* Changelog */}
            <button
              onClick={openChangelog}
              className={ctrlIconBase}
              title="更新日志"
            >
              <Sparkles size={24} />
            </button>
          </>
        }
      />

      {/* Center content — fixed logical layout, scaled to always fit (game-style canvas) */}
      <FitScaler align="center" maxScale={0.8} className="absolute left-5 right-5 portrait:left-[6%] portrait:right-[6%] top-[92px] bottom-[84px] z-[2]">
        <div className="flex flex-col items-center w-[760px] portrait:w-[440px]">
          {/* Brand */}
          <section className="text-center grid justify-items-center gap-3.5 mb-9 portrait:mb-7">
            <div className="flex items-center justify-center gap-7 portrait:gap-5" style={{ color: 'var(--gold)', textShadow: '0 0 26px rgba(246, 190, 62, 0.42)' }}>
              <span className="text-[120px] portrait:text-[74px] leading-none">♠</span>
              <span
                className="text-[120px] portrait:text-[74px] font-black leading-[0.9] tracking-[0.03em]"
                style={{
                  background: 'linear-gradient(180deg, var(--gold-2), var(--gold) 55%, var(--gold-3))',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                UNO
              </span>
            </div>
            <div
              className="h-px w-[520px] portrait:w-[300px] shadow-[0_0_16px_rgba(246,190,62,0.55)]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.52), transparent)' }}
            />
            <div className="text-[#7f89a8] tracking-[0.72em] portrait:tracking-[0.45em] text-[18px] portrait:text-[15px]" style={{ textIndent: '0.72em' }}>
              ONLINE CARD GAME
            </div>
          </section>

          {/* Glass panel actions */}
          <section className="glass-panel w-[760px] portrait:w-[440px] rounded-[34px] portrait:rounded-[28px] px-[70px] py-[60px] portrait:px-[28px] portrait:py-[44px]">
            {/* Create room */}
            <Button
              variant="game"
              size="lg"
              className="w-full h-[102px] text-[30px] tracking-[0.35em] flex items-center justify-center gap-[22px]"
              onClick={handleCreate}
              disabled={loading}
              sound="ready"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-[38px] h-[38px]" strokeWidth={2}><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              {loading ? '创建中...' : '创建房间'}
            </Button>

            {/* Divider */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[22px] my-[36px] text-[#c6cee4] tracking-[0.28em]">
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
              <span>或加入房间</span>
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
            </div>

            {/* Join row */}
            <div className="grid grid-cols-[minmax(0,1fr)_82px_82px] gap-[18px]">
              <label className="min-h-[74px] rounded-[20px] flex items-center gap-4 px-5 bg-[rgba(8,13,28,0.56)] border border-white/[0.13] text-[#d7def1] focus-within:border-[rgba(246,190,62,0.58)] focus-within:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0 text-[#d7def1]"><path d="M10 3 8 21"/><path d="M16 3l-2 18"/><path d="M4 9h17"/><path d="M3 15h17"/></svg>
                <input
                  value={joinCode}
                  onChange={(e) => { setJoinCode(extractRoomCode(e.target.value)); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="房间码或链接"
                  maxLength={100}
                  className="min-w-0 flex-1 h-full border-0 outline-0 text-foreground bg-transparent uppercase tracking-[4px] text-base placeholder:text-[rgba(210,218,240,0.42)] placeholder:tracking-normal placeholder:normal-case"
                />
              </label>
              <button
                onClick={handlePaste}
                className="min-h-[74px] rounded-[20px] grid place-items-center border border-white/[0.13] bg-white/[0.045] text-[#cbd5ef] cursor-pointer transition-all hover:bg-white/[0.08] hover:text-[#dbe3f8]"
                title="从剪贴板粘贴"
              >
                <ClipboardPaste size={22} />
              </button>
              <button
                onClick={handleJoin}
                disabled={loading}
                className="min-h-[74px] rounded-[20px] grid place-items-center border border-[rgba(246,190,62,0.72)] bg-[rgba(246,190,62,0.08)] text-[var(--gold)] cursor-pointer transition-all shadow-[0_0_22px_rgba(246,190,62,0.16)] hover:bg-[rgba(246,190,62,0.14)] hover:border-[rgba(246,190,62,0.9)] disabled:opacity-50 disabled:cursor-not-allowed"
                title="加入房间"
              >
                <ArrowRight size={28} />
              </button>
            </div>

            {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
          </section>
        </div>
      </FitScaler>

      {/* Floating live games panel */}
      {activeRooms.length > 0 && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-[280px] glass-panel p-5 z-[5] hidden xl:block">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-4 px-1">
            <span className="w-[9px] h-[9px] rounded-full bg-[#4dff73] shadow-[0_0_10px_#4dff73] animate-pulse" />
            <span className="text-sm font-semibold text-[#8b95b3]">正在进行的对战</span>
            <span className="ml-auto text-xs text-[#8b95b3] bg-white/[0.04] px-2.5 py-0.5 rounded-xl">
              {activeRooms.length} 场
            </span>
          </div>
          {/* List */}
          <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto scrollbar-thin">
            {activeRooms.map((room) => (
              <div
                key={room.roomCode}
                className="group bg-white/[0.035] rounded-[16px] p-3.5 cursor-pointer transition-all border border-white/[0.10] hover:bg-white/[0.06] hover:border-[rgba(246,190,62,0.26)]"
                onClick={() => {
                  connectSocket();
                  navigate(`/game/${room.roomCode}`);
                }}
              >
                <div className="text-sm font-semibold text-[#eaf0ff]">
                  {room.players.map(p => p.nickname).join(' vs ')}
                </div>
                <div className="text-xs text-[#8b95b3] mt-1 flex justify-between items-center">
                  <span>{room.playerCount} 人 · {room.spectatorCount} 人观战 · <GameDuration startedAt={room.gameStartedAt} /></span>
                  <span className="text-[var(--gold)] text-xs font-semibold opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0">
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
        className="absolute bottom-7 max-sm:bottom-5 right-8 max-sm:right-5 z-[5] flex items-center justify-center gap-2.5 h-[44px] max-sm:h-[38px] px-[18px] max-sm:px-0 max-sm:w-[38px] rounded-full bg-white/[0.045] border border-white/[0.12] transition-all hover:bg-white/[0.07] hover:border-white/[0.18] text-[#dbe3f8] text-sm font-medium no-underline backdrop-blur-[16px] shadow-[0_16px_40px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="shrink-0"><path d="M12 .5A12 12 0 0 0 8.2 23.9c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.5 18.3 4.8 18.3 4.8c.6 1.6.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.5.4.9 1.1.9 2.2v4.1c0 .4.2.7.8.6A12 12 0 0 0 12 .5Z"/></svg>
        <span className="max-sm:hidden">GitHub</span>
      </a>

      {/* Modals */}
      <ServerSelectModal />
      <TutorialModal open={showTutorial} onClose={() => { setShowTutorial(false); localStorage.setItem('tutorialShown', 'true'); }} />
      <BgmToast song={songName} />
      <MusicHallModal open={musicHall} onClose={() => setMusicHall(false)} currentScene="lobby" />
    </GamePageShell>
  );
}
