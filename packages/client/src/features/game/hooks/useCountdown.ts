import { useState, useEffect } from 'react';
import { serverNow } from '@/shared/server-time';

/**
 * Tracks the remaining seconds until `turnEndTime`.
 *
 * Returns `null` when `turnEndTime` is nullish, otherwise a non-negative
 * integer that ticks down every second.
 */
export function useCountdown(turnEndTime: number | null | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!turnEndTime) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((turnEndTime - serverNow()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [turnEndTime]);

  return secondsLeft;
}

/**
 * 高精度倒计时（供倒计时圆环）：250ms 步进返回浮点秒。
 * 圆环据此离散刷新（4/s）而不是开一条 1s 的 stroke-dashoffset CSS 过渡——
 * 后者会让浏览器每帧都在主线程重算样式+重排 SVG（60/s），是稳态性能大头。
 */
export function useCountdownPrecise(turnEndTime: number | null | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!turnEndTime) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, (turnEndTime - serverNow()) / 1000));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [turnEndTime]);

  return secondsLeft;
}
