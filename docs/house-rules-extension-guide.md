# UNO Online — 村规（House Rules）扩展开发指南

## 概述

UNO Online 的村规系统采用 **Rule 注册表** 模式，每条村规是一个独立的 `RuleDefinition` 对象，包含元数据（名称、描述、默认值）和行为逻辑（前置检查、后置处理）。社区开发者可以通过注册新的 `RuleDefinition` 来添加自定义村规，无需修改引擎核心代码。

## 架构

```
packages/shared/src/rules/
  house-rule-registry.ts  # Rule 注册表（核心）
  house-rule-types.ts     # RuleDefinition 接口定义
  house-rules-engine.ts   # 引擎入口（遍历注册表执行规则）
  house-rule-helpers.ts   # 规则辅助函数
  game-engine.ts          # 核心游戏引擎
  autopilot-strategy.ts   # 托管 AI 策略
  rules/                  # 内置村规实现（每个文件一条规则）
    stacking.ts           # stackDrawTwo, stackDrawFour, crossStack
    deflection.ts         # reverseDeflectDrawTwo, reverseDeflectDrawFour, skipDeflect
    zero-rotate.ts        # zeroRotateHands
    seven-swap.ts         # sevenSwapHands
    jump-in.ts            # jumpIn
    multi-play.ts         # multiplePlaySameNumber, bombCard
    draw-until-playable.ts # drawUntilPlayable
    forced-play-after-draw.ts # forcedPlayAfterDraw
    forced-play.ts        # forcedPlay
    death-draw.ts         # deathDraw
    hand-limit.ts         # handLimit, handRevealThreshold
    uno-penalty.ts        # unoPenaltyCount
    misplay-penalty.ts    # misplayPenalty
    finish-restrictions.ts # noWildFinish, noFunctionCardFinish
    double-score.ts       # doubleScore
    elimination.ts        # elimination
    revenge-mode.ts       # revengeMode
    silent-uno.ts         # silentUno
    no-challenge-wild-four.ts # noChallengeWildFour
    team-mode.ts          # teamMode
```

## RuleDefinition 接口

```typescript
// packages/shared/src/rules/rule-types.ts

export interface RuleContext {
  state: GameState;
  action: GameAction;
  houseRules: HouseRules;
}

export interface PreCheckResult {
  handled: true;
  newState: GameState;
} | {
  handled: false;
}

export interface PostProcessResult {
  newState: GameState;
} | null;

export interface RuleDefinition {
  /** 规则唯一标识，对应 HouseRules 接口的字段名 */
  key: keyof HouseRules;

  /** 显示信息 */
  meta: {
    label: string;           // 中文名称
    description: string;     // 中文描述
    category: RuleCategory;  // 分类
  };

  /** UI 控件类型 */
  ui: {
    type: 'boolean' | 'select' | 'number';
    options?: { value: any; label: string }[];
  };

  /** 教学演示步骤（可选） */
  teaching?: TeachingStep[];

  /**
   * 前置检查：在基础引擎处理 action 之前调用。
   * - 返回 { handled: true, newState } 表示规则已处理该 action，跳过基础引擎
   * - 返回 { handled: false } 表示规则不拦截，继续传递
   * - 未定义则跳过
   */
  preCheck?: (ctx: RuleContext) => PreCheckResult;

  /**
   * 后置处理：基础引擎处理完 action 后调用。
   * - 返回 { newState } 表示修改了状态
   * - 返回 null 表示无修改
   * - 未定义则跳过
   */
  postProcess?: (ctx: { prevState: GameState; newState: GameState; action: GameAction; houseRules: HouseRules }) => PostProcessResult;

  /**
   * 执行优先级（数字越小越先执行）。
   * 默认 100。前置检查和后置处理分别独立排序。
   * 内置规则使用 0-99，社区规则建议使用 100+。
   */
  priority?: number;
}

export type RuleCategory =
  | 'stacking'       // 叠加
  | 'deflection'     // 转移
  | 'hand-swap'      // 换牌
  | 'draw'           // 摸牌
  | 'play'           // 出牌限制
  | 'scoring'        // 计分
  | 'mode'           // 模式
  | 'multi-play'     // 连出
  | 'limit'          // 限制
  | 'team';          // 团队
```

## 注册表 API

```typescript
// packages/shared/src/rules/rule-registry.ts

/** 注册一条村规 */
export function registerRule(rule: RuleDefinition): void;

/** 批量注册 */
export function registerRules(rules: RuleDefinition[]): void;

/** 获取所有已注册规则（按 priority 排序） */
export function getAllRules(): RuleDefinition[];

/** 获取指定规则 */
export function getRule(key: keyof HouseRules): RuleDefinition | undefined;

/** 获取所有规则的元数据（用于 UI 渲染） */
export function getRuleMetas(): RuleMeta[];
```

## 引擎执行流程

```
applyActionWithHouseRules(state, action)
  │
  ├─ 1. 收集所有已注册规则，按 priority 排序
  │
  ├─ 2. 依次执行有 preCheck 的规则
  │     ├─ 如果某规则返回 { handled: true, newState }
  │     │   → 使用 newState，跳过基础引擎，进入后置处理
  │     └─ 如果所有规则返回 { handled: false }
  │         → 继续
  │
  ├─ 3. 调用基础引擎 applyAction(state, action)
  │
  └─ 4. 依次执行有 postProcess 的规则
        ├─ 每个规则可修改 newState
        └─ 最终返回累积后的 newState
```

## 添加新村规（完整步骤）

### 第 1 步：定义类型

在 `packages/shared/src/types/house-rules.ts` 的 `HouseRules` 接口中添加字段：

```typescript
export interface HouseRules {
  // ... 现有字段
  myNewRule: boolean;  // 新增
}
```

在 `DEFAULT_HOUSE_RULES` 中设置默认值：

```typescript
export const DEFAULT_HOUSE_RULES: HouseRules = {
  // ... 现有默认值
  myNewRule: false,
};
```

### 第 2 步：实现规则逻辑

在 `packages/shared/src/rules/rules/` 下创建新文件或添加到已有分类文件：

```typescript
// packages/shared/src/rules/rules/my-new-rule.ts
import type { RuleDefinition } from '../rule-types';

export const myNewRule: RuleDefinition = {
  key: 'myNewRule',
  meta: {
    label: '我的新规则',
    description: '当玩家出红色牌时，下一位玩家必须也出红色牌或摸牌',
    category: 'play',
  },
  ui: { type: 'boolean' },
  teaching: [
    { type: 'card', card: { type: 'number', color: 'red', value: 5 } },
    { type: 'arrow' },
    { type: 'text', text: '下家必须出红色' },
  ],
  priority: 110,  // 社区规则建议 100+

  preCheck: ({ state, action, houseRules }) => {
    if (!houseRules.myNewRule) return { handled: false };

    // 只处理出牌动作
    if (action.type !== 'PLAY_CARD') return { handled: false };

    // 检查上一张牌是否是红色...
    // 返回 { handled: true, newState: ... } 来拦截
    // 或 { handled: false } 来放行

    return { handled: false };
  },

  postProcess: ({ prevState, newState, action, houseRules }) => {
    if (!houseRules.myNewRule) return null;
    // 出牌后的额外效果...
    return null;
  },
};
```

### 第 3 步：注册规则

在规则注册入口文件中导入并注册：

```typescript
// packages/shared/src/rules/rules/index.ts
import { registerRule } from '../rule-registry';
import { myNewRule } from './my-new-rule';

registerRule(myNewRule);
```

### 第 4 步：添加测试

```typescript
// packages/shared/tests/house-rules-my-new-rule.test.ts
import { describe, it, expect } from 'vitest';
import { initializeGame, applyActionWithHouseRules } from '@uno-online/shared';

describe('myNewRule', () => {
  it('should enforce red-only play after red card', () => {
    const state = initializeGame(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      { myNewRule: true },
    );
    // 设置测试场景...
    // 执行动作...
    // 验证结果...
  });
});
```

### 第 5 步：验证

```bash
pnpm --filter shared test            # 运行测试
pnpm --filter shared exec tsc --noEmit  # 类型检查
pnpm --filter client exec tsc --noEmit  # 客户端类型检查（UI 自动生成）
```

## UI 自动生成

**新村规的 UI 无需手动编写**。`HouseRulesPanel` 和 `HouseRulesCard` 组件从注册表动态获取规则列表：

```typescript
// HouseRulesPanel.tsx（伪代码）
import { getAllRules } from '@uno-online/shared';

const rules = getAllRules();
// 自动渲染 toggle/select/number 控件
```

教学演示（RuleTeaching）同样从 `RuleDefinition.teaching` 字段自动生成。

## 规则优先级指南

| 范围 | 用途 |
|------|------|
| 0-19 | 基础限制（handLimit, forcedPlay） |
| 20-39 | 出牌约束（noWildFinish, noFunctionCardFinish） |
| 40-59 | 叠加/转移（stacking, deflection） |
| 60-79 | 特殊出牌（jumpIn, multiplePlaySameNumber） |
| 80-99 | 后处理（zeroRotateHands, doubleScore, elimination） |
| 100+ | 社区自定义规则 |

## 预设管理

预设定义不变，仍然是 `Partial<HouseRules>` 对象。社区可以添加新预设：

```typescript
HOUSE_RULES_PRESETS['my-preset'] = {
  myNewRule: true,
  stackDrawTwo: true,
  drawUntilPlayable: true,
};
```

## 最佳实践

1. **单一职责**：每个 `RuleDefinition` 只处理一条规则的逻辑
2. **纯函数**：`preCheck` 和 `postProcess` 必须是纯函数，不产生副作用
3. **不修改输入**：始终返回新的 state 对象，不要 mutate 传入的 state
4. **优雅降级**：规则逻辑第一行检查 `if (!houseRules.myKey) return`
5. **类型安全**：避免 `as any`，如需新的游戏阶段请扩展 `GamePhase` 类型
6. **测试覆盖**：每条规则至少测试：启用时的正常行为、禁用时不生效、与其他规则的交互
7. **优先级选择**：选择合适的优先级范围，避免与内置规则冲突
