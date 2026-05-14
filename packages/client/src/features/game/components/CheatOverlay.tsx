import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetClientRoomState } from '@/shared/stores/reset-room';

const SLICE_COUNT = 5;
const DURATION = 500;
const TICK = 35;
const MAX_OFFSET = 80;

export default function CheatOverlay() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const realRef = useRef<HTMLDivElement>(null);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const real = realRef.current;
    if (!canvas || !real) return;

    const cuts = [0];
    for (let i = 1; i < SLICE_COUNT; i++) {
      cuts.push(Math.round((i / SLICE_COUNT) * 100 + (Math.random() * 8 - 4)));
    }
    cuts.push(100);

    const slices: HTMLDivElement[] = [];
    for (let i = 0; i < SLICE_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'cheat-gs';
      el.innerHTML = real.innerHTML;
      const tl = cuts[i]!;
      const tr = cuts[i]! + Math.round(Math.random() * 6 - 3);
      const br = cuts[i + 1]! + Math.round(Math.random() * 6 - 3);
      const bl = cuts[i + 1]!;
      el.style.clipPath = `polygon(0 ${tl}%, 100% ${tr}%, 100% ${br}%, 0 ${bl}%)`;
      canvas.appendChild(el);
      slices.push(el);
    }

    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += TICK;
      const progress = elapsed / DURATION;
      if (progress >= 1) {
        clearInterval(interval);
        canvas.style.visibility = 'hidden';
        setShowBtn(true);
        return;
      }
      const strength = Math.pow(1 - progress, 2.5);
      for (const el of slices) {
        const roll = Math.random();
        let offset: number;
        if (roll < 0.25) offset = 0;
        else if (roll < 0.5) offset = (Math.random() - 0.5) * MAX_OFFSET * 0.3 * strength;
        else offset = (Math.random() - 0.5) * MAX_OFFSET * 2 * strength;
        el.style.transform = `translateX(${Math.round(offset)}px)`;
      }
    }, TICK);

    return () => clearInterval(interval);
  }, []);

  const handleContinue = () => {
    resetClientRoomState();
    navigate('/');
  };

  return (
    <div className="cheat-overlay">
      <div className="cheat-real" ref={realRef}>
        <div className="cheat-title" data-text="检测到作弊者">检测到作弊者</div>
        <div className="cheat-subtitle">比赛终止</div>
        <div className="cheat-desc">作弊者已受到惩罚，游戏取消，所有玩家的输赢均不计入。</div>
        <div className="cheat-divider" />
        {showBtn && (
          <button className="cheat-btn cheat-btn-visible" onClick={handleContinue}>继 续</button>
        )}
      </div>
      <div className="cheat-glitch-canvas" ref={canvasRef} />
      <div className="cheat-flash" />
    </div>
  );
}
