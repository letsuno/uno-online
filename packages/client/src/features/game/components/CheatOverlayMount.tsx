import { useCheatNoticeStore } from '../stores/cheat-notice-store';
import CheatOverlay from './CheatOverlay';

export default function CheatOverlayMount() {
  const visible = useCheatNoticeStore(s => s.visible);
  if (!visible) return null;
  return <CheatOverlay />;
}
