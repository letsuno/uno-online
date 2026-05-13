import { useState, useEffect, useRef } from 'react';
import type { Position } from './usePlayerLayout';

export type ShufflePhase = 'idle' | 'shuffling' | 'settling';

export function useSeatShuffleAnimation(
  basePositions: Position[],
  roundNumber: number,
  shuffleSeatsEnabled: boolean,
): { positions: Position[]; shufflePhase: ShufflePhase } {
  const [shufflePhase, setShufflePhase] = useState<ShufflePhase>('idle');
  const [shuffledPositions, setShuffledPositions] = useState<Position[] | null>(null);
  const prevRoundRef = useRef(roundNumber);
  const isFirstRef = useRef(true);
  const basePosRef = useRef(basePositions);
  basePosRef.current = basePositions;

  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false;
      prevRoundRef.current = roundNumber;
      return;
    }

    if (roundNumber <= prevRoundRef.current || !shuffleSeatsEnabled) {
      prevRoundRef.current = roundNumber;
      return;
    }

    prevRoundRef.current = roundNumber;
    const n = basePosRef.current.length;
    if (n <= 1) return;

    setShufflePhase('shuffling');

    const shuffle = (arr: Position[]): Position[] => {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    };

    let step = 0;
    const totalSteps = 6;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    setShuffledPositions(shuffle(basePosRef.current));

    const interval = setInterval(() => {
      step++;
      if (step >= totalSteps) {
        clearInterval(interval);
        setShuffledPositions(null);
        setShufflePhase('settling');
        settleTimer = setTimeout(() => setShufflePhase('idle'), 600);
        return;
      }
      setShuffledPositions(shuffle(basePosRef.current));
    }, 180);

    return () => {
      clearInterval(interval);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [roundNumber, shuffleSeatsEnabled]);

  return {
    positions: shuffledPositions ?? basePositions,
    shufflePhase,
  };
}
