import { useEffect, useState } from 'react';
import type { AiProviderInfo } from '@uno-online/shared';
import { Check, Cpu } from 'lucide-react';
import { getSocket } from '@/shared/socket';
import { cn } from '@/shared/lib/utils';

interface AiProviderMenuItemsProps {
  intent: 'add' | 'switch';
  currentProviderId?: string;
  onSelect: (providerId: string) => void;
}

const fairnessMeta = {
  fair: { label: '公平', className: 'bg-green-500/15 text-green-400' },
  privileged: { label: '增强', className: 'bg-amber-500/15 text-amber-400' },
  cheat: { label: '作弊', className: 'bg-red-500/15 text-red-400' },
} as const;

export function AiProviderMenuItems({ intent, currentProviderId, onSelect }: AiProviderMenuItemsProps) {
  const [providers, setProviders] = useState<AiProviderInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSocket().emit('room:list_ai_providers', { intent }, result => {
      if (!active) return;
      if (!result.success) {
        setError(result.error);
        setProviders([]);
        return;
      }
      setError(null);
      setProviders(result.providers);
    });
    return () => {
      active = false;
    };
  }, [intent]);

  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[10px] font-bold tracking-widest text-muted-foreground">AI 引擎</div>
      {providers === null ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">正在读取...</div>
      ) : providers.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">{error ?? '暂无已启用的 AI 引擎'}</div>
      ) : (
        providers.map(provider => {
          const selected = provider.id === currentProviderId;
          const fairness = fairnessMeta[provider.fairness];
          return (
            <button
              key={provider.id}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 cursor-pointer transition-colors',
                selected && 'bg-white/10',
              )}
              onClick={() => onSelect(provider.id)}
              title={provider.displayName}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/25 text-purple-300">
                <Cpu size={11} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{provider.displayName}</span>
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', fairness.className)}>
                {fairness.label}
              </span>
              {selected && <Check size={12} className="shrink-0 text-primary" />}
            </button>
          );
        })
      )}
    </div>
  );
}
