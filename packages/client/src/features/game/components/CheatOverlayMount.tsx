import { useGameStore } from '../stores/game-store';
import CheatOverlay from './CheatOverlay';

/**
 * Top-level mount point for `CheatOverlay`. Lives inside the router so any
 * page (RoomPage waiting lobby, GamePage in-game) can surface the glitch
 * overlay when triggered — either by genuine cheat detection or by the host
 * dissolving the room (`game:cheat_detected` emit covers both).
 */
export default function CheatOverlayMount() {
  const cheatDetected = useGameStore((s) => s.cheatDetected);
  if (!cheatDetected) return null;
  return <CheatOverlay />;
}
