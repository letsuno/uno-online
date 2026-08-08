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
export const BOT_PERSONALITIES: readonly BotPersonality[] = ['aggressive', 'defensive', 'chaotic', 'strategic', 'balanced'];
