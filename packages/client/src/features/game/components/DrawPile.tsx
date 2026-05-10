import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack';
import DrawCardAnimation from './DrawCardAnimation';
import { useGameStore } from '../stores/game-store';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { cn } from '@/shared/lib/utils';

interface DrawPileProps {
  onDraw: () => void;
  drawTargetX?: number;
  drawTargetY?: number;
  drawAnimTrigger?: number;
  drawUntilCount?: number;
}

export default function DrawPile({ onDraw, drawTargetX, drawTargetY, drawAnimTrigger = 0, drawUntilCount = 0 }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);

  const isMyTurn = useIsMyTurn();
  const remainingPenaltyDraws = pendingPenaltyDraws > 0 ? pendingPenaltyDraws : drawStack;
  const isPenaltyDrawing = remainingPenaltyDraws > 0;
  const playableIds = usePlayableCardIds();
  const mustDrawUntilPlayable = Boolean(settings?.houseRules?.drawUntilPlayable || settings?.houseRules?.deathDraw);
  const isDrawUntilTurn = mustDrawUntilPlayable && !isPenaltyDrawing;
  const canContinueDrawUntilPlayable = !isPenaltyDrawing && mustDrawUntilPlayable && hasDrawnThisTurn && playableIds.size === 0;
  const canDraw = isMyTurn && phase === 'playing' && (isPenaltyDrawing || !hasDrawnThisTurn || canContinueDrawUntilPlayable);

  const showNoPlayableHint = canDraw && !isDrawUntilTurn && playableIds.size === 0 && !settings?.houseRules?.noHints;
  const emphasizeDraw = canDraw && !settings?.houseRules?.noHints;

  return (
    <div className="flex flex-col items-center gap-1.5 z-card relative min-w-draw-pile-min">
      <DrawCardAnimation trigger={drawAnimTrigger} targetX={drawTargetX} targetY={drawTargetY} />
      <AnimatePresence>
        {isPenaltyDrawing && canDraw && (
          <motion.div
            className="absolute bottom-hint-bottom left-1/2 -translate-x-1/2 whitespace-nowrap font-game text-caption text-destructive text-shadow-glow"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            还要摸 {remainingPenaltyDraws} 张
          </motion.div>
        )}
        {showNoPlayableHint && (
          <motion.div
            className="absolute bottom-hint-bottom left-1/2 -translate-x-1/2 whitespace-nowrap font-game text-caption text-primary text-shadow-glow"
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
            'shadow-draw-ready',
            'animate-draw-pulse',
            'hover:-translate-y-2 hover:scale-draw-hover',
          ],
        )}
        style={{
          cursor: canDraw ? 'pointer' : 'default',
          opacity: canDraw ? 1 : 0.5,
        }}
      />
      <span
        className={cn(
          'text-xs text-muted-foreground',
          deckCount <= 10 && 'text-destructive font-bold',
        )}
      >
        牌堆 ({deckCount})
      </span>
      <AnimatePresence>
        {isDrawUntilTurn && drawUntilCount > 0 && (
          <motion.span
            className="font-game text-caption text-primary text-shadow-glow whitespace-nowrap"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            已摸 {drawUntilCount} 张
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
