export type BotDifficulty = 'novice' | 'easy' | 'normal' | 'hard' | 'rl';
export type RuleBotDifficulty = Exclude<BotDifficulty, 'rl'>;
export type BotPersonality = 'aggressive' | 'defensive' | 'chaotic' | 'strategic' | 'balanced';

interface BotConfigBase {
  personality: BotPersonality;
}

export interface RuleBotConfig extends BotConfigBase {
  difficulty: RuleBotDifficulty;
  aiProviderId?: never;
}

export interface AiBotConfig extends BotConfigBase {
  difficulty: 'rl';
  aiProviderId: string;
}

export type BotConfig = RuleBotConfig | AiBotConfig;
export type BotSelection = Pick<RuleBotConfig, 'difficulty'> | Pick<AiBotConfig, 'difficulty' | 'aiProviderId'>;

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['novice', 'easy', 'normal', 'hard', 'rl'];
export const RULE_BOT_DIFFICULTIES: readonly RuleBotDifficulty[] = ['novice', 'easy', 'normal', 'hard'];
export const BOT_PERSONALITIES: readonly BotPersonality[] = [
  'aggressive',
  'defensive',
  'chaotic',
  'strategic',
  'balanced',
];

export function isBotConfig(value: unknown): value is BotConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (
    typeof config['difficulty'] !== 'string' ||
    !BOT_DIFFICULTIES.includes(config['difficulty'] as BotDifficulty) ||
    typeof config['personality'] !== 'string' ||
    !BOT_PERSONALITIES.includes(config['personality'] as BotPersonality)
  )
    return false;

  if (config['difficulty'] === 'rl') {
    return (
      Object.keys(config).length === 3 &&
      typeof config['aiProviderId'] === 'string' &&
      config['aiProviderId'].length > 0
    );
  }
  return Object.keys(config).length === 2;
}
