import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import Card from './Card';
import CountdownRing from './CountdownRing';
import GoogleRing from '@/shared/components/ui/GoogleRing';
import ChatBubble from './ChatBubble';
import QuickReaction from './QuickReaction';
import ThrowItemPicker from './ThrowItemPicker';
import { cn, getRoleColor } from '@/shared/lib/utils';
import type { PlayerInfo } from '../stores/game-store';

export const AVATAR_COLORS = [
  '#ff3366',
  '#33cc66',
  '#4488ff',
  '#f97316',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#6366f1',
];
export const AVATAR_EMOJIS = [
  '😎',
  '🤠',
  '😺',
  '🐸',
  '🦊',
  '🐱',
  '🐶',
  '🦁',
  '🐼',
];

interface PlayerNodeProps {
  player: PlayerInfo;
  index: number;
  isActive: boolean;
  isMe: boolean;
  isHost: boolean;
  isSkipped: boolean;
  position: { x: number; y: number };
  turnEndTime?: number | null;
  turnTimeLimit?: number;
  lastPlayedCard?: CardType | null;
  chatMessage?: string | null;
  onReaction?: (emoji: string) => void;
  onThrowItem?: (item: string) => void;
}

export default function PlayerNode({
  player,
  index,
  isActive,
  isMe,
  isHost,
  isSkipped,
  position,
  turnEndTime,
  turnTimeLimit,
  lastPlayedCard,
  chatMessage,
  onReaction,
  onThrowItem,
}: PlayerNodeProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [showReaction, setShowReaction] = useState(false);
  const [showThrowPicker, setShowThrowPicker] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !turnEndTime) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((turnEndTime - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive, turnEndTime]);

  const getAnchor = useCallback(() => {
    const rect = avatarRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: rect.left + rect.width / 2, y: rect.top - 8 };
  }, []);

  const handleClick = useCallback(() => {
    if (isMe) {
      setMenuAnchor(getAnchor());
      setShowReaction(true);
      setShowThrowPicker(false);
    } else {
      setMenuAnchor(getAnchor());
      setShowThrowPicker(true);
      setShowReaction(false);
    }
  }, [isMe, getAnchor]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleTouchStart = useCallback(() => {
    // no-op, single tap handles everything
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  }, []);

  const handleReactionSelect = useCallback((emoji: string) => {
    onReaction?.(emoji);
    setShowReaction(false);
  }, [onReaction]);

  const handleThrowSelect = useCallback((item: string) => {
    onThrowItem?.(item);
    setShowThrowPicker(false);
  }, [onThrowItem]);

  const closeReaction = useCallback(() => setShowReaction(false), []);
  const closeThrowPicker = useCallback(() => setShowThrowPicker(false), []);

  const avatarSize = isMe ? 48 : 44;
  const displayName =
    player.name.length > 8 ? player.name.slice(0, 8) + '...' : player.name;

  return (
    <div
      className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: `translate(-50%, -${avatarSize / 2}px)`,
        zIndex: showReaction || showThrowPicker ? 100 : undefined,
        ...(player.eliminated
          ? { opacity: 0.35, filter: 'grayscale(0.8)' }
          : {}),
      }}
    >
      {/* Chat bubble */}
      <ChatBubble message={chatMessage ?? ''} visible={!!chatMessage} />

      {/* Quick reaction menu */}
      {showReaction && (
        <QuickReaction onSelect={handleReactionSelect} onClose={closeReaction} anchorX={menuAnchor.x} anchorY={menuAnchor.y} />
      )}

      {/* Throw item picker */}
      {showThrowPicker && (
        <ThrowItemPicker onSelect={handleThrowSelect} onClose={closeThrowPicker} anchorX={menuAnchor.x} anchorY={menuAnchor.y} />
      )}

      {/* Avatar container */}
      <div
        ref={avatarRef}
        className="relative pointer-events-auto"
        style={{ width: avatarSize, height: avatarSize }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Countdown ring overlay */}
        {isActive && secondsLeft !== null && turnTimeLimit && (
          <CountdownRing
            totalSeconds={turnTimeLimit}
            remainingSeconds={secondsLeft}
            size={avatarSize}
            strokeWidth={3}
          />
        )}

        {/* Avatar circle */}
        <div
          className={cn(
            'rounded-full flex items-center justify-center overflow-hidden',
            'text-sm md:text-lg',
            'transition-[box-shadow] duration-300 ease-in-out',
            isActive && 'animate-draw-pulse shadow-glow-active',
          )}
          style={{
            background: AVATAR_COLORS[index % AVATAR_COLORS.length],
            width: avatarSize - 4,
            height: avatarSize - 4,
            margin: 2,
          }}
        >
          {AVATAR_EMOJIS[index % AVATAR_EMOJIS.length]}
        </div>

        {/* Google-style colored ring */}
        <GoogleRing size={avatarSize} />

        {/* Host crown */}
        {isHost && (
          <div className="absolute -top-1.5 -left-1.5 text-sm leading-none drop-shadow">👑</div>
        )}

        {/* Skip ban overlay */}
        <AnimatePresence>
          {isSkipped && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <span className="text-2xl text-effect-skip drop-shadow">⊘</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Disconnected indicator */}
        {!player.connected && (
          <div className="absolute top-0 right-0 w-3 h-3 rounded-full bg-destructive border-2 border-background" />
        )}

        {/* Last played card mini */}
        <AnimatePresence>
          {lastPlayedCard && (
            <motion.div
              className="absolute -bottom-1 -right-2"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              <Card
                card={lastPlayedCard}
                mini
                className="!w-card-mini-w !h-card-mini-h !text-2xs !border !rounded-none !shadow-none"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Username */}
      <span
        className={cn(
          'text-xs text-foreground transition-colors duration-300 whitespace-nowrap',
          isActive && 'text-primary font-bold',
          isMe && 'text-primary',
        )}
        style={(!isActive && !isMe && getRoleColor(player.role))
          ? { color: getRoleColor(player.role) }
          : undefined}
      >
        {displayName}
      </span>

      {/* Hand count */}
      <span className="text-xs text-muted-foreground">
        {player.handCount}张
      </span>
    </div>
  );
}
