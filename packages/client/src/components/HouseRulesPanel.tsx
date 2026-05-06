import type { HouseRules } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_PRESETS } from '@uno-online/shared';
import { cn } from '@/lib/utils';

interface RuleDef {
  key: keyof HouseRules;
  label: string;
  description: string;
  type: 'boolean' | 'select';
  options?: { value: any; label: string }[];
}

const RULES: RuleDef[] = [
  { key: 'stackDrawTwo', label: '+2 叠加', description: '被 +2 时可出 +2 叠加给下家', type: 'boolean' },
  { key: 'stackDrawFour', label: '+4 叠加', description: '被 +4 时可出 +4 叠加给下家', type: 'boolean' },
  { key: 'crossStack', label: '+2 和 +4 互叠', description: '被 +2 时可出 +4，反之亦然', type: 'boolean' },
  { key: 'reverseDeflectDrawTwo', label: 'Reverse 反弹 +2', description: '被 +2 时出 Reverse 反弹给上家', type: 'boolean' },
  { key: 'reverseDeflectDrawFour', label: 'Reverse 反弹 +4', description: '被 +4 时出 Reverse 反弹给上家', type: 'boolean' },
  { key: 'skipDeflect', label: 'Skip 挡罚', description: '被 +2/+4 时出 Skip 转移给下家', type: 'boolean' },
  { key: 'zeroRotateHands', label: '0 牌交换手牌', description: '打出 0 时所有人按方向传递手牌', type: 'boolean' },
  { key: 'sevenSwapHands', label: '7 牌交换', description: '打出 7 时与下家交换手牌', type: 'boolean' },
  { key: 'jumpIn', label: '同牌抢出', description: '持有完全相同的牌可不等轮次直接出', type: 'boolean' },
  { key: 'multiplePlaySameNumber', label: '同数字全出', description: '相同数字不同颜色可一次打出', type: 'boolean' },
  { key: 'wildFirstTurn', label: '万能牌开局可出', description: '允许万能牌作为第一张弃牌', type: 'boolean' },
  { key: 'drawUntilPlayable', label: '摸到能出为止', description: '无牌可出时一直摸到能出的牌', type: 'boolean' },
  { key: 'forcedPlayAfterDraw', label: '摸牌后必须出', description: '摸到可出的牌时强制打出', type: 'boolean' },
  { key: 'forcedPlay', label: '强制出牌', description: '有能出的牌就必须出', type: 'boolean' },
  { key: 'unoPenaltyCount', label: 'UNO 罚摸数量', description: '不喊 UNO 被抓罚摸张数', type: 'select', options: [{ value: 2, label: '2张' }, { value: 4, label: '4张' }, { value: 6, label: '6张' }] },
  { key: 'misplayPenalty', label: '误操作惩罚', description: '出非法牌罚摸 1 张', type: 'boolean' },
  { key: 'silentUno', label: '静默 UNO', description: '取消 UNO 喊话机制', type: 'boolean' },
  { key: 'noFunctionCardFinish', label: '空手赢不算', description: '最后一张不能是 +2/+4', type: 'boolean' },
  { key: 'noWildFinish', label: '末牌限制', description: '最后一张不能是万能牌', type: 'boolean' },
  { key: 'doubleScore', label: '积分翻倍', description: '赢家分数翻倍', type: 'boolean' },
  { key: 'noChallengeWildFour', label: '无质疑 +4', description: '关闭 +4 质疑机制', type: 'boolean' },
  { key: 'fastMode', label: '快速模式', description: '回合时间减半', type: 'boolean' },
  { key: 'noHints', label: '无提示模式', description: '关闭可出牌高亮', type: 'boolean' },
  { key: 'blindDraw', label: '暗牌模式', description: '摸牌看不到牌面', type: 'boolean' },
  { key: 'bombCard', label: '炸弹牌', description: '打出 3+ 张同数字时所有人各摸 1 张', type: 'boolean' },
  { key: 'elimination', label: '淘汰制', description: '每轮结束手牌最多者被淘汰', type: 'boolean' },
  { key: 'revengeMode', label: '复仇模式', description: '反击+2/+4时伤害翻倍', type: 'boolean' },
  { key: 'teamMode', label: '团队模式', description: '偶数玩家时对面是队友', type: 'boolean' },
  { key: 'deathDraw', label: '死亡抽牌', description: '无牌可出时必须不停摸牌', type: 'boolean' },
  { key: 'handLimit', label: '手牌上限', description: '超过数量时不能摸牌', type: 'select', options: [{ value: null, label: '无限制' }, { value: 15, label: '15张' }, { value: 20, label: '20张' }, { value: 25, label: '25张' }] },
  { key: 'handRevealThreshold', label: '手牌透明', description: '手牌低于此数对所有人可见', type: 'select', options: [{ value: null, label: '关闭' }, { value: 3, label: '3张' }, { value: 2, label: '2张' }] },
  { key: 'blitzTimeLimit', label: '闪电战', description: '总时间限制（秒），超时手牌最少者赢', type: 'select', options: [{ value: null, label: '关闭' }, { value: 120, label: '2分钟' }, { value: 300, label: '5分钟' }, { value: 600, label: '10分钟' }] },
];

const btnSecondary = 'bg-secondary text-foreground px-5 py-2 rounded-[20px] text-sm border border-white/20';

interface HouseRulesPanelProps {
  houseRules: HouseRules;
  onChange: (rules: HouseRules) => void;
  disabled?: boolean;
}

export default function HouseRulesPanel({ houseRules, onChange, disabled = false }: HouseRulesPanelProps) {
  const applyPreset = (preset: string) => {
    const presetRules = HOUSE_RULES_PRESETS[preset];
    if (presetRules) {
      onChange({ ...DEFAULT_HOUSE_RULES, ...presetRules });
    }
  };

  const toggle = (key: keyof HouseRules) => {
    onChange({ ...houseRules, [key]: !houseRules[key] });
  };

  const setValue = (key: keyof HouseRules, value: any) => {
    onChange({ ...houseRules, [key]: value });
  };

  return (
    <div className="bg-muted rounded-xl p-4 max-w-[400px] w-full max-h-[400px] overflow-y-auto">
      <h3 className="text-sm text-accent mb-3 font-game">
        村规设置
      </h3>
      <div className="flex gap-2 mb-3 flex-wrap">
        {['classic', 'party', 'crazy'].map((p) => (
          <button key={p} onClick={() => applyPreset(p)} disabled={disabled}
            className={cn(btnSecondary, 'text-xs !px-3 !py-1')}>
            {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
          </button>
        ))}
      </div>
      {RULES.map((rule) => (
        <div key={rule.key} className="flex justify-between items-center py-1.5 border-b border-white/5">
          <div className="flex-1">
            <div className="text-[13px]">{rule.label}</div>
            <div className="text-[10px] text-muted-foreground">{rule.description}</div>
          </div>
          {rule.type === 'boolean' ? (
            <button
              onClick={() => toggle(rule.key)}
              disabled={disabled}
              className={cn(
                'w-11 h-6 rounded-xl border-none relative transition-colors duration-200',
                disabled ? 'cursor-default' : 'cursor-pointer',
                houseRules[rule.key] ? 'bg-uno-green' : 'bg-[rgba(148,163,184,0.3)]'
              )}
            >
              <div className={cn(
                'w-[18px] h-[18px] rounded-full bg-white absolute top-[3px] transition-[left] duration-200',
                houseRules[rule.key] ? 'left-[23px]' : 'left-[3px]'
              )} />
            </button>
          ) : (
            <select
              value={String(houseRules[rule.key] ?? 'null')}
              onChange={(e) => {
                const v = e.target.value;
                setValue(rule.key, v === 'null' ? null : Number(v));
              }}
              disabled={disabled}
              className="bg-muted text-foreground border border-white/20 rounded-md px-2 py-0.5 text-xs"
            >
              {rule.options?.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value ?? 'null')}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}
