import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getRoleColor, cn } from '@/shared/lib/utils';
import { useProfileModalStore } from '@/shared/stores/profile-modal-store';

export default function UserCapsule() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const openProfile = useProfileModalStore(s => s.open);
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
  const nickname = user?.nickname ?? user?.username ?? '?';
  const initial = nickname[0]!.toUpperCase();
  const isEphemeral = !!user?.id.startsWith('ephemeral_');

  const avatar = (size: string) => (
    <span
      className={cn(
        size,
        'rounded-full bg-gradient-to-br from-[#ffd66d] to-[#f6be3e] flex items-center justify-center font-bold text-background overflow-hidden shrink-0',
        'border-2 border-primary/55 shadow-[0_0_18px_rgba(246,190,62,0.28)]',
      )}
    >
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={initial}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={e => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        initial
      )}
    </span>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-2.5 cursor-pointer h-[58px] max-sm:h-12 pl-5 pr-2 max-sm:p-0 rounded-full transition-colors',
          'bg-white/5 border border-white/10 hover:bg-white/[0.08] hover:border-white/[0.18]',
          'max-sm:bg-transparent max-sm:border-0',
          open && 'bg-white/[0.08] border-white/[0.18]',
        )}
      >
        <span className="text-sm font-bold max-sm:hidden" style={roleColor ? { color: roleColor } : undefined}>
          <span className={roleColor ? undefined : 'text-primary'}>{nickname}</span>
        </span>
        <ChevronDown
          size={15}
          className={cn('text-muted-foreground transition-transform max-sm:hidden', open && 'rotate-180')}
        />
        {avatar('w-[42px] h-[42px] max-sm:w-12 max-sm:h-12 text-base')}
      </button>

      <div
        className={cn(
          'absolute top-[calc(100%+8px)] right-0 w-[236px] glass-panel p-2.5 z-actions transition-all duration-200 origin-top-right',
          open
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 -translate-y-1.5 scale-[0.96] pointer-events-none',
        )}
      >
        {/* 身份头 */}
        <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-2.5">
          {avatar('w-10 h-10 text-sm')}
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={roleColor ? { color: roleColor } : undefined}>
              {nickname}
            </p>
            <p className="text-xs text-muted-foreground truncate">{isEphemeral ? '临时用户' : `@${user?.username}`}</p>
          </div>
        </div>
        <div className="h-px bg-white/[0.07] mx-1 mb-1.5" />

        {/* 菜单项圆角与面板同心：28px 外圆角 − 10px 内边距 = 18px（rounded-btn） */}
        {!isEphemeral && (
          <button
            onClick={() => {
              setOpen(false);
              openProfile();
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-btn text-[13px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors cursor-pointer"
          >
            <User size={15} /> 个人信息
          </button>
        )}
        <button
          onClick={() => {
            setOpen(false);
            void logout().then(() => navigate('/'));
          }}
          className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-btn text-[13px] text-muted-foreground hover:bg-destructive/10 hover:text-[#ff6b8a] transition-colors cursor-pointer"
        >
          <LogOut size={15} /> 退出登录
        </button>
      </div>
    </div>
  );
}
