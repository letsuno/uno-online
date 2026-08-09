import { useEffect, useRef } from 'react';
import { ArrowLeftRight, Crown, UserX, MicOff, Mic } from 'lucide-react';
import { getSocket } from '@/shared/socket';
import { useGatewayStore } from '@/shared/voice/gateway-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { showConfirm } from '@/shared/stores/confirm-store';
import { cn } from '@/shared/lib/utils';
import type { RoomSeatPlayer, RoomStatus } from '@uno-online/shared';
import { menuItemClass, dangerItemClass } from '../constants/menu-styles';

interface PlayerActionMenuProps {
  target: RoomSeatPlayer;
  isOwner: boolean;
  roomStatus: RoomStatus;
  position: { x: number; y: number };
  onClose: () => void;
  onSwapRequest?: (targetUserId: string) => void;
}

export default function PlayerActionMenu({
  target,
  isOwner,
  roomStatus,
  position,
  onClose,
  onSwapRequest,
}: PlayerActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const playerVoicePresence = useGatewayStore(s => s.playerVoicePresence);
  const targetPresence = playerVoicePresence[target.userId];
  const isForceMuted = targetPresence?.forceMuted ?? false;
  const isTargetInVoice = targetPresence?.inVoice ?? false;
  const isWaiting = roomStatus === 'waiting';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const transferOwner = async () => {
    if (
      !(await showConfirm({
        title: '移交房主',
        message: `确定要将房主移交给 ${target.nickname} 吗？`,
        confirmText: '移交',
      }))
    )
      return;
    getSocket().emit('room:transfer_owner', { targetId: target.userId }, res => {
      if (!res.success) useToastStore.getState().addToast(res.error, 'error');
    });
    onClose();
  };

  const kickPlayer = async () => {
    if (
      !(await showConfirm({
        title: '踢出玩家',
        message: `确定要将 ${target.nickname} 踢出房间吗？`,
        confirmText: '踢出',
        variant: 'danger',
      }))
    )
      return;
    getSocket().emit('room:kick', { targetId: target.userId }, res => {
      if (!res.success) useToastStore.getState().addToast(res.error, 'error');
    });
    onClose();
  };

  const toggleForceMute = () => {
    getSocket().emit('voice:force_mute', { targetId: target.userId, muted: !isForceMuted }, res => {
      if (!res.success) useToastStore.getState().addToast(res.error, 'error');
    });
    onClose();
  };

  const hasOwnerItems = isOwner && isWaiting;
  const hasForceMute = isOwner && isTargetInVoice;
  const hasSwapRequest = !target.isBot && onSwapRequest;
  if (!hasOwnerItems && !hasForceMute && !hasSwapRequest) return null;

  const clampedX = Math.min(position.x, window.innerWidth - 180);
  const clampedY = Math.min(position.y, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: clampedX, top: clampedY }}
      className={cn('z-fab glass-panel-sm py-1 animate-in fade-in zoom-in-95 duration-100', 'min-w-[160px]')}
    >
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-white/5 truncate">
        {target.nickname}
      </div>
      {hasSwapRequest && (
        <button
          className={menuItemClass}
          onClick={() => {
            onSwapRequest(target.userId);
            onClose();
          }}
        >
          <ArrowLeftRight size={14} /> 请求换座
        </button>
      )}
      {hasOwnerItems && !target.isBot && (
        <>
          <button onClick={transferOwner} className={menuItemClass}>
            <Crown size={14} />
            移交房主
          </button>
          <button onClick={kickPlayer} className={dangerItemClass}>
            <UserX size={14} />
            踢出房间
          </button>
        </>
      )}
      {hasForceMute && (
        <button onClick={toggleForceMute} className={menuItemClass}>
          {isForceMuted ? <Mic size={14} /> : <MicOff size={14} />}
          {isForceMuted ? '解除静音' : '强制静音'}
        </button>
      )}
    </div>
  );
}
