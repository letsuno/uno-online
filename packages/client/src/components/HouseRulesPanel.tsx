import type { HouseRules } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_PRESETS } from '@uno-online/shared';

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
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 12, padding: 16,
      maxWidth: 400, width: '100%', maxHeight: 400, overflowY: 'auto',
    }}>
      <h3 style={{ fontSize: 14, color: 'var(--text-accent)', marginBottom: 12, fontFamily: 'var(--font-game)' }}>
        村规设置
      </h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {['classic', 'party', 'crazy'].map((p) => (
          <button key={p} onClick={() => applyPreset(p)} disabled={disabled}
            className="btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }}>
            {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
          </button>
        ))}
      </div>
      {RULES.map((rule) => (
        <div key={rule.key} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13 }}>{rule.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{rule.description}</div>
          </div>
          {rule.type === 'boolean' ? (
            <button onClick={() => toggle(rule.key)} disabled={disabled} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              background: houseRules[rule.key] ? 'var(--color-green)' : 'rgba(148,163,184,0.3)',
              position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3,
                left: houseRules[rule.key] ? 23 : 3, transition: 'left 0.2s',
              }} />
            </button>
          ) : (
            <select
              value={String(houseRules[rule.key] ?? 'null')}
              onChange={(e) => {
                const v = e.target.value;
                setValue(rule.key, v === 'null' ? null : Number(v));
              }}
              disabled={disabled}
              style={{
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                padding: '2px 8px', fontSize: 12,
              }}
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
