import '../styles/cards.css';

interface CardBackProps {
  small?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function CardBack({ small = false, onClick, style }: CardBackProps) {
  return (
    <div
      className={`card-back ${small ? 'card-back--small' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      {!small && 'UNO'}
    </div>
  );
}
