import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DrawPile from './DrawPile';
import DiscardPile from './DiscardPile';
import PlayerNode from './PlayerNode';
import TurnIndicator from './TurnIndicator';
import DirectionIndicator from './DirectionIndicator';
import SpectatorSeats from './SpectatorSeats';
import CriticalCountdown from './CriticalCountdown';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { useGatewayStore } from '@/shared/voice/gateway-store';
import { usePlayerLayout } from '../hooks/usePlayerLayout';
import { useLastPlayedCards } from '../hooks/useLastPlayedCards';
import { useSeatShuffleAnimation } from '../hooks/useSeatShuffleAnimation';
import { useHandEffects } from '../hooks/useHandEffects';

interface GameTableProps {
  onDraw: (side: 'left' | 'right') => void;
}

export default function GameTable({ onDraw }: GameTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isPortrait = dimensions.height > dimensions.width;

  const players = useGameStore(s => s.players);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);
  const direction = useGameStore(s => s.direction);
  const phase = useGameStore(s => s.phase);
  const turnEndTime = useGameStore(s => s.turnEndTime);
  const pendingDrawPlayerId = useGameStore(s => s.pendingDrawPlayerId);
  const settings = useGameStore(s => s.settings);
  const lastAction = useGameStore(s => s.lastAction);
  const roundNumber = useGameStore(s => s.roundNumber);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore(s => s.room?.ownerId);

  // Speaking state keyed by the authoritative game user id.
  const selfSpeaking = useGatewayStore(s => s.selfSpeaking);
  const voicePresence = useGatewayStore(s => s.playerVoicePresence);

  // Chat messages per player

  // Track container dimensions with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 每个玩家最近打出的牌（共享 hook，移动端 OpponentRow 也用）
  const { lastPlayedCards, clearLastPlayed } = useLastPlayedCards();

  // Track skipped player
  const [skippedPlayerId, setSkippedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (lastAction?.type === 'PLAY_CARD' && lastAction.playerId) {
      const { discardPile: dp, direction: dir, players: ps } = useGameStore.getState();
      const topCard = dp[dp.length - 1];

      let skippedIdx = -1;
      const actorIdx = ps.findIndex(p => p.id === lastAction.playerId);

      if (actorIdx >= 0) {
        const step = dir === 'clockwise' ? 1 : -1;
        const nextIdx = (((actorIdx + step) % ps.length) + ps.length) % ps.length;

        if (topCard?.type === 'skip' || topCard?.type === 'draw_two') {
          skippedIdx = nextIdx;
        } else if (topCard?.type === 'reverse' && ps.length === 2) {
          skippedIdx = nextIdx;
        }
      }

      if (skippedIdx >= 0) {
        const skippedId = ps[skippedIdx]?.id ?? null;
        setSkippedPlayerId(skippedId);
        if (skippedId) {
          clearLastPlayed(skippedId);
        }
        const timer = window.setTimeout(() => setSkippedPlayerId(null), 1000);
        return () => window.clearTimeout(timer);
      }
    }

    setSkippedPlayerId(null);
  }, [lastAction]);

  // Player layout
  const { playerPositions, getPlayerPosition } = usePlayerLayout(dimensions, players, userId);

  // Seat shuffle animation
  const shuffleSeatsEnabled = settings?.houseRules.shuffleSeats ?? false;
  const { positions: animatedPositions, shufflePhase } = useSeatShuffleAnimation(
    playerPositions,
    roundNumber,
    shuffleSeatsEnabled,
  );

  // 手牌指示效果（+N 提示、换手抖动、摸到能出计数；飞行动画由 fx/ViewportFxLayer 统一接管）
  const { drawUntilCount, handGainBumps, handSwapEffects } = useHandEffects(
    players,
    lastAction,
    settings,
    direction,
    roundNumber,
    getPlayerPosition,
    phase,
    currentPlayerIndex,
  );

  // Handle reaction from quick reaction menu
  const handleReaction = useCallback((emoji: string) => {
    getSocket().emit('chat:message', { text: emoji });
  }, []);

  // Handle throw item
  const handleThrowItem = useCallback((targetPlayerId: string, item: string) => {
    getSocket().emit('throw:item', { targetId: targetPlayerId, item }, res => {
      if (!res.success) {
        useToastStore.getState().addToast(res.error, 'error');
      }
    });
  }, []);

  const pendingPenaltyDraws = useGameStore(s => s.pendingPenaltyDraws);
  const drawStack = useGameStore(s => s.drawStack);
  const hasDrawnThisTurn = useGameStore(s => s.hasDrawnThisTurn);
  const remainingPenaltyDraws = pendingPenaltyDraws > 0 ? pendingPenaltyDraws : drawStack;
  const isMyTurn = useIsMyTurn();
  const playableIds = usePlayableCardIds();
  const showNoPlayableHint =
    isMyTurn &&
    phase === 'playing' &&
    !hasDrawnThisTurn &&
    remainingPenaltyDraws === 0 &&
    playableIds.size === 0 &&
    !settings?.houseRules.noHints;

  const isClockwise = direction === 'clockwise';

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      {/* Direction arc SVG overlay */}
      <DirectionIndicator
        dimensions={dimensions}
        playerPositions={playerPositions}
        direction={direction}
        currentPlayerIndex={currentPlayerIndex}
        players={players}
        userId={userId}
      />

      {/* Center area: DrawPile + DiscardPile */}
      {dimensions.width > 0 && (
        <div
          className="absolute flex items-center justify-center gap-6 md:gap-12"
          style={{
            left: dimensions.width / 2,
            top: dimensions.height / 2,
            transform: 'translate(-50%, -50%)',
            flexDirection: isPortrait ? 'column' : 'row',
          }}
        >
          {/* Direction indicator */}
          <div
            key={direction}
            className={`absolute w-32 h-32 md:w-40 md:h-40 border-2 border-dashed border-primary/30 rounded-full flex items-center justify-center pointer-events-none ${isClockwise ? 'animate-spin-cw' : 'animate-spin-ccw'}`}
          >
            <span
              className={`text-direction text-primary/50 animate-fade-in ${isClockwise ? 'animate-spin-ccw' : 'animate-spin-cw'}`}
            >
              {isClockwise ? '↻' : '↺'}
            </span>
          </div>

          <DrawPile side="left" isPortrait={isPortrait} onDraw={onDraw} drawUntilCount={drawUntilCount} />
          <DiscardPile />
          <DrawPile side="right" isPortrait={isPortrait} onDraw={onDraw} />
        </div>
      )}

      {/* 大倒计时：动态定位在「最上方玩家 ↔ 牌堆顶」的中点（随牌桌缩放） */}
      {dimensions.width > 0 &&
        phase !== 'round_end' &&
        phase !== 'game_over' &&
        (() => {
          const pilesTop = dimensions.height / 2 - 90;
          const topMostY = Math.min(...playerPositions.map(p => p.y));
          const gapTop = topMostY + 60; // 对手头像+名字的实际下缘
          if (pilesTop - gapTop < 40) return null; // 空间不足就不显示，避免挤压
          const midY = gapTop + (pilesTop - gapTop) / 2;
          return (
            <div
              className="absolute z-timer-overlay pointer-events-none"
              style={{ left: dimensions.width / 2, top: midY, transform: 'translate(-50%, -50%)' }}
            >
              <CriticalCountdown />
            </div>
          );
        })()}

      {/* Current turn indicator below center */}
      {dimensions.width > 0 &&
        (() => {
          const actingIndex =
            phase === 'challenging' && pendingDrawPlayerId
              ? players.findIndex(p => p.id === pendingDrawPlayerId)
              : currentPlayerIndex;
          const actingPlayer = players[actingIndex];
          if (!actingPlayer) return null;
          return (
            <TurnIndicator
              playerName={actingPlayer.name}
              avatarUrl={actingPlayer.avatarUrl}
              playerIndex={actingIndex}
              isMe={actingPlayer.id === userId}
              turnEndTime={turnEndTime}
              phase={phase}
              cy={dimensions.height / 2}
              isBot={actingPlayer.isBot}
              botDifficulty={actingPlayer.botConfig?.difficulty}
            />
          );
        })()}

      {/* Draw hint centered above table */}
      <AnimatePresence>
        {remainingPenaltyDraws > 0 && dimensions.width > 0 && (
          <motion.div
            key="penalty"
            className="absolute left-1/2 -translate-x-1/2 z-card pointer-events-none whitespace-nowrap font-game text-lg font-bold text-destructive text-shadow-glow"
            style={{ top: dimensions.height / 2 - 130 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            {players[currentPlayerIndex]?.id === userId ? '' : `${players[currentPlayerIndex]?.name} `}还要摸{' '}
            {remainingPenaltyDraws} 张
          </motion.div>
        )}
        {showNoPlayableHint && dimensions.width > 0 && (
          <motion.div
            key="no-playable"
            className="absolute left-1/2 -translate-x-1/2 z-card pointer-events-none whitespace-nowrap font-game text-lg font-bold text-primary text-shadow-glow"
            style={{ top: dimensions.height / 2 - 130 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            无牌可出，摸牌
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seat shuffle overlay */}
      <AnimatePresence>
        {shufflePhase !== 'idle' && dimensions.width > 0 && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 z-fab pointer-events-none"
            style={{ top: dimensions.height / 2 - 100 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.3 } }}
          >
            <div className="px-4 py-2 rounded-full bg-black/60 border border-primary/30 backdrop-blur-sm">
              <span className="text-sm font-game font-bold text-primary text-shadow-glow">🔀 随机座位</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player nodes */}
      {animatedPositions.map((pos, i) => {
        const player = players[i];
        if (!player) return null;
        const isActive = i === currentPlayerIndex;
        const isMe = player.id === userId;
        const lastPlayed = lastPlayedCards.get(player.id);

        return (
          <PlayerNode
            key={player.id}
            player={player}
            index={i}
            isActive={isActive}
            isMe={isMe}
            isHost={player.id === ownerId}
            isSkipped={player.id === skippedPlayerId}
            isSpeaking={isMe ? selfSpeaking : voicePresence[player.id]?.speaking === true}
            voiceState={voicePresence[player.id]}
            position={pos}
            shufflePhase={shufflePhase}
            turnEndTime={isActive ? turnEndTime : null}
            turnTimeLimit={
              settings
                ? settings.houseRules.fastMode
                  ? Math.floor(settings.turnTimeLimit / 2)
                  : settings.turnTimeLimit
                : undefined
            }
            lastPlayedCard={lastPlayed?.card ?? null}
            handGain={handGainBumps.get(player.id) ?? null}
            handSwap={handSwapEffects.get(player.id) ?? null}
            onReaction={handleReaction}
            onThrowItem={item => handleThrowItem(player.id, item)}
          />
        );
      })}

      {/* Spectator seats */}
      {dimensions.width > 0 && <SpectatorSeats top={dimensions.height / 2 - 168} />}
    </div>
  );
}
