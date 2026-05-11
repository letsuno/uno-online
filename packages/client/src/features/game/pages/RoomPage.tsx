import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Crown, Check, Copy } from 'lucide-react';
import { cn, getRoleColor } from '@/shared/lib/utils';
import { AiBadge } from '@/shared/components/ui/AiBadge';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useGameStore } from '../stores/game-store';
import { getSocket, connectSocket, refreshVoicePresence } from '@/shared/socket';
import VoicePanel from '@/shared/voice/VoicePanel';
import PlayerVoiceStatus from '@/shared/voice/PlayerVoiceStatus';
import { leaveVoiceSession } from '@/shared/voice/voice-runtime';
import { useToastStore } from '@/shared/stores/toast-store';
import HouseRulesPanel from '../components/HouseRulesPanel';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';
import { Button } from '@/shared/components/ui/Button';

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const user = useAuthStore((s) => s.user);
  const { players, room, clearRoom, setRoom, updateRoom } = useRoomStore();
  const setGameState = useGameStore((s) => s.setGameState);
  const navigate = useNavigate();

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    refreshVoicePresence();

    if (useRoomStore.getState().players.length === 0 && roomCode) {
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (res.success) {
          if (res.players && res.room) {
            setRoom(roomCode, res.players, res.room);
            refreshVoicePresence();
          }
          if (res.gameState) {
            setGameState(res.gameState);
            navigate(`/game/${roomCode}`);
          }
        } else {
          navigate('/lobby');
        }
      });
    }

    const onState = (view: any) => {
      setGameState(view);
      refreshVoicePresence();
      navigate(`/game/${roomCode}`);
    };
    socket.on('game:state', onState);
    return () => { socket.off('game:state', onState); };
  }, [roomCode, navigate, setGameState]);

  const isOwner = room?.ownerId === user?.id;
  const myPlayer = players.find((p) => p.userId === user?.id);
  const allReady = players.length >= 2 && players.every((p) => p.ready);
  const [houseRules, setHouseRules] = useState<HouseRules>(DEFAULT_HOUSE_RULES);

  useEffect(() => {
    if (room?.settings?.houseRules) {
      setHouseRules({ ...DEFAULT_HOUSE_RULES, ...room.settings.houseRules });
    }
  }, [room?.settings?.houseRules]);

  const toggleReady = () => {
    getSocket().emit('room:ready', !myPlayer?.ready, () => {});
  };

  const startGame = () => {
    getSocket().emit('game:start', (res: any) => {
      if (!res.success) alert(res.error);
      if (res.success && res.gameState) {
        setGameState(res.gameState);
        navigate(`/game/${roomCode}`);
      }
    });
  };

  const leaveRoom = () => {
    if (!window.confirm('确定要离开房间吗？')) return;
    getSocket().emit('voice:presence', { inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
    leaveVoiceSession();
    getSocket().emit('room:leave', () => {
      clearRoom();
      navigate('/lobby');
    });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-5">
      <h2 className="font-game text-primary flex items-center gap-2">
        房间 {roomCode}
        <button
          onClick={() => {
            const url = `${window.location.origin}/room/${roomCode}`;
            navigator.clipboard.writeText(`来玩 UNO 吧！房间号：${roomCode}\n${url}`);
            useToastStore.getState().addToast('房间链接已复制', 'success');
          }}
          className="bg-white/10 hover:bg-white/20 rounded-lg p-1.5 cursor-pointer transition-colors"
          title="复制房间链接"
        >
          <Copy size={14} className="text-muted-foreground" />
        </button>
      </h2>
      <div className="min-w-room-min rounded-2xl bg-card p-5">
        <h3 className="mb-3 text-sm text-muted-foreground">
          玩家 ({players.length}/10)
        </h3>
        {players.map((p) => {
          const roleColor = getRoleColor(p.role);
          return <div key={p.userId} className="flex items-center justify-between border-b border-white/5 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5" style={roleColor ? { color: roleColor } : undefined}>
              <span className="truncate">{p.nickname}</span>
              {p.isBot && <AiBadge />}
              {room?.ownerId === p.userId && <Crown size={14} className="shrink-0" />}
              <PlayerVoiceStatus playerId={p.userId} playerName={p.nickname} isSelf={p.userId === user?.id} className="shrink-0" />
            </span>
            <span className={cn('text-xs', p.ready ? 'text-uno-green' : 'text-muted-foreground')}>
              {p.ready ? <><Check size={12} className="inline-block align-middle" /> 已准备</> : '未准备'}
            </span>
          </div>;
        })}
      </div>
      {/* Spectator settings */}
      <div className="min-w-room-min rounded-2xl bg-card p-5 space-y-3">
        <h3 className="mb-3 text-sm text-muted-foreground">观战设置</h3>
        <div className="flex items-center justify-between">
          <label className="text-sm">允许观战</label>
          <input
            type="checkbox"
            checked={room?.settings?.allowSpectators ?? true}
            onChange={(e) => getSocket().emit('room:update_settings', { allowSpectators: e.target.checked })}
            className="accent-primary"
            disabled={!isOwner}
          />
        </div>
        {(room?.settings?.allowSpectators ?? true) && (
          <div className="flex items-center justify-between">
            <label className="text-sm">观战模式</label>
            <select
              value={room?.settings?.spectatorMode ?? 'hidden'}
              onChange={(e) => getSocket().emit('room:update_settings', { spectatorMode: e.target.value as 'full' | 'hidden' })}
              className="bg-card text-foreground border border-white/15 rounded px-2 py-1 text-sm"
              disabled={!isOwner}
            >
              <option value="hidden">只看出牌</option>
              <option value="full">全透视</option>
            </select>
          </div>
        )}
      </div>
      <HouseRulesPanel
        houseRules={houseRules}
        onChange={(rules) => {
          setHouseRules(rules);
          getSocket().emit('room:update_settings', { houseRules: rules });
        }}
        disabled={!isOwner}
      />
      <div className="flex gap-3">
        <Button variant="primary" onClick={toggleReady} sound="ready">
          {myPlayer?.ready ? '取消准备' : '准备'}
        </Button>
        {isOwner && (
          <Button variant="primary" className={cn(!allReady && 'opacity-50')} onClick={startGame} disabled={!allReady} sound="ready">
            开始游戏
          </Button>
        )}
        <Button variant="danger" onClick={leaveRoom} sound="danger">离开房间</Button>
      </div>
      <VoicePanel />
    </div>
  );
}
