import type { HouseRules, HouseRuleDefinition } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_PRESETS, HOUSE_RULE_DEFINITIONS } from '@uno-online/shared';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/Button';

interface RuleDef extends HouseRuleDefinition {
  type: 'boolean' | 'select';
  options?: { value: any; label: string }[];
}

const RULE_EXTRAS: Partial<Record<keyof HouseRules, Pick<RuleDef, 'type' | 'options'>>> = {
  unoPenaltyCount: { type: 'select', options: [{ value: 2, label: '2张' }, { value: 4, label: '4张' }, { value: 6, label: '6张' }] },
  handLimit: { type: 'select', options: [{ value: null, label: '无限制' }, { value: 15, label: '15张' }, { value: 20, label: '20张' }, { value: 25, label: '25张' }] },
  handRevealThreshold: { type: 'select', options: [{ value: null, label: '关闭' }, { value: 3, label: '3张' }, { value: 2, label: '2张' }] },
  blitzTimeLimit: { type: 'select', options: [{ value: null, label: '关闭' }, { value: 120, label: '2分钟' }, { value: 300, label: '5分钟' }, { value: 600, label: '10分钟' }] },
};

const RULES: RuleDef[] = HOUSE_RULE_DEFINITIONS.map((def) => ({
  ...def,
  type: 'boolean' as const,
  ...RULE_EXTRAS[def.key],
}));

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
    <div className="bg-muted rounded-xl p-4 max-w-houserules-max w-full max-h-houserules-max-h overflow-y-auto">
      <h3 className="text-sm text-accent mb-3 font-game">
        村规设置
      </h3>
      <div className="flex gap-2 mb-3 flex-wrap">
        {['classic', 'party', 'crazy'].map((p) => (
          <Button key={p} variant="secondary" size="sm" onClick={() => applyPreset(p)} disabled={disabled}>
            {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
          </Button>
        ))}
      </div>
      {RULES.map((rule) => (
        <div key={rule.key} className="flex justify-between items-center py-1.5 border-b border-white/5">
          <div className="flex-1">
            <div className="text-caption">{rule.label}</div>
            <div className="text-xs text-muted-foreground">{rule.description}</div>
          </div>
          {rule.type === 'boolean' ? (
            <button
              onClick={() => toggle(rule.key)}
              disabled={disabled}
              className={cn(
                'w-11 h-6 rounded-xl border-none relative transition-colors duration-200',
                disabled ? 'cursor-default' : 'cursor-pointer',
                houseRules[rule.key] ? 'bg-uno-green' : 'bg-switch-off'
              )}
            >
              <div className={cn(
                'w-toggle-knob h-toggle-knob rounded-full bg-white absolute top-toggle-off transition-[left] duration-200',
                houseRules[rule.key] ? 'left-toggle-on' : 'left-toggle-off'
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
