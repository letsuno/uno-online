import '../styles/cards.css';

interface CardBackProps {
  small?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function CardBack({ small = false, onClick, className = '', style }: CardBackProps) {
  return (
    <div
      className={`card-back ${small ? 'card-back--small' : ''} ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      {!small && 'UNO'}
    </div>
  );
}
