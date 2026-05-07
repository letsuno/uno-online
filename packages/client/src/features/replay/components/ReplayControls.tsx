import { useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, ChevronsRight } from 'lucide-react';
import { useReplayStore } from '../stores/replay-store';
import { Button } from '@/shared/components/ui/Button';

export default function ReplayControls() {
  const { currentStep, isPlaying, speed, gameDetail, play, pause, stepForward, stepBackward, setSpeed, setStep } = useReplayStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSteps = gameDetail?.events.length ?? 0;

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        stepForward();
      }, 1000 / speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, stepForward]);

  return (
    <div className="flex items-center gap-3 bg-card/80 backdrop-blur-sm rounded-panel-ui p-3">
      <Button variant="ghost" size="sm" onClick={stepBackward} disabled={currentStep === 0}>
        <SkipBack size={16} />
      </Button>
      <Button variant="ghost" size="sm" onClick={isPlaying ? pause : play} disabled={totalSteps === 0}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <Button variant="ghost" size="sm" onClick={stepForward} disabled={currentStep >= totalSteps - 1}>
        <SkipForward size={16} />
      </Button>
      <div className="flex items-center gap-1">
        <ChevronsRight size={14} className="text-muted-foreground" />
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="bg-transparent text-foreground text-sm border border-white/15 rounded px-1"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, totalSteps - 1)}
        value={currentStep}
        onChange={(e) => setStep(Number(e.target.value))}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {currentStep + 1} / {totalSteps}
      </span>
    </div>
  );
}
