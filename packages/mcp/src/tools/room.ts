import { z } from 'zod';
import type { McpUnoServer } from '../server.js';

export function registerRoomTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  // 1. create_room — 创建游戏房间
  mcp.tool(
    'create_room',
    '创建游戏房间',
    {
      turnTimeLimit: z.number().optional().describe('每回合时间限制（秒）：15, 30, 或 60'),
      targetScore: z.number().optional().describe('目标分数：200, 300, 或 500'),
      allowSpectators: z.boolean().optional().describe('是否允许观战'),
    },
    async (args) => {
      try {
        const settings: Record<string, unknown> = {};
        if (args.turnTimeLimit !== undefined) settings.turnTimeLimit = args.turnTimeLimit;
        if (args.targetScore !== undefined) settings.targetScore = args.targetScore;
        if (args.allowSpectators !== undefined) settings.allowSpectators = args.allowSpectators;
        const result = await server.getClient().createRoom(settings);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // 2. join_room — 加入已有房间
  mcp.tool(
    'join_room',
    '加入已有房间',
    {
      roomCode: z.string().describe('6 位房间代码'),
    },
    async (args) => {
      try {
        const result = await server.getClient().joinRoom(args.roomCode);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // 3. leave_room — 离开当前房间
  mcp.tool(
    'leave_room',
    '离开当前房间',
    async () => {
      try {
        const result = await server.getClient().leaveRoom();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // 4. ready — 切换准备状态
  mcp.tool(
    'ready',
    '切换准备状态',
    {
      ready: z.boolean().describe('是否准备'),
    },
    async (args) => {
      try {
        const result = await server.getClient().setReady(args.ready);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // 5. start_game — 房主开始游戏
  mcp.tool(
    'start_game',
    '房主开始游戏（需 2+ 玩家全部准备）',
    async () => {
      try {
        const result = await server.getClient().startGame();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // 6. update_room_settings — 房主更新房间设置
  mcp.tool(
    'update_room_settings',
    '房主更新房间设置（仅等待阶段）',
    {
      settings: z.string().describe('JSON 格式的设置项，如 {"turnTimeLimit":30,"targetScore":300}'),
    },
    async (args) => {
      try {
        const parsed = JSON.parse(args.settings) as Record<string, unknown>;
        const result = await server.getClient().updateSettings(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // 7. dissolve_room — 房主关闭房间
  mcp.tool(
    'dissolve_room',
    '房主关闭房间',
    async () => {
      try {
        const result = await server.getClient().dissolveRoom();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // 8. kick_player — 房主踢出玩家
  mcp.tool(
    'kick_player',
    '房主踢出玩家（仅回合结束时）',
    {
      targetId: z.string().describe('目标玩家 ID'),
    },
    async (args) => {
      try {
        const result = await server.getClient().kickPlayer({ targetId: args.targetId });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
