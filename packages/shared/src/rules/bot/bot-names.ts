export const BOT_NAMES: readonly string[] = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Echo', 'Felix',
  'Grace', 'Hugo', 'Iris', 'Jack', 'Kira', 'Leo',
  'Mia', 'Noah', 'Olive', 'Percy', 'Quinn', 'Ruby',
  'Sam', 'Tina', 'Uma', 'Vicky', 'Walt', 'Xena',
  'Yuki', 'Zoe',
];

let fallbackCounter = 1;

export function pickBotName(usedNames: Set<string>): string {
  const available = BOT_NAMES.filter(n => !usedNames.has(n));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]!;
  }
  return `Bot #${fallbackCounter++}`;
}
