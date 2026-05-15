import type { BotDifficulty } from '@uno-online/shared';

export interface DifficultyDisplay {
  value: BotDifficulty;
  label: string;
  color: string;
  border: string;
}

export const DIFFICULTY_DISPLAY: Record<BotDifficulty, DifficultyDisplay> = {
  novice: { value: 'novice', label: '新手', color: 'text-green-400', border: 'border-green-400' },
  easy: { value: 'easy', label: '简单', color: 'text-blue-400', border: 'border-blue-400' },
  normal: { value: 'normal', label: '普通', color: 'text-orange-400', border: 'border-orange-400' },
  hard: { value: 'hard', label: '困难', color: 'text-red-400', border: 'border-red-400' },
};

export const DIFFICULTY_LIST: DifficultyDisplay[] = [
  DIFFICULTY_DISPLAY.novice,
  DIFFICULTY_DISPLAY.easy,
  DIFFICULTY_DISPLAY.normal,
  DIFFICULTY_DISPLAY.hard,
];
