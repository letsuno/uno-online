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
import { useGameActions } from '../hooks/useGameActions';
import { playSound } from '@/shared/sound/sound-manager';
import { getSocket, refreshVoicePresence } from '@/shared/socket';
import { leaveVoiceSession } from '@/shared/voice/voice-runtime';
import { useRoomStore } from '@/shared/stores/room-store';
import { useToastStore } from '@/shared/stores/toast-store';
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
import AntiCheatToast from '../components/AntiCheatToast';
import CheatOverlay from '../components/CheatOverlay';
import { useSpectatorStore } from '../stores/spectator-store';
import GameStartRulesModal from '../components/GameStartRulesModal';
import ColorWave from '../components/ColorWave';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const phase = useGameStore((s) => s.phase);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const settings = useGameStore((s) => s.settings);
  const openInfoDrawer = useGameStore((s) => s.openInfoDrawer);
  const clearGame = useGameStore((s) => s.clearGame);
  const clearRoom = useRoomStore((s) => s.clearRoom);
  const clearSpectators = useSpectatorStore((s) => s.clearSpectators);
  const cheatDetected = useGameStore((s) => s.cheatDetected);

  const isMyTurn = useIsMyTurn();
  const playableIds = usePlayableCardIds();
  const needsColorPick = phase === 'choosing_color' && isMyTurn;
  const showScoreBoard = phase === 'round_end' || phase === 'game_over';

  const connectionStatus = useGameSocket(roomCode);
  useGameLogTracker();
  const [showStartRules, setShowStartRules] = useState(false);
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
    rematch,
    kickPlayer,
  } = useGameActions();

  useAutoPlay();

  const [searchParams] = useSearchParams();
  const isSpectator = useGameStore((s) => s.isSpectator);
  const setSpectator = useGameStore((s) => s.setSpectator);

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

  const isSelectionAllowed = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-allow-selection], input, textarea, select, [contenteditable="true"]'));
  };

  const suppressContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!isSelectionAllowed(event.target)) {
      event.preventDefault();
    }
  };

  const backToLobby = () => {
    getSocket().emit('voice:presence', { inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
    leaveVoiceSession();
    getSocket().emit('room:leave', () => {
      clearRoom();
      clearGame();
      clearSpectators();
      navigate('/lobby');
    });
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
      <TopBar roomCode={roomCode ?? ''} />
      <PlayerListPanel />
      <LayoutGroup>
      <div className="relative flex flex-col flex-1 min-h-0">
      <GameTable onDraw={drawCard} />
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
      {!isSpectator && (
        <GameActions
          onCallUno={callUno}
          onCatchUno={catchUno}
          onChallenge={challenge}
          onAccept={accept}
          onPass={pass}
          onSwapTarget={swapTarget}
        />
      )}
      {!isSpectator && <PlayerHand onPlayCard={playCard} />}
      </LayoutGroup>
      {isSpectator && (
        <SpectatorBar
          phase={phase}
          onBackToLobby={backToLobby}
          onJoined={() => { setSpectator(false); clearSpectators(); }}
        />
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
      {(phase === 'round_end' || phase === 'game_over') && <Confetti />}
      {needsColorPick && <ColorPicker onPick={chooseColor} />}
      {showScoreBoard && (
        <ScoreBoard onPlayAgain={playAgain} onRematch={rematch} onBackToLobby={backToLobby} onKickPlayer={kickPlayer} />
      )}
      {cheatDetected && <CheatOverlay />}
    </div>
  );
}

function SpectatorBar({ phase, onBackToLobby, onJoined }: { phase: string | null; onBackToLobby: () => void; onJoined: () => void }) {
  const [queued, setQueued] = useState(false);

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
    getSocket().emit('game:spectator_join', (res: { success?: boolean; error?: string; queued?: boolean }) => {
      if (res?.success) {
        setQueued(res.queued ?? false);
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
