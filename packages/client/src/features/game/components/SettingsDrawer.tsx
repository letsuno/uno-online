import { X, Settings } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getSocket } from '@/shared/socket';
import { Button } from '@/shared/components/ui/Button';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Switch } from '@/shared/components/ui/Switch';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_PRESETS, HOUSE_RULE_DEFINITIONS } from '@uno-online/shared';
import type { HouseRules, HouseRuleDefinition, RoomData } from '@uno-online/shared';
import type { RoomSettings } from '@uno-online/shared';
import { reportSocketError } from '@/shared/report-socket-error';

/* ── House-rule rendering helpers ── */

type SelectRuleKey = 'unoPenaltyCount' | 'handLimit' | 'handRevealThreshold' | 'blitzTimeLimit';
type SelectRuleValue = HouseRules[SelectRuleKey];

type RuleDef = HouseRuleDefinition &
  (
    | { type: 'boolean'; options?: never }
    | { key: SelectRuleKey; type: 'select'; options: { value: SelectRuleValue; label: string }[] }
  );

const RULE_EXTRAS: Record<SelectRuleKey, { type: 'select'; options: { value: SelectRuleValue; label: string }[] }> = {
  unoPenaltyCount: {
    type: 'select',
    options: [
      { value: 2, label: '2张' },
      { value: 4, label: '4张' },
      { value: 6, label: '6张' },
    ],
  },
  handLimit: {
    type: 'select',
    options: [
      { value: null, label: '无限制' },
      { value: 15, label: '15张' },
      { value: 20, label: '20张' },
      { value: 25, label: '25张' },
    ],
  },
  handRevealThreshold: {
    type: 'select',
    options: [
      { value: null, label: '关闭' },
      { value: 3, label: '3张' },
      { value: 2, label: '2张' },
    ],
  },
  blitzTimeLimit: {
    type: 'select',
    options: [
      { value: null, label: '关闭' },
      { value: 120, label: '2分钟' },
      { value: 300, label: '5分钟' },
      { value: 600, label: '10分钟' },
    ],
  },
};

const RULES: RuleDef[] = HOUSE_RULE_DEFINITIONS.map(definition => {
  const select = RULE_EXTRAS[definition.key as SelectRuleKey];
  return select
    ? { ...definition, key: definition.key as SelectRuleKey, ...select }
    : { ...definition, type: 'boolean' as const };
});

/* ── Props ── */

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
  room: RoomData;
}

/* ── Component ── */

export default function SettingsDrawer({ open, onClose, isOwner, room }: SettingsDrawerProps) {
  const houseRules = room.settings.houseRules;
  const updateSettings = (settings: Partial<RoomSettings>) => {
    getSocket().emit('room:update_settings', settings, reportSocketError);
  };

  const applyPreset = (preset: string) => {
    const presetRules = HOUSE_RULES_PRESETS[preset];
    if (presetRules) {
      const newRules = { ...DEFAULT_HOUSE_RULES, ...presetRules };
      updateSettings({ houseRules: newRules });
    }
  };

  const toggleRule = (key: keyof HouseRules) => {
    const newRules = { ...houseRules, [key]: !houseRules[key] };
    updateSettings({ houseRules: newRules });
  };

  const setRuleValue = (key: SelectRuleKey, value: SelectRuleValue) => {
    const newRules = { ...houseRules, [key]: value };
    updateSettings({ houseRules: newRules });
  };

  return (
    <>
      {/* Overlay */}
      {open && <div className="fixed inset-0 glass-modal-backdrop z-modal" onClick={onClose} />}

      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[320px] max-w-[75vw] z-modal flex flex-col glass-panel !rounded-none',
          'transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <span className="flex items-center gap-2 text-base font-black text-foreground">
            <Settings size={16} className="text-primary" /> 房间设置
          </span>
          <IconButton size="sm" onClick={onClose} title="关闭">
            <X size={15} />
          </IconButton>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 flex flex-col gap-4">
          {/* Spectator section */}
          <section>
            <h3 className="mb-3 text-sm text-muted-foreground font-game">观战设置</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm">允许观战</label>
                <Switch
                  size="sm"
                  checked={room.settings.allowSpectators}
                  onChange={v => updateSettings({ allowSpectators: v })}
                  disabled={!isOwner}
                  label="允许观战"
                />
              </div>
              {room.settings.allowSpectators && (
                <div className="flex items-center justify-between">
                  <label className="text-sm">观战模式</label>
                  <div
                    className={cn('flex rounded-xl bg-secondary border border-border p-0.5', !isOwner && 'opacity-50')}
                  >
                    {(
                      [
                        ['hidden', '只看出牌'],
                        ['full', '全透视'],
                      ] as const
                    ).map(([value, label]) => {
                      const active = room.settings.spectatorMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => isOwner && updateSettings({ spectatorMode: value })}
                          disabled={!isOwner}
                          className={cn(
                            'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                            isOwner ? 'cursor-pointer' : 'cursor-default',
                            active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
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
              {(['classic', 'party', 'crazy'] as const).map(p => (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(p)}
                  disabled={!isOwner}
                  sound="click"
                >
                  {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
                </Button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              {RULES.map(rule => (
                <div key={rule.key} className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <div className="flex-1">
                    <div className="text-caption">{rule.label}</div>
                    <div className="text-xs text-muted-foreground">{rule.description}</div>
                  </div>
                  {rule.type === 'boolean' ? (
                    <Switch
                      size="sm"
                      checked={Boolean(houseRules[rule.key])}
                      onChange={() => toggleRule(rule.key)}
                      disabled={!isOwner}
                      label={rule.label}
                    />
                  ) : (
                    <select
                      value={String(houseRules[rule.key] ?? 'null')}
                      onChange={e => {
                        const option = rule.options.find(item => String(item.value ?? 'null') === e.target.value);
                        if (option) setRuleValue(rule.key, option.value);
                      }}
                      disabled={!isOwner}
                      className="bg-secondary text-foreground border border-border rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer"
                    >
                      {rule.options?.map(opt => (
                        <option key={String(opt.value)} value={String(opt.value ?? 'null')}>
                          {opt.label}
                        </option>
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
