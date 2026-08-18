import {
  HOUSE_RULE_DEFINITIONS,
  ROLE_CONFIG,
  type BotDifficulty,
  type GamePhase,
  type HouseRules,
  type RoomStatus,
  type UserRole,
} from '@uno-online/shared';

export const roleLabel = (role: UserRole) => ROLE_CONFIG[role].label;

export const roomStatusLabels: Record<RoomStatus, string> = {
  waiting: '等待中',
  playing: '对局中',
  finished: '已结束',
};

export const gamePhaseLabels: Record<GamePhase, string> = {
  waiting: '等待开始',
  dealing: '正在发牌',
  playing: '正常出牌',
  choosing_color: '选择颜色',
  challenging: '等待质疑',
  choosing_swap_target: '选择换牌目标',
  round_end: '本轮结束',
  game_over: '对局结束',
};

export const botDifficultyLabels: Record<BotDifficulty, string> = {
  novice: '新手',
  easy: '简单',
  normal: '普通',
  hard: '困难',
  rl: '学习模型',
};

export function formatDateTime(value: string | number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function formatRelativeTime(value: string | number): string {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  const intervals: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, unit] of intervals) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}

export function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function enabledHouseRuleLabels(rules: HouseRules): string[] {
  return HOUSE_RULE_DEFINITIONS.filter(definition => {
    const value = rules[definition.key];
    if (definition.key === 'unoPenaltyCount') return value !== 2;
    return value === true || typeof value === 'number';
  }).map(definition => definition.label);
}
