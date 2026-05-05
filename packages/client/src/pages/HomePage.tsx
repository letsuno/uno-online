import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Spade } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store.js';
import { GITHUB_CLIENT_ID } from '../env.js';

export default function HomePage() {
  const { user, token, loading, loadUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => { if (user) navigate('/lobby'); }, [user, navigate]);

  const loginUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 32, textAlign: 'center', padding: 20,
    }}>
      <h1 style={{
        fontFamily: 'var(--font-game)', fontSize: 48, color: 'var(--text-accent)',
        textShadow: '3px 4px 0px rgba(0,0,0,0.3)',
      }}>
        <Spade size={36} style={{ verticalAlign: 'middle' }} /> UNO Online
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 18, maxWidth: 400 }}>
        和朋友一起玩 UNO！支持 2-10 人在线对战、语音通话、自定义村规。
      </p>
      {!loading && !token && (
        <a href={loginUrl} className="btn-primary" style={{
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 18, padding: '14px 32px',
        }}>
          <LogIn size={20} /> GitHub 登录
        </a>
      )}
      {loading && <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>}
    </div>
  );
}
