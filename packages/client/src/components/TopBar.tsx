import { Eye, Volume2, VolumeX, Spade, DoorOpen, Bot } from 'lucide-react';
import TurnTimer from './TurnTimer';
import { useSettingsStore } from '../stores/settings-store';
import { useRoomStore } from '../stores/room-store';
import { useAuthStore } from '../stores/auth-store';
import { getSocket } from '../socket';
import { cn } from '@/lib/utils';

interface TopBarProps { roomCode: string; }

export default function TopBar({ roomCode }: TopBarProps) {
  const { colorBlindMode, toggleColorBlind, soundEnabled, toggleSound, autoPlay, toggleAutoPlay } = useSettingsStore();
  const ownerId = useRoomStore((s) => s.room?.ownerId);
  const userId = useAuthStore((s) => s.user?.id);
  const isHost = ownerId === userId;

  const handleDissolve = () => {
    if (!window.confirm('确定要解散房间吗？所有玩家将被踢出。')) return;
    getSocket().emit('room:dissolve', () => {});
  };

  return (
    <div className="flex justify-between items-center px-4 py-2 bg-black/30 text-caption z-topbar">
      <div className="flex items-center gap-3">
        <span className="font-bold text-primary font-game"><Spade size={18} className="inline align-middle" /> UNO Online</span>
        <span className="text-muted-foreground">房间: {roomCode}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleAutoPlay}
          className={cn(
            'bg-transparent border-none text-sm cursor-pointer',
            autoPlay ? 'text-accent' : 'text-muted-foreground'
          )}
          title={autoPlay ? '关闭自动托管' : '开启自动托管'}
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
