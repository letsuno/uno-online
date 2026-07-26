import { motion } from 'framer-motion';
import { Trophy, ChevronRight } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { cn } from '@/shared/lib/utils';
import Card from './Card';

interface EndRevealBannerProps {
  secondsLeft: number;
  onSkip: () => void;
  /** strip（移动端）模式放在手牌上方空档，避免遮挡顶部玩家罗盘（扔表情的点击目标） */
  placement?: 'top' | 'lower';
}

/**
 * 终局展示横幅：最后一张牌打出后先停留数秒再进结算板，
 * 期间牌桌保持可交互（可继续扔表情），横幅展示赢家与最后一张牌。
 */
export default function EndRevealBanner({ secondsLeft, onSkip, placement = 'top' }: EndRevealBannerProps) {
  const players = useGameStore((s) => s.players);
  const winnerId = useGameStore((s) => s.winnerId);
  const phase = useGameStore((s) => s.phase);
  const topCard = useGameStore((s) => s.discardPile?.[s.discardPile.length - 1]);
  const winner = players.find((p) => p.id === winnerId);

  return (
    <div
      className={cn(
        'fixed inset-x-0 z-actions flex justify-center pointer-events-none',
        placement === 'top' ? 'top-[10%]' : 'bottom-[17%]',
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="glass-panel pointer-events-auto flex items-center gap-4 px-5 py-3"
      >
        {topCard && (
          <div className="shrink-0 pointer-events-none">
            <Card card={topCard} />
          </div>
        )}
        <div className="flex flex-col items-start gap-1.5">
          <span className="font-game text-lg font-black text-white flex items-center gap-1.5">
            <Trophy size={18} className="text-primary shrink-0" />
            {winner ? `${winner.name} 获胜！` : phase === 'game_over' ? '游戏结束' : '本轮结束'}
          </span>
          <span className="text-xs text-muted-foreground">这是最后一张牌 · {secondsLeft}s 后进入结算</span>
          <button
            onClick={onSkip}
            className="inline-flex items-center gap-0.5 rounded-full bg-primary/80 px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary cursor-pointer"
          >
            查看结算 <ChevronRight size={12} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
