import type { Card as CardData, Color, HouseRules } from '@uno-online/shared';
import Card from './Card';

type TeachingCard =
  | { type: 'number'; color: Color; value: number }
  | { type: 'skip' | 'reverse' | 'draw_two'; color: Color }
  | { type: 'wild' | 'wild_draw_four'; color: null };

type TeachingStep = { type: 'card'; card: TeachingCard } | { type: 'arrow' | 'text'; text: string };

function teachingCardWithId(card: TeachingCard, id: string): CardData {
  switch (card.type) {
    case 'number':
      return { id, type: card.type, color: card.color, value: card.value };
    case 'skip':
    case 'reverse':
    case 'draw_two':
      return { id, type: card.type, color: card.color };
    case 'wild':
    case 'wild_draw_four':
      return { id, type: card.type, color: null };
  }
}

const TEACHINGS: Partial<Record<keyof HouseRules, TeachingStep[]>> = {
  stackDrawTwo: [
    { type: 'card', card: { type: 'draw_two', color: 'red' } },
    { type: 'arrow', text: '→' },
    { type: 'card', card: { type: 'draw_two', color: 'blue' } },
    { type: 'arrow', text: '→' },
    { type: 'text', text: '下家摸4张' },
  ],
  stackDrawFour: [
    { type: 'card', card: { type: 'wild_draw_four', color: null } },
    { type: 'arrow', text: '→' },
    { type: 'card', card: { type: 'wild_draw_four', color: null } },
    { type: 'arrow', text: '→' },
    { type: 'text', text: '下家摸8张' },
  ],
  crossStack: [
    { type: 'card', card: { type: 'draw_two', color: 'red' } },
    { type: 'arrow', text: '→' },
    { type: 'card', card: { type: 'wild_draw_four', color: null } },
    { type: 'arrow', text: '→' },
    { type: 'text', text: '可互叠' },
  ],
  reverseDeflectDrawTwo: [
    { type: 'card', card: { type: 'draw_two', color: 'red' } },
    { type: 'arrow', text: '→' },
    { type: 'card', card: { type: 'reverse', color: 'blue' } },
    { type: 'arrow', text: '↩' },
    { type: 'text', text: '反弹!' },
  ],
  reverseDeflectDrawFour: [
    { type: 'card', card: { type: 'wild_draw_four', color: null } },
    { type: 'arrow', text: '→' },
    { type: 'card', card: { type: 'reverse', color: 'blue' } },
    { type: 'arrow', text: '↩' },
    { type: 'text', text: '反弹!' },
  ],
  skipDeflect: [
    { type: 'card', card: { type: 'draw_two', color: 'red' } },
    { type: 'arrow', text: '→' },
    { type: 'card', card: { type: 'skip', color: 'green' } },
    { type: 'arrow', text: '→' },
    { type: 'text', text: '转移下家' },
  ],
  zeroRotateHands: [
    { type: 'card', card: { type: 'number', color: 'green', value: 0 } },
    { type: 'arrow', text: '→' },
    { type: 'text', text: '全员传递手牌' },
  ],
  sevenSwapHands: [
    { type: 'card', card: { type: 'number', color: 'green', value: 7 } },
    { type: 'arrow', text: '⇄' },
    { type: 'text', text: '交换手牌' },
  ],
  jumpIn: [{ type: 'text', text: '相同牌 → 直接抢出' }],
  drawUntilPlayable: [{ type: 'text', text: '摸到能出为止' }],
  forcedPlay: [{ type: 'text', text: '有牌必出' }],
  elimination: [{ type: 'text', text: '每轮淘汰手牌最多者' }],
};

interface RuleTeachingProps {
  ruleKey: keyof HouseRules;
}

export default function RuleTeaching({ ruleKey }: RuleTeachingProps) {
  const steps = TEACHINGS[ruleKey];
  if (!steps) return null;

  return (
    <div className="flex flex-row gap-1 items-center bg-black/20 rounded-lg px-2 py-1">
      {steps.map((step, i) => {
        if (step.type === 'card') {
          const cardData = teachingCardWithId(step.card, `teaching_${ruleKey}_${i}`);
          return (
            <Card
              key={i}
              card={cardData}
              mini
              className="!w-card-log-w !h-card-log-h !text-2xs !border !rounded-none"
            />
          );
        }
        if (step.type === 'arrow') {
          return (
            <span key={i} className="text-2xs text-muted-foreground font-bold">
              {step.text}
            </span>
          );
        }
        return (
          <span key={i} className="text-2xs text-muted-foreground">
            {step.text}
          </span>
        );
      })}
    </div>
  );
}
