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
}

export default function DrawPile({ onDraw, drawTargetX, drawTargetY, drawAnimTrigger = 0 }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const settings = useGameStore((s) => s.settings);

  const isMyTurn = useIsMyTurn();
  const canDraw = isMyTurn && !hasDrawnThisTurn && phase === 'playing';

  const playableIds = usePlayableCardIds();

  const showNoPlayableHint = canDraw && playableIds.size === 0 && !settings?.houseRules?.noHints;
  const emphasizeDraw = canDraw && !settings?.houseRules?.noHints;

  return (
    <div className="flex flex-col items-center gap-1.5 z-card relative min-w-draw-pile-min">
      <DrawCardAnimation trigger={drawAnimTrigger} targetX={drawTargetX} targetY={drawTargetY} />
      <AnimatePresence>
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
    </div>
  );
}
