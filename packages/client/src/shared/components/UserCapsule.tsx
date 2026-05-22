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
        className="flex items-center gap-3 cursor-pointer h-[58px] max-sm:h-12 px-[22px] max-sm:px-0 pr-[10px] max-sm:pr-0 rounded-full bg-white/[0.045] max-sm:bg-transparent border border-white/[0.12] max-sm:border-0 transition-all hover:bg-white/[0.07] hover:border-white/[0.18] shadow-[0_18px_40px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)] max-sm:shadow-none"
      >
        <span className="text-[14px] text-[#d7def2] max-sm:hidden">
          欢迎, <b className="text-[var(--gold)]" style={roleColor ? { color: roleColor } : undefined}>
            {user?.nickname ?? user?.username}
          </b>
        </span>
        <ChevronDown size={16} className={`text-[#d7def2] transition-transform max-sm:hidden ${open ? 'rotate-180' : ''}`} />
        <span className="w-[46px] h-[46px] max-sm:w-12 max-sm:h-12 rounded-full bg-gradient-to-br from-[#ffd66d] to-[#f6be3e] flex items-center justify-center text-base font-bold text-[#161513] overflow-hidden border-2 border-[rgba(246,190,62,0.55)] shadow-[0_0_22px_rgba(246,190,62,0.32)]">
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt={initial} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            : initial}
        </span>
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
