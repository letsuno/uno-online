import { useState } from 'react';
import { Eye, Volume2, VolumeX, Spade, DoorOpen, Bot, HelpCircle } from 'lucide-react';
import type { Card, Color } from '@uno-online/shared';
import TurnTimer from './TurnTimer';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { getSocket } from '@/shared/socket';
import { cn } from '@/shared/lib/utils';
import { BUILD_VERSION } from '@/shared/build-info';

const AUTOPILOT_COOLDOWN_MS = 3000;

const PHASE_LABEL: Record<string, string> = {
  choosing_color: '选色中…',
  challenging: '质疑中…',
  choosing_swap_target: '选交换…',
};

const COLOR_HEX: Record<Color, string> = {
  red: 'var(--color-uno-red)',
  blue: 'var(--color-uno-blue)',
  green: 'var(--color-uno-green)',
  yellow: 'var(--color-uno-yellow)',
};

const COLOR_LABEL: Record<Color, string> = {
  red: '红', blue: '蓝', green: '绿', yellow: '黄',
};

function getCardLabel(card: Card): string {
  switch (card.type) {
    case 'number': return `${card.value}`;
    case 'skip': return '禁';
    case 'reverse': return '转';
    case 'draw_two': return '+2';
    case 'wild': return '变色';
    case 'wild_draw_four': return '+4';
  }
}

function GameStatus() {
  const topCard = useGameStore((s) => s.discardPile?.[s.discardPile.length - 1]);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const phase = useGameStore((s) => s.phase);

  if (!topCard || !currentColor || phase === 'round_end' || phase === 'game_over') return null;

  const hex = COLOR_HEX[currentColor];

  return (
    <div className="hidden sm:flex items-center gap-2 text-xs">
      <div
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-game"
        style={{ background: `color-mix(in srgb, ${hex} 20%, transparent)`, color: hex }}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: hex }}
        />
        <span>{COLOR_LABEL[currentColor]}</span>
        <span className="opacity-60">·</span>
        <span>{getCardLabel(topCard)}</span>
      </div>
      {drawStack > 0 && (
        <span className="rounded-full bg-destructive/20 text-destructive px-2 py-1 font-game font-bold">
          叠加 +{drawStack}
        </span>
      )}
      {phase && PHASE_LABEL[phase] && (
        <span className="rounded-full bg-white/10 text-muted-foreground px-2 py-1 font-game">
          {PHASE_LABEL[phase]}
        </span>
      )}
    </div>
  );
}

interface TopBarProps { roomCode: string; }

export default function TopBar({ roomCode }: TopBarProps) {
  const { colorBlindMode, toggleColorBlind, soundEnabled, toggleSound } = useSettingsStore();
  const ownerId = useRoomStore((s) => s.room?.ownerId);
  const userId = useEffectiveUserId();
  const isHost = ownerId === userId;
  const toggleInfoDrawer = useGameStore((s) => s.toggleInfoDrawer);
  const players = useGameStore((s) => s.players);
  const myAutopilot = players.find(p => p.id === userId)?.autopilot ?? false;
  const [autopilotCooldown, setAutopilotCooldown] = useState(false);

  const handleToggleAutopilot = () => {
    if (autopilotCooldown) return;
    setAutopilotCooldown(true);
    getSocket().emit('player:toggle-autopilot', () => {});
    setTimeout(() => setAutopilotCooldown(false), AUTOPILOT_COOLDOWN_MS);
  };

  const handleDissolve = () => {
    if (!window.confirm('确定要解散房间吗？所有玩家将被踢出。')) return;
    getSocket().emit('room:dissolve', () => {});
  };

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 bg-black/30 text-caption z-topbar">
      <div className="flex items-center gap-3">
        <span className="font-bold text-primary font-game"><Spade size={18} className="inline align-middle" /> UNO Online</span>
        <span className="text-muted-foreground">房间: {roomCode}</span>
        <span className="text-muted-foreground/50 text-xs hidden md:inline">v{BUILD_VERSION}</span>
      </div>
      <GameStatus />
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={toggleInfoDrawer}
          className="hidden md:inline bg-transparent border-none text-sm cursor-pointer text-muted-foreground hover:text-accent transition-colors"
          title="游戏信息 (H)"
        >
          <HelpCircle size={16} />
        </button>
        <button
          onClick={handleToggleAutopilot}
          disabled={autopilotCooldown}
          className={cn(
            'bg-transparent border-none text-sm cursor-pointer',
            autopilotCooldown ? 'opacity-40 cursor-not-allowed' : myAutopilot ? 'text-accent' : 'text-muted-foreground'
          )}
          title={autopilotCooldown ? '操作冷却中...' : myAutopilot ? '关闭自动托管' : '开启自动托管'}
        >
          <Bot size={16} />
        </button>
        <button
          onClick={toggleColorBlind}
          className={cn(
            'bg-transparent border-none text-sm cursor-pointer',
            colorBlindMode ? 'text-accent' : 'text-muted-foreground'
          )}
          title={colorBlindMode ? '关闭色盲模式' : '开启色盲模式'}
        >
          <Eye size={16} />
        </button>
        <button
          onClick={toggleSound}
          className={cn(
            'bg-transparent border-none text-sm cursor-pointer',
            soundEnabled ? 'text-accent' : 'text-muted-foreground'
          )}
          title={soundEnabled ? '关闭音效' : '开启音效'}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <TurnTimer />
        {isHost && (
          <button
            onClick={handleDissolve}
            className="bg-transparent border-none text-sm cursor-pointer text-destructive hover:text-destructive/80 transition-colors"
            title="解散房间"
          >
            <DoorOpen size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
