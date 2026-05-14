import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { getAudioContext } from '@/shared/sound/audio-context';

interface Props {
  greeting?: string;
  onEnter: () => void;
  onSwitchAccount?: () => void;
}

export default function StartScreenGate({ greeting, onEnter, onSwitchAccount }: Props) {
  const switchBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // 主动创建 audio context，确保 audio-context.ts 的全局 resume listener
    // 在用户按下任意键之前已注册到 document
    getAudioContext();

    let triggered = false;

    const trigger = () => {
      if (triggered) return;
      triggered = true;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      onEnter();
    };

    const onKey = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      trigger();
    };

    const onPointer = (e: PointerEvent) => {
      // 排除"切换账号"按钮自身，避免顺带触发 onEnter
      if (switchBtnRef.current?.contains(e.target as Node)) return;
      trigger();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [onEnter]);

  return (
    <div className="relative z-1 flex flex-col items-center justify-center text-center">
      {greeting && (
        <p className="absolute top-[-80px] text-sm text-muted-foreground">
          欢迎回来，<span className="text-foreground">{greeting}</span>
        </p>
      )}

      <h1
        className="font-game text-[88px] leading-none text-primary"
        style={{ textShadow: '0 0 40px rgba(251,191,36,0.3), 0 2px 8px rgba(0,0,0,0.5)' }}
      >
        ♠ UNO
      </h1>
      <p className="mt-2 text-sm tracking-[6px] text-white/40 font-medium uppercase">
        Online Card Game
      </p>

      <motion.p
        className="mt-16 text-base text-muted-foreground tracking-[2px]"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        按任意键继续
      </motion.p>

      {onSwitchAccount && (
        <button
          ref={switchBtnRef}
          onClick={onSwitchAccount}
          className="absolute bottom-[-80px] bg-transparent border-none text-muted-foreground text-xs cursor-pointer hover:text-foreground transition-colors"
        >
          不是你？切换账号
        </button>
      )}
    </div>
  );
}
