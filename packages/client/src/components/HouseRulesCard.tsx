import { useState } from 'react';
import type { HouseRules } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import { cn } from '@/lib/utils';
import RuleTeaching from './RuleTeaching';

interface RuleDisplayDef {
  key: keyof HouseRules;
  label: string;
  description: string;
}

const RULES: RuleDisplayDef[] = [
  { key: 'stackDrawTwo', label: '+2 叠加', description: '被 +2 时可出 +2 叠加给下家' },
  { key: 'stackDrawFour', label: '+4 叠加', description: '被 +4 时可出 +4 叠加给下家' },
  { key: 'crossStack', label: '+2 和 +4 互叠', description: '被 +2 时可出 +4，反之亦然' },
  { key: 'reverseDeflectDrawTwo', label: 'Reverse 反弹 +2', description: '被 +2 时出 Reverse 反弹给上家' },
  { key: 'reverseDeflectDrawFour', label: 'Reverse 反弹 +4', description: '被 +4 时出 Reverse 反弹给上家' },
  { key: 'skipDeflect', label: 'Skip 挡罚', description: '被 +2/+4 时出 Skip 转移给下家' },
  { key: 'zeroRotateHands', label: '0 牌交换手牌', description: '打出 0 时所有人按方向传递手牌' },
  { key: 'sevenSwapHands', label: '7 牌交换', description: '打出 7 时与下家交换手牌' },
  { key: 'jumpIn', label: '同牌抢出', description: '持有完全相同的牌可不等轮次直接出' },
  { key: 'multiplePlaySameNumber', label: '同数字全出', description: '相同数字不同颜色可一次打出' },
  { key: 'wildFirstTurn', label: '万能牌开局可出', description: '允许万能牌作为第一张弃牌' },
  { key: 'drawUntilPlayable', label: '摸到能出为止', description: '无牌可出时一直摸到能出的牌' },
  { key: 'forcedPlayAfterDraw', label: '摸牌后必须出', description: '摸到可出的牌时强制打出' },
  { key: 'forcedPlay', label: '强制出牌', description: '有能出的牌就必须出' },
  { key: 'unoPenaltyCount', label: 'UNO 罚摸数量', description: '不喊 UNO 被抓罚摸张数' },
  { key: 'misplayPenalty', label: '误操作惩罚', description: '出非法牌罚摸 1 张' },
  { key: 'silentUno', label: '静默 UNO', description: '取消 UNO 喊话机制' },
  { key: 'noFunctionCardFinish', label: '空手赢不算', description: '最后一张不能是 +2/+4' },
  { key: 'noWildFinish', label: '末牌限制', description: '最后一张不能是万能牌' },
  { key: 'doubleScore', label: '积分翻倍', description: '赢家分数翻倍' },
  { key: 'noChallengeWildFour', label: '无质疑 +4', description: '关闭 +4 质疑机制' },
  { key: 'fastMode', label: '快速模式', description: '回合时间减半' },
  { key: 'noHints', label: '无提示模式', description: '关闭可出牌高亮' },
  { key: 'blindDraw', label: '暗牌模式', description: '摸牌看不到牌面' },
  { key: 'bombCard', label: '炸弹牌', description: '打出 3+ 张同数字时所有人各摸 1 张' },
  { key: 'elimination', label: '淘汰制', description: '每轮结束手牌最多者被淘汰' },
  { key: 'revengeMode', label: '复仇模式', description: '反击+2/+4时伤害翻倍' },
  { key: 'teamMode', label: '团队模式', description: '偶数玩家时对面是队友' },
  { key: 'deathDraw', label: '死亡抽牌', description: '无牌可出时必须不停摸牌' },
  { key: 'handLimit', label: '手牌上限', description: '超过数量时不能摸牌' },
  { key: 'handRevealThreshold', label: '手牌透明', description: '手牌低于此数对所有人可见' },
  { key: 'blitzTimeLimit', label: '闪电战', description: '总时间限制（秒），超时手牌最少者赢' },
];

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

  const activeRules = RULES.filter((rule) => {
    const current = houseRules[rule.key];
    const defaultVal = DEFAULT_HOUSE_RULES[rule.key];
    return current !== defaultVal;
  });

  if (activeRules.length === 0) return null;

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
    <div className="hidden md:block fixed left-4 bottom-24 w-chat-w max-h-[60vh] overflow-y-auto scrollbar-hidden z-fab bg-card/80 backdrop-blur-sm rounded-xl border border-white/10 p-3">
      {content}
    </div>
  );
}
