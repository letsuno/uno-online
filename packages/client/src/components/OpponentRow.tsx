import { useState, useEffect } from 'react';
import CardBack from './CardBack.js';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import '../styles/game.css';

const AVATAR_COLORS = ['#ff3366', '#33cc66', '#4488ff', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];
const AVATAR_EMOJIS = ['😎', '🤠', '😺', '🐸', '🦊', '🐱', '🐶', '🦁', '🐼'];

export default function OpponentRow() {
  const userId = useAuthStore((s) => s.user?.id);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const [shakenId, setShakenId] = useState<string | null>(null);

  // Detect when an opponent's hand suddenly grows (caught UNO penalty)
  const prevCounts = useState<Record<string, number>>(() => ({}))[0];
  useEffect(() => {
    for (const p of players) {
      const prev = prevCounts[p.id];
      if (prev !== undefined && p.handCount > prev + 1 && p.id !== userId) {
        setShakenId(p.id);
        setTimeout(() => setShakenId(null), 600);
      }
      prevCounts[p.id] = p.handCount;
    }
  }, [players]);

  const me = players.find((p) => p.id === userId);
  const opponents = players.filter((p) => p.id !== userId);

  return (
    <div className="opponent-row">
      {opponents.map((opp, i) => {
        const isActive = players[currentPlayerIndex]?.id === opp.id;
        const isTeammate = me?.teamId !== undefined && opp.teamId === me.teamId;
        return (
          <div key={opp.id} className="opponent" style={{
            ...(opp.eliminated ? { opacity: 0.35, filter: 'grayscale(0.8)' } : {}),
            ...(shakenId === opp.id ? { animation: 'shake 0.1s ease-in-out 3' } : {}),
          }}>
            <div
              className={`opponent__avatar ${isActive ? 'opponent__avatar--active' : ''}`}
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length], border: isTeammate ? '2px solid var(--text-accent)' : undefined }}
            >
              {AVATAR_EMOJIS[i % AVATAR_EMOJIS.length]}
            </div>
            <span className={`opponent__name ${isActive ? 'opponent__name--active' : ''}`}>
              {isTeammate ? '🤝 ' : ''}{opp.name} {isActive ? '◀' : ''} {opp.eliminated ? '❌' : ''}
            </span>
            <div className="opponent__cards">
              {opp.hand.length > 0
                ? opp.hand.map((card) => (
                    <Card key={card.id} card={card} style={{ width: 28, height: 40, fontSize: 10, borderWidth: 2, borderRadius: 6 }} />
                  ))
                : Array.from({ length: Math.min(opp.handCount, 10) }).map((_, j) => (
                    <CardBack key={j} small />
                  ))
              }
            </div>
            <span className="opponent__count">{opp.handCount}张</span>
            {!opp.connected && <span style={{ fontSize: 10, color: '#ef4444' }}>掉线</span>}
          </div>
        );
      })}
    </div>
  );
}
