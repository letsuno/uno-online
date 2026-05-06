import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack';
import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '../stores/auth-store';
import { getPlayableCardIds } from '../utils/playable-cards';
import { cn } from '@/lib/utils';

interface DrawPileProps { onDraw: () => void; }

export default function DrawPile({ onDraw }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const canDraw = isMyTurn && !hasDrawnThisTurn && phase === 'playing';
  const me = players.find((p) => p.id === userId);
  const topCard = discardPile[discardPile.length - 1];

  const playableIds = useMemo(() => {
    if (!isMyTurn || phase !== 'playing') return new Set<string>();
    return getPlayableCardIds({
      hand: me?.hand ?? [],
      topCard,
      currentColor,
      drawStack,
      houseRules: settings?.houseRules,
    });
  }, [currentColor, drawStack, isMyTurn, me?.hand, phase, settings?.houseRules, topCard]);

  const showNoPlayableHint = canDraw && playableIds.size === 0 && !settings?.houseRules?.noHints;
  const emphasizeDraw = canDraw && !settings?.houseRules?.noHints;

  return (
    <div className="flex flex-col items-center gap-1.5 z-[1] relative min-w-[92px]">
      <AnimatePresence>
        {showNoPlayableHint && (
          <motion.div
            className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap font-game text-[13px] text-primary [text-shadow:0_2px_8px_rgba(0,0,0,0.45)]"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            无牌可出，摸牌
          </motion.div>
        )}
      </AnimatePresence>
      <CardBack
        onClick={canDraw ? onDraw : undefined}
        className={cn(
          emphasizeDraw && [
            'border-primary',
            'shadow-[0_0_0_4px_rgba(251,191,36,0.28),0_0_26px_rgba(251,191,36,0.72),3px_4px_0px_rgba(0,0,0,0.2)]',
            'animate-[drawReadyPulse_1s_ease-in-out_infinite_alternate]',
            'hover:-translate-y-2 hover:scale-[1.04]',
          ],
        )}
        style={{
          cursor: canDraw ? 'pointer' : 'default',
          opacity: canDraw ? 1 : 0.5,
        }}
      />
      <span
        className={cn(
          'text-[10px] text-muted-foreground',
          deckCount <= 10 && 'text-destructive font-bold',
        )}
      >
        牌堆 ({deckCount})
      </span>
    </div>
  );
}
