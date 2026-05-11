import { z } from 'zod';
import type { McpUnoServer } from '../server.js';
import { wrapTool } from '../utils.js';

export function registerRoomTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool(
    'create_room',
    '创建游戏房间',
    {
      turnTimeLimit: z.number().optional().describe('每回合时间限制（秒）：15, 30, 或 60'),
      targetScore: z.number().optional().describe('目标分数：200, 300, 或 500'),
      allowSpectators: z.boolean().optional().describe('是否允许观战'),
    },
    (args) => wrapTool(() => {
      const settings = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      return server.getClient().createRoom(settings);
    }),
  );

  mcp.tool(
    'join_room',
    '加入已有房间',
    { roomCode: z.string().describe('6 位房间代码') },
    (args) => wrapTool(() => server.getClient().joinRoom(args.roomCode)),
  );

  mcp.tool(
    'leave_room',
    '离开当前房间',
    () => wrapTool(() => server.getClient().leaveRoom()),
  );

  mcp.tool(
    'ready',
    '切换准备状态',
    { ready: z.boolean().describe('是否准备') },
    (args) => wrapTool(() => server.getClient().setReady(args.ready)),
  );

  mcp.tool(
    'start_game',
    '房主开始游戏（需 2+ 玩家全部准备）',
    () => wrapTool(() => server.getClient().startGame()),
  );

  mcp.tool(
    'update_room_settings',
    '房主更新房间设置（仅等待阶段）',
    {
      turnTimeLimit: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional().describe('每回合时间限制（秒）'),
      targetScore: z.union([z.literal(200), z.literal(300), z.literal(500)]).optional().describe('目标分数'),
      allowSpectators: z.boolean().optional().describe('是否允许观战'),
      houseRules: z.record(z.unknown()).optional().describe('村规设置，如 {"stackDrawTwo":true}'),
    },
    (args) => wrapTool(() => {
      const settings = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      return server.getClient().updateSettings(settings);
    }),
  );

  mcp.tool(
    'dissolve_room',
    '房主关闭房间',
    () => wrapTool(() => server.getClient().dissolveRoom()),
  );

  mcp.tool(
    'kick_player',
    '房主踢出玩家（仅回合结束时）',
    { targetId: z.string().describe('目标玩家 ID') },
    (args) => wrapTool(() => server.getClient().kickPlayer({ targetId: args.targetId })),
  );
}
