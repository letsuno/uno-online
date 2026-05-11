import { z } from 'zod';
import type { McpUnoServer } from '../server.js';
import { ok, fail } from '../utils.js';

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
        return ok(await server.getClient().createRoom(settings));
      } catch (err) {
        return fail(err);
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
        return ok(await server.getClient().joinRoom(args.roomCode));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // 3. leave_room — 离开当前房间
  mcp.tool(
    'leave_room',
    '离开当前房间',
    async () => {
      try {
        return ok(await server.getClient().leaveRoom());
      } catch (err) {
        return fail(err);
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
        return ok(await server.getClient().setReady(args.ready));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // 5. start_game — 房主开始游戏
  mcp.tool(
    'start_game',
    '房主开始游戏（需 2+ 玩家全部准备）',
    async () => {
      try {
        return ok(await server.getClient().startGame());
      } catch (err) {
        return fail(err);
      }
    },
  );

  // 6. update_room_settings — 房主更新房间设置
  mcp.tool(
    'update_room_settings',
    '房主更新房间设置（仅等待阶段）',
    {
      turnTimeLimit: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional().describe('每回合时间限制（秒）'),
      targetScore: z.union([z.literal(200), z.literal(300), z.literal(500)]).optional().describe('目标分数'),
      allowSpectators: z.boolean().optional().describe('是否允许观战'),
      houseRules: z.record(z.unknown()).optional().describe('村规设置，如 {"stackDrawTwo":true}'),
    },
    async (args) => {
      try {
        const settings: Record<string, unknown> = {};
        if (args.turnTimeLimit !== undefined) settings.turnTimeLimit = args.turnTimeLimit;
        if (args.targetScore !== undefined) settings.targetScore = args.targetScore;
        if (args.allowSpectators !== undefined) settings.allowSpectators = args.allowSpectators;
        if (args.houseRules !== undefined) settings.houseRules = args.houseRules;
        return ok(await server.getClient().updateSettings(settings));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // 7. dissolve_room — 房主关闭房间
  mcp.tool(
    'dissolve_room',
    '房主关闭房间',
    async () => {
      try {
        return ok(await server.getClient().dissolveRoom());
      } catch (err) {
        return fail(err);
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
        return ok(await server.getClient().kickPlayer({ targetId: args.targetId }));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
