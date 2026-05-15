export type BotDifficulty = 'novice' | 'easy' | 'normal' | 'hard';
export type BotPersonality = 'aggressive' | 'defensive' | 'chaotic' | 'strategic' | 'balanced';

export interface BotConfig {
  difficulty: BotDifficulty;
  personality: BotPersonality;
}

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['novice', 'easy', 'normal', 'hard'];
export const BOT_PERSONALITIES: readonly BotPersonality[] = ['aggressive', 'defensive', 'chaotic', 'strategic', 'balanced'];
