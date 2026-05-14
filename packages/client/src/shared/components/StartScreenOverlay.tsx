import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getAudioContext } from '@/shared/sound/audio-context';

const SESSION_KEY = 'start-screen-passed';

/**
 * 全屏启动屏 overlay。本次 sessionStorage session 内只渲染一次：
 * - 已渲染并被关闭后，sessionStorage[SESSION_KEY] = '1'，后续刷新/路由切换不再显示
 * - 任何受保护路由首次访问都会被覆盖一次（解决书签直达深链接绕过启动屏的问题）
 *
 * 关闭触发：keydown / pointerdown 任意。挂载时主动调 getAudioContext() 让全局
 * audio resume listener 在按键前就位，按键时同步解锁 audio。
 */
export default function StartScreenOverlay() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const switchBtnRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(SESSION_KEY) !== '1';
  });

  useEffect(() => {
    if (!visible) return;

    // 主动创建 audio context 实例，确保 audio-context.ts 的全局 resume listener
    // 在用户按下任意键之前已注册到 document
    getAudioContext();

    let triggered = false;

    const close = () => {
      if (triggered) return;
      triggered = true;
      sessionStorage.setItem(SESSION_KEY, '1');
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      setVisible(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      close();
    };

    const onPointer = (e: PointerEvent) => {
      // 排除"切换账号"按钮自身——按它不应顺带关闭 overlay
      if (switchBtnRef.current?.contains(e.target as Node)) return;
      close();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [visible]);

  const handleSwitchAccount = () => {
    logout();
    // overlay 仍可见，token / user 变 null 后用户身份卡片自动消失
  };

  const loggedIn = Boolean(token && user);
  const initial = user?.nickname?.charAt(0) ?? '?';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 backdrop-blur-2xl"
        >
          {loggedIn ? (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center"
            >
              {/* 头像 */}
              <div
                className="relative h-[120px] w-[120px] rounded-full overflow-hidden ring-2 ring-primary/40"
                style={{ boxShadow: '0 0 80px rgba(251,191,36,0.35), 0 0 24px rgba(251,191,36,0.5) inset' }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.nickname} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/80 to-amber-600 text-5xl font-game text-background">
                    {initial}
                  </div>
                )}
              </div>

              {/* 欢迎文字 */}
              <p className="mt-8 text-xs tracking-[6px] text-muted-foreground uppercase">欢迎回来</p>
              <p className="mt-2 font-game text-3xl text-foreground">{user?.nickname}</p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center"
            >
              <h1
                className="font-game text-[112px] leading-none text-primary"
                style={{ textShadow: '0 0 60px rgba(251,191,36,0.4), 0 4px 12px rgba(0,0,0,0.6)' }}
              >
                ♠ UNO
              </h1>
              <p className="mt-3 text-sm tracking-[8px] text-white/40 font-medium uppercase">
                Online Card Game
              </p>
            </motion.div>
          )}

          {/* 按任意键继续 */}
          <motion.p
            className="mt-20 text-sm tracking-[4px] uppercase text-muted-foreground"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            按任意键继续
          </motion.p>

          {/* 切换账号 */}
          {loggedIn && (
            <button
              ref={switchBtnRef}
              onClick={handleSwitchAccount}
              className="absolute bottom-12 bg-transparent border-none text-muted-foreground text-xs tracking-wider cursor-pointer hover:text-foreground transition-colors"
            >
              不是你？切换账号
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
