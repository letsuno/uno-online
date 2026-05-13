import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, X } from 'lucide-react';
import type { HouseRules } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES, HOUSE_RULE_DEFINITIONS } from '@uno-online/shared';
import { cn } from '@/shared/lib/utils';

interface GameStartRulesModalProps {
  open: boolean;
  houseRules?: HouseRules;
  onClose: () => void;
}

function formatRuleValue(key: keyof HouseRules, value: unknown): string | null {
  if (typeof value === 'boolean') return value ? '开启' : null;
  if (key === 'unoPenaltyCount') return `${value}张`;
  if (key === 'handLimit') return value !== null ? `${value}张` : null;
  if (key === 'handRevealThreshold') return value !== null ? `${value}张以下` : null;
  if (key === 'blitzTimeLimit') {
    if (value === null) return null;
    const seconds = value as number;
    return seconds >= 60 ? `${Math.floor(seconds / 60)}分钟` : `${seconds}秒`;
  }
  return null;
}

export default function GameStartRulesModal({ open, houseRules, onClose }: GameStartRulesModalProps) {
  const activeRules = houseRules
    ? HOUSE_RULE_DEFINITIONS.filter((rule) => houseRules[rule.key] !== DEFAULT_HOUSE_RULES[rule.key])
    : [];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center px-4">
          <motion.div
            className="absolute inset-0 glass-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-[460px] overflow-hidden glass-panel"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-accent" />
                <div>
                  <div className="font-game text-base font-bold text-accent">本局规则已载入</div>
                  <div className="text-xs text-muted-foreground">玩法介绍已在右侧展开</div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-md bg-white/5 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-5 scrollbar-thin">
              {activeRules.length === 0 ? (
                <div className="rounded-lg border border-white/5 bg-white/5 px-4 py-5 text-center">
                  <div className="font-bold text-foreground">经典规则</div>
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
            </div>

            <div className="border-t border-white/5 px-5 py-3.5">
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] px-4 py-2 text-sm font-bold text-[#1a1a2e] transition-opacity hover:opacity-90"
              >
                开始游戏
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
