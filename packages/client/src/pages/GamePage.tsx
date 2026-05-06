import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Color } from '@uno-online/shared';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import { getSocket, connectSocket, onConnectionStatus } from '../socket.js';
import { playSound } from '../sound/sound-manager.js';
import TopBar from '../components/TopBar.js';
import OpponentRow from '../components/OpponentRow.js';
import DirectionIndicator from '../components/DirectionIndicator.js';
import DrawPile from '../components/DrawPile.js';
import DiscardPile from '../components/DiscardPile.js';
import GameActions from '../components/GameActions.js';
import PlayerHand from '../components/PlayerHand.js';
import ColorPicker from '../components/ColorPicker.js';
import ScoreBoard from '../components/ScoreBoard.js';
import ChatBox from '../components/ChatBox.js';
import VoicePanel from '../voice/VoicePanel.js';
import GameEffects from '../components/GameEffects.js';
import UnoCallEffect from '../components/UnoCallEffect.js';
import Confetti from '../components/Confetti.js';
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
      <LayoutGroup>
      <div className="game-table">
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
      </LayoutGroup>
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
