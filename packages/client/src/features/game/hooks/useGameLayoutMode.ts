import { useSyncExternalStore } from 'react';

const QUERY = '(orientation: portrait), (max-height: 559px)';

function subscribe(cb: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

export type GameLayoutMode = 'table' | 'strip';

/**
 * 对局布局模式：
 * - table：椭圆牌桌（横屏且高度充足）
 * - strip：玩家条 + 中央牌区（竖屏，或高度不足 560 的短屏）
 *
 * 模式只决定布局形态；尺寸适配由 FitScaler 整体缩放完成。
 */
export function useGameLayoutMode(): GameLayoutMode {
  const compact = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
  return compact ? 'strip' : 'table';
}

const SHORT_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 559px)';

function subscribeShort(cb: () => void) {
  const mql = window.matchMedia(SHORT_LANDSCAPE_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

/** 短横屏（如 844×390 手机横握）：strip 的紧凑变体——更小的对手栏、操作按钮悬浮、无倒计时期 */
export function useShortLandscape(): boolean {
  return useSyncExternalStore(subscribeShort, () => window.matchMedia(SHORT_LANDSCAPE_QUERY).matches);
}
