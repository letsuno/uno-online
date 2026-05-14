import { motion } from 'framer-motion';

interface Props {
  size?: number;
}

/**
 * AuthCallback 等待页用的旋转 UNO 卡牌 SVG。
 * 自旋（4s 周期）+ 浮动（2.5s 周期）+ 阴影光晕。
 */
export default function SpinningCard({ size = 80 }: Props) {
  return (
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{ filter: 'drop-shadow(0 0 24px rgba(251,191,36,0.3))' }}
    >
      <motion.svg
        width={size}
        height={size * 1.4}
        viewBox="0 0 80 112"
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      >
        {/* 卡牌外形：圆角矩形，amber 描边，深色填充 */}
        <rect
          x="2" y="2" width="76" height="108" rx="8"
          fill="rgba(20,20,28,0.95)"
          stroke="rgb(251,191,36)"
          strokeWidth="2"
        />
        {/* 中央 ♠ UNO 字样 */}
        <text
          x="40" y="58"
          textAnchor="middle"
          fill="rgb(251,191,36)"
          fontFamily="var(--font-game, sans-serif)"
          fontSize="28"
          fontWeight="bold"
        >
          ♠
        </text>
        <text
          x="40" y="82"
          textAnchor="middle"
          fill="rgb(251,191,36)"
          fontFamily="var(--font-game, sans-serif)"
          fontSize="14"
          fontWeight="bold"
        >
          UNO
        </text>
      </motion.svg>
    </motion.div>
  );
}
