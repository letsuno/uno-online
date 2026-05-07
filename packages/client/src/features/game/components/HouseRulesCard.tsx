import { useState } from 'react';
import type { HouseRules } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES, HOUSE_RULE_DEFINITIONS } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import { cn } from '@/shared/lib/utils';
import RuleTeaching from './RuleTeaching';

const BORDER_COLORS = [
  'border-l-primary',
  'border-l-uno-green',
  'border-l-uno-blue',
  'border-l-uno-red',
  'border-l-avatar-5',
];

function formatRuleValue(key: keyof HouseRules, value: unknown): string | null {
  if (typeof value === 'boolean') return value ? '开启' : null;
  if (key === 'unoPenaltyCount') return `${value}张`;
  if (key === 'handLimit') return value !== null ? `${value}张` : null;
  if (key === 'handRevealThreshold') return value !== null ? `${value}张以下` : null;
  if (key === 'blitzTimeLimit') {
    if (value === null) return null;
    const secs = value as number;
    return secs >= 60 ? `${Math.floor(secs / 60)}分钟` : `${secs}秒`;
  }
  return null;
}

interface HouseRulesCardProps {
  embedded?: boolean;
}

export default function HouseRulesCard({ embedded = false }: HouseRulesCardProps) {
  const houseRules = useGameStore((s) => s.settings?.houseRules);
  const [collapsed, setCollapsed] = useState(false);

  if (!houseRules) return null;

  const activeRules = HOUSE_RULE_DEFINITIONS.filter((rule) => {
    const current = houseRules[rule.key];
    const defaultVal = DEFAULT_HOUSE_RULES[rule.key];
    return current !== defaultVal;
  });

  if (activeRules.length === 0) {
    if (embedded) {
      return <p className="text-sm text-muted-foreground text-center py-8">本局未启用任何村规</p>;
    }
    return null;
  }

  const content = (
    <>
      {!embedded && (
        <div
          className="flex items-center justify-between cursor-pointer mb-2"
          onClick={() => setCollapsed((c) => !c)}
        >
          <h3 className="text-sm font-game font-bold text-accent">
            {'📋'} 本局村规
          </h3>
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {collapsed ? '展开' : '收起'}
          </button>
        </div>
      )}

      {(embedded || !collapsed) && (
        <div className="flex flex-col gap-2">
          {activeRules.map((rule, idx) => {
            const borderColor = BORDER_COLORS[idx % BORDER_COLORS.length];
            const valueText = formatRuleValue(rule.key, houseRules[rule.key]);

            return (
              <div
                key={rule.key}
                className={cn(
                  'border-l-3 rounded-none pl-2 py-1',
                  borderColor,
                )}
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-foreground">{rule.label}</span>
                  {valueText && typeof houseRules[rule.key] !== 'boolean' && (
                    <span className="text-2xs text-primary">({valueText})</span>
                  )}
                </div>
                <div className="text-2xs text-muted-foreground">{rule.description}</div>
                <div className="mt-1">
                  <RuleTeaching ruleKey={rule.key} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="w-full">{content}</div>;
  }

  return (
    <div className="hidden md:block fixed left-4 bottom-24 w-chat-w max-h-[60vh] overflow-y-auto scrollbar-thin z-fab bg-card/80 backdrop-blur-sm rounded-xl border border-white/10 p-3">
      {content}
    </div>
  );
}
