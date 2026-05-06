import { Eye, Volume2, VolumeX, Spade, Bot } from 'lucide-react';
import TurnTimer from './TurnTimer.js';
import { useSettingsStore } from '../stores/settings-store.js';
import '../styles/game.css';

interface TopBarProps { roomCode: string; }

export default function TopBar({ roomCode }: TopBarProps) {
  const { colorBlindMode, toggleColorBlind, soundEnabled, toggleSound, autoPlay, toggleAutoPlay } = useSettingsStore();

  return (
    <div className="game-topbar">
      <div className="game-topbar__left">
        <span className="game-topbar__brand"><Spade size={18} style={{ verticalAlign: 'middle' }} /> UNO Online</span>
        <span style={{ color: 'var(--text-secondary)' }}>房间: {roomCode}</span>
      </div>
      <div className="game-topbar__right">
        <button onClick={toggleAutoPlay} style={{
          background: 'none', border: 'none', fontSize: 14, cursor: 'pointer',
          color: autoPlay ? 'var(--text-accent)' : 'var(--text-secondary)',
        }} title={autoPlay ? '关闭自动托管' : '开启自动托管'}>
          <Bot size={16} />
        </button>
        <button onClick={toggleColorBlind} style={{
          background: 'none', border: 'none', fontSize: 14, cursor: 'pointer',
          color: colorBlindMode ? 'var(--text-accent)' : 'var(--text-secondary)',
        }} title={colorBlindMode ? '关闭色盲模式' : '开启色盲模式'}>
          <Eye size={16} />
        </button>
        <button onClick={toggleSound} style={{
          background: 'none', border: 'none', fontSize: 14, cursor: 'pointer',
          color: soundEnabled ? 'var(--text-accent)' : 'var(--text-secondary)',
        }} title={soundEnabled ? '关闭音效' : '开启音效'}>
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <TurnTimer />
      </div>
    </div>
  );
}
