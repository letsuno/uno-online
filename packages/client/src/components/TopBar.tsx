import { Eye, Volume2, VolumeX, Spade } from 'lucide-react';
import TurnTimer from './TurnTimer';
import { useSettingsStore } from '../stores/settings-store';
import { cn } from '@/lib/utils';

interface TopBarProps { roomCode: string; }

export default function TopBar({ roomCode }: TopBarProps) {
  const { colorBlindMode, toggleColorBlind, soundEnabled, toggleSound } = useSettingsStore();

  return (
    <div className="flex justify-between items-center px-4 py-2 bg-black/30 text-caption z-topbar">
      <div className="flex items-center gap-3">
        <span className="font-bold text-primary font-game"><Spade size={18} className="inline align-middle" /> UNO Online</span>
        <span className="text-muted-foreground">房间: {roomCode}</span>
      </div>
      <div className="flex items-center gap-3">
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
      </div>
    </div>
  );
}
