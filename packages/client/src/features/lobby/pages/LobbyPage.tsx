import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spade, LogOut, User, Hexagon, Circle } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getRoleColor } from '@/shared/lib/utils';
import { useRoomStore } from '@/shared/stores/room-store';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { getSocket, connectSocket } from '@/shared/socket';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { BUILD_VERSION } from '@/shared/build-info';
import { ServerButton } from '@/shared/components/ServerButton';
import { ServerSelectModal } from '@/shared/components/ServerSelectModal';

export default function LobbyPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setRoom = useRoomStore((s) => s.setRoom);
  const { uiTheme, setUiTheme } = useSettingsStore();
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-5">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-game text-heading-xl text-primary text-shadow-bold">
          <Spade size={32} className="inline-block align-middle" /> 游戏大厅
        </h1>
        <p className="mt-2 text-muted-foreground">
          欢迎回来, <span className="font-bold" style={getRoleColor(user?.role) ? { color: getRoleColor(user?.role) } : undefined}>{user?.nickname ?? user?.username}</span>
        </p>
      </div>

      {/* Main card */}
      <div className="w-full max-w-sm rounded-panel-ui bg-card/80 backdrop-blur-sm p-6 shadow-card shadow-tech flex flex-col gap-5">
        {/* Create room */}
        <Button variant="primary" size="lg" className="w-full" onClick={handleCreate} disabled={loading}>
          {loading ? '创建中...' : '创建房间'}
        </Button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/15" />
          <span className="text-xs text-muted-foreground">或加入房间</span>
          <div className="flex-1 h-px bg-white/15" />
        </div>

        {/* Join room */}
        <div className="flex gap-2">
          <Input
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
            placeholder="输入房间码"
            maxLength={6}
            className="flex-1 text-center uppercase tracking-room-code"
            inputSize="lg"
          />
          <Button variant="outline" onClick={handleJoin} disabled={loading} className="px-6">
            加入
          </Button>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </div>

      {/* Bottom actions */}
      <div className="flex items-center gap-3">
        {!user?.id.startsWith('ephemeral_') && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>
            <User size={14} className="mr-1 inline-block" /> 个人信息
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/'); }}>
          <LogOut size={14} className="mr-1 inline-block" /> 退出登录
        </Button>
      </div>

      {/* Theme switcher + version */}
      <div className="absolute bottom-6 right-6 flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-btn bg-card/60 p-1">
          <button
            onClick={() => setUiTheme('rounded')}
            className={`p-1.5 rounded-full transition-colors ${uiTheme === 'rounded' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="圆角风格"
          >
            <Circle size={14} />
          </button>
          <button
            onClick={() => setUiTheme('tech')}
            className={`p-1.5 rounded-sm transition-colors ${uiTheme === 'tech' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="科技风格"
          >
            <Hexagon size={14} />
          </button>
        </div>
        <ServerButton />
        <span className="text-xs text-muted-foreground/50">v{BUILD_VERSION}</span>
      </div>

      <ServerSelectModal />
    </div>
  );
}
