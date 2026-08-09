import { useGameStore } from '../stores/game-store';
import CheatOverlay from './CheatOverlay';

export default function CheatOverlayMount() {
  const cheatDetected = useGameStore(s => s.cheatDetected);
  if (!cheatDetected) return null;
  return <CheatOverlay />;
}
