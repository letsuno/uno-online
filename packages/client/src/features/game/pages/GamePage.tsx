import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { useGameSocket } from '../hooks/useGameSocket';
import { useGameLogTracker } from '../hooks/useGameLogTracker';
import { useAutoPlay } from '../hooks/useAutoPlay';
import { useGameActions } from '../hooks/useGameActions';
import { playSound } from '@/shared/sound/sound-manager';
import TopBar from '../components/TopBar';
import GameTable from '../components/GameTable';
import GameActions from '../components/GameActions';
import PlayerHand from '../components/PlayerHand';
import ColorPicker from '../components/ColorPicker';
import ScoreBoard from '../components/ScoreBoard';
import VoicePanel from '@/shared/voice/VoicePanel';
import GameEffects from '../components/GameEffects';
import UnoCallEffect from '../components/UnoCallEffect';
import Confetti from '../components/Confetti';
import MobileFAB from '../components/MobileFAB';
import InfoDrawer from '../components/InfoDrawer';
import PlayerListPanel from '../components/PlayerListPanel';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const phase = useGameStore((s) => s.phase);

  const isMyTurn = useIsMyTurn();
  const playableIds = usePlayableCardIds();
  const needsColorPick = phase === 'choosing_color' && isMyTurn;
  const showScoreBoard = phase === 'round_end' || phase === 'game_over';

  const connectionStatus = useGameSocket(roomCode);
  useGameLogTracker();

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
  } = useGameActions();

  useAutoPlay();

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

  if (!phase) {
    return <div className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground">加载游戏中...</p>
    </div>;
  }

  return (
    <div className="flex h-screen flex-col relative overflow-hidden">
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
      <GameTable onDraw={drawCard} />
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
      <GameActions
        onCallUno={callUno}
        onCatchUno={catchUno}
        onChallenge={challenge}
        onAccept={accept}
        onPass={pass}
        onSwapTarget={swapTarget}
      />
      <PlayerHand onPlayCard={playCard} />
      </LayoutGroup>
      <VoicePanel />
      <InfoDrawer />
      <MobileFAB />
      <GameEffects />
      <UnoCallEffect />
      {(phase === 'round_end' || phase === 'game_over') && <Confetti />}
      {needsColorPick && <ColorPicker onPick={chooseColor} />}
      {showScoreBoard && (
        <ScoreBoard onPlayAgain={playAgain} onRematch={rematch} onBackToLobby={() => navigate('/lobby')} />
      )}
    </div>
  );
}
