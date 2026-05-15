import { memo, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Trophy, Mic, MicOff } from 'lucide-react';
import type { Card as CardType } from '@uno-online/shared';
import type { PlayerVoicePresence } from '@/shared/voice/gateway-store';
import Card from './Card';
import CardBack from './CardBack';
import CountdownRing from './CountdownRing';
import GoogleRing from '@/shared/components/ui/GoogleRing';
import ChatBubble from './ChatBubble';
import QuickReaction from './QuickReaction';
import ThrowItemPicker from './ThrowItemPicker';
import { cn, getRoleColor } from '@/shared/lib/utils';
import { AiBadge } from '@/shared/components/ui/AiBadge';
import { BotPlayerBadge } from './BotPlayerBadge';
import { useCountdown } from '../hooks/useCountdown';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants/avatars';
import type { PlayerInfo } from '../stores/game-store';

interface PlayerNodeProps {
  player: PlayerInfo;
  index: number;
  isActive: boolean;
  isMe: boolean;
  isHost: boolean;
  isSkipped: boolean;
  isSpeaking?: boolean;
  voiceState?: PlayerVoicePresence;
  position: { x: number; y: number };
  shufflePhase?: 'idle' | 'shuffling' | 'settling';
  turnEndTime?: number | null;
  turnTimeLimit?: number;
  lastPlayedCard?: CardType | null;
  chatMessage?: string | null;
  handGain?: { id: number; count: number } | null;
  handSwap?: { id: number; fromX: number } | null;
  onReaction?: (emoji: string) => void;
  onThrowItem?: (item: string) => void;
}

function PlayerNode({
  player,
  index,
  isActive,
  isMe,
  isHost,
  isSkipped,
  isSpeaking = false,
  voiceState,
  position,
  shufflePhase = 'idle',
  turnEndTime,
  turnTimeLimit,
  lastPlayedCard,
  chatMessage,
  handGain,
  handSwap,
  onReaction,
  onThrowItem,
}: PlayerNodeProps) {
  const secondsLeft = useCountdown(isActive ? turnEndTime : null);
  const [showReaction, setShowReaction] = useState(false);
  const [showThrowPicker, setShowThrowPicker] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const avatarRef = useRef<HTMLDivElement>(null);

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
  }, [onThrowItem]);

  const closeReaction = useCallback(() => setShowReaction(false), []);
  const closeThrowPicker = useCallback(() => setShowThrowPicker(false), []);

  const avatarSize = isMe ? 48 : 44;
  const displayName =
    player.name.length > 8 ? player.name.slice(0, 8) + '...' : player.name;
  const avatarInnerSize = avatarSize - 4;
  const revealedHand =
    player.hand.length > 0 && player.hand.length === player.handCount
      ? player.hand
      : [];
  const shouldShowRevealedHand = !isMe && revealedHand.length > 0;
  const roleColor = getRoleColor(player.role);

  const positionTransition =
    shufflePhase === 'shuffling'
      ? { duration: 0.14, ease: 'easeOut' as const }
      : shufflePhase === 'settling'
        ? { type: 'spring' as const, stiffness: 120, damping: 14 }
        : { duration: 0 };

  return (
    <motion.div
      className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
      initial={false}
      animate={{
        left: position.x,
        top: position.y,
      }}
      transition={positionTransition}
      style={{
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
        onContextMenu={(e) => e.preventDefault()}
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
            'relative',
            'text-sm md:text-lg',
            'transition-[box-shadow] duration-300 ease-in-out',
            isActive && 'animate-draw-pulse shadow-glow-active',
            isSpeaking && 'ring-2 ring-green-400 shadow-[0_0_10px_rgba(74,222,128,0.6)]',
          )}
          style={{
            background: AVATAR_COLORS[index % AVATAR_COLORS.length],
            width: avatarInnerSize,
            height: avatarInnerSize,
            margin: 2,
          }}
        >
          <span>{AVATAR_EMOJIS[index % AVATAR_EMOJIS.length]}</span>
          {player.avatarUrl && (
            <img
              src={player.avatarUrl}
              alt={player.name}
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
        </div>

        {/* Round wins and score */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 flex flex-col gap-0.5 pointer-events-none">
          <div className="h-4 min-w-10 rounded bg-black/45 border border-white/10 px-1.5 flex items-center justify-between gap-1 shadow-card-sm">
            <Trophy size={10} className="text-accent shrink-0" />
            <span className="text-2xs leading-none tabular-nums font-bold text-foreground">{player.roundWins ?? 0}</span>
          </div>
          <div className="h-4 min-w-10 rounded bg-black/45 border border-white/10 px-1.5 flex items-center justify-between gap-1 shadow-card-sm">
            <span className="text-2xs leading-none tabular-nums font-bold text-foreground">{player.score}分</span>
          </div>
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

        {/* Voice indicator */}
        {voiceState?.inVoice && (
          <div
            className={cn(
              'absolute -bottom-0.5 -left-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-background',
              isSpeaking ? 'bg-green-500' : voiceState.micEnabled ? 'bg-slate-600' : 'bg-red-500/80',
            )}
          >
            {voiceState.micEnabled
              ? <Mic size={10} className="text-white" />
              : <MicOff size={10} className="text-white" />}
          </div>
        )}

        {/* Autopilot / Disconnected indicator */}
        {player.autopilot ? (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center border-2 border-background">
            <Bot size={12} className="text-primary-foreground" />
          </div>
        ) : !player.connected ? (
          <div className="absolute top-0 right-0 w-3 h-3 rounded-full bg-destructive border-2 border-background" />
        ) : null}

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
        style={(!isActive && !isMe && roleColor)
          ? { color: roleColor }
          : undefined}
      >
        {displayName}
        {player.isBot && player.botConfig
          ? <BotPlayerBadge difficulty={player.botConfig.difficulty} />
          : player.isBot && <AiBadge className="ml-1" />}
      </span>

      {/* Hand count */}
      {(player.handCount > 0 || handSwap) && (
        <motion.div
          key={handSwap ? `${player.id}-swap-${handSwap.id}-${player.handCount}` : `${player.id}-hand-${player.handCount}`}
          className="relative flex min-h-card-mini-h items-center gap-1"
          initial={handSwap ? { x: handSwap.fromX, opacity: 0.2, scale: 0.92 } : false}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.34, ease: 'easeOut' }}
        >
          {player.handCount === 0 ? (
            <span className="h-card-mini-h min-w-card-mini-w rounded-sm border border-dashed border-white/20 bg-black/20" />
          ) : shouldShowRevealedHand ? (
            <div className="flex -space-x-2">
              {revealedHand.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  mini
                  className="!w-card-mini-w !h-card-mini-h !text-2xs !border !rounded-sm !shadow-none"
                />
              ))}
            </div>
          ) : player.handCount <= 5 ? (
            <div className="flex -space-x-2">
              {Array.from({ length: player.handCount }).map((_, i) => (
                <CardBack key={i} small />
              ))}
            </div>
          ) : (
            <>
              <div className="flex -space-x-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <CardBack key={i} small />
                ))}
              </div>
              <span className="text-2xs text-muted-foreground font-bold">×{player.handCount}</span>
            </>
          )}
          <AnimatePresence mode="popLayout">
            {handGain && (
              <motion.span
                key={handGain.id}
                className="absolute left-full ml-1 text-xs font-game font-black text-primary text-shadow-glow tabular-nums"
                initial={{ y: -10, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 14, opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.22 }}
              >
                +{handGain.count}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}

export default memo(PlayerNode, (prev, next) => {
  return (
    prev.player.id === next.player.id &&
    prev.player.handCount === next.player.handCount &&
    prev.player.connected === next.player.connected &&
    prev.player.autopilot === next.player.autopilot &&
    prev.player.calledUno === next.player.calledUno &&
    prev.player.eliminated === next.player.eliminated &&
    prev.player.score === next.player.score &&
    prev.player.roundWins === next.player.roundWins &&
    prev.player.avatarUrl === next.player.avatarUrl &&
    prev.player.role === next.player.role &&
    prev.player.hand.length === next.player.hand.length &&
    prev.index === next.index &&
    prev.isActive === next.isActive &&
    prev.isMe === next.isMe &&
    prev.isHost === next.isHost &&
    prev.isSkipped === next.isSkipped &&
    prev.isSpeaking === next.isSpeaking &&
    prev.voiceState?.inVoice === next.voiceState?.inVoice &&
    prev.voiceState?.micEnabled === next.voiceState?.micEnabled &&
    prev.position.x === next.position.x &&
    prev.position.y === next.position.y &&
    prev.shufflePhase === next.shufflePhase &&
    prev.turnEndTime === next.turnEndTime &&
    prev.turnTimeLimit === next.turnTimeLimit &&
    prev.lastPlayedCard?.id === next.lastPlayedCard?.id &&
    prev.chatMessage === next.chatMessage &&
    prev.handGain?.id === next.handGain?.id &&
    prev.handGain?.count === next.handGain?.count &&
    prev.handSwap?.id === next.handSwap?.id &&
    prev.onReaction === next.onReaction &&
    prev.onThrowItem === next.onThrowItem
  );
});
