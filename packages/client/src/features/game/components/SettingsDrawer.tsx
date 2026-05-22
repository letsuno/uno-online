import { X, Settings } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getSocket } from '@/shared/socket';
import { Button } from '@/shared/components/ui/Button';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_PRESETS, HOUSE_RULE_DEFINITIONS } from '@uno-online/shared';
import type { HouseRules, HouseRuleDefinition } from '@uno-online/shared';

/* ── House-rule rendering helpers ── */

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

/* ── Props ── */

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
  room: { settings?: { allowSpectators?: boolean; spectatorMode?: string; houseRules?: Partial<HouseRules> } } | null;
  houseRules: HouseRules;
  onHouseRulesChange: (rules: HouseRules) => void;
}

/* ── Component ── */

export default function SettingsDrawer({
  open,
  onClose,
  isOwner,
  room,
  houseRules,
  onHouseRulesChange,
}: SettingsDrawerProps) {
  const applyPreset = (preset: string) => {
    const presetRules = HOUSE_RULES_PRESETS[preset];
    if (presetRules) {
      const newRules = { ...DEFAULT_HOUSE_RULES, ...presetRules };
      onHouseRulesChange(newRules);
      getSocket().emit('room:update_settings', { houseRules: newRules });
    }
  };

  const toggleRule = (key: keyof HouseRules) => {
    const newRules = { ...houseRules, [key]: !houseRules[key] };
    onHouseRulesChange(newRules);
    getSocket().emit('room:update_settings', { houseRules: newRules });
  };

  const setRuleValue = (key: keyof HouseRules, value: any) => {
    const newRules = { ...houseRules, [key]: value };
    onHouseRulesChange(newRules);
    getSocket().emit('room:update_settings', { houseRules: newRules });
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[320px] max-w-[75vw] z-50 flex flex-col border-l border-[rgba(246,190,62,0.18)] backdrop-blur-xl shadow-[-20px_0_60px_rgba(0,0,0,0.45)]',
          'transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ background: 'linear-gradient(180deg, rgba(23,30,56,0.96), rgba(12,17,34,0.97))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <span className="flex items-center gap-2 text-base font-black text-foreground">
            <Settings size={16} className="text-[var(--gold)]" /> 房间设置
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[10px] bg-white/[0.045] border border-white/[0.12] flex items-center justify-center text-[#c7d0ec] hover:text-[var(--gold)] hover:border-[rgba(246,190,62,0.46)] cursor-pointer transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 flex flex-col gap-4">
          {/* Spectator section */}
          <section>
            <h3 className="mb-3 text-sm text-muted-foreground font-game">观战设置</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm">允许观战</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={room?.settings?.allowSpectators ?? true}
                  onClick={() => {
                    if (isOwner) {
                      getSocket().emit('room:update_settings', { allowSpectators: !(room?.settings?.allowSpectators ?? true) });
                    }
                  }}
                  disabled={!isOwner}
                  className={cn(
                    'w-11 h-6 rounded-full relative transition-all duration-200',
                    !isOwner ? 'cursor-default opacity-50' : 'cursor-pointer',
                  )}
                  style={{
                    background: (room?.settings?.allowSpectators ?? true)
                      ? 'linear-gradient(135deg, var(--gold-2), var(--gold))'
                      : 'rgba(255,255,255,0.15)',
                    boxShadow: (room?.settings?.allowSpectators ?? true) ? '0 0 12px rgba(246,190,62,0.26)' : 'none',
                  }}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.3)] transition-transform',
                      (room?.settings?.allowSpectators ?? true) ? 'translate-x-5' : '',
                    )}
                  />
                </button>
              </div>
              {(room?.settings?.allowSpectators ?? true) && (
                <div className="flex items-center justify-between">
                  <label className="text-sm">观战模式</label>
                  <div className={cn('flex rounded-xl bg-white/[0.06] border border-white/10 p-0.5', !isOwner && 'opacity-50')}>
                    {([['hidden', '只看出牌'], ['full', '全透视']] as const).map(([value, label]) => {
                      const active = (room?.settings?.spectatorMode ?? 'hidden') === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => isOwner && getSocket().emit('room:update_settings', { spectatorMode: value })}
                          disabled={!isOwner}
                          className={cn(
                            'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                            isOwner ? 'cursor-pointer' : 'cursor-default',
                            active ? 'bg-accent text-[#161513]' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Divider */}
          <div className="border-b border-white/5" />

          {/* House rules section */}
          <section className="flex flex-col flex-1 min-h-0">
            <h3 className="mb-3 text-sm text-accent font-game">村规设置</h3>
            <div className="flex gap-2 mb-3 flex-wrap">
              {(['classic', 'party', 'crazy'] as const).map((p) => (
                <Button key={p} variant="outline" size="sm" onClick={() => applyPreset(p)} disabled={!isOwner} sound="click">
                  {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
                </Button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              {RULES.map((rule) => (
                <div key={rule.key} className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <div className="flex-1">
                    <div className="text-caption">{rule.label}</div>
                    <div className="text-xs text-muted-foreground">{rule.description}</div>
                  </div>
                  {rule.type === 'boolean' ? (
                    <button
                      onClick={() => toggleRule(rule.key)}
                      disabled={!isOwner}
                      className={cn(
                        'w-11 h-6 rounded-full border-none relative transition-all duration-200',
                        !isOwner ? 'cursor-default' : 'cursor-pointer',
                      )}
                      style={{
                        background: houseRules[rule.key]
                          ? 'linear-gradient(135deg, var(--gold-2), var(--gold))'
                          : 'rgba(255,255,255,0.15)',
                        boxShadow: houseRules[rule.key] ? '0 0 12px rgba(246,190,62,0.26)' : 'none',
                      }}
                    >
                      <div
                        className={cn(
                          'w-toggle-knob h-toggle-knob rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.3)] absolute top-toggle-off transition-[left] duration-200',
                          houseRules[rule.key] ? 'left-toggle-on' : 'left-toggle-off',
                        )}
                      />
                    </button>
                  ) : (
                    <select
                      value={String(houseRules[rule.key] ?? 'null')}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRuleValue(rule.key, v === 'null' ? null : Number(v));
                      }}
                      disabled={!isOwner}
                      className="bg-white/[0.06] text-foreground border border-white/10 rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer"
                    >
                      {rule.options?.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value ?? 'null')}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
