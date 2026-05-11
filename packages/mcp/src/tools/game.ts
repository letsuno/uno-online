import { z } from 'zod';
import type { McpUnoServer } from '../server.js';
import { wrapTool } from '../utils.js';

export function registerGameTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool(
    'play_card',
    '出牌',
    {
      cardId: z.string().describe('手牌 ID'),
      chosenColor: z.enum(['red', 'blue', 'green', 'yellow']).optional().describe('出 Wild 牌时选择的颜色'),
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

  mcp.tool('challenge', '挑战对手的 Wild Draw Four',
    () => wrapTool(() => server.getClient().challenge()));

  mcp.tool('accept', '接受罚牌',
    () => wrapTool(() => server.getClient().accept()));

  mcp.tool(
    'choose_color',
    '选择颜色（出 Wild 牌后）',
    { color: z.enum(['red', 'blue', 'green', 'yellow']).describe('选择的颜色') },
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
