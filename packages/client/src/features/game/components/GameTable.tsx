import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import DrawPile from './DrawPile';
import DiscardPile from './DiscardPile';
import PlayerNode from './PlayerNode';
import ThrowAnimation from './ThrowAnimation';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { cn } from '@/shared/lib/utils';

interface ThrowEvent {
  id: string;
  fromId: string;
  targetId: string;
  item: string;
}

interface ActiveThrow {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  item: string;
}

interface GameTableProps {
  onDraw: () => void;
}

let throwIdCounter = 0;

export default function GameTable({ onDraw }: GameTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const direction = useGameStore((s) => s.direction);
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const settings = useGameStore((s) => s.settings);
  const lastAction = useGameStore((s) => s.lastAction);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore((s) => s.room?.ownerId);

  // Chat messages per player
  const [chatMessages, setChatMessages] = useState<Map<string, string>>(new Map());
  const chatTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  // Track skipped player (show ban overlay for 1.5s)
  const [skippedPlayerId, setSkippedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (lastAction?.type === 'PLAY_CARD' && lastAction.playerId) {
      const { discardPile: dp, direction: dir, players: ps } = useGameStore.getState();
      const topCard = dp[dp.length - 1];
      if (topCard?.type === 'skip') {
        const actorIdx = ps.findIndex((p) => p.id === lastAction.playerId);
        if (actorIdx >= 0) {
          const step = dir === 'clockwise' ? 1 : -1;
          const skippedIdx = ((actorIdx + step) % ps.length + ps.length) % ps.length;
          setSkippedPlayerId(ps[skippedIdx]?.id ?? null);
          const timer = window.setTimeout(() => setSkippedPlayerId(null), 1500);
          return () => window.clearTimeout(timer);
        }
      }
    }
  }, [lastAction]);

  // Listen for chat messages from socket
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { userId: string; text: string }) => {
      setChatMessages((prev) => {
        const next = new Map(prev);
        next.set(data.userId, data.text);
        return next;
      });

      // Clear previous timer for this player
      const existing = chatTimers.current.get(data.userId);
      if (existing) clearTimeout(existing);

      // Auto-dismiss after 3s
      const timer = setTimeout(() => {
        setChatMessages((prev) => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
        chatTimers.current.delete(data.userId);
      }, 3000);
      chatTimers.current.set(data.userId, timer);
    };

    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:message', handler);
      // Clean up timers
      chatTimers.current.forEach((t) => clearTimeout(t));
      chatTimers.current.clear();
    };
  }, []);

  // Listen for throw:item events from socket
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { fromId: string; targetId: string; item: string }) => {
      const fromPos = getPlayerPosition(data.fromId);
      const toPos = getPlayerPosition(data.targetId);
      if (!fromPos || !toPos) return;

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

  // Calculate player positions on ellipse
  const playerPositions = useMemo(() => {
    const { width, height } = dimensions;
    if (width === 0 || height === 0 || players.length === 0) return [];

    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.38;
    const ry = height * 0.38;
    const n = players.length;

    // Find my index
    const myIndex = players.findIndex((p) => p.id === userId);
    const safeMyIndex = myIndex >= 0 ? myIndex : 0;

    const positions: { x: number; y: number }[] = [];

    for (let i = 0; i < n; i++) {
      // My position is at bottom (angle = PI/2)
      // Other players distributed clockwise from there
      const offset = i - safeMyIndex;
      const angle = Math.PI / 2 + (offset * 2 * Math.PI) / n;
      positions.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      });
    }

    return positions;
  }, [dimensions, players, userId]);

  // Helper: get position for a player by ID
  const getPlayerPosition = useCallback((playerId: string) => {
    const idx = players.findIndex((p) => p.id === playerId);
    if (idx < 0 || idx >= playerPositions.length) return null;
    return playerPositions[idx];
  }, [players, playerPositions]);

  // Draw animation: track who drew and compute target direction
  const [drawAnim, setDrawAnim] = useState<{ trigger: number; targetX: number; targetY: number }>({ trigger: 0, targetX: 0, targetY: 220 });

  const computeDrawTarget = useCallback((playerId: string) => {
    const pos = getPlayerPosition(playerId);
    if (!pos || dimensions.width === 0) return { x: 0, y: 220 };
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    return { x: pos.x - cx, y: pos.y - cy };
  }, [getPlayerPosition, dimensions]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { playerId: string }) => {
      const target = computeDrawTarget(data.playerId);
      setDrawAnim((prev) => ({ trigger: prev.trigger + 1, targetX: target.x, targetY: target.y }));
    };
    socket.on('game:opponent_drew', handler);
    return () => { socket.off('game:opponent_drew', handler); };
  }, [computeDrawTarget]);

  useEffect(() => {
    if (lastAction?.type === 'DRAW_CARD' && lastAction.playerId === userId) {
      const target = computeDrawTarget(lastAction.playerId);
      setDrawAnim((prev) => ({ trigger: prev.trigger + 1, targetX: target.x, targetY: target.y }));
    }
  }, [lastAction, userId, computeDrawTarget]);

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

  // Direction arc path for SVG overlay
  const directionArc = useMemo(() => {
    if (playerPositions.length < 2) return null;
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return null;

    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.38;
    const ry = height * 0.38;
    const n = players.length;

    const isClockwise = direction === 'clockwise';
    const leftX = cx - rx;
    const rightX = cx + rx;

    const fullPath = `M ${rightX} ${cy} A ${rx} ${ry} 0 1 1 ${leftX} ${cy} A ${rx} ${ry} 0 1 1 ${rightX} ${cy}`;

    const myIndex = players.findIndex((p) => p.id === userId);
    const safeMyIndex = myIndex >= 0 ? myIndex : 0;

    const currentOffset = currentPlayerIndex - safeMyIndex;
    const step = isClockwise ? 1 : -1;
    const nextIdx = ((currentPlayerIndex + step) % n + n) % n;
    const nextOffset = nextIdx - safeMyIndex;

    const startAngle = Math.PI / 2 + (currentOffset * 2 * Math.PI) / n;
    const endAngle = Math.PI / 2 + (nextOffset * 2 * Math.PI) / n;

    const sx = cx + rx * Math.cos(startAngle);
    const sy = cy + ry * Math.sin(startAngle);
    const ex = cx + rx * Math.cos(endAngle);
    const ey = cy + ry * Math.sin(endAngle);

    let angleDiff = endAngle - startAngle;
    if (isClockwise) {
      if (angleDiff <= 0) angleDiff += 2 * Math.PI;
    } else {
      if (angleDiff >= 0) angleDiff -= 2 * Math.PI;
    }
    const largeArc = Math.abs(angleDiff) > Math.PI ? 1 : 0;
    const sweep = isClockwise ? 1 : 0;

    const highlightPath = `M ${sx} ${sy} A ${rx} ${ry} 0 ${largeArc} ${sweep} ${ex} ${ey}`;

    return { fullPath, highlightPath, isClockwise };
  }, [playerPositions, dimensions, direction, players, userId, currentPlayerIndex]);

  const isClockwise = direction === 'clockwise';

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      {/* Direction arc SVG overlay */}
      {directionArc && dimensions.width > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={dimensions.width}
          height={dimensions.height}
        >
          <motion.path
            d={directionArc.fullPath}
            fill="none"
            stroke="rgba(251, 191, 36, 0.15)"
            strokeWidth={2}
            strokeDasharray="8 6"
            animate={{
              strokeDashoffset: isClockwise
                ? [0, -28]
                : [0, 28],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          <motion.path
            key={currentPlayerIndex}
            d={directionArc.highlightPath}
            fill="none"
            stroke="rgba(251, 191, 36, 0.6)"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          />
        </svg>
      )}

      {/* Center area: DrawPile + DiscardPile */}
      {dimensions.width > 0 && (
        <div
          className="absolute flex items-center justify-center gap-6 md:gap-10"
          style={{
            left: dimensions.width / 2,
            top: dimensions.height / 2,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Direction indicator */}
          <motion.div
            className="absolute w-32 h-32 md:w-40 md:h-40 border-2 border-dashed border-primary/30 rounded-full flex items-center justify-center pointer-events-none"
            animate={{ rotate: isClockwise ? 0 : 180 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <motion.span
              className="text-direction text-primary/50"
              key={direction}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            >
              {isClockwise ? '↻' : '↺'}
            </motion.span>
          </motion.div>

          <DrawPile onDraw={onDraw} drawAnimTrigger={drawAnim.trigger} drawTargetX={drawAnim.targetX} drawTargetY={drawAnim.targetY} />
          <DiscardPile />
        </div>
      )}

      {/* Current turn indicator below center */}
      {dimensions.width > 0 && players[currentPlayerIndex] && (
        <TurnIndicator
          playerName={players[currentPlayerIndex]!.name}
          isMe={players[currentPlayerIndex]!.id === userId}
          turnEndTime={turnEndTime}
          cx={dimensions.width / 2}
          cy={dimensions.height / 2}
        />
      )}

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
            position={pos}
            turnEndTime={isActive ? turnEndTime : null}
            turnTimeLimit={settings?.turnTimeLimit}
            lastPlayedCard={lastPlayed?.card ?? null}
            chatMessage={chatMessages.get(player.id) ?? null}
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
    </div>
  );
}

function TurnIndicator({ playerName, isMe, turnEndTime, cx, cy }: {
  playerName: string;
  isMe: boolean;
  turnEndTime: number | null;
  cx: number;
  cy: number;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!turnEndTime) { setSecondsLeft(null); return; }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((turnEndTime - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [turnEndTime]);

  const urgent = secondsLeft !== null && secondsLeft <= 5;

  return (
    <motion.div
      key={playerName}
      className="absolute pointer-events-none flex items-center gap-2 whitespace-nowrap"
      style={{ left: cx, top: cy + 80, transform: 'translateX(-50%)' }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <span className={cn(
        'font-game text-sm',
        isMe ? 'text-primary font-bold' : 'text-foreground',
      )}>
        {isMe ? '你的回合' : playerName}
      </span>
      {secondsLeft !== null && (
        <span className={cn(
          'font-game text-sm tabular-nums',
          urgent ? 'text-destructive font-bold animate-timer-flash' : 'text-muted-foreground',
        )}>
          {secondsLeft}s
        </span>
      )}
    </motion.div>
  );
}
