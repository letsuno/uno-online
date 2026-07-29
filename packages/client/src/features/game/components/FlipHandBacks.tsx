import type { CardBack } from '@uno-online/shared';
import { DARK_COLORS } from '@uno-online/shared';
import { cn } from '@/shared/lib/utils';
import { cardSymbol } from '../constants/card-symbols';
import { UNO_COLOR_BG_CLASS } from '../constants/colors';

const DARK_ONLY_TYPES = new Set(['draw_five', 'skip_everyone', 'wild_draw_color']);

/** 这张背面属于暗面吗。带色牌看颜色，万能牌看卡型。 */
function isDarkFace(back: CardBack): boolean {
  if (back.color !== null) return (DARK_COLORS as readonly string[]).includes(back.color);
  return DARK_ONLY_TYPES.has(back.type);
}

interface Props {
  backs: CardBack[];
  /** 超过这个数量就只画前 N 张 + 计数，避免手牌多时挤爆座位 */
  maxVisible?: number;
}

/**
 * 对手手牌的**背面**。
 *
 * 这是 UNO Flip 的核心情报来源：配对是固定的，所以看到背面就能反推对手的正面持牌。
 * 尺寸很小，用「色块 + 符号」的极简版式，不复用完整的 Card 组件。
 */
export default function FlipHandBacks({ backs, maxVisible = 5 }: Props) {
  const visible = backs.slice(0, maxVisible);
  const overflow = backs.length - visible.length;

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {visible.map((back, i) => (
          <div
            key={i}
            className={cn(
              'w-card-mini-w h-card-mini-h rounded-sm border',
              'grid place-items-center text-2xs font-black text-white leading-none',
              back.color ? UNO_COLOR_BG_CLASS[back.color] : 'bg-wild-gradient',
              // 背面显示的是「另一面」，边框按它自己所属的那一面来：
              // 暗面牌 → 黑灰边 + 白描边；亮面牌 → 白边
              isDarkFace(back)
                ? 'border-2 border-[#0f1116] shadow-[0_0_0_1px_rgba(196,201,214,0.85)]'
                : 'border-white/70',
            )}
            title={`背面：${back.color ?? '万能'} ${cardSymbol(back.type, back.value)}`}
          >
            {cardSymbol(back.type, back.value)}
          </div>
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-2xs text-muted-foreground font-bold">+{overflow}</span>
      )}
    </div>
  );
}
