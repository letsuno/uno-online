import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useCountdown } from '../hooks/useCountdown';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import DrawPile from './DrawPile';
import DiscardPile from './DiscardPile';
import PlayerNode from './PlayerNode';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants/avatars';
import GoogleRing from '@/shared/components/ui/GoogleRing';
import ThrowAnimation from './ThrowAnimation';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { useGatewayStore } from '@/shared/voice/gateway-store';
import { useChatStore } from '../stores/chat-store';
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

interface HandGainBump {
  id: number;
  count: number;
}

interface GameTableProps {
  onDraw: () => void;
}

let throwIdCounter = 0;
let handGainBumpId = 0;

export default function GameTable({ onDraw }: GameTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const direction = useGameStore((s) => s.direction);
  const phase = useGameStore((s) => s.phase);
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const settings = useGameStore((s) => s.settings);
  const lastAction = useGameStore((s) => s.lastAction);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore((s) => s.room?.ownerId);
  const drawUntilEnabled = Boolean(settings?.houseRules?.drawUntilPlayable || settings?.houseRules?.deathDraw);

  // Mumble speaking state
  const mumbleUsersById = useGatewayStore((s) => s.usersById);
  const mumbleSpeakingByUserId = useGatewayStore((s) => s.speakingByUserId);
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
  const [chatMessages, setChatMessages] = useState<Map<string, string>>(new Map());
  const chatTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const latestChatMessage = useChatStore((s) => s.latestLiveMessage);

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

  // Track skipped player: show ban overlay until the next action, with a fallback timeout
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

  useEffect(() => {
    if (!latestChatMessage) {
      setChatMessages(new Map());
      chatTimers.current.forEach((t) => clearTimeout(t));
      chatTimers.current.clear();
      return;
    }

    setChatMessages((prev) => {
      const next = new Map(prev);
      next.set(latestChatMessage.userId, latestChatMessage.text);
      return next;
    });

    const existing = chatTimers.current.get(latestChatMessage.userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setChatMessages((prev) => {
        const next = new Map(prev);
        next.delete(latestChatMessage.userId);
        return next;
      });
      chatTimers.current.delete(latestChatMessage.userId);
    }, 3000);
    chatTimers.current.set(latestChatMessage.userId, timer);
  }, [latestChatMessage]);

  useEffect(() => {
    return () => {
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

  // Draw animation: track hand count increases and compute target direction
  const [drawAnim, setDrawAnim] = useState<{ trigger: number; targetX: number; targetY: number }>({ trigger: 0, targetX: 0, targetY: 220 });
  const [handGainBumps, setHandGainBumps] = useState<Map<string, HandGainBump>>(new Map());
  const [drawUntilCount, setDrawUntilCount] = useState(0);
  const prevHandCountsRef = useRef<Map<string, number>>(new Map());
  const drawUntilRef = useRef<{ playerId: string | null; count: number; handCount: number | null }>({ playerId: null, count: 0, handCount: null });
  const handGainTimersRef = useRef<Map<string, number>>(new Map());
  const drawAnimationTimersRef = useRef<number[]>([]);

  const computeDrawTarget = useCallback((playerId: string) => {
    const pos = getPlayerPosition(playerId);
    if (!pos || dimensions.width === 0) return { x: 0, y: 220 };
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const isMe = playerId === userId;
    return { x: pos.x - cx, y: pos.y - cy + (isMe ? 92 : 58) };
  }, [getPlayerPosition, dimensions, userId]);

  useEffect(() => {
    if (players.length === 0 || dimensions.width === 0) return;
    const previous = prevHandCountsRef.current;
    for (const player of players) {
      const before = previous.get(player.id);
      const after = player.handCount;
      if (before !== undefined && after > before) {
        const added = after - before;
        const bumpId = ++handGainBumpId;
        setHandGainBumps((prev) => {
          const next = new Map(prev);
          const current = next.get(player.id);
          next.set(player.id, { id: bumpId, count: (current?.count ?? 0) + added });
          return next;
        });
        const existingTimer = handGainTimersRef.current.get(player.id);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }
        const removeTimer = window.setTimeout(() => {
          setHandGainBumps((prev) => {
            const current = prev.get(player.id);
            if (!current || current.id !== bumpId) return prev;
            const next = new Map(prev);
            next.delete(player.id);
            return next;
          });
          handGainTimersRef.current.delete(player.id);
        }, 3000);
        handGainTimersRef.current.set(player.id, removeTimer);

        for (let i = 0; i < added; i++) {
          const target = computeDrawTarget(player.id);
          const timer = window.setTimeout(() => {
            setDrawAnim((prev) => ({
              trigger: prev.trigger + 1,
              targetX: target.x,
              targetY: target.y,
            }));
          }, i * 120);
          drawAnimationTimersRef.current.push(timer);
        }
      }
    }
    prevHandCountsRef.current = new Map(players.map((p) => [p.id, p.handCount]));
  }, [players, dimensions.width, computeDrawTarget]);

  useEffect(() => {
    if (!drawUntilEnabled || phase !== 'playing' || lastAction?.type !== 'DRAW_CARD') {
      drawUntilRef.current = { playerId: null, count: 0, handCount: null };
      setDrawUntilCount(0);
      return;
    }

    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer || lastAction.playerId !== currentPlayer.id) {
      drawUntilRef.current = { playerId: null, count: 0, handCount: null };
      setDrawUntilCount(0);
      return;
    }

    const previous = drawUntilRef.current;
    if (previous.playerId === lastAction.playerId && previous.handCount === currentPlayer.handCount) return;

    const nextCount = previous.playerId === lastAction.playerId ? previous.count + 1 : 1;
    drawUntilRef.current = { playerId: lastAction.playerId, count: nextCount, handCount: currentPlayer.handCount };
    setDrawUntilCount(nextCount);
  }, [drawUntilEnabled, phase, lastAction, players, currentPlayerIndex]);

  useEffect(() => {
    return () => {
      for (const timer of drawAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
      for (const timer of handGainTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      drawAnimationTimersRef.current = [];
      handGainTimersRef.current.clear();
    };
  }, []);

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

    // Tangent direction at the end point for arrowhead
    // Derivative of ellipse: dx/dθ = -rx·sin(θ), dy/dθ = ry·cos(θ)
    const tangentX = -rx * Math.sin(endAngle);
    const tangentY = ry * Math.cos(endAngle);
    const tangentLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    const dir = isClockwise ? 1 : -1;
    const tx = (tangentX / tangentLen) * dir;
    const ty = (tangentY / tangentLen) * dir;

    return { fullPath, highlightPath, isClockwise, arrowTip: { x: ex, y: ey, tx, ty }, cx, cy, rx, ry };
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
            stroke="rgba(251, 191, 36, 0.5)"
            strokeWidth={2}
            strokeDasharray="8 6"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              strokeDashoffset: [0, -28],
            }}
            transition={{
              opacity: { duration: 0.3 },
              strokeDashoffset: { duration: 1.5, repeat: Infinity, ease: 'linear' },
            }}
          />
          {/* Arrowhead at end of highlight arc */}
          {(() => {
            const { x, y, tx, ty } = directionArc.arrowTip;
            const length = 12;
            const halfWidth = 11;
            const nx = -ty, ny = tx;
            const p1x = x - tx * length + nx * halfWidth;
            const p1y = y - ty * length + ny * halfWidth;
            const p2x = x - tx * length - nx * halfWidth;
            const p2y = y - ty * length - ny * halfWidth;
            return (
              <motion.polygon
                key={`arrow-${currentPlayerIndex}`}
                points={`${x},${y} ${p1x},${p1y} ${p2x},${p2y}`}
                fill="rgba(251, 191, 36, 0.6)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
            );
          })()}
          {/* Direction arrows on full ellipse */}
          {(() => {
            const { cx, cy, rx, ry } = directionArc;
            const count = Math.min(players.length * 2, 8);
            const dir = isClockwise ? 1 : -1;
            const arrows = [];
            for (let i = 0; i < count; i++) {
              const angle = (i * 2 * Math.PI) / count;
              const ax = cx + rx * Math.cos(angle);
              const ay = cy + ry * Math.sin(angle);
              const tangentX = -rx * Math.sin(angle);
              const tangentY = ry * Math.cos(angle);
              const len = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
              const atx = (tangentX / len) * dir;
              const aty = (tangentY / len) * dir;
              const anx = -aty, any_ = atx;
              const length = 8;
              const halfWidth = 8;
              arrows.push(
                <polygon
                  key={`dir-arrow-${i}`}
                  points={`${ax + atx * length},${ay + aty * length} ${ax - atx * length + anx * halfWidth},${ay - aty * length + any_ * halfWidth} ${ax - atx * length - anx * halfWidth},${ay - aty * length - any_ * halfWidth}`}
                  fill="rgba(251, 191, 36, 0.15)"
                />
              );
            }
            return arrows;
          })()}
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
            onDraw={onDraw}
            drawAnimTrigger={drawAnim.trigger}
            drawTargetX={drawAnim.targetX}
            drawTargetY={drawAnim.targetY}
            drawUntilCount={drawUntilCount}
          />
          <DiscardPile />
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
            isSpeaking={mumbleSpeakingNames.has(player.name)}
            position={pos}
            turnEndTime={isActive ? turnEndTime : null}
            turnTimeLimit={settings?.turnTimeLimit}
            lastPlayedCard={lastPlayed?.card ?? null}
            chatMessage={chatMessages.get(player.id) ?? null}
            handGain={handGainBumps.get(player.id) ?? null}
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

function TurnIndicator({ playerName, avatarUrl, playerIndex, isMe, turnEndTime, phase, cy }: {
  playerName: string;
  avatarUrl?: string | null;
  playerIndex: number;
  isMe: boolean;
  turnEndTime: number | null;
  phase: string | null;
  cy: number;
}) {
  const secondsLeft = useCountdown(turnEndTime);

  let label: string;
  if (phase === 'challenging') {
    label = isMe ? '选择质疑或接受' : `${playerName} 正在考虑质疑`;
  } else if (phase === 'choosing_color') {
    label = isMe ? '选择颜色' : `${playerName} 正在选色`;
  } else if (phase === 'choosing_swap_target') {
    label = isMe ? '选择交换对象' : `${playerName} 正在选择交换`;
  } else {
    label = isMe ? '你的回合' : playerName;
  }

  const urgent = secondsLeft !== null && secondsLeft <= 5;

  return (
    <motion.div
      key={playerName}
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1 whitespace-nowrap"
      style={{ top: cy + 110 }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-2">
        <div
          className="relative w-7 h-7 rounded-full flex items-center justify-center text-xs overflow-hidden"
          style={{ background: AVATAR_COLORS[playerIndex % AVATAR_COLORS.length] }}
        >
          <span>{AVATAR_EMOJIS[playerIndex % AVATAR_EMOJIS.length]}</span>
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt={playerName}
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <GoogleRing size={0} className="w-full h-full" />
        </div>
        <span className={cn(
          'font-game text-lg',
          isMe ? 'text-primary font-bold' : 'text-foreground',
        )}>
          {label}
        </span>
      </div>
      {secondsLeft !== null && (
        <span className={cn(
          'font-game text-base tabular-nums',
          urgent ? 'text-destructive font-bold animate-timer-flash' : 'text-muted-foreground',
        )}>
          {secondsLeft}s
        </span>
      )}
    </motion.div>
  );
}
