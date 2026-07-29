import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../stores/game-store';

/**
 * 翻面转场：整桌翻转一次的一次性提示层。
 *
 * ⚠️ 必须是一次性的 transform / opacity 动画，动画结束后立刻卸载。
 * 对局中任何常驻动画都会导致持续重栅格化，移动端会发热
 * （见 commit 5054ce5「修复对局中持续重栅格化导致的移动端发热」）。
 */
export default function FlipTransition() {
  const flipSide = useGameStore((s) => s.flipSide);
  const gameMode = useGameStore((s) => s.settings?.gameMode);
  const prevSide = useRef(flipSide);
  const [burst, setBurst] = useState<{ id: number; side: 'light' | 'dark' } | null>(null);
  const seq = useRef(0);

  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (gameMode !== 'flip') { prevSide.current = flipSide; return; }
    if (prevSide.current === flipSide) return;
    prevSide.current = flipSide;
    seq.current += 1;
    setBurst({ id: seq.current, side: flipSide });
  }, [flipSide, gameMode]);

  // 卸载时清掉待触发的隐藏定时器，避免离开对局后仍留着回调
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  if (gameMode !== 'flip') return null;

  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.id}
          className="fixed inset-0 z-modal grid place-items-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onAnimationComplete={() => {
            // 动画播完立刻卸载，避免留下常驻合成层
            window.clearTimeout(hideTimer.current);
            hideTimer.current = window.setTimeout(() => setBurst(null), 620);
          }}
        >
          <motion.div
            className="px-8 py-5 rounded-2xl glass-panel text-center"
            initial={{ rotateY: -90, scale: 0.85 }}
            animate={{ rotateY: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ willChange: 'transform' }}
          >
            <div className="font-game text-4xl font-black text-accent leading-none">⇅</div>
            <div className="mt-2 font-game text-lg font-bold text-foreground">
              {burst.side === 'dark' ? '翻到暗面' : '翻回亮面'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {burst.side === 'dark' ? '+5 / 跳过全体 / 摸到指定色' : '+1 / Skip / Reverse'}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
