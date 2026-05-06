import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Crown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '../stores/auth-store';
import { useRoomStore } from '../stores/room-store';
import { useGameStore } from '../stores/game-store';
import { getSocket, connectSocket } from '../socket';
import VoicePanel from '../voice/VoicePanel';
import HouseRulesPanel from '../components/HouseRulesPanel';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const user = useAuthStore((s) => s.user);
  const { players, room, clearRoom, setRoom, updateRoom } = useRoomStore();
  const setGameState = useGameStore((s) => s.setGameState);
  const navigate = useNavigate();

  useEffect(() => {
    connectSocket();
    const socket = getSocket();

    if (useRoomStore.getState().players.length === 0 && roomCode) {
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (res.success) {
          if (res.players && res.room) {
            setRoom(roomCode, res.players, res.room);
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
    getSocket().emit('room:leave', () => {
      clearRoom();
      navigate('/lobby');
    });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-5">
      <h2 className="font-game text-primary">
        房间 {roomCode}
      </h2>
      <div className="min-w-[300px] rounded-2xl bg-card p-5">
        <h3 className="mb-3 text-sm text-muted-foreground">
          玩家 ({players.length}/10)
        </h3>
        {players.map((p) => (
          <div key={p.userId} className="flex items-center justify-between border-b border-white/5 py-2">
            <span>{p.username}{room?.ownerId === p.userId && <> <Crown size={14} className="inline-block align-middle" /></>}</span>
            <span className={cn('text-xs', p.ready ? 'text-uno-green' : 'text-muted-foreground')}>
              {p.ready ? <><Check size={12} className="inline-block align-middle" /> 已准备</> : '未准备'}
            </span>
          </div>
        ))}
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
        <button className="bg-primary text-primary-foreground px-6 py-2.5 rounded-3xl text-base font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-105 active:scale-[0.97]" onClick={toggleReady}>
          {myPlayer?.ready ? '取消准备' : '准备'}
        </button>
        {isOwner && (
          <button className={cn('bg-primary text-primary-foreground px-6 py-2.5 rounded-3xl text-base font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-105 active:scale-[0.97]', !allReady && 'opacity-50')} onClick={startGame}
            disabled={!allReady}>
            开始游戏
          </button>
        )}
        <button className="bg-destructive text-white px-5 py-2 rounded-[20px] text-sm font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)]" onClick={leaveRoom}>离开房间</button>
      </div>
      <VoicePanel />
    </div>
  );
}
