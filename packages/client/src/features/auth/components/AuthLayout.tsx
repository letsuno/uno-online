import { motion } from 'framer-motion';
import GamePageShell from '@/shared/components/GamePageShell';
import ServerStatusBar from '@/shared/components/ServerStatusBar';
import FitScaler from '@/shared/components/FitScaler';

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
      <FitScaler
        align="center"
        maxScale={1}
        className="absolute left-5 right-5 portrait:left-[6%] portrait:right-[6%] top-[28px] bottom-[88px]"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="glass-panel w-[644px] portrait:w-[460px] rounded-panel-ui px-[52px] portrait:px-[30px] py-[44px] portrait:py-[38px]"
        >
          {showLogo && (
            <div className="text-center">
              <div
                className="flex justify-center items-center gap-2.5 text-primary font-black text-[28px]"
                style={{ textShadow: '0 0 18px rgba(246,190,62,0.36)' }}
              >
                <span>♠</span>
                <span>UNO</span>
              </div>
              {title && <h1 className="mt-3 text-primary text-[48px] font-black tracking-[0.12em]">{title}</h1>}
              {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          )}

          <div className={showLogo ? 'mt-[30px]' : ''}>{children}</div>

          {footer && <div className="mt-[26px] text-center text-[17px] text-muted-foreground">{footer}</div>}
        </motion.div>
      </FitScaler>

      <ServerStatusBar />
    </GamePageShell>
  );
}
