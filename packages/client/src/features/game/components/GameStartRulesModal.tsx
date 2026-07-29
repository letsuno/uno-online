import { BookOpen } from 'lucide-react';
import type { GameMode, HouseRules } from '@uno-online/shared';
import { getActiveHouseRuleDefinitions } from '@uno-online/shared';
import { cn } from '@/shared/lib/utils';
import Modal from '@/shared/components/ui/Modal';

interface GameStartRulesModalProps {
  open: boolean;
  houseRules?: HouseRules;
  gameMode?: GameMode;
  onClose: () => void;
}

function formatRuleValue(key: keyof HouseRules, value: unknown): string | null {
  if (typeof value === 'boolean') return value ? '开启' : null;
  if (key === 'unoPenaltyCount') return `${value}张`;
  if (key === 'handLimit') return value !== null ? `${value}张` : null;
  if (key === 'handRevealThreshold') return value !== null ? `${value}张以下` : null;
  if (key === 'flipDrawColorCap') return value !== null ? `最多${value}张` : null;
  if (key === 'blitzTimeLimit') {
    if (value === null) return null;
    const seconds = value as number;
    return seconds >= 60 ? `${Math.floor(seconds / 60)}分钟` : `${seconds}秒`;
  }
  return null;
}

export default function GameStartRulesModal({ open, houseRules, gameMode, onClose }: GameStartRulesModalProps) {
  const isFlip = gameMode === 'flip';
  const activeRules = getActiveHouseRuleDefinitions(houseRules, gameMode);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-accent shrink-0" />
          <div>
            <div className="font-game text-base font-bold text-accent">本局规则已载入</div>
            <div className="text-xs font-normal text-muted-foreground">玩法介绍已在右侧展开</div>
          </div>
        </div>
      }
      footer={
        <button
          onClick={onClose}
          className="gold-button-base w-full px-4 py-2 text-sm transition-all"
        >
          开始游戏
        </button>
      }
    >
      {isFlip && (
        <div className="mb-3 rounded-lg border border-uno-purple/40 bg-uno-purple/10 px-4 py-3">
          <div className="font-bold text-foreground">UNO Flip</div>
          <div className="mt-1 text-sm text-muted-foreground leading-relaxed">
            双面牌组。打出 <b className="text-foreground">Flip 卡</b> 整局翻面：
            亮面是 +1 / Skip / Reverse，暗面是 <b className="text-foreground">+5 / 跳过全体 / 摸到指定色</b>。
            你能看到对手手牌的背面，但看不到自己的。
          </div>
        </div>
      )}
      {activeRules.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/5 px-4 py-5 text-center">
          <div className="font-bold text-foreground">{isFlip ? '无额外村规' : '经典规则'}</div>
          <div className="mt-1 text-sm text-muted-foreground">本局未启用额外村规。</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm text-muted-foreground">
            本局启用 {activeRules.length} 条村规：
          </div>
          {activeRules.map((rule, index) => {
            const valueText = formatRuleValue(rule.key, houseRules?.[rule.key]);
            return (
              <div
                key={rule.key}
                className={cn(
                  'rounded-lg border border-white/5 bg-white/[0.04] px-3 py-2.5',
                  index < 3 && 'border-accent/25 bg-accent/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{rule.label}</span>
                  {valueText && typeof houseRules?.[rule.key] !== 'boolean' && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-2xs text-primary">
                      {valueText}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{rule.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
