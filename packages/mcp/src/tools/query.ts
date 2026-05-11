import type { McpUnoServer } from '../server.js';
import { wrapTool, formatActiveRules } from '../utils.js';

export function registerQueryTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool('get_game_state', '获取当前完整游戏状态（手牌、场上牌、各玩家信息、村规等）',
    () => wrapTool(() => {
      const state = server.getClient().gameState;
      return state ?? '当前没有进行中的游戏';
    }));

  mcp.tool('get_hand', '仅获取自己的手牌和当前可出的牌',
    () => wrapTool(() => {
      const state = server.getClient().gameState;
      if (!state) return '当前没有进行中的游戏';
      const myPlayer = state.players.find((p) => p.id === state.viewerId);
      if (!myPlayer) return '你不在游戏中';
      return { cards: myPlayer.hand, handCount: myPlayer.handCount };
    }));

  mcp.tool('get_room_info', '获取房间信息（玩家列表、设置、状态）',
    () => wrapTool(() => {
      const info = server.getClient().roomInfo;
      return info ?? '当前不在任何房间中';
    }));

  mcp.tool('get_rules', '获取当前房间的村规配置及说明',
    () => wrapTool(() => {
      const client = server.getClient();
      const state = client.gameState;
      const roomInfo = client.roomInfo;
      const settings = state?.settings ?? (roomInfo as Record<string, unknown> | null)?.settings;
      if (!settings) return '当前没有房间或游戏';
      const activeRules = formatActiveRules(settings as import('@uno-online/shared').PlayerView['settings']);
      if (activeRules.length === 0) return '没有生效的村规';
      return { activeHouseRules: activeRules };
    }));
}
