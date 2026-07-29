import type { CardType } from '@uno-online/shared';

/** 卡面符号。Card、对手背面、HUD 等处共用同一套，避免各写一份走样。 */
export function cardSymbol(type: CardType, value?: number): string {
  switch (type) {
    case 'number': return String(value ?? '');
    case 'skip': return '⊘';
    case 'reverse': return '转向';
    case 'draw_two': return '+2';
    case 'wild': return 'W';
    case 'wild_draw_four': return '+4';
    // UNO Flip
    case 'draw_one': return '+1';
    case 'draw_five': return '+5';
    case 'skip_everyone': return '⊘⊘';
    case 'flip': return '⇅';
    case 'wild_draw_two': return '+2';
    case 'wild_draw_color': return '+?';
  }
}
