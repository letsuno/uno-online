import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardPaste,
  Music,
  Volume2,
  VolumeX,
  ArrowRight,
  BookOpen,
  Sparkles,
  Hash,
  Plus,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { useRoomStore } from '@/shared/stores/room-store';
import { useSettingsStore } from '@/shared/stores/settings-store';
import CardThemeModal from '../components/CardThemeModal';
import { getSocket, connectSocket } from '@/shared/socket';
import { Button } from '@/shared/components/ui/Button';
import { IconButton } from '@/shared/components/ui/IconButton';
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
import { clearSuspendedRoom, getSuspendedRoom, useSuspendedRoomStore } from '@/shared/stores/suspended-room-store';
import { resetClientRoomState } from '@/shared/stores/reset-room';
import { resolveCurrentRoom } from '../current-room-resolution';

function GameDuration({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsedTimer(startedAt);
  if (elapsed === null) return null;
  return <span>{formatElapsed(elapsed)}</span>;
}

export default function LobbyPage() {
  const setRoom = useRoomStore(s => s.setRoom);
  const { bgmEnabled, toggleBgm, cardTheme } = useSettingsStore();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const activeRooms = useLobbyStore(s => s.activeRooms);
  const songName = useBgm('lobby');
  const [musicHall, setMusicHall] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCardTheme, setShowCardTheme] = useState(false);
  const suspendedRoomCode = useSuspendedRoomStore(state => state.roomCode);
  const currentRoomCheckId = useRef(0);

  useEffect(() => {
    if (!localStorage.getItem('tutorialShown')) {
      setShowTutorial(true);
    }
  }, []);

  const checkCurrentRoom = useCallback(
    (returnToSuspendedRoom = false) => {
      const checkId = ++currentRoomCheckId.current;
      const suspendedAtRequest = getSuspendedRoom();
      connectSocket();
      getSocket().emit('user:current_room', res => {
        if (checkId !== currentRoomCheckId.current) return;
        const resolution = resolveCurrentRoom(
          suspendedAtRequest,
          getSuspendedRoom(),
          res.roomCode,
          returnToSuspendedRoom,
        );
        if (resolution.kind === 'ignore') return;
        if (resolution.kind === 'reset') {
          // This is an authoritative no-membership boundary. Do not leave an
          // old hand, spectator role, chat, join record, or voice session in
          // module stores for the next room/account to inherit.
          resetClientRoomState();
          return;
        }

        if (resolution.kind === 'suspended') {
          if (resolution.returnToGame) navigate(`/game/${resolution.roomCode}`);
          return;
        }

        if (resolution.clearPreviousSuspension && suspendedAtRequest) {
          clearSuspendedRoom(suspendedAtRequest);
        }
        navigate(`/room/${resolution.roomCode}`);
      });
    },
    [navigate],
  );

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    const checkRoom = () => checkCurrentRoom();
    const checkVisibleRoom = () => {
      if (document.visibilityState === 'visible') checkRoom();
    };

    if (socket.connected) checkRoom();
    socket.on('connect', checkRoom);
    window.addEventListener('focus', checkRoom);
    document.addEventListener('visibilitychange', checkVisibleRoom);
    return () => {
      currentRoomCheckId.current += 1;
      socket.off('connect', checkRoom);
      window.removeEventListener('focus', checkRoom);
      document.removeEventListener('visibilitychange', checkVisibleRoom);
    };
  }, [checkCurrentRoom]);

  const handleCreate = () => {
    if (suspendedRoomCode) return;
    setLoading(true);
    connectSocket();
    getSocket().emit('room:create', {}, res => {
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setRoom(res.roomCode, res.seats, res.spectators, res.room);
      navigate(`/room/${res.roomCode}`);
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
    if (suspendedRoomCode) return;
    const code = extractRoomCode(joinCode);
    if (code !== joinCode) setJoinCode(code);
    if (code.length !== 6) {
      setError('请输入 6 位房间码');
      return;
    }
    setLoading(true);
    connectSocket();
    getSocket().emit('room:join', code, res => {
      setLoading(false);
      if (res.success) {
        setRoom(code, res.seats, res.spectators, res.room);
        navigate(res.rejoin ? `/game/${code}` : `/room/${code}`);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <GamePageShell>
      {/* 顶栏控件（HUD，左上） */}
      <GameTopBar
        leftControls={
          <>
            <IconButton
              size="lg"
              onClick={toggleBgm}
              active={bgmEnabled}
              title={bgmEnabled ? '关闭背景音乐' : '开启背景音乐'}
            >
              {bgmEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </IconButton>
            <IconButton size="lg" onClick={() => setMusicHall(true)} title="音乐厅">
              <Music size={24} />
            </IconButton>
            <IconButton
              size="lg"
              onClick={() => setShowCardTheme(true)}
              active={cardTheme !== 'default'}
              title="卡面主题"
            >
              <Layers size={24} />
            </IconButton>
            <IconButton size="lg" onClick={() => setShowTutorial(true)} title="游戏教程">
              <BookOpen size={24} />
            </IconButton>
            <IconButton size="lg" onClick={openChangelog} title="更新日志">
              <Sparkles size={24} />
            </IconButton>
          </>
        }
      />

      {/* 中心内容——固定逻辑尺寸，整体等比缩放（游戏画布思路） */}
      <FitScaler
        align="center"
        maxScale={1}
        className="absolute left-5 right-5 portrait:left-[6%] portrait:right-[6%] top-[92px] bottom-[84px]"
      >
        <div className="flex flex-col items-center w-[760px] portrait:w-[440px]">
          {/* 品牌 */}
          <section className="text-center grid justify-items-center gap-3.5 mb-9 portrait:mb-7">
            <div
              className="flex items-center justify-center gap-7 portrait:gap-5 text-primary"
              style={{ textShadow: '0 0 26px rgba(246, 190, 62, 0.42)' }}
            >
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
            <div
              className="text-muted-foreground tracking-[0.72em] portrait:tracking-[0.45em] text-[18px] portrait:text-[15px]"
              style={{ textIndent: '0.72em' }}
            >
              ONLINE CARD GAME
            </div>
          </section>

          {/* 操作面板 */}
          <section className="glass-panel w-[760px] portrait:w-[440px] px-[70px] py-[60px] portrait:px-[28px] portrait:py-[44px]">
            {suspendedRoomCode && (
              <button
                type="button"
                onClick={() => checkCurrentRoom(true)}
                className="mb-5 flex w-full items-center justify-between rounded-panel border border-primary/40 bg-primary/10 px-5 py-4 text-left text-primary transition-colors hover:bg-primary/15"
              >
                <span>
                  <span className="block text-sm font-bold">正在托管房间 {suspendedRoomCode}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    你仍是该房间成员，返回时将同步服务端最新状态
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <RotateCcw size={17} />
                  返回对局
                </span>
              </button>
            )}
            <Button
              variant="game"
              size="lg"
              className="w-full h-[102px] text-[30px] tracking-[0.35em] flex items-center justify-center gap-[22px]"
              onClick={handleCreate}
              disabled={loading || !!suspendedRoomCode}
              sound="ready"
            >
              <Plus size={38} strokeWidth={2.5} />
              {loading ? '创建中...' : '创建房间'}
            </Button>

            {/* 分割线 */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[22px] my-[36px] text-muted-foreground tracking-[0.28em]">
              <div
                className="h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }}
              />
              <span>或加入房间</span>
              <div
                className="h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }}
              />
            </div>

            {/* 加入行 */}
            <div className="grid grid-cols-[minmax(0,1fr)_82px_82px] gap-[18px]">
              <label className="min-h-[74px] rounded-panel flex items-center gap-4 px-5 bg-[rgba(8,13,28,0.56)] border border-input text-foreground focus-within:border-primary/58 focus-within:shadow-input-focus transition-all">
                <Hash size={26} className="shrink-0 text-muted-foreground" />
                <input
                  value={joinCode}
                  onChange={e => {
                    setJoinCode(extractRoomCode(e.target.value));
                    setError('');
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder="房间码或链接"
                  maxLength={100}
                  className="min-w-0 flex-1 h-full border-0 outline-0 text-foreground bg-transparent uppercase tracking-[4px] text-base placeholder:text-muted-foreground/60 placeholder:tracking-normal placeholder:normal-case"
                />
              </label>
              <button
                onClick={handlePaste}
                className="min-h-[74px] rounded-panel grid place-items-center border border-input bg-secondary text-foreground/80 cursor-pointer transition-all hover:bg-white/[0.08] hover:text-foreground"
                title="从剪贴板粘贴"
              >
                <ClipboardPaste size={22} />
              </button>
              <button
                onClick={handleJoin}
                disabled={loading || !!suspendedRoomCode}
                className="min-h-[74px] rounded-panel grid place-items-center border border-primary/72 bg-primary/8 text-primary cursor-pointer transition-all shadow-[0_0_22px_rgba(246,190,62,0.16)] hover:bg-primary/14 hover:border-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                title="加入房间"
              >
                <ArrowRight size={28} />
              </button>
            </div>

            {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}

            {/* 进行中的对战（并入画布，任何分辨率随整体缩放可见） */}
            {activeRooms.length > 0 && (
              <div className="mt-[36px]">
                <div className="flex items-center gap-2.5 mb-3.5 px-1">
                  <span className="w-[9px] h-[9px] rounded-full bg-uno-green shadow-[0_0_10px_var(--color-uno-green)] animate-pulse" />
                  <span className="text-sm font-semibold text-muted-foreground">正在进行的对战</span>
                  <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2.5 py-0.5 rounded-xl">
                    {activeRooms.length} 场
                  </span>
                </div>
                <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto scrollbar-thin">
                  {activeRooms.map(room => (
                    <button
                      type="button"
                      key={room.roomCode}
                      disabled={!!suspendedRoomCode}
                      className="group w-full bg-secondary rounded-input p-3.5 text-left cursor-pointer transition-all border border-border hover:bg-white/[0.06] hover:border-primary/26 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-secondary disabled:hover:border-border"
                      title={suspendedRoomCode ? `请先返回房间 ${suspendedRoomCode}` : `观战房间 ${room.roomCode}`}
                      onClick={() => {
                        connectSocket();
                        navigate(`/game/${room.roomCode}`);
                      }}
                    >
                      <div className="text-sm font-semibold text-foreground">
                        {room.players.map(p => p.nickname).join(' vs ')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex justify-between items-center">
                        <span>
                          {room.playerCount} 人 · {room.spectatorCount} 人观战 ·{' '}
                          <GameDuration startedAt={room.gameStartedAt} />
                        </span>
                        <span className="text-primary text-xs font-semibold opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 group-disabled:opacity-0">
                          观战 ›
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </FitScaler>

      {/* 左下：服务器状态 */}
      <ServerStatusBar />

      {/* 右下：GitHub */}
      <a
        href="https://github.com/letsuno/uno-online"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-7 right-8 z-card flex items-center justify-center gap-2.5 h-[44px] px-[18px] rounded-full bg-secondary border border-border transition-all hover:bg-white/[0.07] text-foreground/85 text-sm font-medium no-underline backdrop-blur-[16px]"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="shrink-0">
          <path d="M12 .5A12 12 0 0 0 8.2 23.9c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.5 18.3 4.8 18.3 4.8c.6 1.6.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.5.4.9 1.1.9 2.2v4.1c0 .4.2.7.8.6A12 12 0 0 0 12 .5Z" />
        </svg>
        <span className="portrait:hidden">GitHub</span>
      </a>

      {/* 弹窗 */}
      <ServerSelectModal />
      <TutorialModal
        open={showTutorial}
        onClose={() => {
          setShowTutorial(false);
          localStorage.setItem('tutorialShown', 'true');
        }}
      />
      <BgmToast song={songName} />
      <MusicHallModal open={musicHall} onClose={() => setMusicHall(false)} currentScene="lobby" />
      <CardThemeModal open={showCardTheme} onClose={() => setShowCardTheme(false)} />
    </GamePageShell>
  );
}
