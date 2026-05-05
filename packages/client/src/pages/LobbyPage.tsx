import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spade } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store.js';
import { useRoomStore } from '../stores/room-store.js';
import { getSocket, connectSocket } from '../socket.js';

export default function LobbyPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setRoom = useRoomStore((s) => s.setRoom);
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  const handleCreate = () => {
    connectSocket();
    getSocket().emit('room:create', {}, (res: any) => {
      if (res.success) {
        setRoom(res.roomCode, res.players, res.room);
        navigate(`/room/${res.roomCode}`);
      }
    });
  };

  const handleJoin = () => {
    if (joinCode.length !== 6) { setError('请输入 6 位房间码'); return; }
    connectSocket();
    getSocket().emit('room:join', joinCode.toUpperCase(), (res: any) => {
      if (res.success) {
        setRoom(joinCode.toUpperCase(), res.players, res.room);
        navigate(`/room/${joinCode.toUpperCase()}`);
      } else {
        setError(res.error || '加入失败');
      }
    });
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 32, padding: 20,
    }}>
      <h1 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)', fontSize: 32 }}>
        <Spade size={24} style={{ verticalAlign: 'middle' }} /> 游戏大厅
      </h1>
      <p style={{ color: 'var(--text-secondary)' }}>欢迎, {user?.username}!</p>
      <button className="btn-primary" onClick={handleCreate} style={{ fontSize: 20, padding: '16px 40px' }}>
        创建房间
      </button>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
          placeholder="输入房间码"
          maxLength={6}
          style={{
            padding: '12px 16px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)',
            background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 18,
            textAlign: 'center', width: 160, letterSpacing: 4, textTransform: 'uppercase',
          }}
        />
        <button className="btn-primary" onClick={handleJoin}>加入</button>
      </div>
      {error && <p style={{ color: 'var(--color-red)', fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button className="btn-secondary" onClick={() => navigate('/profile')}>个人信息</button>
        <button className="btn-secondary" onClick={() => { logout(); navigate('/'); }}>退出登录</button>
      </div>
    </div>
  );
}
