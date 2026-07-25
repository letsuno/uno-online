import { useGameStore } from '../stores/game-store';
import { useCountdown } from '../hooks/useCountdown';

/**
 * 回合最后 5 秒的大号倒计时数字（纯渲染，不管定位）。
 * 定位由所在布局决定：table 模式由 GameTable 按玩家/牌堆坐标动态放置，
 * strip 模式由 TableCenter 放在牌堆上方——不写死视口坐标。
 */
export default function CriticalCountdown() {
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const secondsLeft = useCountdown(turnEndTime);

  if (secondsLeft === null || secondsLeft > 5 || secondsLeft <= 0) return null;

  return (
    <span className="text-timer-critical font-black font-game text-destructive animate-timer-flash opacity-80 text-shadow-bold">
      {secondsLeft}
    </span>
  );
}
