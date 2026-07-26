import { RotateCw, RotateCcw } from 'lucide-react';
import type { Color } from '@uno-online/shared';
import Card from '../Card';
import CriticalCountdown from '../CriticalCountdown';
import { useGameStore } from '../../stores/game-store';
import { useFxStore } from '../../fx/fx-store';
import { useEffectiveUserId } from '../../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../../hooks/usePlayableCardIds';
import { cn } from '@/shared/lib/utils';

const COLOR_HEX: Record<Color, string> = {
  red: 'var(--color-uno-red)',
  blue: 'var(--color-uno-blue)',
  green: 'var(--color-uno-green)',
  yellow: 'var(--color-uno-yellow)',
};

const COLOR_LABEL: Record<Color, string> = {
  red: '红', blue: '蓝', green: '绿', yellow: '黄',
};

interface StageCenterProps {
  onDraw: (side: 'left' | 'right') => void;
  compact?: boolean;
}

function useCanDraw(side: 'left' | 'right') {
  const deckCount = useGameStore((s) => side === 'left' ? s.deckLeftCount : s.deckRightCount);
  const discardPileLength = useGameStore((s) => s.discardPile.length);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);
  const isMyTurn = useIsMyTurn();
  const playableIds = usePlayableCardIds();

  const remainingPenaltyDraws = pendingPenaltyDraws > 0 ? pendingPenaltyDraws : drawStack;
  const isPenaltyDrawing = remainingPenaltyDraws > 0;
  const mustDrawUntilPlayable = Boolean(settings?.houseRules?.drawUntilPlayable);
  const canStartDrawUntilPlayable = !mustDrawUntilPlayable || playableIds.size === 0;
  const canContinueDrawUntilPlayable = !isPenaltyDrawing && mustDrawUntilPlayable && hasDrawnThisTurn && playableIds.size === 0;
  const hasCardsAvailable = deckCount > 0 || discardPileLength > 1;

  return isMyTurn && phase === 'playing' && hasCardsAvailable
    && (isPenaltyDrawing || (!hasDrawnThisTurn && canStartDrawUntilPlayable) || canContinueDrawUntilPlayable);
}

/** 牌垛：叠层边缘 + UNO 字样 + 张数，可摸时金色脉冲 */
function DeckBack({ count, side, canDraw, onDraw, compact }: {
  count: number; side: 'left' | 'right'; canDraw: boolean; onDraw: () => void; compact: boolean;
}) {
  const w = compact ? 56 : 66;
  const h = compact ? 80 : 95;
  return (
    <button
      data-draw-pile={side}
      onClick={canDraw ? onDraw : undefined}
      disabled={!canDraw}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 rounded-card border-2 transition-all bg-transparent self-end',
        canDraw
          ? 'border-primary/60 shadow-draw-ready animate-draw-pulse active:scale-95 cursor-pointer'
          : 'border-white/15',
        count === 0 && !canDraw && 'opacity-25',
        !canDraw && count > 0 && 'opacity-60',
      )}
      style={{
        width: w, height: h,
        background: 'linear-gradient(135deg, var(--color-card-back-from), var(--color-card-back-to))',
        boxShadow: canDraw
          ? undefined
          : '3px 3px 0 -1px rgba(30, 58, 95, 0.9), 6px 6px 0 -2px rgba(15, 39, 68, 0.9), 0 8px 20px rgba(0,0,0,0.35)',
      }}
    >
      <span className={cn('font-game font-black tracking-widest text-white/55', compact ? 'text-xs' : 'text-sm')}>UNO</span>
      <span className={cn('font-bold text-white/85 font-game tabular-nums', compact ? 'text-sm' : 'text-base')}>{count}</span>
      <span className="text-[9px] text-white/40 font-game">摸牌</span>
    </button>
  );
}

/**
 * 移动端牌桌区：倒计时槽 + [牌垛 | 弃牌槽 | 牌垛] + 回合徽章。
 * 整个区域在父容器（flex-1）内垂直居中，牌槽与两侧牌垛基线对齐。
 */
export default function StageCenter({ onDraw, compact = false }: StageCenterProps) {
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const direction = useGameStore((s) => s.direction);
  const phase = useGameStore((s) => s.phase);
  const endRevealing = useGameStore((s) => s.endRevealLeft > 0);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const userId = useEffectiveUserId();

  const canDrawLeft = useCanDraw('left');
  const canDrawRight = useCanDraw('right');
  const deckLeftCount = useGameStore((s) => s.deckLeftCount);
  const deckRightCount = useGameStore((s) => s.deckRightCount);

  const hiddenDiscardCardIds = useFxStore((s) => s.hiddenDiscardCardIds);
  // 飞牌在途时仍显示上一张顶牌，落地瞬间才更新
  const topCardRaw = discardPile[discardPile.length - 1];
  const topCard = topCardRaw && hiddenDiscardCardIds.has(topCardRaw.id) && discardPile.length > 1
    ? discardPile[discardPile.length - 2]
    : topCardRaw;
  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === userId;

  // 终局展示窗期间（endRevealLeft > 0）保留舞台，让玩家看清最后一张牌；结算板真正显示时才隐藏
  if ((phase === 'round_end' || phase === 'game_over') && !endRevealing) return null;

  const DirIcon = direction === 'clockwise' ? RotateCw : RotateCcw;
  const colorHex = currentColor ? COLOR_HEX[currentColor] : null;
  const slotW = compact ? 76 : 92;
  const slotH = compact ? 110 : 132;

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
      {/* 大倒计时期（紧凑模式隐藏，HUD 小字仍在） */}
      {!compact && (
        <div className="h-9 flex items-center justify-center">
          <CriticalCountdown />
        </div>
      )}

      {/* 牌桌行：牌垛 | 弃牌槽 | 牌垛（基线对齐） */}
      <div className="flex items-end justify-center gap-6 pointer-events-auto">
        <DeckBack count={deckLeftCount} side="left" canDraw={canDrawLeft} compact={compact} onDraw={() => onDraw('left')} />

        {/* 弃牌槽：虚线牌位 + 当前颜色辉光 */}
        <div className="relative">
          <div
            className={cn(
              'rounded-[16px] border-2 border-dashed flex items-center justify-center transition-shadow',
              !topCard && 'border-white/20',
            )}
            style={{
              width: slotW + 14, height: slotH + 14,
              borderColor: colorHex ? `color-mix(in srgb, ${colorHex} 50%, transparent)` : undefined,
              boxShadow: colorHex ? `0 0 26px color-mix(in srgb, ${colorHex} 30%, transparent)` : undefined,
            }}
          >
            {topCard ? (
              // 出牌过渡由特效层 PlayCardFlight 呈现（从出牌者位置飞入），这里只负责最新牌面
              <div data-discard-slot style={{ width: slotW, height: slotH }}>
                <Card key={topCard.id} card={topCard} forceCornerLabel style={{ width: slotW, height: slotH }} />
              </div>
            ) : (
              <span className="text-white/20 text-xs font-game">弃牌区</span>
            )}
          </div>
          {drawStack > 0 && (
            <span className="absolute -top-2.5 -right-2.5 bg-destructive text-white text-xs font-bold rounded-full min-w-6 h-6 flex items-center justify-center px-1.5 shadow-lg z-card">
              +{drawStack}
            </span>
          )}
          {/* 当前颜色牌 */}
          {colorHex && (
            <span
              className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[11px] font-black font-game text-white shadow-lg whitespace-nowrap"
              style={{ background: colorHex, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              {COLOR_LABEL[currentColor!]}
            </span>
          )}
        </div>

        <DeckBack count={deckRightCount} side="right" canDraw={canDrawRight} compact={compact} onDraw={() => onDraw('right')} />
      </div>

      {/* 回合徽章 */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <DirIcon size={13} className="opacity-60" />
        <span className={cn('font-game text-sm', isMyTurn && 'text-primary font-bold')}>
          {isMyTurn ? '你的回合' : `${currentPlayer?.name ?? ''} 的回合`}
        </span>
      </div>
    </div>
  );
}
