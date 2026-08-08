import type { BotDifficulty, RuleBotDifficulty } from '@uno-online/shared';
import { RULE_BOT_DIFFICULTY_LIST } from '../constants/bot-difficulty';
import { cn } from '@/shared/lib/utils';
import { BotAvatarIcon } from './BotAvatarIcon';
import { AiProviderMenuItems } from './AiProviderMenuItems';

interface BotDifficultyColumnsProps {
  currentDifficulty?: BotDifficulty;
  currentAiProviderId?: string;
  onSelect: (difficulty: RuleBotDifficulty) => void;
  onSelectAiProvider: (providerId: string) => void;
}

export function BotDifficultyColumns({
  currentDifficulty,
  currentAiProviderId,
  onSelect,
  onSelectAiProvider,
}: BotDifficultyColumnsProps) {
  return (
    <div className="divide-y divide-white/10 border-y border-white/5">
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] font-bold tracking-widest text-muted-foreground">BOT</div>
        {RULE_BOT_DIFFICULTY_LIST.map(difficulty => (
          <button
            key={difficulty.value}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 cursor-pointer transition-colors',
              currentDifficulty === difficulty.value && 'bg-white/10',
            )}
            onClick={() => onSelect(difficulty.value)}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={{ background: difficulty.avatarBg }}
            >
              <BotAvatarIcon difficulty={difficulty.value} size={10} className="text-white" />
            </span>
            <span className="text-foreground">{difficulty.label}</span>
          </button>
        ))}
      </div>
      <AiProviderMenuItems
        intent="switch"
        currentProviderId={currentDifficulty === 'rl' ? currentAiProviderId : undefined}
        onSelect={onSelectAiProvider}
      />
    </div>
  );
}
