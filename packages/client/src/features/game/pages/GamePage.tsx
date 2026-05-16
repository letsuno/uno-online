import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Eye, LogOut, UserPlus, X } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { useGameSocket } from '../hooks/useGameSocket';
import { useGameLogTracker } from '../hooks/useGameLogTracker';
import { useAutoPlay } from '../hooks/useAutoPlay';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useGameActions } from '../hooks/useGameActions';
import { useGameHotkeys } from '../hooks/useGameHotkeys';
import { playSound } from '@/shared/sound/sound-manager';
import { useBgm } from '@/shared/sound/useBgm';
import BgmToast from '@/shared/components/BgmToast';
import { getSocket, refreshVoicePresence } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { useLeaveRoom } from '../hooks/useLeaveRoom';
import TopBar from '../components/TopBar';
import GameTable from '../components/GameTable';
import GameActions from '../components/GameActions';
import PlayerHand from '../components/PlayerHand';
import ColorPicker from '../components/ColorPicker';
import ScoreBoard from '../components/ScoreBoard';
import VoicePanel from '@/shared/voice/VoicePanel';
import GameEffects from '../components/GameEffects';
import Confetti from '../components/Confetti';
import MobileFAB from '../components/MobileFAB';
import InfoDrawer from '../components/InfoDrawer';
import PlayerListPanel from '../components/PlayerListPanel';
import DanmakuLayer from '../components/DanmakuLayer';
import SpectatorActions from '../components/SpectatorActions';
import AntiCheatToast from '../components/AntiCheatToast';
import { useSpectatorStore } from '../stores/spectator-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import GameStartRulesModal from '../components/GameStartRulesModal';
import ColorWave from '../components/ColorWave';
import HotkeySettingsModal from '../components/HotkeySettingsModal';
import OwnerTransferBanner from '../components/OwnerTransferBanner';
import AutopilotOverlay from '../components/AutopilotOverlay';
import MobileStatusBar from '../components/MobileStatusBar';
import MobilePlayerStrip from '../components/MobilePlayerStrip';
import MobileGameCenter from '../components/MobileGameCenter';
import MobileMenuSheet from '../components/MobileMenuSheet';
import { useIsMobile } from '../hooks/useIsMobile';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const phase = useGameStore((s) => s.phase);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const settings = useGameStore((s) => s.settings);
  const toggleInfoDrawer = useGameStore((s) => s.toggleInfoDrawer);
  const openInfoDrawer = useGameStore((s) => s.openInfoDrawer);
  const backToLobby = useLeaveRoom();
  const clearSpectators = useSpectatorStore((s) => s.clearSpectators);

  const isSpectator = useGameStore((s) => s.isSpectator);
  const setSpectator = useGameStore((s) => s.setSpectator);
  const players = useGameStore((s) => s.players);
  const userId = useEffectiveUserId();
  const myAutopilot = players.find((p) => p.id === userId)?.autopilot ?? false;
  const isMyTurn = useIsMyTurn();
  const playableIds = usePlayableCardIds();
  const noop = () => {};
  const needsColorPick = phase === 'choosing_color' && isMyTurn && !myAutopilot;
  const showScoreBoard = phase === 'round_end' || phase === 'game_over';

  const connectionStatus = useGameSocket(roomCode);

  useEffect(() => {
    const socket = getSocket();
    const handleBackToRoom = () => {
      navigate(`/room/${roomCode}`);
    };
    socket.on('game:back_to_room', handleBackToRoom);
    return () => { socket.off('game:back_to_room', handleBackToRoom); };
  }, [roomCode, navigate]);

  useGameLogTracker();
  const bgmSongName = useBgm('game');
  const isMobile = useIsMobile();
  const [showStartRules, setShowStartRules] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const shownStartRulesRef = useRef<string | null>(null);
  const [antiCheatKey, setAntiCheatKey] = useState<string | null>(null);
  const shownAntiCheatRef = useRef<string | null>(null);

  useEffect(() => {
    refreshVoicePresence();
  }, []);

  useEffect(() => {
    if (!roomCode || !settings || roundNumber !== 1) return;
    if (phase !== 'playing' && phase !== 'challenging' && phase !== 'choosing_color' && phase !== 'choosing_swap_target') return;

    const key = `${roomCode}:round-${roundNumber}`;
    if (shownStartRulesRef.current === key) return;
    shownStartRulesRef.current = key;
    openInfoDrawer('rules');
    setShowStartRules(true);
  }, [roomCode, settings, roundNumber, phase, openInfoDrawer]);

  useEffect(() => {
    if (!roomCode || roundNumber !== 1) return;
    if (phase !== 'playing' && phase !== 'challenging' && phase !== 'choosing_color' && phase !== 'choosing_swap_target') return;
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

  useAutoPlay();

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
      getSocket().emit('game:autopilot_once', (res: { success?: boolean; error?: string }) => {
        if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
      });
    },
    toggle_info: () => toggleInfoDrawer(),
    open_chat: () => openInfoDrawer('chat'),
  });

  const isSelectionAllowed = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-allow-selection], input, textarea, select, [contenteditable="true"]'));
  };

  const suppressContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!isSelectionAllowed(event.target)) {
      event.preventDefault();
    }
  };


  if (!phase) {
    return <div className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground">加载游戏中...</p>
    </div>;
  }

  return (
    <div
      className="flex h-screen flex-col relative overflow-hidden select-none"
      onContextMenu={suppressContextMenu}
      onMouseDown={(event) => {
        if (event.detail > 1 && !isSelectionAllowed(event.target)) {
          event.preventDefault();
        }
      }}
    >
      {connectionStatus !== 'connected' && (
        <div className="fixed inset-0 z-connection flex flex-col items-center justify-center gap-3 bg-black/75">
          <Loader2 size={36} className="animate-spin text-white" />
          <p className="font-game text-lg text-white">
            {connectionStatus === 'reconnecting' ? '重新连接中...' : '连接已断开，尝试重连...'}
          </p>
        </div>
      )}
      {isMobile ? (
        <>
          <MobileStatusBar onOpenMenu={() => setShowMobileMenu(true)} />
          <MobilePlayerStrip />
          <div className="relative flex flex-col flex-1 min-h-0">
            <MobileGameCenter onDraw={myAutopilot ? noop : drawCard} />
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
          {!isSpectator && <PlayerHand onPlayCard={myAutopilot ? noop : playCard} />}
          {isSpectator && (
            <>
              <SpectatorActions onCatchUno={catchUno} />
              {!showScoreBoard && (
                <SpectatorBar
                  phase={phase}
                  onBackToLobby={backToLobby}
                  onJoined={() => { setSpectator(false); clearSpectators(); }}
                />
              )}
            </>
          )}
          <MobileMenuSheet open={showMobileMenu} onClose={() => setShowMobileMenu(false)} />
        </>
      ) : (
        <>
          <TopBar roomCode={roomCode ?? ''} onOpenHotkeys={() => setShowHotkeys(true)} />
          <PlayerListPanel />
          <LayoutGroup>
          <div className="relative flex flex-col flex-1 min-h-0">
          <GameTable onDraw={myAutopilot ? noop : drawCard} />
          <DanmakuLayer />
          </div>
          <AnimatePresence>
            {showTurnBanner && isMyTurn && phase === 'playing' && (
              <motion.div
                className="absolute left-1/2 top-turn-top -translate-x-1/2 -translate-y-1/2 z-actions pointer-events-none font-game text-title-responsive font-black text-white text-shadow-bold"
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                轮到你了
              </motion.div>
            )}
          </AnimatePresence>
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
          {!isSpectator && <PlayerHand onPlayCard={myAutopilot ? noop : playCard} />}
          </LayoutGroup>
          {isSpectator && (
            <>
              <SpectatorActions onCatchUno={catchUno} />
              {!showScoreBoard && (
                <SpectatorBar
                  phase={phase}
                  onBackToLobby={backToLobby}
                  onJoined={() => { setSpectator(false); clearSpectators(); }}
                />
              )}
            </>
          )}
        </>
      )}
      <VoicePanel />
      <InfoDrawer />
      <MobileFAB />
      <GameStartRulesModal
        open={showStartRules}
        houseRules={settings?.houseRules}
        onClose={() => setShowStartRules(false)}
      />
      <GameEffects />
      <ColorWave />
      {antiCheatKey && <AntiCheatToast key={antiCheatKey} />}
      <OwnerTransferBanner />
      {!isSpectator && <AutopilotOverlay />}
      {(phase === 'round_end' || phase === 'game_over') && <Confetti />}
      {needsColorPick && <ColorPicker onPick={chooseColor} />}
      {showScoreBoard && (
        <ScoreBoard
          isSpectator={isSpectator}
          onPlayAgain={playAgain}
          onBackToRoom={backToRoom}
          onBackToLobby={backToLobby}
          onKickPlayer={kickPlayer}
          onLeaveToSpectate={leaveToSpectate}
          onJoinedFromSpectator={() => { setSpectator(false); clearSpectators(); }}
        />
      )}
      <BgmToast song={bgmSongName} />
      <HotkeySettingsModal open={showHotkeys} onClose={() => setShowHotkeys(false)} />
    </div>
  );
}

function SpectatorBar({ phase, onBackToLobby, onJoined }: { phase: string | null; onBackToLobby: () => void; onJoined: () => void }) {
  const [queued, setQueued] = useState(false);
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);

  useEffect(() => {
    const nickname = useAuthStore.getState().user?.nickname;
    if (nickname && pendingJoinQueue.includes(nickname)) {
      setQueued(true);
    }
  }, [pendingJoinQueue]);

  useEffect(() => {
    const socket = getSocket();
    const handleState = () => {
      const { isSpectator } = useGameStore.getState();
      if (!isSpectator && queued) {
        onJoined();
        setQueued(false);
      }
    };
    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [queued, onJoined]);

  const toggleQueue = () => {
    getSocket().emit('game:spectator_join', (res: { success?: boolean; error?: string; queued?: boolean; joined?: boolean }) => {
      if (res?.success) {
        if (res.joined) {
          onJoined();
          setQueued(false);
        } else {
          setQueued(res.queued ?? false);
        }
      } else {
        useToastStore.getState().addToast(res?.error ?? '操作失败', 'error');
      }
    });
  };

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-actions bg-card/90 backdrop-blur-sm rounded-full px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
      <Eye size={16} /> 观战中
      {queued ? (
        <button
          onClick={toggleQueue}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-foreground transition-colors hover:bg-white/20"
        >
          <X size={12} /> 取消加入
        </button>
      ) : (
        <button
          onClick={toggleQueue}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/80 px-2 py-1 text-xs text-white transition-colors hover:bg-primary"
        >
          <UserPlus size={12} /> 下局加入
        </button>
      )}
      <button
        onClick={onBackToLobby}
        className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-foreground transition-colors hover:bg-white/20"
      >
        <LogOut size={12} /> 退出
      </button>
    </div>
  );
}
