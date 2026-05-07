import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { apiPatch, apiPost } from '../api';
import AvatarUpload from '../components/AvatarUpload';
import { Button } from '../components/ui/Button';

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
      });
      navigate('/lobby');
    } catch (err) {
      setError((err as Error).message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-5">
      <h2 className="font-game text-[28px] text-primary mb-2">完善个人信息</h2>
      <p className="text-muted-foreground text-sm mb-6">首次登录，请确认你的用户名和昵称</p>

      <div className="flex flex-col items-center gap-3.5 w-[300px]">
        <AvatarUpload avatarUrl={avatar} size={80} onUpload={setAvatar} />

        <div className="w-full">
          <label className="text-muted-foreground text-xs mb-1 block">用户名（登录用）</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground" />
        </div>
        <div className="w-full">
          <label className="text-muted-foreground text-xs mb-1 block">昵称（游戏中显示）</label>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground" />
        </div>

        {error && <p className="text-sm text-destructive m-0">{error}</p>}

        <Button variant="primary" className="w-full" onClick={handleSave} disabled={submitting}>
          <Check size={18} className="inline-block align-middle mr-1.5" />
          {submitting ? '保存中...' : '确认'}
        </Button>
      </div>
    </div>
  );
}
