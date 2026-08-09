import type { BotDifficulty, RuleBotDifficulty } from '@uno-online/shared';

export interface DifficultyDisplay<T extends BotDifficulty = BotDifficulty> {
  value: T;
  label: string;
  color: string;
  border: string;
  avatarBg: string;
  ringColor: string;
  description: string;
}

export const DIFFICULTY_DISPLAY: { [K in BotDifficulty]: DifficultyDisplay<K> } = {
  novice: {
    value: 'novice',
    label: 'Novice',
    color: 'text-green-400',
    border: 'border-green-400',
    avatarBg: '#22c55e',
    ringColor: '#4ade80',
    description: '随机出牌',
  },
  easy: {
    value: 'easy',
    label: 'Easy',
    color: 'text-blue-400',
    border: 'border-blue-400',
    avatarBg: '#3b82f6',
    ringColor: '#60a5fa',
    description: '基础策略',
  },
  normal: {
    value: 'normal',
    label: 'Normal',
    color: 'text-orange-400',
    border: 'border-orange-400',
    avatarBg: '#f97316',
    ringColor: '#fb923c',
    description: '进阶策略',
  },
  hard: {
    value: 'hard',
    label: 'Hard',
    color: 'text-red-400',
    border: 'border-red-400',
    avatarBg: '#ef4444',
    ringColor: '#f87171',
    description: '高级策略',
  },
  rl: {
    value: 'rl',
    label: 'RL AI',
    color: 'text-purple-400',
    border: 'border-purple-400',
    avatarBg: '#a855f7',
    ringColor: '#c084fc',
    description: '强化学习',
  },
};

export const RULE_BOT_DIFFICULTY_LIST: DifficultyDisplay<RuleBotDifficulty>[] = [
  DIFFICULTY_DISPLAY.novice,
  DIFFICULTY_DISPLAY.easy,
  DIFFICULTY_DISPLAY.normal,
  DIFFICULTY_DISPLAY.hard,
];
