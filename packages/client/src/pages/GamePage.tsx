import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Color } from '@uno-online/shared';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '../stores/auth-store';
import { getSocket, connectSocket, onConnectionStatus } from '../socket';
import { playSound } from '../sound/sound-manager';
import TopBar from '../components/TopBar';
import OpponentRow from '../components/OpponentRow';
import DirectionIndicator from '../components/DirectionIndicator';
import DrawPile from '../components/DrawPile';
import DiscardPile from '../components/DiscardPile';
import GameActions from '../components/GameActions';
import PlayerHand from '../components/PlayerHand';
import ColorPicker from '../components/ColorPicker';
import ScoreBoard from '../components/ScoreBoard';
import ChatBox from '../components/ChatBox';
import VoicePanel from '../voice/VoicePanel';
import GameEffects from '../components/GameEffects';
import UnoCallEffect from '../components/UnoCallEffect';
import Confetti from '../components/Confetti';
import '../styles/game.css';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const phase = useGameStore((s) => s.phase);
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const needsColorPick = phase === 'choosing_color' && isMyTurn;
  const showScoreBoard = phase === 'round_end' || phase === 'game_over';
  const setGameState = useGameStore((s) => s.setGameState);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
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

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    if (!phase && roomCode) {
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (res.success && res.gameState) {
          setGameState(res.gameState);
        } else {
          navigate(`/room/${roomCode}`);
        }
      });
    }
  }, []);

  useEffect(() => {
    onConnectionStatus((status) => {
      setConnectionStatus(status);
      if (status === 'connected' && roomCode) {
        const socket = getSocket();
        socket.emit('room:rejoin', roomCode, (res: any) => {
          if (res.success && res.gameState) {
            setGameState(res.gameState);
          }
        });
      }
    });
    return () => onConnectionStatus(() => {});
  }, [roomCode]);

  useEffect(() => {
    if (!phase || phase === 'game_over') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  const playCard = useCallback((cardId: string) => {
    playSound('play_card');
    getSocket().emit('game:play_card', { cardId }, () => {});
  }, []);

  const drawCard = useCallback(() => {
    const houseRules = settings?.houseRules;
    const shouldAutoPass =
      drawStack === 0 &&
      !houseRules?.drawUntilPlayable &&
      !houseRules?.deathDraw &&
      !houseRules?.forcedPlayAfterDraw;

    playSound('draw_card');
    getSocket().emit('game:draw_card', (res: { success: boolean }) => {
      if (res?.success && shouldAutoPass) {
        getSocket().emit('game:pass', () => {});
      }
    });
  }, [drawStack, settings?.houseRules]);

  const chooseColor = useCallback((color: Color) => {
    getSocket().emit('game:choose_color', { color }, () => {});
  }, []);

  const callUno = useCallback(() => {
    playSound('uno_call');
    getSocket().emit('game:call_uno', () => {});
  }, []);

  const catchUno = useCallback((targetId: string) => {
    getSocket().emit('game:catch_uno', { targetPlayerId: targetId }, () => {});
  }, []);

  const challenge = useCallback(() => {
    getSocket().emit('game:challenge', () => {});
  }, []);

  const accept = useCallback(() => {
    getSocket().emit('game:accept', () => {});
  }, []);

  const pass = useCallback(() => {
    getSocket().emit('game:pass', () => {});
  }, []);

  const swapTarget = useCallback((targetId: string) => {
    getSocket().emit('game:choose_swap_target', { targetId }, () => {});
  }, []);

  const playAgain = useCallback(() => {
    getSocket().emit('game:next_round', () => {});
  }, []);

  const rematch = useCallback(() => {
    getSocket().emit('game:rematch', () => {});
  }, []);

  if (!phase) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-secondary)' }}>加载游戏中...</p>
    </div>;
  }

  return (
    <div className="game-layout">
      {connectionStatus !== 'connected' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, flexDirection: 'column', gap: 12,
        }}>
          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#fff' }} />
          <p style={{ color: '#fff', fontSize: 18, fontFamily: 'var(--font-game)' }}>
            {connectionStatus === 'reconnecting' ? '重新连接中...' : '连接已断开，尝试重连...'}
          </p>
        </div>
      )}
      <TopBar roomCode={roomCode ?? ''} />
      <OpponentRow />
      <div className="game-center">
        <DirectionIndicator />
        <DrawPile onDraw={drawCard} />
        <DiscardPile />
        <AnimatePresence>
          {showTurnBanner && isMyTurn && phase === 'playing' && (
            <motion.div
              className="turn-banner"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              轮到你了
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <GameActions
        onCallUno={callUno}
        onCatchUno={catchUno}
        onChallenge={challenge}
        onAccept={accept}
        onPass={pass}
        onSwapTarget={swapTarget}
      />
      <PlayerHand onPlayCard={playCard} />
      <ChatBox />
      <VoicePanel />
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
