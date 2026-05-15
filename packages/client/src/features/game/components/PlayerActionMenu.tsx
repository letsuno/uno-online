import { useEffect, useRef, useState, useCallback } from 'react';
import { Crown, UserX, MicOff, Mic, Volume2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getSocket } from '@/shared/socket';
import { useGatewayStore } from '@/shared/voice/gateway-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { showConfirm } from '@/shared/stores/confirm-store';
import type { RoomPlayer } from '@/shared/stores/room-store';
import { useBotManagement } from '../hooks/useBotManagement';
import { DIFFICULTY_DISPLAY, DIFFICULTY_LIST } from '../constants/bot-difficulty';

interface PlayerActionMenuProps {
  target: RoomPlayer;
  isOwner: boolean;
  roomStatus: string;
  position: { x: number; y: number };
  onClose: () => void;
}

function normalizeVoiceName(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32).toLocaleLowerCase();
}

export default function PlayerActionMenu({ target, isOwner, roomStatus, position, onClose }: PlayerActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { removeBot, setBotDifficulty } = useBotManagement();
  const playerVoicePresence = useGatewayStore((s) => s.playerVoicePresence);
  const usersById = useGatewayStore((s) => s.usersById);
  const voiceConnected = useGatewayStore((s) => s.status) === 'connected';
  const targetPresence = playerVoicePresence[target.userId];
  const isForceMuted = targetPresence?.forceMuted ?? false;
  const isTargetInVoice = targetPresence?.inVoice ?? false;
  const isWaiting = roomStatus === 'waiting';

  const mumbleUser = Object.values(usersById).find(
    u => normalizeVoiceName(u.name) === normalizeVoiceName(target.nickname)
  );
  const mumbleUserId = mumbleUser?.id ?? null;

  const [peerVolume, setPeerVolume] = useState(100);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const transferOwner = async () => {
    if (!(await showConfirm({
      title: '移交房主',
      message: `确定要将房主移交给 ${target.nickname} 吗？`,
      confirmText: '移交',
    }))) return;
    getSocket().emit('room:transfer_owner', { targetId: target.userId }, (res) => {
      if (!res.success) useToastStore.getState().addToast(res.error ?? '移交失败', 'error');
    });
    onClose();
  };

  const kickPlayer = async () => {
    if (!(await showConfirm({
      title: '踢出玩家',
      message: `确定要将 ${target.nickname} 踢出房间吗？`,
      confirmText: '踢出',
      variant: 'danger',
    }))) return;
    getSocket().emit('room:kick', { targetId: target.userId }, (res) => {
      if (!res.success) useToastStore.getState().addToast(res.error ?? '踢出失败', 'error');
    });
    onClose();
  };

  const toggleForceMute = () => {
    getSocket().emit('voice:force_mute', { targetId: target.userId, muted: !isForceMuted }, (res) => {
      if (!res.success) useToastStore.getState().addToast(res.error ?? '操作失败', 'error');
    });
    onClose();
  };

  const handleVolumeChange = useCallback((value: number) => {
    setPeerVolume(value);
  }, []);

  const hasOwnerItems = isOwner && isWaiting;
  const hasBotItems = isOwner && target.isBot;
  const hasForceMute = isOwner && isTargetInVoice;
  const hasVolume = voiceConnected && isTargetInVoice;
  if (!hasOwnerItems && !hasBotItems && !hasForceMute && !hasVolume) return null;

  const clampedX = Math.min(position.x, window.innerWidth - 180);
  const clampedY = Math.min(position.y, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: clampedX, top: clampedY, zIndex: 50 }}
      className="glass-panel !rounded-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-white/5 truncate">
        {target.nickname}
      </div>
      {hasOwnerItems && !target.isBot && (
        <>
          <button onClick={transferOwner} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 cursor-pointer transition-colors">
            <Crown size={14} />
            移交房主
          </button>
          <button onClick={kickPlayer} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 cursor-pointer transition-colors">
            <UserX size={14} />
            踢出房间
          </button>
        </>
      )}
      {hasBotItems && (
        <>
          <div className="px-3 py-1 text-xs text-white/40">调整难度</div>
          {DIFFICULTY_LIST.map((d) => (
            <button
              key={d.value}
              onClick={() => { setBotDifficulty(target.userId, d.value); onClose(); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/10 cursor-pointer transition-colors"
            >
              <span className={DIFFICULTY_DISPLAY[d.value].color}>●</span>
              <span>{d.label}</span>
            </button>
          ))}
          <button
            onClick={() => { removeBot(target.userId); onClose(); }}
            className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-white/10 cursor-pointer transition-colors"
          >
            移除人机
          </button>
        </>
      )}
      {hasForceMute && (
        <button onClick={toggleForceMute} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 cursor-pointer transition-colors">
          {isForceMuted ? <Mic size={14} /> : <MicOff size={14} />}
          {isForceMuted ? '解除静音' : '强制静音'}
        </button>
      )}
      {hasVolume && (
        <div className="px-3 py-2 flex items-center gap-2">
          <Volume2 size={14} className="text-muted-foreground shrink-0" />
          <input
            type="range"
            min="0"
            max="100"
            value={peerVolume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="flex-1 h-1 accent-primary"
          />
          <span className="text-2xs text-muted-foreground w-6 text-right">{peerVolume}</span>
        </div>
      )}
    </div>
  );
}
