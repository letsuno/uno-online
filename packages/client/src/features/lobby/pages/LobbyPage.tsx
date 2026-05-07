import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spade } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getRoleColor } from '@/shared/lib/utils';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket, connectSocket } from '@/shared/socket';
import { Button } from '@/shared/components/ui/Button';

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
        const code = joinCode.toUpperCase();
        setRoom(code, res.players, res.room);
        navigate(res.rejoin ? `/game/${code}` : `/room/${code}`);
      } else {
        setError(res.error || '加入失败');
      }
    });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-5">
      <h1 className="font-game text-heading-lg text-primary">
        <Spade size={24} className="inline-block align-middle" /> 游戏大厅
      </h1>
      <p className="text-muted-foreground">欢迎, <span style={getRoleColor(user?.role) ? { color: getRoleColor(user?.role) } : undefined}>{user?.nickname ?? user?.username}</span>!</p>
      <Button variant="primary" size="lg" onClick={handleCreate} disabled={loading}>
        {loading ? '创建中...' : '创建房间'}
      </Button>
      <div className="flex items-center gap-2">
        <input
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
          placeholder="输入房间码"
          maxLength={6}
          className="w-join-input rounded-xl border-2 border-white/20 bg-card px-4 py-3 text-center text-lg uppercase tracking-room-code text-foreground"
        />
        <Button variant="primary" onClick={handleJoin} disabled={loading}>加入</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex gap-3">
        {!user?.id.startsWith('ephemeral_') && (
          <Button variant="secondary" onClick={() => navigate('/profile')}>个人信息</Button>
        )}
        <Button variant="secondary" onClick={() => { logout(); navigate('/'); }}>退出登录</Button>
      </div>
    </div>
  );
}
