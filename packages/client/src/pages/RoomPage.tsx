import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Crown, Check } from 'lucide-react';
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
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 24, padding: 20,
    }}>
      <h2 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)' }}>
        房间 {roomCode}
      </h2>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 20, minWidth: 300 }}>
        <h3 style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
          玩家 ({players.length}/10)
        </h3>
        {players.map((p) => (
          <div key={p.userId} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <span>{p.username}{room?.ownerId === p.userId && <> <Crown size={14} style={{ verticalAlign: 'middle' }} /></>}</span>
            <span style={{ color: p.ready ? 'var(--color-green)' : 'var(--text-secondary)', fontSize: 12 }}>
              {p.ready ? <><Check size={12} style={{ verticalAlign: 'middle' }} /> 已准备</> : '未准备'}
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
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-primary" onClick={toggleReady}>
          {myPlayer?.ready ? '取消准备' : '准备'}
        </button>
        {isOwner && (
          <button className="btn-primary" onClick={startGame}
            style={{ opacity: allReady ? 1 : 0.5 }} disabled={!allReady}>
            开始游戏
          </button>
        )}
        <button className="btn-danger" onClick={leaveRoom}>离开房间</button>
      </div>
      <VoicePanel />
    </div>
  );
}
