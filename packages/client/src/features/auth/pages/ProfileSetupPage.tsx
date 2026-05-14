import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { apiPatch, apiPost } from '@/shared/api';
import AvatarUpload from '../components/AvatarUpload';
import AuthLayout from '../components/AuthLayout';
import { Button } from '@/shared/components/ui/Button';
import { useBgm } from '@/shared/sound/useBgm';

export default function ProfileSetupPage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user?.username ?? '');
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [avatar, setAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useBgm('lobby');

  const handleSave = async () => {
    if (!username.trim()) { setFieldError('请输入用户名'); return; }
    setFieldError('');
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
      navigate('/');
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || '保存失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="完善个人信息"
      subtitle="首次登录，请确认你的用户名和昵称"
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          <AvatarUpload avatarUrl={avatar} size={96} onUpload={setAvatar} />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">用户名（登录用）</label>
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); setFieldError(''); }}
            className="glass-input w-full text-foreground"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">昵称（游戏中显示）</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="glass-input w-full text-foreground"
            placeholder="留空则使用用户名"
          />
        </div>

        {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}

        <Button variant="game" className="w-full mt-1" onClick={handleSave} disabled={submitting} sound="click">
          {submitting ? '保存中...' : '确 认'}
        </Button>
      </div>
    </AuthLayout>
  );
}
