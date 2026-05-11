import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import DrawPile from './DrawPile';
import DiscardPile from './DiscardPile';
import PlayerNode from './PlayerNode';
import TurnIndicator from './TurnIndicator';
import HandSwapAnimation from './HandSwapAnimation';
import DirectionIndicator from './DirectionIndicator';
import ThrowAnimation from './ThrowAnimation';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { useGatewayStore } from '@/shared/voice/gateway-store';
import { useMemo } from 'react';
import { playThrowHitSound } from '@/shared/sound/sound-manager';
import { usePlayerLayout } from '../hooks/usePlayerLayout';
import { useDrawAnimation } from '../hooks/useDrawAnimation';
import { useChatBubbles } from '../hooks/useChatBubbles';

interface ActiveThrow {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  item: string;
}

interface GameTableProps {
  onDraw: (side: 'left' | 'right') => void;
}

let throwIdCounter = 0;

export default function GameTable({ onDraw }: GameTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isPortrait = dimensions.height > dimensions.width;

  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const direction = useGameStore((s) => s.direction);
  const phase = useGameStore((s) => s.phase);
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const settings = useGameStore((s) => s.settings);
  const lastAction = useGameStore((s) => s.lastAction);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore((s) => s.room?.ownerId);

  // Mumble speaking state
  const mumbleUsersById = useGatewayStore((s) => s.usersById);
  const mumbleSpeakingByUserId = useGatewayStore((s) => s.speakingByUserId);
  const selfSpeaking = useGatewayStore((s) => s.selfSpeaking);
  const voicePresence = useGatewayStore((s) => s.playerVoicePresence);
  const mumbleSpeakingNames = useMemo(() => {
    const names = new Set<string>();
    for (const [uid, speaking] of Object.entries(mumbleSpeakingByUserId)) {
      if (speaking) {
        const user = mumbleUsersById[Number(uid)];
        if (user) names.add(user.name);
      }
    }
    return names;
  }, [mumbleUsersById, mumbleSpeakingByUserId]);

  // Chat messages per player
  const chatMessages = useChatBubbles();

  // Active throw animations
  const [activeThrows, setActiveThrows] = useState<ActiveThrow[]>([]);

  // Track container dimensions with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
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

  // Track last played cards per player
  const [lastPlayedCards, setLastPlayedCards] = useState<
    Map<string, { card: CardType; time: number }>
  >(new Map());

  useEffect(() => {
    if (
      lastAction?.type === 'PLAY_CARD' &&
      lastAction.playerId
    ) {
      const discardPile = useGameStore.getState().discardPile;
      const topCard = discardPile[discardPile.length - 1];
      if (topCard) {
        setLastPlayedCards((prev) => {
          const next = new Map(prev);
          next.set(lastAction.playerId, { card: topCard, time: Date.now() });
          return next;
        });

        const playerId = lastAction.playerId;
        const timer = window.setTimeout(() => {
          setLastPlayedCards((prev) => {
            const next = new Map(prev);
            next.delete(playerId);
            return next;
          });
        }, 5000);

        return () => window.clearTimeout(timer);
      }
    }
  }, [lastAction]);

  // Track skipped player
  const [skippedPlayerId, setSkippedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (lastAction?.type === 'PLAY_CARD' && lastAction.playerId) {
      const { discardPile: dp, direction: dir, players: ps } = useGameStore.getState();
      const topCard = dp[dp.length - 1];

      let skippedIdx = -1;
      const actorIdx = ps.findIndex((p) => p.id === lastAction.playerId);

      if (actorIdx >= 0) {
        const step = dir === 'clockwise' ? 1 : -1;
        const nextIdx = ((actorIdx + step) % ps.length + ps.length) % ps.length;

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
          setLastPlayedCards((prev) => {
            if (!prev.has(skippedId)) return prev;
            const next = new Map(prev);
            next.delete(skippedId);
            return next;
          });
        }
        const timer = window.setTimeout(() => setSkippedPlayerId(null), 1000);
        return () => window.clearTimeout(timer);
      }
    }

    setSkippedPlayerId(null);
  }, [lastAction]);

  // Player layout
  const { playerPositions, getPlayerPosition } = usePlayerLayout(dimensions, players, userId);

  // Draw animation and hand swap animation
  const {
    drawAnimLeft,
    drawAnimRight,
    drawUntilCount,
    handGainBumps,
    activeHandSwaps,
    handSwapEffects,
    handleHandSwapComplete,
  } = useDrawAnimation(
    players,
    dimensions,
    userId,
    lastAction,
    settings,
    direction,
    roundNumber,
    getPlayerPosition,
    phase,
    currentPlayerIndex,
  );

  // Listen for throw:item events from socket
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { fromId: string; targetId: string; item: string }) => {
      const fromPos = getPlayerPosition(data.fromId);
      const toPos = getPlayerPosition(data.targetId);
      if (!fromPos || !toPos) return;
      if (data.targetId === userId) {
        playThrowHitSound(data.item);
      }

      const rect = containerRef.current?.getBoundingClientRect();
      const ox = rect?.left ?? 0;
      const oy = rect?.top ?? 0;

      const id = `throw_${++throwIdCounter}`;
      setActiveThrows((prev) => [...prev, {
        id,
        from: { x: fromPos.x + ox, y: fromPos.y + oy },
        to: { x: toPos.x + ox, y: toPos.y + oy },
        item: data.item,
      }]);
    };

    socket.on('throw:item', handler);
    return () => { socket.off('throw:item', handler); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, dimensions]);

  // Handle reaction from quick reaction menu
  const handleReaction = useCallback((emoji: string) => {
    getSocket().emit('chat:message', { text: emoji });
  }, []);

  // Handle throw item
  const handleThrowItem = useCallback((targetPlayerId: string, item: string) => {
    getSocket().emit('throw:item', { targetId: targetPlayerId, item }, (res: { success: boolean; error?: string }) => {
      if (!res?.success && res?.error) {
        useToastStore.getState().addToast(res.error, 'error');
      }
    });
  }, []);

  // Remove completed throw animation
  const handleThrowComplete = useCallback((id: string) => {
    setActiveThrows((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
          className="absolute flex items-center justify-center gap-3 md:gap-6"
          style={{
            left: dimensions.width / 2,
            top: dimensions.height / 2,
            transform: 'translate(-50%, -50%)',
            flexDirection: isPortrait ? 'column' : 'row',
          }}
        >
          {/* Direction indicator */}
          <motion.div
            key={direction}
            className="absolute w-32 h-32 md:w-40 md:h-40 border-2 border-dashed border-primary/30 rounded-full flex items-center justify-center pointer-events-none"
            animate={{ rotate: isClockwise ? 360 : -360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          >
            <motion.span
              className="text-direction text-primary/50"
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: isClockwise ? -360 : 360 }}
              transition={{
                scale: { type: 'spring', stiffness: 300, damping: 15 },
                opacity: { duration: 0.2 },
                rotate: { duration: 3, repeat: Infinity, ease: 'linear' },
              }}
            >
              {isClockwise ? '↻' : '↺'}
            </motion.span>
          </motion.div>

          <DrawPile
            side="left"
            isPortrait={isPortrait}
            onDraw={onDraw}
            drawAnimTrigger={drawAnimLeft.trigger}
            drawTargetX={drawAnimLeft.targetX}
            drawTargetY={drawAnimLeft.targetY}
            drawUntilCount={drawUntilCount}
          />
          <DiscardPile />
          <DrawPile
            side="right"
            isPortrait={isPortrait}
            onDraw={onDraw}
            drawAnimTrigger={drawAnimRight.trigger}
            drawTargetX={drawAnimRight.targetX}
            drawTargetY={drawAnimRight.targetY}
          />
        </div>
      )}

      {/* Current turn indicator below center */}
      {dimensions.width > 0 && (() => {
        const actingIndex = (phase === 'challenging' && pendingDrawPlayerId)
          ? players.findIndex((p) => p.id === pendingDrawPlayerId)
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
          />
        );
      })()}

      {/* Player nodes */}
      {playerPositions.map((pos, i) => {
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
            isSpeaking={isMe ? selfSpeaking : mumbleSpeakingNames.has(player.name)}
            voiceState={voicePresence[player.id]}
            position={pos}
            turnEndTime={isActive ? turnEndTime : null}
            turnTimeLimit={settings ? (settings.houseRules?.fastMode ? Math.floor(settings.turnTimeLimit / 2) : settings.turnTimeLimit) : undefined}
            lastPlayedCard={lastPlayed?.card ?? null}
            chatMessage={chatMessages.get(player.id) ?? null}
            handGain={handGainBumps.get(player.id) ?? null}
            handSwap={handSwapEffects.get(player.id) ?? null}
            onReaction={handleReaction}
            onThrowItem={(item) => handleThrowItem(player.id, item)}
          />
        );
      })}

      {/* Throw animations */}
      <AnimatePresence>
        {activeThrows.map((t) => (
          <ThrowAnimation
            key={t.id}
            from={t.from}
            to={t.to}
            item={t.item}
            onComplete={() => handleThrowComplete(t.id)}
          />
        ))}
      </AnimatePresence>

      {/* Hand swap animations */}
      <AnimatePresence>
        {activeHandSwaps.map((swap) => (
          <HandSwapAnimation
            key={swap.id}
            swap={swap}
            onComplete={() => handleHandSwapComplete(swap.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
