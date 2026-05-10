import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { PlayerInfo } from '../stores/game-store';

export interface Position {
  x: number;
  y: number;
}

interface DirectionIndicatorProps {
  dimensions: { width: number; height: number };
  playerPositions: Position[];
  direction: 'clockwise' | 'counter_clockwise';
  currentPlayerIndex: number;
  players: PlayerInfo[];
  userId: string | null | undefined;
}

function DirectionIndicator({
  dimensions,
  playerPositions,
  direction,
  currentPlayerIndex,
  players,
  userId,
}: DirectionIndicatorProps) {
  const directionArc = useMemo(() => {
    if (playerPositions.length < 2) return null;
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return null;

    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.38;
    const ry = height * 0.38;
    const n = players.length;

    const isClockwise = direction === 'clockwise';
    const leftX = cx - rx;
    const rightX = cx + rx;

    const fullPath = `M ${rightX} ${cy} A ${rx} ${ry} 0 1 1 ${leftX} ${cy} A ${rx} ${ry} 0 1 1 ${rightX} ${cy}`;

    const myIndex = players.findIndex((p) => p.id === userId);
    const safeMyIndex = myIndex >= 0 ? myIndex : 0;

    const currentOffset = currentPlayerIndex - safeMyIndex;
    const step = isClockwise ? 1 : -1;
    const nextIdx = ((currentPlayerIndex + step) % n + n) % n;
    const nextOffset = nextIdx - safeMyIndex;

    const startAngle = Math.PI / 2 + (currentOffset * 2 * Math.PI) / n;
    const endAngle = Math.PI / 2 + (nextOffset * 2 * Math.PI) / n;

    const sx = cx + rx * Math.cos(startAngle);
    const sy = cy + ry * Math.sin(startAngle);
    const ex = cx + rx * Math.cos(endAngle);
    const ey = cy + ry * Math.sin(endAngle);

    let angleDiff = endAngle - startAngle;
    if (isClockwise) {
      if (angleDiff <= 0) angleDiff += 2 * Math.PI;
    } else {
      if (angleDiff >= 0) angleDiff -= 2 * Math.PI;
    }
    const largeArc = Math.abs(angleDiff) > Math.PI ? 1 : 0;
    const sweep = isClockwise ? 1 : 0;

    const highlightPath = `M ${sx} ${sy} A ${rx} ${ry} 0 ${largeArc} ${sweep} ${ex} ${ey}`;

    const tangentX = -rx * Math.sin(endAngle);
    const tangentY = ry * Math.cos(endAngle);
    const tangentLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    const dir = isClockwise ? 1 : -1;
    const tx = (tangentX / tangentLen) * dir;
    const ty = (tangentY / tangentLen) * dir;

    return { fullPath, highlightPath, isClockwise, arrowTip: { x: ex, y: ey, tx, ty }, cx, cy, rx, ry };
  }, [playerPositions, dimensions, direction, players, userId, currentPlayerIndex]);

  if (!directionArc || dimensions.width <= 0) return null;

  const isClockwise = direction === 'clockwise';

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={dimensions.width}
      height={dimensions.height}
    >
      <motion.path
        d={directionArc.fullPath}
        fill="none"
        stroke="rgba(251, 191, 36, 0.15)"
        strokeWidth={2}
        strokeDasharray="8 6"
        animate={{
          strokeDashoffset: isClockwise
            ? [0, -28]
            : [0, 28],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      <motion.path
        key={currentPlayerIndex}
        d={directionArc.highlightPath}
        fill="none"
        stroke="rgba(251, 191, 36, 0.5)"
        strokeWidth={2}
        strokeDasharray="8 6"
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          strokeDashoffset: [0, -28],
        }}
        transition={{
          opacity: { duration: 0.3 },
          strokeDashoffset: { duration: 1.5, repeat: Infinity, ease: 'linear' },
        }}
      />
      {/* Arrowhead at end of highlight arc */}
      {(() => {
        const { x, y, tx, ty } = directionArc.arrowTip;
        const length = 12;
        const halfWidth = 11;
        const nx = -ty, ny = tx;
        const p1x = x - tx * length + nx * halfWidth;
        const p1y = y - ty * length + ny * halfWidth;
        const p2x = x - tx * length - nx * halfWidth;
        const p2y = y - ty * length - ny * halfWidth;
        return (
          <motion.polygon
            key={`arrow-${currentPlayerIndex}`}
            points={`${x},${y} ${p1x},${p1y} ${p2x},${p2y}`}
            fill="rgba(251, 191, 36, 0.6)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          />
        );
      })()}
      {/* Direction arrows on full ellipse */}
      {(() => {
        const { cx, cy, rx, ry } = directionArc;
        const count = Math.min(players.length * 2, 8);
        const dir = isClockwise ? 1 : -1;
        const arrows = [];
        for (let i = 0; i < count; i++) {
          const angle = (i * 2 * Math.PI) / count;
          const ax = cx + rx * Math.cos(angle);
          const ay = cy + ry * Math.sin(angle);
          const tangentX = -rx * Math.sin(angle);
          const tangentY = ry * Math.cos(angle);
          const len = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
          const atx = (tangentX / len) * dir;
          const aty = (tangentY / len) * dir;
          const anx = -aty, any_ = atx;
          const length = 8;
          const halfWidth = 8;
          arrows.push(
            <polygon
              key={`dir-arrow-${i}`}
              points={`${ax + atx * length},${ay + aty * length} ${ax - atx * length + anx * halfWidth},${ay - aty * length + any_ * halfWidth} ${ax - atx * length - anx * halfWidth},${ay - aty * length - any_ * halfWidth}`}
              fill="rgba(251, 191, 36, 0.15)"
            />
          );
        }
        return arrows;
      })()}
    </svg>
  );
}

export default memo(DirectionIndicator);
