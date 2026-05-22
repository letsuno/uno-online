import { motion } from 'framer-motion';
import GamePageShell from '@/shared/components/GamePageShell';
import ServerStatusBar from '@/shared/components/ServerStatusBar';

interface Props {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Auth 4 页（HomePage / RegisterPage / AuthCallback / ProfileSetupPage）共享的卡片化布局。
 * 外层沿用 GamePageShell（保留装饰背景），内层一个玻璃质感卡片。
 *
 * showLogo=false 时只渲染 children，不显示标题块——AuthCallback 等待状态使用。
 */
export default function AuthLayout({ title, subtitle, showLogo = true, footer, children }: Props) {
  return (
    <GamePageShell>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-1 w-[min(440px,calc(100vw-2rem))] rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 shadow-2xl px-8 py-10"
      >
        {showLogo && (
          <div className="text-center">
            <p className="font-game text-[28px] leading-none text-primary" style={{ textShadow: '0 0 16px rgba(251,191,36,0.25)' }}>
              ♠ UNO
            </p>
            {title && <h1 className="mt-4 font-game text-[28px] text-primary text-shadow-bold">{title}</h1>}
            {subtitle && (
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        <div className={showLogo ? 'mt-8' : ''}>
          {children}
        </div>

        {footer && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        )}
      </motion.div>

      <ServerStatusBar />
    </GamePageShell>
  );
}
