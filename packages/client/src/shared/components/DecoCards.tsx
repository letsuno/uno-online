import { useRoomStore } from '@/shared/stores/room-store';

interface DecoCard {
  value: string;
  color: string;
  borderColor: string;
  background?: string;
  /** 暗面牌：黑灰边外再加一圈白描边 */
  outline?: boolean;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  rotate: string;
}

const CARDS: DecoCard[] = [
  { value: '7', color: '#ff5c63', borderColor: 'rgba(255, 92, 99, 0.28)', top: '15%', left: '7%', rotate: '-15deg' },
  { value: '+2', color: '#4d7eff', borderColor: 'rgba(77, 126, 255, 0.28)', top: '17%', right: '7%', rotate: '12deg' },
  { value: '↔', color: '#4d7eff', borderColor: 'rgba(77, 126, 255, 0.28)', top: '44%', left: '4%', rotate: '9deg' },
  { value: '0', color: '#ff5c63', borderColor: 'rgba(255, 92, 99, 0.28)', top: '58%', right: '7%', rotate: '-14deg' },
  { value: '5', color: '#50e16b', borderColor: 'rgba(80, 225, 107, 0.26)', bottom: '16%', left: '8%', rotate: '13deg' },
  { value: '9', color: 'var(--gold)', borderColor: 'rgba(246, 190, 62, 0.28)', bottom: '13%', right: '12%', rotate: '-11deg' },
];

const DARK_FACE_BG = 'linear-gradient(145deg, rgba(0,0,0,0.55), rgba(0,0,0,0.28))';

/**
 * UNO Flip 模式的装饰牌：左半屏 3 张走亮面、右半屏 3 张走暗面。
 *
 * 注意原本的「红 0」和「蓝 +2」在 UNO Flip 里都不存在——Flip 无 0 牌，
 * 带色 +2 也不存在（+2 是万能牌），所以这里换成了 Flip 真实存在的牌面。
 */
const CARDS_FLIP: DecoCard[] = [
  // 左半屏 —— 亮面
  { value: '7', color: '#ff5c63', borderColor: 'rgba(255, 255, 255, 0.34)', top: '15%', left: '7%', rotate: '-15deg' },
  { value: '⇅', color: '#4d7eff', borderColor: 'rgba(255, 255, 255, 0.34)', top: '44%', left: '4%', rotate: '9deg' },
  { value: '+1', color: '#50e16b', borderColor: 'rgba(255, 255, 255, 0.34)', bottom: '16%', left: '8%', rotate: '13deg' },
  // 右半屏 —— 暗面
  { value: '+5', color: 'var(--color-uno-orange)', borderColor: '#0f1116', background: DARK_FACE_BG, outline: true, top: '17%', right: '7%', rotate: '12deg' },
  { value: '⊘⊘', color: 'var(--color-uno-pink)', borderColor: '#0f1116', background: DARK_FACE_BG, outline: true, top: '58%', right: '7%', rotate: '-14deg' },
  { value: '⇅', color: 'var(--color-uno-purple)', borderColor: '#0f1116', background: DARK_FACE_BG, outline: true, bottom: '13%', right: '12%', rotate: '-11deg' },
];

const DEFAULT_BG = 'linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015))';

export default function DecoCards() {
  const gameMode = useRoomStore((s) => s.room?.settings?.gameMode);
  const cards = gameMode === 'flip' ? CARDS_FLIP : CARDS;

  return (
    <div className="absolute inset-0 pointer-events-none z-card overflow-hidden">
      {cards.map((card, i) => (
        <div
          key={i}
          className="absolute w-[78px] h-[112px] rounded-[16px] grid place-items-center text-[26px] font-extrabold opacity-[0.32] select-none"
          style={{
            background: card.background ?? DEFAULT_BG,
            border: `1px solid ${card.borderColor}`,
            boxShadow: card.outline
              ? '0 0 0 2px rgba(196,201,214,0.45), inset 0 0 24px rgba(255,255,255,0.04), 0 18px 42px rgba(0,0,0,0.26)'
              : 'inset 0 0 24px rgba(255,255,255,0.04), 0 18px 42px rgba(0,0,0,0.26)',
            filter: 'blur(0.2px)',
            color: card.color,
            top: card.top, left: card.left, right: card.right, bottom: card.bottom,
            transform: `rotate(${card.rotate})`,
          }}
        >
          {card.value}
        </div>
      ))}
    </div>
  );
}
