import { useGameStore } from '../stores/game-store';
import CheatOverlay from './CheatOverlay';

export default function CheatOverlayMount() {
  const cheatDetected = useGameStore((s) => s.cheatDetected);
  const dissolvedReason = useGameStore((s) => s.dissolvedReason);
  if (!cheatDetected && !dissolvedReason) return null;
  return <CheatOverlay dissolvedReason={dissolvedReason} />;
}
