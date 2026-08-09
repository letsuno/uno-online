import { z } from 'zod';
import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';
import type { McpUnoServer } from '../server.js';
import type { McpRoomSettingsInput } from '../types.js';
import { wrapTool } from '../utils.js';

const houseRuleShape = {
  stackDrawTwo: z.boolean().optional(),
  stackDrawFour: z.boolean().optional(),
  crossStack: z.boolean().optional(),
  reverseDeflectDrawTwo: z.boolean().optional(),
  reverseDeflectDrawFour: z.boolean().optional(),
  skipDeflect: z.boolean().optional(),
  zeroRotateHands: z.boolean().optional(),
  sevenSwapHands: z.boolean().optional(),
  jumpIn: z.boolean().optional(),
  multiplePlaySameNumber: z.boolean().optional(),
  wildFirstTurn: z.boolean().optional(),
  drawUntilPlayable: z.boolean().optional(),
  forcedPlayAfterDraw: z.boolean().optional(),
  handLimit: z
    .union([z.literal(15), z.literal(20), z.literal(25)])
    .nullable()
    .optional(),
  forcedPlay: z.boolean().optional(),
  handRevealThreshold: z
    .union([z.literal(2), z.literal(3)])
    .nullable()
    .optional(),
  unoPenaltyCount: z.union([z.literal(2), z.literal(4), z.literal(6)]).optional(),
  strictUnoCall: z.boolean().optional(),
  misplayPenalty: z.boolean().optional(),
  fastMode: z.boolean().optional(),
  noHints: z.boolean().optional(),
  elimination: z.boolean().optional(),
  blitzTimeLimit: z
    .union([z.literal(120), z.literal(300), z.literal(600)])
    .nullable()
    .optional(),
  revengeMode: z.boolean().optional(),
  silentUno: z.boolean().optional(),
  teamMode: z.boolean().optional(),
  noFunctionCardFinish: z.boolean().optional(),
  noWildFinish: z.boolean().optional(),
  doubleScore: z.boolean().optional(),
  noChallengeWildFour: z.boolean().optional(),
  blindDraw: z.boolean().optional(),
  bombCard: z.boolean().optional(),
  shuffleSeats: z.boolean().optional(),
} satisfies {
  [Key in keyof HouseRules]: z.ZodType<HouseRules[Key] | undefined>;
};

const houseRulesSchema = z.strictObject(houseRuleShape);

const roomSettingsSchema = {
  turnTimeLimit: z
    .union([z.literal(15), z.literal(30), z.literal(60)])
    .optional()
    .describe('每回合时间限制（秒）'),
  targetScore: z
    .union([z.literal(200), z.literal(300), z.literal(500), z.literal(1000)])
    .optional()
    .describe('目标分数'),
  allowSpectators: z.boolean().optional().describe('是否允许观战'),
  spectatorMode: z.enum(['full', 'hidden']).optional().describe('观战者看到完整或隐藏手牌'),
  houseRules: houseRulesSchema.optional().describe('要修改的村规字段'),
} satisfies {
  [Key in keyof McpRoomSettingsInput]-?: z.ZodType<McpRoomSettingsInput[Key]>;
};

const roomCodePattern = new RegExp(`^[${ROOM_CODE_CHARS}]{${ROOM_CODE_LENGTH}}$`);

export function registerRoomTools(server: McpUnoServer): void {
  const mcp = server.mcpServer;

  mcp.tool('create_room', '创建游戏房间', roomSettingsSchema, args =>
    wrapTool(() => server.getClient().createRoom(args)),
  );

  mcp.tool(
    'join_room',
    '加入已有房间',
    {
      roomCode: z.string().regex(roomCodePattern).describe('6 位房间代码'),
    },
    args => wrapTool(() => server.getClient().joinRoom(args.roomCode)),
  );

  mcp.tool(
    'leave_room',
    '离开当前房间；等待室或观战状态会真正退出，进行中的玩家会离开界面并转为托管、保留席位，之后可用原房间码调用 join_room 恢复',
    () => wrapTool(() => server.getClient().leaveRoom()),
  );

  mcp.tool('ready', '切换准备状态', { ready: z.boolean().describe('是否准备') }, args =>
    wrapTool(() => server.getClient().setReady(args.ready)),
  );

  mcp.tool('start_game', '房主开始游戏（需 2+ 玩家全部准备）', () => wrapTool(() => server.getClient().startGame()));

  mcp.tool('update_room_settings', '房主更新房间设置（仅等待阶段）', roomSettingsSchema, args =>
    wrapTool(() => server.getClient().updateSettings(args)),
  );

  mcp.tool('dissolve_room', '房主关闭房间', () => wrapTool(() => server.getClient().dissolveRoom()));

  mcp.tool('kick_player', '房主踢出玩家（仅回合结束时）', { targetId: z.string().describe('目标玩家 ID') }, args =>
    wrapTool(() => server.getClient().kickPlayer({ targetId: args.targetId })),
  );

  mcp.tool(
    'take_seat',
    '入座指定座位（0-9），加入房间后默认在观战席',
    { seatIndex: z.number().int().min(0).max(9).describe('座位号（0-9）') },
    args => wrapTool(() => server.getClient().takeSeat(args.seatIndex)),
  );

  mcp.tool('leave_seat', '离开座位回到观战席', () => wrapTool(() => server.getClient().leaveSeat()));
}
