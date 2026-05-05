import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';
import { apiGet } from '../api.js';

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
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 40, gap: 24,
    }}>
      <h2 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)' }}>个人信息</h2>
      {profile && (
        <>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 20, fontWeight: 'bold' }}>{profile.user.username}</p>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
              总场次: {profile.user.totalGames} | 胜场: {profile.user.totalWins} |
              胜率: {profile.user.totalGames > 0 ? Math.round(profile.user.totalWins / profile.user.totalGames * 100) : 0}%
            </p>
          </div>
          {profile.recentGames.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 16, width: '100%', maxWidth: 500 }}>
              <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>最近对局</h3>
              {profile.recentGames.map((g) => (
                <div key={g.id} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13,
                }}>
                  <span>房间 {g.game.roomCode}</span>
                  <span>第 {g.placement} 名 | {g.finalScore} 分</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <button className="btn-secondary" onClick={() => navigate('/lobby')}>返回大厅</button>
    </div>
  );
}
