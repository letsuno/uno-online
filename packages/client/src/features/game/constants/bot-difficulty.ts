import type { BotDifficulty } from '@uno-online/shared';

export interface DifficultyDisplay {
  value: BotDifficulty;
  label: string;
  color: string;
  border: string;
  avatarBg: string;
  ringColor: string;
  description: string;
}

export const DIFFICULTY_DISPLAY: Record<BotDifficulty, DifficultyDisplay> = {
  novice: { value: 'novice', label: '新手', color: 'text-green-400', border: 'border-green-400', avatarBg: '#22c55e', ringColor: '#4ade80', description: '随机出牌' },
  easy: { value: 'easy', label: '简单', color: 'text-blue-400', border: 'border-blue-400', avatarBg: '#3b82f6', ringColor: '#60a5fa', description: '基础策略' },
  normal: { value: 'normal', label: '普通', color: 'text-orange-400', border: 'border-orange-400', avatarBg: '#f97316', ringColor: '#fb923c', description: '进阶策略' },
  hard: { value: 'hard', label: '困难', color: 'text-red-400', border: 'border-red-400', avatarBg: '#ef4444', ringColor: '#f87171', description: '高级策略' },
};

export const DIFFICULTY_LIST: DifficultyDisplay[] = [
  DIFFICULTY_DISPLAY.novice,
  DIFFICULTY_DISPLAY.easy,
  DIFFICULTY_DISPLAY.normal,
  DIFFICULTY_DISPLAY.hard,
];
