import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { apiGet } from '../api';

interface ProfileData {
  user: { id: string; username: string; avatarUrl: string | null; totalGames: number; totalWins: number };
  recentGames: { id: string; game: { roomCode: string; createdAt: string }; finalScore: number; placement: number }[];
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    apiGet<ProfileData>('/profile').then(setProfile).catch(() => {});
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-10">
      <h2 className="font-game text-primary">个人信息</h2>
      {profile && (
        <>
          <div className="text-center">
            <p className="text-xl font-bold">{profile.user.username}</p>
            <p className="mt-2 text-muted-foreground">
              总场次: {profile.user.totalGames} | 胜场: {profile.user.totalWins} |
              胜率: {profile.user.totalGames > 0 ? Math.round(profile.user.totalWins / profile.user.totalGames * 100) : 0}%
            </p>
          </div>
          {profile.recentGames.length > 0 && (
            <div className="w-full max-w-[500px] rounded-xl bg-card p-4">
              <h3 className="mb-3 text-sm text-muted-foreground">最近对局</h3>
              {profile.recentGames.map((g) => (
                <div key={g.id} className="flex justify-between border-b border-white/5 py-1.5 text-[13px]">
                  <span>房间 {g.game.roomCode}</span>
                  <span>第 {g.placement} 名 | {g.finalScore} 分</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <button className="bg-secondary text-foreground px-5 py-2 rounded-[20px] text-sm border border-white/20" onClick={() => navigate('/lobby')}>返回大厅</button>
    </div>
  );
}
