import type { McpUnoServer } from '../server.js';
import { HOUSE_RULE_DESCRIPTIONS } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';

export function registerQueryTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool('get_game_state', '获取当前完整游戏状态（手牌、场上牌、各玩家信息、村规等）', async () => {
    const state = server.getClient().gameState;
    if (!state) return { content: [{ type: 'text' as const, text: '当前没有进行中的游戏' }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }] };
  });

  mcp.tool('get_hand', '仅获取自己的手牌和当前可出的牌', async () => {
    const state = server.getClient().gameState;
    if (!state) return { content: [{ type: 'text' as const, text: '当前没有进行中的游戏' }] };
    const myPlayer = state.players.find((p) => p.id === state.viewerId);
    if (!myPlayer) return { content: [{ type: 'text' as const, text: '你不在游戏中' }] };
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ cards: myPlayer.hand, handCount: myPlayer.handCount }, null, 2),
      }],
    };
  });

  mcp.tool('get_room_info', '获取房间信息（玩家列表、设置、状态）', async () => {
    const info = server.getClient().roomInfo;
    if (!info) return { content: [{ type: 'text' as const, text: '当前不在任何房间中' }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }] };
  });

  mcp.tool('get_rules', '获取当前房间的村规配置及说明', async () => {
    const client = server.getClient();
    const state = client.gameState;
    const roomInfo = client.roomInfo;
    const settings = (state?.settings ?? (roomInfo as Record<string, unknown> | null)?.settings) as Record<string, unknown> | undefined;
    if (!settings) return { content: [{ type: 'text' as const, text: '当前没有房间或游戏' }] };
    const houseRules = settings.houseRules as Partial<HouseRules> | undefined;
    if (!houseRules) return { content: [{ type: 'text' as const, text: '没有生效的村规' }] };

    const activeRules: { key: string; value: unknown; description: string }[] = [];
    for (const [key, value] of Object.entries(houseRules)) {
      if (value === false || value === null || value === undefined) continue;
      const desc = HOUSE_RULE_DESCRIPTIONS[key as keyof HouseRules] ?? key;
      activeRules.push({ key, value, description: desc });
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify({ activeHouseRules: activeRules }, null, 2) }] };
  });
}
