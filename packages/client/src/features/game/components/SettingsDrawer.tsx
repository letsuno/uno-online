import { X } from 'lucide-react';
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
          'fixed right-0 top-0 h-full w-[320px] max-w-[75vw] bg-[#0f1729]/98 border-l border-white/10 z-50 flex flex-col',
          'transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-sm font-bold font-game text-foreground">房间设置</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <X size={14} />
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
                    'w-11 h-6 rounded-xl relative transition-colors duration-200',
                    !isOwner ? 'cursor-default opacity-50' : 'cursor-pointer',
                    (room?.settings?.allowSpectators ?? true) ? 'bg-accent' : 'bg-white/15',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      (room?.settings?.allowSpectators ?? true) ? 'translate-x-5' : '',
                    )}
                  />
                </button>
              </div>
              {(room?.settings?.allowSpectators ?? true) && (
                <div className="flex items-center justify-between">
                  <label className="text-sm">观战模式</label>
                  <select
                    value={room?.settings?.spectatorMode ?? 'hidden'}
                    onChange={(e) => getSocket().emit('room:update_settings', { spectatorMode: e.target.value as 'full' | 'hidden' })}
                    className={cn(
                      'bg-white/[0.06] text-foreground border border-white/10 rounded-xl px-3 py-1.5 text-sm outline-none cursor-pointer',
                      !isOwner && 'opacity-50 cursor-default',
                    )}
                    disabled={!isOwner}
                  >
                    <option value="hidden">只看出牌</option>
                    <option value="full">全透视</option>
                  </select>
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
                        'w-11 h-6 rounded-xl border-none relative transition-colors duration-200',
                        !isOwner ? 'cursor-default' : 'cursor-pointer',
                        houseRules[rule.key] ? 'bg-accent' : 'bg-switch-off',
                      )}
                    >
                      <div
                        className={cn(
                          'w-toggle-knob h-toggle-knob rounded-full bg-white absolute top-toggle-off transition-[left] duration-200',
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
