import { memo, useEffect, useRef, useState } from 'react';
import CardBack from '../components/CardBack';
import type { ViewportPoint } from './coords';

/** 实测手牌槽位中心（每帧调用，追踪 spring 归位中的移动目标） */
function measureCardSlot(cardId: string): ViewportPoint | null {
  const el = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
  const rect = el?.getBoundingClientRect();
  if (!rect || rect.width === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export interface DrawFlight {
  id: string;
  from: ViewportPoint;
  to: ViewportPoint;
  /** 多张连摸时的错开延迟（秒） */
  delay: number;
  /** 终点形态：hand = 自己手牌（放大），avatar = 对手头像（缩小淡出） */
  toSize: 'hand' | 'avatar';
  /** 对应的手牌 id（自己摸牌时逐帧追踪其槽位，落地后现身） */
  handCardId?: string;
}

interface DrawCardFlightProps {
  flight: DrawFlight;
  onComplete: () => void;
}

interface Frame {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

const DURATION_MS = 500;

/**
 * 摸牌飞行（rAF 逐帧驱动）：
 * 立即从牌堆起飞，逐帧实测目标槽位并追踪——新牌 spring 归位的过程中
 * 飞牌跟着它移动，两者同时到达，无滞后、无错误落点。
 */
function DrawCardFlight({ flight, onComplete }: DrawCardFlightProps) {
  const [go, setGo] = useState(flight.delay <= 0);
  const [frame, setFrame] = useState<Frame>({ x: flight.from.x, y: flight.from.y, scale: 0.55, opacity: 0 });
  const completedRef = useRef(false);

  // 连摸错开
  useEffect(() => {
    if (flight.delay <= 0) return;
    const timer = setTimeout(() => setGo(true), flight.delay * 1000);
    return () => clearTimeout(timer);
  }, [flight.delay]);

  useEffect(() => {
    if (!go) return;
    const toHand = flight.toSize === 'hand';
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      // 逐帧追踪目标（槽位在 spring 归位中也在动）
      const to = (flight.handCardId && measureCardSlot(flight.handCardId)) || flight.to;
      const p = Math.min((now - start) / DURATION_MS, 1);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const arc = Math.sin(p * Math.PI) * -36;
      setFrame({
        x: flight.from.x + (to.x - flight.from.x) * e,
        y: flight.from.y + (to.y - flight.from.y) * e + arc,
        scale: toHand ? 0.55 + (1.3 - 0.55) * e : 0.55 + (0.45 - 0.55) * e,
        opacity: Math.min(1, p * 6),
      });
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  if (!go) return null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: 0,
        top: 0,
        transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`,
        opacity: frame.opacity,
      }}
    >
      <div className="-translate-x-1/2 -translate-y-1/2">
        <CardBack style={{ width: 64, height: 92 }} />
      </div>
    </div>
  );
}

export default memo(DrawCardFlight);
