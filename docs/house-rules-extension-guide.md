# UNO Online — 村规（House Rules）扩展开发指南

## 概述

UNO Online 的村规系统当前采用 **插件数组 + 共享规则描述表** 的实现：

- 规则开关和值定义在 `packages/shared/src/types/house-rules.ts`
- 房间设置 UI 读取 `HOUSE_RULE_DEFINITIONS` 自动渲染规则列表
- 引擎执行逻辑读取 `PRE_CHECK_PLUGINS` 和 `POST_PROCESS_PLUGINS`
- 规则引擎插件实现 `HouseRulePlugin`，按数组顺序执行
- 少数规则不需要引擎插件：例如 `wildFirstTurn` / `shuffleSeats` 在发牌设置中处理，`fastMode` / `blitzTimeLimit` / `handRevealThreshold` 在服务端会话与计时逻辑中处理，`noHints` 只影响客户端提示展示

当前没有运行时 `registerRule()` API，也没有 `HouseRuleDefinition.ui` / `teaching` / `priority` 字段。新增村规时需要先判断它是否改变核心规则引擎；如果会改变出牌、摸牌、结算等逻辑，就同步更新类型、默认值、描述表、插件数组和测试；如果只影响发牌、计时、展示或服务端房间流程，则更新对应消费点和测试。

## 架构

```
packages/shared/src/
  types/
    house-rules.ts          # HouseRules 接口、DEFAULT_HOUSE_RULES、HOUSE_RULES_PRESETS
  constants/
    house-rules.ts          # HOUSE_RULE_DEFINITIONS，供 UI 和说明使用
  rules/
    house-rule-types.ts     # HouseRulePlugin / RuleContext / PreCheckResult
    house-rule-helpers.ts   # 构建 RuleContext
    house-rules-engine.ts   # applyActionWithHouseRules 入口
    house-rule-registry.ts  # getAllRuleMetadata()，从插件数组收集元数据
    rules/
      index.ts              # PRE_CHECK_PLUGINS / POST_PROCESS_PLUGINS
      stacking.ts
      deflection.ts
      zero-rotate.ts
      seven-swap.ts
      jump-in.ts
      multi-play.ts
      draw-until-playable.ts
      forced-play-after-draw.ts
      forced-play.ts
      death-draw.ts
      hand-limit.ts
      uno-penalty.ts
      misplay-penalty.ts
      finish-restrictions.ts
      double-score.ts
      elimination.ts
      revenge-mode.ts
      silent-uno.ts
      no-challenge-wild-four.ts
      team-mode.ts
```

## HouseRulePlugin 接口

实际类型定义在 `packages/shared/src/rules/house-rule-types.ts`：

```typescript
export interface RuleMetadata {
  id: string;
  keys: (keyof HouseRules)[];
  label: string;
  description: string;
}

export type PreCheckResult =
  | { handled: false }
  | { handled: true; state: GameState };

export interface RuleContext {
  applyAction: (state: GameState, action: GameAction) => GameState;
  checkRoundEnd: (state: GameState, playerId: string) => GameState;
  drawCardsFromDeck: (state: GameState, playerId: string, count: number) => GameState;
  startPenaltyDraw: (
    state: GameState,
    playerId: string,
    count: number,
    nextPlayerIndex: number,
    sourcePlayerId?: string | null,
  ) => GameState;
  putAttackCardOnStack: (
    state: GameState,
    action: Extract<GameAction, { type: 'PLAY_CARD' }>,
    card: Card,
    stackAdd: number,
  ) => GameState;
  getCardDrawPenalty: (card: Card) => number;
  canStartDrawStack: (state: GameState, card: Card) => boolean;
  isLastCard: (state: GameState, playerId: string, cardId: string) => boolean;
  isWildCard: (card: Card) => boolean;
  isFunctionCard: (card: Card) => boolean;
  handleDrawUntilPlayable: (state: GameState, action: Extract<GameAction, { type: 'DRAW_CARD' }>) => GameState;
  handleForcedPlayAfterDraw: (state: GameState, action: Extract<GameAction, { type: 'DRAW_CARD' }>) => GameState;
  applyDoubleScore: (before: GameState, after: GameState) => GameState;
  canPlayCard: (card: Card, topCard: Card, currentColor: Color) => boolean;
  getNextPlayerIndex: (current: number, total: number, direction: Direction, skip?: number) => number;
}

export interface HouseRulePlugin {
  meta: RuleMetadata;
  isEnabled: (hr: HouseRules) => boolean;
  preCheck?: (state: GameState, action: GameAction, ctx: RuleContext) => PreCheckResult;
  postProcess?: (before: GameState, after: GameState, action: GameAction, ctx: RuleContext) => GameState;
}
```

### preCheck 与 postProcess

- `preCheck` 在基础引擎 `applyAction()` 之前执行。
- 如果返回 `{ handled: true, state }`，基础引擎会被跳过，然后进入后处理阶段。
- 返回 `{ handled: false }` 表示当前规则不拦截，继续执行后续规则或基础引擎。
- `postProcess` 在基础引擎或已拦截的前置规则之后执行，返回新的 `GameState`。

## 引擎执行流程

```
applyActionWithHouseRules(state, action)
  │
  ├─ buildRuleContext()
  │
  ├─ 遍历 PRE_CHECK_PLUGINS
  │    ├─ 跳过 isEnabled() 为 false 的插件
  │    ├─ 执行 preCheck()
  │    └─ 若 handled: true，使用返回 state 并跳过基础引擎
  │
  ├─ 若未被 preCheck 处理，调用基础引擎 applyAction()
  │
  ├─ 处理 pending penalty queue
  │
  └─ 遍历 POST_PROCESS_PLUGINS
       ├─ 跳过 isEnabled() 为 false 的插件
       └─ 执行 postProcess() 并累积新 state
```

规则引擎插件的执行顺序由 `packages/shared/src/rules/rules/index.ts` 中数组顺序决定。新增插件型规则时要把顺序当成行为契约审查，尤其是出牌限制、叠加/转移、连出和结算类规则。

## 当前村规清单

当前 `HouseRules` 共 34 个字段：

| 分类 | 字段 |
|------|------|
| 叠加/转移 | `stackDrawTwo`, `stackDrawFour`, `crossStack`, `reverseDeflectDrawTwo`, `reverseDeflectDrawFour`, `skipDeflect` |
| 出牌/摸牌 | `jumpIn`, `multiplePlaySameNumber`, `wildFirstTurn`, `drawUntilPlayable`, `forcedPlayAfterDraw`, `forcedPlay`, `deathDraw`, `blindDraw`, `bombCard` |
| 手牌/UNO | `zeroRotateHands`, `sevenSwapHands`, `handLimit`, `handRevealThreshold`, `unoPenaltyCount`, `strictUnoCall`, `silentUno`, `misplayPenalty` |
| 终局/积分 | `noFunctionCardFinish`, `noWildFinish`, `doubleScore` |
| 模式 | `elimination`, `blitzTimeLimit`, `revengeMode`, `teamMode`, `shuffleSeats`, `fastMode`, `noHints`, `noChallengeWildFour` |

## 添加新村规

### 第 1 步：更新类型与默认值

在 `packages/shared/src/types/house-rules.ts` 中添加字段，并同步 `DEFAULT_HOUSE_RULES`：

```typescript
export interface HouseRules {
  // ...
  myNewRule: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  // ...
  myNewRule: false,
};
```

如果预设需要启用新规则，也同步更新 `HOUSE_RULES_PRESETS`。

### 第 2 步：更新 UI 描述表

在 `packages/shared/src/constants/house-rules.ts` 中添加：

```typescript
export const HOUSE_RULE_DEFINITIONS: HouseRuleDefinition[] = [
  // ...
  {
    key: 'myNewRule',
    label: '我的新规则',
    description: '这条规则的用户可见中文说明',
  },
];
```

房间页和村规面板会读取这张表。布尔规则默认自动渲染开关；如果是 `number | null` 或枚举值，需要在客户端的 `RULE_EXTRAS` 中补充 select 配置，目前相关位置包括：

- `packages/client/src/features/game/pages/RoomPage.tsx`
- `packages/client/src/features/game/components/HouseRulesPanel.tsx`

### 第 3 步：实现规则插件

在 `packages/shared/src/rules/rules/` 下创建新文件，或加入已有分类文件：

```typescript
// packages/shared/src/rules/rules/my-new-rule.ts
import type { HouseRulePlugin } from '../house-rule-types.js';

export const myNewRule: HouseRulePlugin = {
  meta: {
    id: 'my-new-rule',
    keys: ['myNewRule'],
    label: '我的新规则',
    description: '这条规则的开发侧说明',
  },

  isEnabled: (hr) => hr.myNewRule,

  preCheck: (state, action, ctx) => {
    if (action.type !== 'PLAY_CARD') return { handled: false };

    // 根据 state/action 判断是否拦截。
    // 如需完全接管动作，返回 { handled: true, state: nextState }。
    // 如不接管，返回 { handled: false }。
    return { handled: false };
  },

  postProcess: (before, after, action, ctx) => {
    if (action.type !== 'PLAY_CARD') return after;

    // 基础引擎处理后可继续调整状态。
    return after;
  },
};
```

如果规则只需要前置或后置处理，可以只实现其中一个函数。

### 第 4 步：注册插件顺序

在 `packages/shared/src/rules/rules/index.ts` 中导入并加入合适的数组：

```typescript
import { myNewRule } from './my-new-rule.js';

export const PRE_CHECK_PLUGINS: HouseRulePlugin[] = [
  // 出牌限制、拦截类规则放这里
  myNewRule,
];

export const POST_PROCESS_PLUGINS: HouseRulePlugin[] = [
  // 结算、换手牌、积分等后处理规则放这里
];
```

顺序建议：

| 顺序 | 适合规则 |
|------|----------|
| 前置靠前 | 终局限制、禁止行为、必须行为 |
| 前置中段 | 罚摸、叠加、转移、摸到能出为止 |
| 前置靠后 | 抢出、交换目标选择等特殊动作 |
| 后置靠前 | 0/7 换手牌、复仇、连出 |
| 后置靠后 | 强制摸后出、积分翻倍、团队/淘汰结算 |

## UI 展示与教学

当前 UI 不读取 `HouseRuleDefinition.teaching`（目前也没有这个字段）。已有教学展示由 `RuleTeaching` 组件内部根据 `ruleKey` 维护。如果新规则需要教学演示，请更新：

```
packages/client/src/features/game/components/RuleTeaching.tsx
```

启用规则展示由这些组件读取 `HOUSE_RULE_DEFINITIONS` 和 `DEFAULT_HOUSE_RULES`：

- `HouseRulesCard`
- `HouseRulesPanel`
- `GameStartRulesModal`
- `RoomPage` 内联村规面板

## 测试

新增规则至少添加 shared 层测试：

```typescript
// packages/shared/tests/house-rules-my-new-rule.test.ts
import { describe, expect, it } from 'vitest';
import { applyActionWithHouseRules } from '@uno-online/shared';
import { makeCard, makeState } from './helpers/test-utils';

describe('myNewRule', () => {
  it('applies when enabled', () => {
    const state = makeState({
      settings: {
        turnTimeLimit: 30,
        targetScore: 1000,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { /* DEFAULT_HOUSE_RULES + myNewRule */ } as any,
      },
    });

    const next = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'card-id',
    });

    expect(next).toBeDefined();
  });
});
```

验证命令：

```bash
pnpm --filter shared test
pnpm --filter shared build
pnpm --filter client exec tsc --noEmit
```

## 最佳实践

1. **保持纯函数**：不要在规则插件里做 IO、计时器或随机副作用。
2. **不要 mutate 输入 state**：返回新的 state 或沿用已复制的状态对象。
3. **先写失效测试**：覆盖启用、禁用、与相邻规则的交互。
4. **小心插件顺序**：顺序变化可能改变现有规则行为。
5. **同步用户可见文案**：`HOUSE_RULE_DEFINITIONS`、中文描述、必要的教学组件一起更新。
6. **同步 MCP/协议文档**：如果新增规则影响 Socket payload 或房间设置，需要更新 `docs/protocol.md`。
