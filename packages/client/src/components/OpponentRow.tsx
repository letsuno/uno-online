import { useState, useEffect } from 'react';
import CardBack from './CardBack.js';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import '../styles/game.css';

const AVATAR_COLORS = ['#ff3366', '#33cc66', '#4488ff', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];
const AVATAR_EMOJIS = ['😎', '🤠', '😺', '🐸', '🦊', '🐱', '🐶', '🦁', '🐼'];

/**
 * Distribute opponents around an ellipse (top half + sides).
 * Angle 0 = top center, spread from -150° to +150° (leaving bottom for the local player).
 */
function getSeatPositions(count: number): { x: string; y: string; angle: number }[] {
  const seats: { x: string; y: string; angle: number }[] = [];
  // Spread opponents across the arc from -150° to +150° (in radians, 0 = top)
  const arcStart = -150 * (Math.PI / 180);
  const arcEnd = 150 * (Math.PI / 180);
  const step = count === 1 ? 0 : (arcEnd - arcStart) / (count - 1);

  for (let i = 0; i < count; i++) {
    const angle = count === 1 ? 0 : arcStart + step * i;
    // Ellipse: rx ~42%, ry ~40% of the container
    const x = 50 + 42 * Math.sin(angle);
    const y = 50 - 40 * Math.cos(angle);
    seats.push({ x: `${x}%`, y: `${y}%`, angle });
  }
  return seats;
}

export default function OpponentRow() {
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const [shakenId, setShakenId] = useState<string | null>(null);

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
  const opponents = userId ? players.filter((p) => p.id !== userId) : [];
  const seats = getSeatPositions(opponents.length);

  return (
    <>
      {opponents.map((opp, i) => {
        const isActive = players[currentPlayerIndex]?.id === opp.id;
        const isTeammate = me?.teamId !== undefined && opp.teamId === me.teamId;
        const seat = seats[i];
        // Cards on left side face right, on right side face left
        const isLeftSide = seat.angle < -0.3;
        const isRightSide = seat.angle > 0.3;
        const cardRotation = isLeftSide ? 'rotate(90deg)' : isRightSide ? 'rotate(-90deg)' : undefined;
        return (
          <div key={opp.id} className="seat" style={{
            left: seat.x, top: seat.y,
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
            <div className="opponent__cards" style={cardRotation ? { transform: cardRotation } : undefined}>
              {opp.handCount > 8 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CardBack small />
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 'bold' }}>×{opp.handCount}</span>
                </div>
              ) : opp.hand.length > 0
                ? opp.hand.map((card) => (
                    <Card key={card.id} card={card} style={{ width: 28, height: 40, fontSize: 10, borderWidth: 2, borderRadius: 6 }} />
                  ))
                : Array.from({ length: Math.min(opp.handCount, 8) }).map((_, j) => (
                    <CardBack key={j} small />
                  ))
              }
            </div>
            <span className="opponent__count">{opp.handCount}张</span>
            {!opp.connected && <span style={{ fontSize: 10, color: '#ef4444' }}>掉线</span>}
          </div>
        );
      })}
    </>
  );
}
