import { useSyncExternalStore } from 'react';

const QUERY = '(orientation: portrait)';

function subscribe(cb: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

/**
 * 是否竖屏（ aspect 驱动的布局模式开关）。
 * 只用于横/竖屏布局模式切换，不做尺寸流式重排——尺寸适配统一走 FitScaler。
 */
export function useIsPortrait(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
}
