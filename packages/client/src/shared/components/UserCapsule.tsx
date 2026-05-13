import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getRoleColor } from '@/shared/lib/utils';
import { useProfileModalStore } from '@/shared/stores/profile-modal-store';

export default function UserCapsule() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const openProfile = useProfileModalStore((s) => s.open);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const roleColor = getRoleColor(user?.role);
  const initial = (user?.nickname ?? user?.username ?? '?')[0]!.toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 cursor-pointer px-[18px] py-2 pr-2 rounded-[28px] bg-white/[0.03] border border-white/[0.06] transition-all hover:bg-white/[0.06] hover:border-white/10"
      >
        <span className="text-[13px] text-muted-foreground">
          欢迎, <span className="font-semibold text-foreground" style={roleColor ? { color: roleColor } : undefined}>
            {user?.nickname ?? user?.username}
          </span>
        </span>
        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] flex items-center justify-center text-sm font-bold text-[#1a1a2e]">
          {initial}
        </span>
        <ChevronDown size={12} className={`text-[#475569] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`absolute top-[calc(100%+8px)] right-0 w-[180px] glass-panel p-1.5 z-20 transition-all duration-200 ${
        open ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-y-2 scale-[0.96] pointer-events-none'
      }`}>
        {!user?.id.startsWith('ephemeral_') && (
          <>
            <button
              onClick={() => { setOpen(false); openProfile(); }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-[10px] text-[13px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-all cursor-pointer"
            >
              <User size={15} /> 个人信息
            </button>
            <div className="h-px bg-white/[0.06] mx-2 my-1" />
          </>
        )}
        <button
          onClick={() => { setOpen(false); logout(); navigate('/'); }}
          className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-[10px] text-[13px] text-muted-foreground hover:bg-[rgba(255,51,102,0.08)] hover:text-[#ff6b8a] transition-all cursor-pointer"
        >
          <LogOut size={15} /> 退出登录
        </button>
      </div>
    </div>
  );
}
