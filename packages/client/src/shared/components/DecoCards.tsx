const CARDS = [
  { value: '7', color: '#ff5c63', borderColor: 'rgba(255, 92, 99, 0.28)', top: '15%', left: '7%', rotate: '-15deg' },
  { value: '+2', color: '#4d7eff', borderColor: 'rgba(77, 126, 255, 0.28)', top: '17%', right: '7%', rotate: '12deg' },
  { value: '↔', color: '#4d7eff', borderColor: 'rgba(77, 126, 255, 0.28)', top: '44%', left: '4%', rotate: '9deg' },
  { value: '0', color: '#ff5c63', borderColor: 'rgba(255, 92, 99, 0.28)', top: '58%', right: '7%', rotate: '-14deg' },
  { value: '5', color: '#50e16b', borderColor: 'rgba(80, 225, 107, 0.26)', bottom: '16%', left: '8%', rotate: '13deg' },
  {
    value: '9',
    color: 'var(--gold)',
    borderColor: 'rgba(246, 190, 62, 0.28)',
    bottom: '13%',
    right: '12%',
    rotate: '-11deg',
  },
];

export default function DecoCards() {
  return (
    <div className="absolute inset-0 pointer-events-none z-card overflow-hidden">
      {CARDS.map((card, i) => (
        <div
          key={i}
          className="absolute w-[78px] h-[112px] rounded-[16px] grid place-items-center text-[26px] font-extrabold opacity-[0.32] select-none"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015))',
            border: `1px solid ${card.borderColor}`,
            boxShadow: 'inset 0 0 24px rgba(255,255,255,0.04), 0 18px 42px rgba(0,0,0,0.26)',
            filter: 'blur(0.2px)',
            color: card.color,
            top: card.top,
            left: card.left,
            right: card.right,
            bottom: card.bottom,
            transform: `rotate(${card.rotate})`,
          }}
        >
          {card.value}
        </div>
      ))}
    </div>
  );
}
