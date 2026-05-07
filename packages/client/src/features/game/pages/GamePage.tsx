import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Color } from '@uno-online/shared';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { getSocket, connectSocket, onConnectionStatus } from '@/shared/socket';
import { playSound } from '@/shared/sound/sound-manager';
import { getPlayableCardIds } from '@/shared/utils/playable-cards';
import TopBar from '../components/TopBar';
import GameTable from '../components/GameTable';
import GameActions from '../components/GameActions';
import PlayerHand from '../components/PlayerHand';
import ColorPicker from '../components/ColorPicker';
import ScoreBoard from '../components/ScoreBoard';
import ChatBox from '../components/ChatBox';
import VoicePanel from '@/shared/voice/VoicePanel';
import GameEffects from '../components/GameEffects';
import UnoCallEffect from '../components/UnoCallEffect';
import Confetti from '../components/Confetti';
import HouseRulesCard from '../components/HouseRulesCard';
import GameLog from '../components/GameLog';
import MobileFAB from '../components/MobileFAB';
import { useGameLogStore } from '../stores/game-log-store';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const phase = useGameStore((s) => s.phase);
  const userId = useEffectiveUserId();
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);

  const lastAction = useGameStore((s) => s.lastAction);
  const discardPile = useGameStore((s) => s.discardPile);
  const addLogEntry = useGameLogStore((s) => s.addEntry);
  const clearLog = useGameLogStore((s) => s.clear);

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const needsColorPick = phase === 'choosing_color' && isMyTurn;
  const showScoreBoard = phase === 'round_end' || phase === 'game_over';
  const setGameState = useGameStore((s) => s.setGameState);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [showTurnBanner, setShowTurnBanner] = useState(false);
  const prevTurnRef = useRef(false);
  const prevActionRef = useRef<typeof lastAction>(null);

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
    if (!lastAction || lastAction === prevActionRef.current) return;
    prevActionRef.current = lastAction;

    const findPlayer = (id: string) => players.find((p) => p.id === id);

    if (lastAction.type === 'PLAY_CARD') {
      const player = findPlayer(lastAction.playerId);
      const topCard = discardPile[discardPile.length - 1];
      if (!player || !topCard) return;

      const typeMap: Record<string, 'play_number' | 'play_skip' | 'play_reverse' | 'play_draw_two' | 'play_wild' | 'play_wild_draw_four'> = {
        number: 'play_number',
        skip: 'play_skip',
        reverse: 'play_reverse',
        draw_two: 'play_draw_two',
        wild: 'play_wild',
        wild_draw_four: 'play_wild_draw_four',
      };

      addLogEntry({
        type: typeMap[topCard.type] ?? 'play_number',
        playerId: lastAction.playerId,
        playerName: player.name,
        card: topCard,
      });
    } else if (lastAction.type === 'DRAW_CARD') {
      const player = findPlayer(lastAction.playerId);
      if (!player) return;
      addLogEntry({
        type: 'draw',
        playerId: lastAction.playerId,
        playerName: player.name,
      });
    } else if (lastAction.type === 'CATCH_UNO') {
      const catcher = findPlayer(lastAction.catcherId);
      const target = findPlayer(lastAction.targetId);
      if (!catcher || !target) return;
      addLogEntry({
        type: 'catch_uno',
        playerId: lastAction.catcherId,
        playerName: catcher.name,
        targetId: lastAction.targetId,
        targetName: target.name,
        extra: '未喊 UNO!',
      });
    } else if (lastAction.type === 'CHALLENGE') {
      const player = findPlayer(lastAction.playerId);
      if (!player) return;
      addLogEntry({
        type: 'challenge',
        playerId: lastAction.playerId,
        playerName: player.name,
        extra: '质疑 +4',
      });
    }
  }, [lastAction, players, discardPile, addLogEntry]);

  useEffect(() => {
    if (phase === 'dealing') {
      clearLog();
    }
  }, [phase, clearLog]);

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

  // --- Auto-play logic ---
  const autoPlay = useSettingsStore((s) => s.autoPlay);
  const me = players.find((p) => p.id === userId);
  const currentColor = useGameStore((s) => s.currentColor);
  const topCard = discardPile[discardPile.length - 1];

  useEffect(() => {
    if (!autoPlay || !isMyTurn || phase !== 'playing' || !me || !topCard || !currentColor) return;

    const hand = me.hand;
    const playableIds = getPlayableCardIds({
      hand,
      topCard,
      currentColor,
      drawStack,
      houseRules: settings?.houseRules,
    });

    if (playableIds.size === 0) {
      // No playable card — draw
      const timer = setTimeout(() => drawCard(), 600);
      return () => clearTimeout(timer);
    }

    // Strategy: prefer same-color cards, then first playable (sorted order), avoid wild if possible
    const sorted = [...hand].sort((a, b) => {
      const COLOR_ORDER: Record<string, number> = { red: 0, blue: 1, green: 2, yellow: 3 };
      const colorA = COLOR_ORDER[a.color ?? ''] ?? 99;
      const colorB = COLOR_ORDER[b.color ?? ''] ?? 99;
      if (colorA !== colorB) return colorA - colorB;
      return 0;
    });

    // 1) Same color non-wild cards
    let pick = sorted.find((c) => playableIds.has(c.id) && c.color === currentColor);
    // 2) Any non-wild playable
    if (!pick) pick = sorted.find((c) => playableIds.has(c.id) && c.color !== null);
    // 3) Wild card as last resort
    if (!pick) pick = sorted.find((c) => playableIds.has(c.id));

    if (pick) {
      const isWild = pick.type === 'wild' || pick.type === 'wild_draw_four';
      const timer = setTimeout(() => {
        playCard(pick.id);
        if (isWild) {
          // Auto-choose color: most frequent color in remaining hand
          const colorCount: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
          for (const c of hand) {
            if (c.color && c.id !== pick.id) colorCount[c.color]++;
          }
          const bestColor = (Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red') as Color;
          setTimeout(() => chooseColor(bestColor), 300);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, isMyTurn, phase, me?.hand, topCard, currentColor, drawStack, settings?.houseRules]);

  // Auto-play: handle non-playing phases (challenge/accept, color pick, swap target)
  useEffect(() => {
    if (!autoPlay || !isMyTurn) return;

    if (phase === 'challenging') {
      const timer = setTimeout(() => challenge(), 600);
      return () => clearTimeout(timer);
    }

    if (phase === 'choosing_color') {
      const hand = me?.hand ?? [];
      const colorCount: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
      for (const c of hand) {
        if (c.color) colorCount[c.color]++;
      }
      const bestColor = (Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red') as Color;
      const timer = setTimeout(() => chooseColor(bestColor), 600);
      return () => clearTimeout(timer);
    }

    if (phase === 'choosing_swap_target') {
      const targets = players.filter((p) => p.id !== userId && !p.eliminated);
      if (targets.length > 0) {
        const target = targets.reduce((best, p) => p.handCount > best.handCount ? p : best, targets[0]!);
        const timer = setTimeout(() => {
          getSocket().emit('game:choose_swap_target', { targetId: target.id }, () => {});
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [autoPlay, isMyTurn, phase, me?.hand, players, userId]);

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
      <ChatBox />
      <VoicePanel />
      <HouseRulesCard />
      <GameLog />
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
