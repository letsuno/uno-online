import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import Card from '../components/Card';
import type { ViewportPoint } from './coords';

export interface PlayFlight {
  id: string;
  from: ViewportPoint;
  to: ViewportPoint;
  card: CardType;
  /** 是否自己出的牌（自己从手牌区飞出，略大） */
  isSelf: boolean;
  /** 弃牌槽实际尺寸（飞行终点大小，保证与牌堆视觉一致） */
  toW: number;
  toH: number;
}

interface PlayCardFlightProps {
  flight: PlayFlight;
  onComplete: () => void;
}

/**
 * 出牌飞行：牌面从出牌者位置飞向弃牌槽——
 * 自己：从手牌区（底部）起飞；对手：从对手头像起飞。略带弧线。
 */
function PlayCardFlight({ flight, onComplete }: PlayCardFlightProps) {
  const midX = (flight.from.x + flight.to.x) / 2;
  const midY = Math.min(flight.from.y, flight.to.y) - (flight.isSelf ? 90 : 40);
  return (
    <motion.div
      className="absolute pointer-events-none z-effects"
      style={{ left: 0, top: 0 }}
      initial={{ x: flight.from.x, y: flight.from.y, opacity: 0.4, scale: flight.isSelf ? 0.9 : 0.5, rotate: 0 }}
      animate={{
        x: [flight.from.x, midX, flight.to.x],
        y: [flight.from.y, midY, flight.to.y],
        opacity: [0.4, 1, 1],
        scale: [flight.isSelf ? 0.9 : 0.5, 1, 0.98],
        rotate: [0, flight.isSelf ? -4 : 6, 0],
      }}
      transition={{ duration: 0.38, ease: 'easeOut', times: [0, 0.5, 1] }}
      onAnimationComplete={onComplete}
    >
      <div className="-translate-x-1/2 -translate-y-1/2">
        <Card card={flight.card} forceCornerLabel disableHoverLift style={{ width: flight.toW, height: flight.toH }} />
      </div>
    </motion.div>
  );
}

export default memo(PlayCardFlight);
