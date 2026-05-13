import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { apiPatch, apiPost } from '@/shared/api';
import AvatarUpload from '../components/AvatarUpload';
import { Button } from '@/shared/components/ui/Button';
import GamePageShell from '@/shared/components/GamePageShell';

export default function ProfileSetupPage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user?.username ?? '');
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [avatar, setAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setError('');
    setSubmitting(true);
    try {
      const updates: Record<string, string> = {};
      if (username !== user?.username) updates.username = username;
      if (nickname !== user?.nickname) updates.nickname = nickname || username;
      if (Object.keys(updates).length > 0) {
        await apiPatch('/profile', updates);
      }
      let finalAvatar = avatar;
      if (avatar && avatar !== user?.avatarUrl && avatar.startsWith('data:')) {
        const res = await apiPost<{ avatarUrl: string | null }>('/profile/avatar', { avatar });
        finalAvatar = res.avatarUrl;
      }
      setUser({
        id: user!.id,
        username: updates.username ?? user!.username,
        nickname: updates.nickname ?? user!.nickname,
        avatarUrl: finalAvatar ?? user!.avatarUrl,
        role: user!.role,
      });
      navigate('/lobby');
    } catch (err) {
      setError((err as Error).message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GamePageShell>
      <div className="relative z-1 flex flex-col items-center justify-center text-center">
        <h1 className="font-game text-[36px] text-primary text-shadow-bold">完善个人信息</h1>
        <p className="mt-2 text-muted-foreground text-sm">首次登录，请确认你的用户名和昵称</p>

        <div className="mt-8 flex flex-col items-center gap-4 w-[400px]">
          <AvatarUpload avatarUrl={avatar} size={80} onUpload={setAvatar} />

          <div className="w-full">
            <label className="text-muted-foreground text-xs mb-1.5 block text-left">用户名（登录用）</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass-input w-full text-foreground"
            />
          </div>
          <div className="w-full">
            <label className="text-muted-foreground text-xs mb-1.5 block text-left">昵称（游戏中显示）</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="glass-input w-full text-foreground"
            />
          </div>

          {error && <p className="text-sm text-destructive m-0">{error}</p>}

          <Button variant="game" className="w-full" onClick={handleSave} disabled={submitting} sound="click">
            {submitting ? '保存中...' : '确认'}
          </Button>
        </div>
      </div>
    </GamePageShell>
  );
}
