export const BOT_NAMES: readonly string[] = [
  'Alice', 'Amber', 'Aria', 'Ash', 'April', 'Atlas',
  'Bob', 'Bella', 'Blake', 'Bruno', 'Bree', 'Blaze',
  'Charlie', 'Cleo', 'Cody', 'Coral', 'Cruz', 'Cedar',
  'Diana', 'Dash', 'Drew', 'Dylan', 'Daisy', 'Duke',
  'Echo', 'Eli', 'Eva', 'Ezra', 'Eden', 'Ellis',
  'Felix', 'Faye', 'Finn', 'Flora', 'Fox', 'Freya',
  'Grace', 'Gus', 'Gwen', 'Gray', 'Gem', 'Glen',
  'Hugo', 'Hazel', 'Heath', 'Holly', 'Hank', 'Hope',
  'Iris', 'Ivan', 'Ivy', 'Iker', 'Indie', 'Isla',
  'Jack', 'Jade', 'Juno', 'Joel', 'Jazz', 'Jules',
  'Kira', 'Kai', 'Knox', 'Kit', 'Koda', 'Kelly',
  'Leo', 'Luna', 'Lark', 'Lily', 'Lane', 'Luca',
  'Mia', 'Max', 'Milo', 'Maple', 'Mars', 'Misty',
  'Noah', 'Nora', 'Nico', 'Nell', 'Nash', 'Nova',
  'Olive', 'Oscar', 'Opal', 'Owen', 'Onyx', 'Orion',
  'Percy', 'Piper', 'Penn', 'Pearl', 'Pax', 'Poppy',
  'Quinn', 'Qiao', 'Quest', 'Quill', 'Quincy', 'Queen',
  'Ruby', 'Remy', 'Rio', 'Rowan', 'Reed', 'Rosa',
  'Sam', 'Sage', 'Sky', 'Stella', 'Scout', 'Shane',
  'Tina', 'Theo', 'Troy', 'Tara', 'Tate', 'Thea',
  'Uma', 'Uri', 'Unity', 'Ulric', 'Ugo', 'Umi',
  'Vicky', 'Vale', 'Vera', 'Vince', 'Vesper', 'Viola',
  'Walt', 'Wren', 'Wyatt', 'Willow', 'Wade', 'Winter',
  'Xena', 'Xavi', 'Xia', 'Xylo', 'Xander', 'Xion',
  'Yuki', 'Yara', 'York', 'Yves', 'Yael', 'Yoshi',
  'Zoe', 'Zane', 'Zara', 'Zion', 'Zen', 'Zinnia',
];

let fallbackCounter = 1;

export function pickBotName(usedNames: Set<string>): string {
  const available = BOT_NAMES.filter(n => !usedNames.has(n));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]!;
  }
  return `Bot #${fallbackCounter++}`;
}
