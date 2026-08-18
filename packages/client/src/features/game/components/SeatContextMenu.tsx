import { useEffect, useRef } from 'react';
import { ArrowLeftRight, Trash2, UserRoundPlus } from 'lucide-react';
import type { RoomSeatPlayer, RuleBotDifficulty } from '@uno-online/shared';
import { RULE_BOT_DIFFICULTY_LIST } from '../constants/bot-difficulty';
import { menuItemClass, dangerItemClass } from '../constants/menu-styles';
import { BotAvatarIcon } from './BotAvatarIcon';
import { BotDifficultyColumns } from './BotDifficultyColumns';
import { AiProviderMenuItems } from './AiProviderMenuItems';

interface SeatContextMenuProps {
  seatIndex: number;
  player: RoomSeatPlayer | null;
  isOwner: boolean;
  isMeSeated: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onTakeSeat: () => void;
  onAddRuleBot: (difficulty: RuleBotDifficulty, seatIndex: number) => void;
  onAddAiBot: (providerId: string, seatIndex: number) => void;
  onSwapRequest: (targetUserId: string) => void;
  onSetBotDifficulty: (botId: string, difficulty: RuleBotDifficulty) => void;
  onSetBotAi: (botId: string, providerId: string) => void;
  onRemoveBot: (botId: string) => void;
}

export function SeatContextMenu({
  seatIndex,
  player,
  isOwner,
  isMeSeated,
  position,
  onClose,
  onTakeSeat,
  onAddRuleBot,
  onAddAiBot,
  onSwapRequest,
  onSetBotDifficulty,
  onSetBotAi,
  onRemoveBot,
}: SeatContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const clampedX = Math.min(position.x, window.innerWidth - 200);
  const clampedY = Math.min(position.y, window.innerHeight - 300);

  if (!player) {
    return (
      <div
        ref={ref}
        style={{ position: 'fixed', left: clampedX, top: clampedY }}
        className="z-fab glass-panel-sm py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-white/5">{seatIndex + 1}号位</div>
        <button
          className={menuItemClass}
          onClick={() => {
            onTakeSeat();
            onClose();
          }}
        >
          <UserRoundPlus size={14} /> 入座
        </button>
        {isOwner && (
          <>
            <div className="mt-1 border-t border-white/5 px-3 py-1 text-xs text-muted-foreground">添加人机</div>
            {RULE_BOT_DIFFICULTY_LIST.map(d => (
              <button
                key={d.value}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 cursor-pointer transition-colors"
                onClick={() => {
                  onAddRuleBot(d.value, seatIndex);
                  onClose();
                }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: d.avatarBg }}
                >
                  <BotAvatarIcon difficulty={d.value} size={10} className="text-white" />
                </div>
                <span className="text-foreground">{d.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{d.description}</span>
              </button>
            ))}
            <div className="mt-1 border-t border-white/5">
              <AiProviderMenuItems
                intent="add"
                onSelect={providerId => {
                  onAddAiBot(providerId, seatIndex);
                  onClose();
                }}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  if (player.isBot) {
    return (
      <div
        ref={ref}
        style={{ position: 'fixed', left: clampedX, top: clampedY }}
        className="z-fab glass-panel-sm py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-white/5">
          {seatIndex + 1}号位 · {player.nickname}
        </div>
        {isMeSeated && (
          <button
            className={menuItemClass}
            onClick={() => {
              onSwapRequest(player.userId);
              onClose();
            }}
          >
            <ArrowLeftRight size={14} /> 交换座位
          </button>
        )}
        {isOwner && (
          <>
            <div className="px-3 py-1 text-xs text-muted-foreground">调整难度</div>
            <BotDifficultyColumns
              currentDifficulty={player.botConfig?.difficulty}
              currentAiProviderId={player.botConfig?.aiProviderId}
              onSelect={difficulty => {
                onSetBotDifficulty(player.userId, difficulty);
                onClose();
              }}
              onSelectAiProvider={providerId => {
                onSetBotAi(player.userId, providerId);
                onClose();
              }}
            />
            <button
              className={dangerItemClass}
              onClick={() => {
                onRemoveBot(player.userId);
                onClose();
              }}
            >
              <Trash2 size={14} /> 移除人机
            </button>
          </>
        )}
      </div>
    );
  }

  return null;
}
