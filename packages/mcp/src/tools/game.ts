import { z } from 'zod';
import type { McpUnoServer } from '../server.js';
import { ok, fail } from '../utils.js';

export function registerGameTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool(
    'play_card',
    '出牌',
    {
      cardId: z.string().describe('手牌 ID'),
      chosenColor: z.enum(['red', 'blue', 'green', 'yellow']).optional().describe('出 Wild 牌时选择的颜色'),
    },
    async (args) => {
      try {
        return ok(await server.getClient().playCard({ cardId: args.cardId, chosenColor: args.chosenColor }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  mcp.tool(
    'draw_card',
    '摸牌',
    {
      side: z.enum(['left', 'right']).optional().describe('从哪侧牌堆摸牌，默认 left'),
    },
    async (args) => {
      try {
        return ok(await server.getClient().drawCard({ side: args.side ?? 'left' }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  mcp.tool('pass', '过牌（无牌可出时）', async () => {
    try {
      return ok(await server.getClient().pass());
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool('call_uno', '喊 UNO（手牌剩 1 张时）', async () => {
    try {
      return ok(await server.getClient().callUno());
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool(
    'catch_uno',
    '抓别人没喊 UNO',
    {
      targetPlayerId: z.string().describe('目标玩家 ID'),
    },
    async (args) => {
      try {
        return ok(await server.getClient().catchUno({ targetPlayerId: args.targetPlayerId }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  mcp.tool('challenge', '挑战对手的 Wild Draw Four', async () => {
    try {
      return ok(await server.getClient().challenge());
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool('accept', '接受罚牌', async () => {
    try {
      return ok(await server.getClient().accept());
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool(
    'choose_color',
    '选择颜色（出 Wild 牌后）',
    {
      color: z.enum(['red', 'blue', 'green', 'yellow']).describe('选择的颜色'),
    },
    async (args) => {
      try {
        return ok(await server.getClient().chooseColor({ color: args.color }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  mcp.tool(
    'choose_swap_target',
    '选择换牌目标（七换牌规则）',
    {
      targetPlayerId: z.string().describe('目标玩家 ID'),
    },
    async (args) => {
      try {
        return ok(await server.getClient().chooseSwapTarget({ targetId: args.targetPlayerId }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  mcp.tool('vote_next_round', '投票开始下一轮', async () => {
    try {
      return ok(await server.getClient().voteNextRound());
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool('rematch', '游戏结束后重新开局（仅房主）', async () => {
    try {
      return ok(await server.getClient().rematch());
    } catch (err) {
      return fail(err);
    }
  });
}
