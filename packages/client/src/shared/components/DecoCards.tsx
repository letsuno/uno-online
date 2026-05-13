const CARDS = [
  { value: '7', color: 'rgba(255,51,102,0.25)', border: '#ff3366', top: '8%', left: '6%', rotate: '-18deg' },
  { value: '+2', color: 'rgba(68,136,255,0.25)', border: '#4488ff', top: '14%', right: '8%', rotate: '10deg' },
  { value: '5', color: 'rgba(51,204,102,0.25)', border: '#33cc66', bottom: '10%', left: '8%', rotate: '12deg' },
  { value: '9', color: 'rgba(251,191,36,0.25)', border: '#fbbf24', bottom: '12%', right: '12%', rotate: '-8deg' },
  { value: '⇆', color: 'rgba(68,136,255,0.2)', border: '#4488ff', top: '40%', left: '4%', rotate: '6deg' },
  { value: '0', color: 'rgba(255,51,102,0.2)', border: '#ff3366', bottom: '32%', right: '5%', rotate: '-14deg' },
];

export default function DecoCards() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      {CARDS.map((card, i) => (
        <div
          key={i}
          className="absolute w-16 h-24 rounded-[10px] flex items-center justify-center text-2xl font-black opacity-[0.06]"
          style={{
            background: card.color,
            border: '2px solid rgba(255,255,255,0.08)',
            color: card.border,
            top: card.top, left: card.left, right: card.right, bottom: card.bottom,
            transform: `rotate(${card.rotate})`,
          }}
        >
          {card.value}
        </div>
      ))}
    </div>
  );
}
