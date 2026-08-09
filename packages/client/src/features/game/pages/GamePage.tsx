import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Eye, LogOut, UserPlus, X } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { useGameSocket } from '../hooks/useGameSocket';
import { useGameLogTracker } from '../hooks/useGameLogTracker';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useGameActions } from '../hooks/useGameActions';
import { useGameHotkeys } from '../hooks/useGameHotkeys';
import { playSound } from '@/shared/sound/sound-manager';
import { useBgm } from '@/shared/sound/useBgm';
import BgmToast from '@/shared/components/BgmToast';
import { getSocket, connectSocket, refreshVoicePresence } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { useSuspendGame } from '../hooks/useSuspendGame';
import GameHUD from '../components/GameHUD';
import GameTable from '../components/GameTable';
import GameActions from '../components/GameActions';
import PlayerHand from '../components/PlayerHand';
import ColorPicker from '../components/ColorPicker';
import ScoreBoard from '../components/ScoreBoard';
import VoicePanel from '@/shared/voice/VoicePanel';
import GameEffects from '../components/GameEffects';
import ViewportFxLayer from '../fx/ViewportFxLayer';
import Confetti from '../components/Confetti';
import InfoDrawer from '../components/InfoDrawer';
import PlayerListPanel from '../components/PlayerListPanel';
import DanmakuLayer from '../components/DanmakuLayer';
import AntiCheatToast from '../components/AntiCheatToast';
import GameStartRulesModal from '../components/GameStartRulesModal';
import ColorWave from '../components/ColorWave';
import HotkeySettingsModal from '../components/HotkeySettingsModal';
import OwnerTransferBanner from '../components/OwnerTransferBanner';
import AutopilotOverlay from '../components/AutopilotOverlay';
import MobileMenuSheet from '../components/MobileMenuSheet';
import MobileGameScreen from '../components/mobile/MobileGameScreen';
import SpectatorActions from '../components/SpectatorActions';
import SpectatorView from '../components/mobile/SpectatorView';
import MobileHand from '../components/mobile/MobileHand';
import InfoSheet from '../components/mobile/InfoSheet';
import { useGameLayoutMode, useShortLandscape } from '../hooks/useGameLayoutMode';
import FitScaler from '@/shared/components/FitScaler';
import EndRevealBanner from '../components/EndRevealBanner';
import { useRoomStore } from '@/shared/stores/room-store';
import { showConfirm } from '@/shared/stores/confirm-store';
import { useSpectatorQueue } from '../hooks/useSpectatorQueue';

/** 终局展示窗时长：最后一张牌打出后保留牌桌的秒数（与结算板 10s 开局冷却完全重叠，不拖慢节奏） */
const END_REVEAL_S = 10;

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const phase = useGameStore(s => s.phase);
  const roundNumber = useGameStore(s => s.roundNumber);
  const settings = useGameStore(s => s.settings);
  const toggleInfoDrawer = useGameStore(s => s.toggleInfoDrawer);
  const openInfoDrawer = useGameStore(s => s.openInfoDrawer);
  const backToLobby = useSuspendGame();

  const isSpectator = useGameStore(s => s.isSpectator);
  const setSpectator = useGameStore(s => s.setSpectator);
  const players = useGameStore(s => s.players);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore(s => s.room?.ownerId);
  const isHost = ownerId === userId;
  const myAutopilot = players.find(p => p.id === userId)?.autopilot ?? false;
  const isMyTurn = useIsMyTurn();
  const noop = () => {};
  const needsColorPick = phase === 'choosing_color' && isMyTurn && !myAutopilot;

  // 终局展示窗：现场经历"对局 → 终局"切换时，先保留牌桌若干秒再进结算板；
  // 中途加入/刷新（prev 不是对局中 phase）则直接显示结算板。
  const revealLeft = useGameStore(s => s.endRevealLeft);
  const setEndRevealLeft = useGameStore(s => s.setEndRevealLeft);
  const prevPhaseRef = useRef<typeof phase>(null);
  const isEndPhase = phase === 'round_end' || phase === 'game_over';

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    const isEnd = phase === 'round_end' || phase === 'game_over';
    const wasInGame =
      prev === 'playing' || prev === 'challenging' || prev === 'choosing_color' || prev === 'choosing_swap_target';
    if (isEnd && wasInGame) {
      setEndRevealLeft(END_REVEAL_S);
      const interval = window.setInterval(() => {
        const left = Math.max(0, useGameStore.getState().endRevealLeft - 1);
        setEndRevealLeft(left);
        if (left <= 0) window.clearInterval(interval);
      }, 1000);
      return () => window.clearInterval(interval);
    }
  }, [phase, setEndRevealLeft]);

  const endRevealing = isEndPhase && revealLeft > 0;
  const showScoreBoard = isEndPhase && !endRevealing;

  const { connectionStatus, rejoinError, retryRejoin } = useGameSocket(roomCode);

  const confirmAndLeave = async () => {
    const confirmed = isSpectator
      ? await showConfirm({
          title: '退出房间',
          message: isHost
            ? '退出后你将离开观战席，房主权会转让；该观战席不会保留。'
            : '退出后你将离开观战席，该观战席不会保留。',
          confirmText: '退出',
        })
      : isHost
        ? await showConfirm({
            title: '返回大厅并托管',
            message: '离开后将立即断开并由系统托管，房主权会转让；你可以从大厅返回。',
            confirmText: '返回大厅',
          })
        : await showConfirm({
            title: '返回大厅并托管',
            message: '离开后将立即断开并由系统托管，你可以从大厅返回当前对局。',
            confirmText: '返回大厅',
          });
    if (confirmed) backToLobby();
  };

  useEffect(() => {
    const socket = getSocket();
    const handleBackToRoom = () => {
      navigate(`/room/${roomCode}`);
    };
    socket.on('game:back_to_room', handleBackToRoom);
    return () => {
      socket.off('game:back_to_room', handleBackToRoom);
    };
  }, [roomCode, navigate]);

  useGameLogTracker();
  const bgmSongName = useBgm('game');
  // 布局模式：strip（竖屏/短屏：玩家条 + 中央牌区），table（横屏：椭圆牌桌）
  const mode = useGameLayoutMode();
  // 短横屏（横握手机）：操作按钮悬浮不占布局高度
  const shortLandscape = useShortLandscape();
  const [showStartRules, setShowStartRules] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileInfo, setShowMobileInfo] = useState(false);
  const shownStartRulesRef = useRef<string | null>(null);
  const [antiCheatKey, setAntiCheatKey] = useState<string | null>(null);
  const shownAntiCheatRef = useRef<string | null>(null);

  useEffect(() => {
    refreshVoicePresence();
  }, []);

  useEffect(() => {
    if (!roomCode || !settings || roundNumber !== 1) return;
    if (
      phase !== 'playing' &&
      phase !== 'challenging' &&
      phase !== 'choosing_color' &&
      phase !== 'choosing_swap_target'
    )
      return;

    const key = `${roomCode}:round-${roundNumber}`;
    if (shownStartRulesRef.current === key) return;
    shownStartRulesRef.current = key;
    openInfoDrawer('rules');
    setShowStartRules(true);
  }, [roomCode, settings, roundNumber, phase, openInfoDrawer]);

  useEffect(() => {
    if (!roomCode || roundNumber !== 1) return;
    if (
      phase !== 'playing' &&
      phase !== 'challenging' &&
      phase !== 'choosing_color' &&
      phase !== 'choosing_swap_target'
    )
      return;
    const key = `${roomCode}:ac`;
    if (shownAntiCheatRef.current === key) return;
    shownAntiCheatRef.current = key;
    setAntiCheatKey(key);
  }, [roomCode, roundNumber, phase]);

  const {
    playCard,
    drawCard,
    chooseColor,
    callUno,
    catchUno,
    challenge,
    accept,
    pass,
    swapTarget,
    playAgain,
    backToRoom,
    kickPlayer,
    leaveToSpectate,
  } = useGameActions();

  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('spectate') === 'true') {
      setSpectator(true);
    }
  }, [searchParams, setSpectator]);

  // Turn banner state
  const [showTurnBanner, setShowTurnBanner] = useState(false);
  const prevTurnRef = useRef(false);

  useEffect(() => {
    if (isMyTurn && phase === 'playing' && !prevTurnRef.current) {
      playSound('your_turn');
      setShowTurnBanner(true);
      const timer = window.setTimeout(() => setShowTurnBanner(false), 1600);
      return () => window.clearTimeout(timer);
    }
    prevTurnRef.current = isMyTurn && phase === 'playing';
  }, [isMyTurn, phase]);

  useGameHotkeys({
    autopilot_once: () => {
      getSocket().emit('game:autopilot_once', res => {
        if (!res.success) useToastStore.getState().addToast(res.error, 'error');
      });
    },
    toggle_info: () => toggleInfoDrawer(),
    open_chat: () => openInfoDrawer('chat'),
  });

  if (!phase) {
    // 断线状态在这条早退分支同样要可见可恢复——重连耗尽时这里若只显示
    // "加载游戏中...",玩家会被无提示地永久卡住。
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">
          {rejoinError ?? (connectionStatus === 'disconnected' ? '连接已断开' : '加载游戏中...')}
        </p>
        {(connectionStatus === 'disconnected' || rejoinError) && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                connectSocket();
                retryRejoin();
              }}
              className="rounded-lg bg-primary px-6 py-2 font-game text-primary-foreground hover:opacity-90"
            >
              重新连接
            </button>
            {rejoinError && (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-lg bg-secondary px-6 py-2 font-game text-foreground hover:opacity-90"
              >
                返回大厅
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!roomCode) return <Navigate to="/" replace />;

  return (
    <div className="flex h-screen flex-col relative overflow-hidden">
      {connectionStatus !== 'connected' && (
        <div className="fixed inset-0 z-connection flex flex-col items-center justify-center gap-3 bg-black/75">
          {connectionStatus === 'reconnecting' && <Loader2 size={36} className="animate-spin text-white" />}
          <p className="font-game text-lg text-white">
            {connectionStatus === 'reconnecting' ? '重新连接中...' : '连接已断开'}
          </p>
          {connectionStatus === 'disconnected' && (
            // 自动重连尝试耗尽后 socket.io 不再自行重试——没有这个按钮
            // (以及 socket.ts 的 online 监听),玩家会被无交互的全屏遮罩
            // 永久困住,只能整页刷新。
            <button
              type="button"
              onClick={() => connectSocket()}
              className="rounded-lg bg-primary px-6 py-2 font-game text-primary-foreground hover:opacity-90"
            >
              重新连接
            </button>
          )}
        </div>
      )}

      {connectionStatus === 'connected' && rejoinError && (
        <div className="fixed left-1/2 top-3 z-connection flex -translate-x-1/2 items-center gap-3 rounded-lg bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
          <span>{rejoinError}</span>
          <button
            type="button"
            onClick={retryRejoin}
            className="rounded bg-primary px-3 py-1 font-game text-primary-foreground hover:opacity-90"
          >
            重试
          </button>
        </div>
      )}

      {/* 顶栏 HUD（table / strip 两种密度） */}
      <GameHUD
        roomCode={roomCode}
        mode={mode}
        onLeave={confirmAndLeave}
        onOpenHotkeys={() => setShowHotkeys(true)}
        onOpenMenu={() => setShowMobileMenu(true)}
        onOpenInfo={() => setShowMobileInfo(true)}
      />

      {/* 桌面牌桌侧栏 */}
      {mode === 'table' && <PlayerListPanel />}

      <LayoutGroup>
        {/* 中央区域：table = 椭圆牌桌（逻辑画布缩放）；strip = 全新移动端布局 */}
        {mode === 'strip' ? (
          isSpectator ? (
            <SpectatorView onDraw={noop} onBackToLobby={backToLobby}>
              <DanmakuLayer />
            </SpectatorView>
          ) : (
            <MobileGameScreen onDraw={myAutopilot ? noop : drawCard}>
              <DanmakuLayer />
              <AnimatePresence>
                {showTurnBanner && isMyTurn && phase === 'playing' && (
                  <motion.div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-actions pointer-events-none font-game text-4xl font-black text-white text-shadow-bold"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  >
                    轮到你了
                  </motion.div>
                )}
              </AnimatePresence>
            </MobileGameScreen>
          )
        ) : (
          <div className="relative flex flex-col flex-1 min-h-0">
            <FitScaler align="center" maxScale={1} className="absolute inset-0">
              <div className="w-[1200px] h-[720px] flex flex-col">
                <GameTable onDraw={myAutopilot ? noop : drawCard} />
              </div>
            </FitScaler>
            <DanmakuLayer />
            <AnimatePresence>
              {showTurnBanner && isMyTurn && phase === 'playing' && (
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-actions pointer-events-none font-game text-4xl font-black text-white text-shadow-bold"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  轮到你了
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {mode === 'strip' ? (
          shortLandscape ? (
            <div className="absolute bottom-[136px] left-0 right-0 z-actions flex items-center justify-center pointer-events-none [&_button]:h-10 [&_button]:px-5 [&_button]:text-sm [&_button]:rounded-full [&_button]:pointer-events-auto">
              {!isSpectator && !myAutopilot && (
                <GameActions
                  onCallUno={callUno}
                  onCatchUno={catchUno}
                  onChallenge={challenge}
                  onAccept={accept}
                  onPass={pass}
                  onSwapTarget={swapTarget}
                />
              )}
            </div>
          ) : (
            <div className="relative z-actions min-h-[60px] flex items-center justify-center shrink-0 [&_button]:h-11 [&_button]:px-5 [&_button]:text-base [&_button]:rounded-full">
              {!isSpectator && !myAutopilot && (
                <GameActions
                  onCallUno={callUno}
                  onCatchUno={catchUno}
                  onChallenge={challenge}
                  onAccept={accept}
                  onPass={pass}
                  onSwapTarget={swapTarget}
                />
              )}
            </div>
          )
        ) : (
          !isSpectator &&
          !myAutopilot && (
            <GameActions
              onCallUno={callUno}
              onCatchUno={catchUno}
              onChallenge={challenge}
              onAccept={accept}
              onPass={pass}
              onSwapTarget={swapTarget}
            />
          )
        )}
        {!isSpectator &&
          (mode === 'strip' ? (
            <MobileHand onPlayCard={myAutopilot ? noop : playCard} />
          ) : (
            <PlayerHand onPlayCard={myAutopilot ? noop : playCard} />
          ))}
      </LayoutGroup>

      {isSpectator && mode === 'table' && (
        <>
          <SpectatorActions onCatchUno={catchUno} />
          {!showScoreBoard && <SpectatorBar onBackToLobby={backToLobby} />}
        </>
      )}

      {/* 共享覆盖层（只渲染一份） */}
      <VoicePanel />
      {mode === 'table' ? <InfoDrawer /> : <InfoSheet open={showMobileInfo} onClose={() => setShowMobileInfo(false)} />}
      <MobileMenuSheet open={showMobileMenu} onClose={() => setShowMobileMenu(false)} onLeave={confirmAndLeave} />
      {settings && (
        <GameStartRulesModal
          open={showStartRules}
          houseRules={settings.houseRules}
          onClose={() => setShowStartRules(false)}
        />
      )}
      <GameEffects />
      <ViewportFxLayer />
      <ColorWave />
      {antiCheatKey && <AntiCheatToast key={antiCheatKey} />}
      {!isSpectator && <AutopilotOverlay />}
      {(phase === 'round_end' || phase === 'game_over') && <Confetti />}
      {needsColorPick && <ColorPicker onPick={chooseColor} />}
      {endRevealing && (
        <EndRevealBanner
          secondsLeft={revealLeft}
          onSkip={() => setEndRevealLeft(0)}
          placement={mode === 'strip' ? 'lower' : 'top'}
        />
      )}
      {showScoreBoard && (
        <ScoreBoard
          isSpectator={isSpectator}
          onPlayAgain={playAgain}
          onBackToRoom={backToRoom}
          onBackToLobby={backToLobby}
          onKickPlayer={kickPlayer}
          onLeaveToSpectate={leaveToSpectate}
        />
      )}
      <OwnerTransferBanner />
      <BgmToast song={bgmSongName} />
      <HotkeySettingsModal open={showHotkeys} onClose={() => setShowHotkeys(false)} />
    </div>
  );
}

/** PC 悬浮观战条：顶部居中胶囊（下局加入/取消 + 退出） */
function SpectatorBar({ onBackToLobby }: { onBackToLobby: () => void }) {
  const { queued, toggle: toggleQueue } = useSpectatorQueue();

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-actions glass-panel !rounded-full px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
      <Eye size={16} /> 观战中
      {queued ? (
        <button
          onClick={toggleQueue}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs text-foreground transition-colors hover:bg-white/10"
        >
          <X size={12} /> 取消加入
        </button>
      ) : (
        <button
          onClick={toggleQueue}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/80 px-2 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary"
        >
          <UserPlus size={12} /> 下局加入
        </button>
      )}
      <button
        onClick={onBackToLobby}
        className="ml-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs text-foreground transition-colors hover:bg-white/10"
      >
        <LogOut size={12} /> 退出
      </button>
    </div>
  );
}
