import { Bot, Brain } from 'lucide-react';
import type { BotDifficulty } from '@uno-online/shared';

interface BotAvatarIconProps {
  difficulty?: BotDifficulty;
  size: number;
  className?: string;
}

export function BotAvatarIcon({ difficulty, size, className }: BotAvatarIconProps) {
  const Icon = difficulty === 'rl' ? Brain : Bot;
  return <Icon size={size} className={className} />;
}
