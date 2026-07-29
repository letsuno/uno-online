import { z } from 'zod';
import type { McpUnoServer } from '../server.js';
import { wrapTool } from '../utils.js';

/**
 * 全部 8 种颜色：亮面 red/blue/green/yellow，UNO Flip 暗面 pink/teal/orange/purple。
 * 任一时刻只有当前生效那一面的 4 色合法，服务端会校验并拒绝越面选色。
 */
const COLOR_ENUM = z.enum(['red', 'blue', 'green', 'yellow', 'pink', 'teal', 'orange', 'purple']);
const COLOR_HINT = '颜色。经典模式与 Flip 亮面用 red/blue/green/yellow；Flip 暗面用 pink/teal/orange/purple。'
  + '选了不属于当前面的颜色会被服务端拒绝，可先用 get_game_state 查看 flipSide。';

export function registerGameTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool(
    'play_card',
    '出牌。UNO Flip 模式下打出 Flip 卡会让整局翻面（牌堆、弃牌堆、所有人手牌一起翻）。',
    {
      cardId: z.string().describe('手牌 ID'),
      chosenColor: COLOR_ENUM.optional().describe(`出 Wild 牌时选择的${COLOR_HINT}`),
    },
    (args) => wrapTool(() => server.getClient().playCard({ cardId: args.cardId, chosenColor: args.chosenColor })),
  );

  mcp.tool(
    'draw_card',
    '摸牌',
    { side: z.enum(['left', 'right']).optional().describe('从哪侧牌堆摸牌，默认 left') },
    (args) => wrapTool(() => server.getClient().drawCard({ side: args.side ?? 'left' })),
  );

  mcp.tool('pass', '过牌（无牌可出时）',
    () => wrapTool(() => server.getClient().pass()));

  mcp.tool('call_uno', '喊 UNO（手牌剩 1 张时）',
    () => wrapTool(() => server.getClient().callUno()));

  mcp.tool(
    'catch_uno',
    '抓别人没喊 UNO',
    { targetPlayerId: z.string().describe('目标玩家 ID') },
    (args) => wrapTool(() => server.getClient().catchUno({ targetPlayerId: args.targetPlayerId })),
  );

  mcp.tool('challenge',
    '质疑对手的万能罚摸牌是否合法出牌。经典模式针对 Wild Draw Four（罚则 4/6）；'
    + 'UNO Flip 针对万能 +2（罚则 2/4）与摸到指定色（摸到该色 / 摸到该色再加 2）。',
    () => wrapTool(() => server.getClient().challenge()));

  mcp.tool('accept', '接受罚牌',
    () => wrapTool(() => server.getClient().accept()));

  mcp.tool(
    'choose_color',
    '选择颜色（出 Wild 牌后）',
    { color: COLOR_ENUM.describe(COLOR_HINT) },
    (args) => wrapTool(() => server.getClient().chooseColor({ color: args.color })),
  );

  mcp.tool(
    'choose_swap_target',
    '选择换牌目标（七换牌规则）',
    { targetPlayerId: z.string().describe('目标玩家 ID') },
    (args) => wrapTool(() => server.getClient().chooseSwapTarget({ targetId: args.targetPlayerId })),
  );

  mcp.tool('vote_next_round', '投票开始下一轮',
    () => wrapTool(() => server.getClient().voteNextRound()));

  mcp.tool('rematch', '游戏结束后重新开局（仅房主）',
    () => wrapTool(() => server.getClient().rematch()));
}
