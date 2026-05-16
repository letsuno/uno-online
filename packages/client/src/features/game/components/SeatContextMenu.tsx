import { useEffect, useRef } from 'react';
import { ArrowLeftRight, Bot, Trash2, UserRoundPlus } from 'lucide-react';
import type { BotDifficulty, RoomSeatPlayer } from '@uno-online/shared';
import { DIFFICULTY_LIST } from '../constants/bot-difficulty';

interface SeatContextMenuProps {
  seatIndex: number;
  player: RoomSeatPlayer | null;
  isOwner: boolean;
  isMeSeated: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onTakeSeat: () => void;
  onAddBot: (difficulty: BotDifficulty, seatIndex: number) => void;
  onSwapRequest: (targetUserId: string) => void;
  onSetBotDifficulty: (botId: string, difficulty: BotDifficulty) => void;
  onRemoveBot: (botId: string) => void;
}

export function SeatContextMenu({
  seatIndex, player, isOwner, isMeSeated, position, onClose,
  onTakeSeat, onAddBot, onSwapRequest, onSetBotDifficulty, onRemoveBot,
}: SeatContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 200),
    top: Math.min(position.y, window.innerHeight - 300),
    zIndex: 100,
  };

  if (!player) {
    return (
      <div ref={ref} style={menuStyle} className="w-48 rounded-xl bg-card/95 backdrop-blur-sm border border-white/10 p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
        <div className="px-3 py-1.5 text-xs text-muted-foreground">{seatIndex + 1}号位</div>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/8 cursor-pointer"
          onClick={() => { onTakeSeat(); onClose(); }}
        >
          <UserRoundPlus size={14} /> 入座
        </button>
        {isOwner && (
          <>
            <div className="border-t border-white/5 my-1" />
            <div className="px-3 py-1 text-xs text-muted-foreground">添加人机</div>
            {DIFFICULTY_LIST.map((d) => (
              <button
                key={d.value}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-white/8 cursor-pointer"
                onClick={() => { onAddBot(d.value, seatIndex); onClose(); }}
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: d.avatarBg }}>
                  <Bot size={10} className="text-white" />
                </div>
                <span className="text-foreground">{d.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{d.description}</span>
              </button>
            ))}
          </>
        )}
      </div>
    );
  }

  if (player.isBot) {
    return (
      <div ref={ref} style={menuStyle} className="w-48 rounded-xl bg-card/95 backdrop-blur-sm border border-white/10 p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
        <div className="px-3 py-1.5 text-xs text-muted-foreground">{seatIndex + 1}号位 · {player.nickname}</div>
        {isMeSeated && (
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-white/8 cursor-pointer"
            onClick={() => { onSwapRequest(player.userId); onClose(); }}
          >
            <ArrowLeftRight size={14} /> 交换座位
          </button>
        )}
        {isOwner && (
          <>
            <div className="border-t border-white/5 my-1" />
            <div className="px-3 py-1 text-xs text-muted-foreground">调整难度</div>
            {DIFFICULTY_LIST.map((d) => (
              <button
                key={d.value}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-white/8 cursor-pointer"
                onClick={() => { onSetBotDifficulty(player.userId, d.value); onClose(); }}
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: d.avatarBg }}>
                  <Bot size={10} className="text-white" />
                </div>
                <span className="text-foreground">{d.label}</span>
              </button>
            ))}
            <div className="border-t border-white/5 my-1" />
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-white/8 cursor-pointer"
              onClick={() => { onRemoveBot(player.userId); onClose(); }}
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
