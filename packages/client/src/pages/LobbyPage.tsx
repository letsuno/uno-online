import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spade } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { useRoomStore } from '../stores/room-store';
import { getSocket, connectSocket } from '../socket';

export default function LobbyPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setRoom = useRoomStore((s) => s.setRoom);
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    setLoading(true);
    connectSocket();
    getSocket().emit('room:create', {}, (res: any) => {
      setLoading(false);
      if (res.success) {
        setRoom(res.roomCode, res.players, res.room);
        navigate(`/room/${res.roomCode}`);
      }
    });
  };

  const handleJoin = () => {
    if (joinCode.length !== 6) { setError('请输入 6 位房间码'); return; }
    setLoading(true);
    connectSocket();
    getSocket().emit('room:join', joinCode.toUpperCase(), (res: any) => {
      setLoading(false);
      if (res.success) {
        setRoom(joinCode.toUpperCase(), res.players, res.room);
        navigate(`/room/${joinCode.toUpperCase()}`);
      } else {
        setError(res.error || '加入失败');
      }
    });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-5">
      <h1 className="font-game text-[32px] text-primary">
        <Spade size={24} className="inline-block align-middle" /> 游戏大厅
      </h1>
      <p className="text-muted-foreground">欢迎, {user?.username}!</p>
      <button className="bg-primary text-primary-foreground px-10 py-4 rounded-3xl text-xl font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-105 active:scale-[0.97]" onClick={handleCreate} disabled={loading}>
        {loading ? '创建中...' : '创建房间'}
      </button>
      <div className="flex items-center gap-2">
        <input
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
          placeholder="输入房间码"
          maxLength={6}
          className="w-[160px] rounded-xl border-2 border-white/20 bg-card px-4 py-3 text-center text-lg uppercase tracking-[4px] text-foreground"
        />
        <button className="bg-primary text-primary-foreground px-6 py-2.5 rounded-3xl text-base font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-105 active:scale-[0.97]" onClick={handleJoin} disabled={loading}>加入</button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button className="bg-secondary text-foreground px-5 py-2 rounded-[20px] text-sm border border-white/20" onClick={() => navigate('/profile')}>个人信息</button>
        <button className="bg-secondary text-foreground px-5 py-2 rounded-[20px] text-sm border border-white/20" onClick={() => { logout(); navigate('/'); }}>退出登录</button>
      </div>
    </div>
  );
}
