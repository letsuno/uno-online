import type { ReactNode } from 'react';
import { Eye, Volume2, VolumeX, Music, Bot, DoorOpen, LogOut, Trash2 } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useGameStore } from '../stores/game-store';
import { getSocket } from '@/shared/socket';
import { showConfirm } from '@/shared/stores/confirm-store';
import { cn } from '@/shared/lib/utils';
import { reportSocketError } from '@/shared/report-socket-error';

interface MobileMenuSheetProps {
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
}

export default function MobileMenuSheet({ open, onClose, onLeave }: MobileMenuSheetProps) {
  const { colorBlindMode, toggleColorBlind, soundEnabled, toggleSound, bgmEnabled, toggleBgm } = useSettingsStore();
  const ownerId = useRoomStore(s => s.room?.ownerId);
  const userId = useEffectiveUserId();
  const isHost = ownerId === userId;
  const players = useGameStore(s => s.players);
  const isSpectator = useGameStore(s => s.isSpectator);
  const myAutopilot = players.find(p => p.id === userId)?.autopilot ?? false;

  const handleToggleAutopilot = () => {
    getSocket().emit('player:toggle-autopilot', reportSocketError);
    onClose();
  };

  const handleLeave = () => {
    onClose();
    onLeave();
  };

  const handleDissolve = async () => {
    onClose();
    const ok = await showConfirm({
      title: '解散房间',
      message: '确定要解散房间吗？所有玩家将被踢出。',
      confirmText: '解散',
      variant: 'danger',
    });
    if (ok) getSocket().emit('room:dissolve', reportSocketError);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="游戏菜单">
      <div className="flex flex-col gap-1">
        {!isSpectator && (
          <Item
            icon={<Bot size={16} />}
            label={myAutopilot ? '关闭自动托管' : '开启自动托管'}
            active={myAutopilot}
            onClick={handleToggleAutopilot}
          />
        )}
        <Item
          icon={<Eye size={16} />}
          label={colorBlindMode ? '关闭色盲模式' : '开启色盲模式'}
          active={colorBlindMode}
          onClick={() => {
            toggleColorBlind();
            onClose();
          }}
        />
        <Item
          icon={<Music size={16} />}
          label={bgmEnabled ? '关闭背景音乐' : '开启背景音乐'}
          active={bgmEnabled}
          onClick={() => {
            toggleBgm();
            onClose();
          }}
        />
        <Item
          icon={soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          label={soundEnabled ? '关闭音效' : '开启音效'}
          active={soundEnabled}
          onClick={() => {
            toggleSound();
            onClose();
          }}
        />
        <div className="h-px bg-border my-1" />
        <Item
          icon={isHost ? <DoorOpen size={16} /> : <LogOut size={16} />}
          label={isSpectator ? '退出房间' : isHost ? '返回大厅并转让房主' : '返回大厅并托管'}
          danger
          onClick={handleLeave}
        />
        {isHost && <Item icon={<Trash2 size={16} />} label="解散房间" danger onClick={handleDissolve} />}
      </div>
    </BottomSheet>
  );
}

function Item({
  icon,
  label,
  active,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left transition-colors',
        danger
          ? 'text-destructive hover:bg-destructive/10'
          : active
            ? 'text-accent bg-accent/10'
            : 'text-foreground hover:bg-white/10',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
