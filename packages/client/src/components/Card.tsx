import type { Card as CardType } from '@uno-online/shared';
import '../styles/cards.css';
import { useSettingsStore } from '../stores/settings-store.js';
import { getCardImageUrl, isPackLoaded } from '../utils/card-images.js';
import ColorBlindOverlay from './ColorBlindOverlay.js';

const COLOR_SYMBOLS: Record<string, string> = {
  red: '♦',
  blue: '♠',
  green: '♣',
  yellow: '♥',
};

function getCardLabel(card: CardType): string {
  switch (card.type) {
    case 'number': return String(card.value);
    case 'skip': return '⊘';
    case 'reverse': return '⟲';
    case 'draw_two': return '+2';
    case 'wild': return 'W';
    case 'wild_draw_four': return '+4';
  }
}

function getColorClass(card: CardType): string {
  if (card.type === 'wild' || card.type === 'wild_draw_four') return 'card--wild';
  return `card--${card.color}`;
}

interface CardProps {
  card: CardType;
  playable?: boolean;
  clickable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function Card({ card, playable = false, clickable = playable, dimmed = false, onClick, style }: CardProps) {
  const colorBlindMode = useSettingsStore((s) => s.colorBlindMode);
  const cardImagePack = useSettingsStore((s) => s.cardImagePack);
  const playableClass = playable ? 'card--playable' : '';
  const dimmedClass = dimmed ? 'card--dimmed' : '';

  if (cardImagePack && isPackLoaded()) {
    const imgUrl = getCardImageUrl(card);
    if (imgUrl) {
      return (
        <div
          className={`card card--image ${playableClass} ${dimmedClass}`}
          onClick={clickable ? onClick : undefined}
          style={style}
        >
          <img src={imgUrl} alt={getCardLabel(card)} className="card__img" draggable={false} />
          {colorBlindMode && card.color && <ColorBlindOverlay color={card.color} />}
        </div>
      );
    }
  }

  const colorClass = getColorClass(card);
  const typeClass = `card--${card.type}`;

  return (
    <div
      className={`card ${colorClass} ${typeClass} ${playableClass} ${dimmedClass}`}
      onClick={clickable ? onClick : undefined}
      style={style}
    >
      {card.color && (
        <span className="card__symbol">{COLOR_SYMBOLS[card.color]}</span>
      )}
      <span className="card__value">{getCardLabel(card)}</span>
      {colorBlindMode && card.color && <ColorBlindOverlay color={card.color} />}
    </div>
  );
}
