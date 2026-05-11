import { useEffect, useState } from 'react';

type Phase = 'loading' | 'running' | 'done';

export default function AntiCheatToast() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = [
      { delay: 0, value: 12 },
      { delay: 300, value: 25 },
      { delay: 800, value: 38 },
      { delay: 1400, value: 41 },
      { delay: 2200, value: 56 },
      { delay: 2600, value: 64 },
      { delay: 3400, value: 67 },
      { delay: 4200, value: 83 },
      { delay: 4600, value: 91 },
      { delay: 5200, value: 100 },
    ];
    const timers = steps.map(({ delay, value }) =>
      setTimeout(() => setProgress(value), delay),
    );
    const switchTimer = setTimeout(() => setPhase('running'), 5600);
    const doneTimer = setTimeout(() => setPhase('done'), 9600);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(switchTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`ace-container ${phase === 'running' ? '' : ''}`}>
      {phase === 'loading' && (
        <div className="ace-loading">
          <div className="ace-loading-shimmer" />
          <div className="ace-header">
            <div className="ace-logo-icon">U</div>
            <div className="ace-header-text">
              <span className="ace-title">UNO Anti-Cheat</span>
              <span className="ace-subtitle">公平竞技守护系统</span>
            </div>
          </div>
          <div className="ace-desc">正在加载反作弊模块…</div>
          <div className="ace-progress">
            <div className="ace-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {phase === 'running' && (
        <div className="ace-running">
          <div className="ace-scan-line" />
          <div className="ace-running-body">
            <div className="ace-logo-icon">U</div>
            <div className="ace-running-content">
              <div className="ace-status-row">
                <span className="ace-status-label">反作弊系统已加载</span>
                <span className="ace-status-badge"><span className="ace-status-dot" />运行中</span>
              </div>
              <div className="ace-desc">请遵守游戏规则，享受公平对局</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
