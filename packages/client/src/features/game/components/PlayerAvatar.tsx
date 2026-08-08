import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants/avatars';
import { DIFFICULTY_DISPLAY } from '../constants/bot-difficulty';
import type { BotConfig } from '@uno-online/shared';
import { cn } from '@/shared/lib/utils';
import { BotAvatarIcon } from './BotAvatarIcon';

interface PlayerAvatarProps {
  /** 玩家在 players 数组中的原始序号（决定兜底配色与 emoji） */
  index: number;
  name: string;
  avatarUrl?: string | null;
  isBot?: boolean;
  botConfig?: BotConfig;
  /** 直径 px */
  size?: number;
  className?: string;
  /** 主色描边高亮（如当前回合） */
  highlighted?: boolean;
}

/** 圆形玩家头像：真实头像 > Bot 难度配色 > 序号 emoji 兜底；img 在容器内裁圆 */
export default function PlayerAvatar({ index, name, avatarUrl, isBot, botConfig, size = 28, className, highlighted = false }: PlayerAvatarProps) {
  const botDisplay = isBot && botConfig ? DIFFICULTY_DISPLAY[botConfig.difficulty] : undefined;
  return (
    <div
      className={cn(
        'relative rounded-full flex items-center justify-center overflow-hidden shrink-0 transition-shadow duration-300',
        highlighted && 'ring-2 ring-primary/70 shadow-[0_0_10px_rgba(246,190,62,0.35)]',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: botDisplay ? botDisplay.avatarBg : AVATAR_COLORS[index % AVATAR_COLORS.length],
        boxShadow: !highlighted && botDisplay ? `inset 0 0 0 1.5px ${botDisplay.ringColor}` : undefined,
      }}
    >
      {botDisplay ? (
        <BotAvatarIcon difficulty={botConfig?.difficulty} size={size * 0.5} className="text-white drop-shadow-sm" />
      ) : (
        <>
          <span>{AVATAR_EMOJIS[index % AVATAR_EMOJIS.length]}</span>
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt={name}
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </>
      )}
    </div>
  );
}
