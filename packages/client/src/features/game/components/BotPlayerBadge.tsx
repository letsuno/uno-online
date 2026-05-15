import type { BotDifficulty } from '@uno-online/shared';
import { DIFFICULTY_DISPLAY } from '../constants/bot-difficulty';

export function BotPlayerBadge({ difficulty }: { difficulty?: BotDifficulty }) {
  const style = DIFFICULTY_DISPLAY[difficulty ?? 'easy'];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${style.color} ${style.border}`}>
      <span>🤖</span>
      <span>Bot · {style.label}</span>
    </span>
  );
}
