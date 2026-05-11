import type { McpUnoServer } from '../server.js';
import { ok, fail, formatActiveRules } from '../utils.js';

export function registerQueryTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool('get_game_state', '获取当前完整游戏状态（手牌、场上牌、各玩家信息、村规等）', async () => {
    try {
      const state = server.getClient().gameState;
      if (!state) return ok('当前没有进行中的游戏');
      return ok(state);
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool('get_hand', '仅获取自己的手牌和当前可出的牌', async () => {
    try {
      const state = server.getClient().gameState;
      if (!state) return ok('当前没有进行中的游戏');
      const myPlayer = state.players.find((p) => p.id === state.viewerId);
      if (!myPlayer) return ok('你不在游戏中');
      return ok({ cards: myPlayer.hand, handCount: myPlayer.handCount });
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool('get_room_info', '获取房间信息（玩家列表、设置、状态）', async () => {
    try {
      const info = server.getClient().roomInfo;
      if (!info) return ok('当前不在任何房间中');
      return ok(info);
    } catch (err) {
      return fail(err);
    }
  });

  mcp.tool('get_rules', '获取当前房间的村规配置及说明', async () => {
    try {
      const client = server.getClient();
      const state = client.gameState;
      const roomInfo = client.roomInfo;
      const settings = state?.settings ?? (roomInfo as Record<string, unknown> | null)?.settings;
      if (!settings) return ok('当前没有房间或游戏');
      const activeRules = formatActiveRules(settings as import('@uno-online/shared').PlayerView['settings']);
      if (activeRules.length === 0) return ok('没有生效的村规');
      return ok({ activeHouseRules: activeRules });
    } catch (err) {
      return fail(err);
    }
  });
}
