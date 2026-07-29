import { X, Settings } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getSocket } from '@/shared/socket';
import { Button } from '@/shared/components/ui/Button';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Switch } from '@/shared/components/ui/Switch';
import { DEFAULT_HOUSE_RULES, getHouseRulesPresets, HOUSE_RULE_DEFINITIONS, FLIP_HOUSE_RULE_DEFINITIONS, FLIP_INCOMPATIBLE_RULES, normalizeHouseRulesForMode } from '@uno-online/shared';
import type { GameMode, HouseRules, HouseRuleDefinition } from '@uno-online/shared';

/* ── House-rule rendering helpers ── */

interface RuleDef extends HouseRuleDefinition {
  type: 'boolean' | 'select';
  options?: { value: any; label: string }[];
}

const RULE_EXTRAS: Partial<Record<keyof HouseRules, Pick<RuleDef, 'type' | 'options'>>> = {
  unoPenaltyCount: { type: 'select', options: [{ value: 2, label: '2张' }, { value: 4, label: '4张' }, { value: 6, label: '6张' }] },
  handLimit: { type: 'select', options: [{ value: null, label: '无限制' }, { value: 15, label: '15张' }, { value: 20, label: '20张' }, { value: 25, label: '25张' }] },
  handRevealThreshold: { type: 'select', options: [{ value: null, label: '关闭' }, { value: 3, label: '3张' }, { value: 2, label: '2张' }] },
  flipDrawColorCap: { type: 'select', options: [{ value: null, label: '不限' }, { value: 3, label: '3张' }, { value: 5, label: '5张' }, { value: 8, label: '8张' }] },
  blitzTimeLimit: { type: 'select', options: [{ value: null, label: '关闭' }, { value: 120, label: '2分钟' }, { value: 300, label: '5分钟' }, { value: 600, label: '10分钟' }] },
};

const RULES: RuleDef[] = HOUSE_RULE_DEFINITIONS.map((def) => ({
  ...def,
  type: 'boolean' as const,
  ...RULE_EXTRAS[def.key],
}));

const FLIP_RULES: RuleDef[] = FLIP_HOUSE_RULE_DEFINITIONS.map((def) => ({
  ...def,
  type: 'boolean' as const,
  ...RULE_EXTRAS[def.key],
}));

/* ── Props ── */

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
  room: { settings?: { allowSpectators?: boolean; spectatorMode?: string; gameMode?: GameMode; targetScore?: number; houseRules?: Partial<HouseRules> } } | null;
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
  const gameMode: GameMode = room?.settings?.gameMode === 'flip' ? 'flip' : 'classic';

  const applyPreset = (preset: string) => {
    // 预设按模式取：Flip 的「派对/疯狂」用 +1/+5 叠加等 Flip 规则，而不是经典的 +2/+4
    const presetRules = getHouseRulesPresets(gameMode)[preset];
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

  const toggleGameMode = () => {
    const next: GameMode = gameMode === 'flip' ? 'classic' : 'flip';
    // 目标分跟随模式的官方默认值（Flip 是 500 分），但玩家自定义过就不动
    const currentTarget = room?.settings?.targetScore;
    const followsDefault = currentTarget === (next === 'flip' ? 1000 : 500);
    // 顺带清掉在新模式下无意义的村规，避免留下「看不见却仍开着」的配置
    const nextRules = normalizeHouseRulesForMode(houseRules, next);
    onHouseRulesChange(nextRules);
    getSocket().emit('room:update_settings', {
      gameMode: next,
      houseRules: nextRules,
      ...(followsDefault ? { targetScore: next === 'flip' ? 500 : 1000 } : {}),
    } as never);
  };

  // Flip 模式下不适用的村规直接隐藏，不占位
  const visibleRules = (rules: RuleDef[]) =>
    gameMode === 'flip' ? rules.filter((r) => !FLIP_INCOMPATIBLE_RULES[r.key]) : rules;

  const renderRules = (rules: RuleDef[]) => (
    <>
      {visibleRules(rules).map((rule) => (
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
              onChange={(e) => {
                const v = e.target.value;
                setRuleValue(rule.key, v === 'null' ? null : Number(v));
              }}
              disabled={!isOwner}
              className="bg-secondary text-foreground border border-border rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer"
            >
              {rule.options?.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value ?? 'null')}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 glass-modal-backdrop z-modal"
          onClick={onClose}
        />
      )}

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
                  checked={room?.settings?.allowSpectators ?? true}
                  onChange={(v) => getSocket().emit('room:update_settings', { allowSpectators: v })}
                  disabled={!isOwner}
                  label="允许观战"
                />
              </div>
              {(room?.settings?.allowSpectators ?? true) && (
                <div className="flex items-center justify-between">
                  <label className="text-sm">观战模式</label>
                  <div className={cn('flex rounded-xl bg-secondary border border-border p-0.5', !isOwner && 'opacity-50')}>
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

          {/* Game mode */}
          <section>
            <h3 className="mb-3 text-sm text-accent font-game">游戏模式</h3>
            <div className={cn('flex rounded-xl bg-secondary border border-border p-0.5', !isOwner && 'opacity-50')}>
              {([['classic', '经典 UNO'], ['flip', 'UNO Flip']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => isOwner && gameMode !== value && toggleGameMode()}
                  disabled={!isOwner}
                  className={cn(
                    'flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    isOwner ? 'cursor-pointer' : 'cursor-default',
                    gameMode === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {gameMode === 'flip'
                ? '双面牌组 · 目标 500 分。打出 Flip 卡整局翻面：亮面是 +1 / Skip / Reverse，暗面是 +5 / 跳过全体 / 摸到指定色。你能看到对手手牌的背面，但看不到自己的。'
                : '标准 108 张牌组 · 目标 1000 分。'}
            </p>
          </section>

          {/* Divider */}
          <div className="border-b border-white/5" />

          {/* House rules section */}
          <section>
            <h3 className="mb-3 text-sm text-accent font-game">村规设置</h3>
            <div className="flex gap-2 mb-3 flex-wrap">
              {(['classic', 'party', 'crazy'] as const).map((p) => (
                <Button key={p} variant="outline" size="sm" onClick={() => applyPreset(p)} disabled={!isOwner} sound="click">
                  {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
                </Button>
              ))}
            </div>
            {renderRules(RULES)}
          </section>

          {gameMode === 'flip' && (
            <>
              <div className="border-b border-white/5" />
              <section>
                <h3 className="mb-1 text-sm text-accent font-game">UNO Flip 村规</h3>
                <p className="mb-3 text-xs text-muted-foreground">仅在 Flip 模式下生效</p>
                {renderRules(FLIP_RULES)}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
