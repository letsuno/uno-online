import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import DrawPile from './DrawPile';
import DiscardPile from './DiscardPile';
import PlayerNode from './PlayerNode';
import ThrowAnimation from './ThrowAnimation';
import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '../stores/auth-store';
import { getSocket } from '../socket';

interface ThrowEvent {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
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
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;

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
    const handler = (data: { fromPlayerId: string; toPlayerId: string; item: string }) => {
      const fromPos = getPlayerPosition(data.fromPlayerId);
      const toPos = getPlayerPosition(data.toPlayerId);
      if (!fromPos || !toPos) return;

      const id = `throw_${++throwIdCounter}`;
      setActiveThrows((prev) => [...prev, { id, from: fromPos, to: toPos, item: data.item }]);
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

  // Handle reaction from quick reaction menu
  const handleReaction = useCallback((emoji: string) => {
    getSocket().emit('chat:message', { text: emoji });
  }, []);

  // Handle throw item
  const handleThrowItem = useCallback((targetPlayerId: string, item: string) => {
    getSocket().emit('throw:item', { toPlayerId: targetPlayerId, item });
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

    // Create full ellipse path
    // SVG elliptical arc doesn't directly support full ellipse,
    // so we use two arcs
    const startX = cx + rx;
    const startY = cy;
    const isClockwise = direction === 'clockwise';

    return {
      path: `M ${startX} ${startY} A ${rx} ${ry} 0 1 1 ${startX - 0.001} ${startY} A ${rx} ${ry} 0 1 1 ${startX} ${startY}`,
      isClockwise,
      circumference: 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2),
    };
  }, [playerPositions, dimensions, direction]);

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
            d={directionArc.path}
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

          <DrawPile onDraw={onDraw} />
          <DiscardPile />
        </div>
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
