# UNO Flip 模式设计文档

> 状态：设计评审中 · 目标版本：v0.12.0 · 最后更新：2026-07-26

## 1. 定位与目标

UNO Flip 作为**独立游戏模式**实现，不是村规开关。

理由：村规插件（`HouseRulePlugin`）的能力边界是 `GameState → GameState`，只能改变**动作的处理流程**；而 UNO Flip 改变的是**数据模型本身**——一张牌有两个面、颜色从 4 种扩到 8 种、新增 6 种卡型、对手能看到你手牌的背面、计分表不同。这些都无法通过 `preCheck` / `postProcess` 表达。

因此引入 `RoomSettings.gameMode`：

```typescript
export type GameMode = 'classic' | 'flip';
```

村规系统在 Flip 模式下继续工作，但按兼容矩阵（§10）筛选可用项，并新增一组 Flip 专属村规（§11）。

### 设计原则

1. **classic 零回归** — 阶段 1 的类型改造必须做到经典模式行为逐位不变，现有 shared/server 测试全绿是硬门槛。
2. **信息对等** — 玩家（含机器人）能看到的信息严格等于实物游戏：你看不到自己手牌的背面，只看得到对手手牌的背面。
3. **单一翻面入口** — 所有翻面通过一个纯函数完成，禁止散落的面切换逻辑。
4. **偏离必须显式** — 任何与官方规则不同的裁定都在本文档标注为「本项目裁定」并给出理由。

---

## 2. 官方规则基线

以下内容核对自 Mattel 官方说明书（Toy No. GDR44）。

### 2.1 牌组构成：112 张双面牌

**亮面（Light Side，白边）**

| 内容 | 数量 |
|------|------|
| 蓝 / 绿 / 红 / 黄 数字 1–9（每色每数字 2 张） | 18 × 4 = 72 |
| Draw One（+1） | 每色 2 张 = 8 |
| Reverse | 每色 2 张 = 8 |
| Skip | 每色 2 张 = 8 |
| Flip | 每色 2 张 = 8 |
| Wild | 4 |
| Wild Draw Two（万能 +2） | 4 |
| **合计** | **112** |

**暗面（Dark Side，黑边）**

| 内容 | 数量 |
|------|------|
| 粉 / 青 / 橙 / 紫 数字 1–9（每色每数字 2 张） | 18 × 4 = 72 |
| Draw Five（+5） | 每色 2 张 = 8 |
| Reverse | 每色 2 张 = 8 |
| Skip Everyone | 每色 2 张 = 8 |
| Flip | 每色 2 张 = 8 |
| Wild | 4 |
| Wild Draw Color（万能摸到指定色） | 4 |
| **合计** | **112** |

> ⚠️ **关键差异：UNO Flip 两面都没有 0 牌。** 经典 UNO 每色有 1 张 0（19 张/色），Flip 是 1–9 各两张（18 张/色）。这直接决定了村规「0 牌交换手牌」在 Flip 模式下必须禁用。
>
> ⚠️ **亮面没有带色 +2。** 经典 UNO 的 `draw_two` 是带色 +2；Flip 亮面的带色罚摸牌是 **+1**，而 +2 是**万能牌**（Wild Draw Two）。这是两个不同的卡型，不能复用同一个 `type`。

### 2.2 卡牌效果

**亮面**

| 卡 | 效果 | 出牌限制 |
|----|------|----------|
| 数字 1–9 | 无 | 同色或同数字 |
| Draw One | 下家摸 1 张并跳过回合 | 同色或另一张 Draw One |
| Reverse | 反转出牌方向 | 同色或另一张 Reverse |
| Skip | 下家跳过回合 | 同色或另一张 Skip |
| Flip | 整场翻到暗面 | 同色或另一张 Flip |
| Wild | 指定继续的颜色 | 任意时刻可出 |
| Wild Draw Two | 指定颜色 + 下家摸 2 并跳过 | **手中不能有与弃牌堆顶同色的牌**（同数字/同功能不算）；可被质疑 |

**暗面**

| 卡 | 效果 | 出牌限制 |
|----|------|----------|
| 数字 1–9 | 无 | 同色或同数字 |
| Draw Five | 下家摸 5 张并跳过回合 | 同色或另一张 Draw Five |
| Reverse | 反转出牌方向 | 同色或另一张 Reverse |
| Skip Everyone | **所有人**跳过回合，轮次回到出牌者本人 | 同色或另一张 Skip Everyone |
| Flip | 整场翻到亮面 | 同色或另一张 Flip |
| Wild | 指定继续的颜色 | 任意时刻可出 |
| Wild Draw Color | 指定颜色 + **下家一直摸牌直到摸到该颜色**，然后跳过回合 | 同 Wild Draw Two 的限制；可被质疑 |

### 2.3 质疑罚则（与经典 UNO 不同）

| 场景 | 质疑成功（出牌者违规） | 质疑失败（出牌者清白） |
|------|------------------------|------------------------|
| Wild Draw Two | 出牌者摸 2 | 质疑者摸 2 **+ 额外 2 = 4** |
| Wild Draw Color | 出牌者摸到指定色为止 | 质疑者摸到指定色为止 **+ 额外 2** |

> 现有经典实现是 4 / 6（`game-engine.ts:handleChallenge`），Flip 是 2 / 4。罚则必须按模式分派。

### 2.4 Flip 卡的翻面顺序（官方原文）

> "Once the Flip card has been played, flip over the Discard Pile (the card just played will now be on the bottom), then the Draw Pile, then everyone's hands must flip to the other side."

即：
1. **翻转弃牌堆整体** —— 刚打出的 Flip 卡沉到堆底，原本堆底的第一张弃牌成为新顶牌（显示其另一面）
2. 翻转摸牌堆
3. 所有玩家手牌翻面

这条「弃牌堆整体反转」是实现上最容易漏掉的细节，它决定了翻面后的新顶牌是**本轮第一张弃牌**，而不是刚打出的 Flip 卡。

### 2.5 开局

- 每人 7 张，亮面朝自己、暗面朝对手
- 剩余牌**亮面朝下**成为摸牌堆（因此摸牌堆可见的是暗面）
- 翻开顶牌成为弃牌堆（亮面朝上）
- 若首张为功能牌，按功能牌规则处理；**若为 Wild Draw Two，放回牌堆重抽**

### 2.6 计分（按结束时所处的那一面计算）

| 卡 | 分值 |
|----|------|
| 数字 1–9 | 面值 |
| Draw One | 10 |
| Draw Five | 20 |
| Reverse | 20 |
| Skip | 20 |
| Flip | 20 |
| Skip Everyone | 30 |
| Wild | 40 |
| Wild Draw Two | 50 |
| Wild Draw Color | 60 |

官方目标分 **500 分**（`targetScore` 已支持该值，Flip 模式默认设为 500）。

若最后一张牌是 Draw One / Draw Five / Wild Draw Two / Wild Draw Color，下家仍需完成罚摸，且这些牌计入结算。

---

## 3. 数据模型

### 3.1 颜色

```typescript
// packages/shared/src/types/card.ts
export type LightColor = 'red' | 'blue' | 'green' | 'yellow';
export type DarkColor  = 'pink' | 'teal' | 'orange' | 'purple';
export type Color = LightColor | DarkColor;
```

`Color` 从 4 元扩为 8 元。所有 `Record<Color, T>` 的映射表必须补全（`UNO_COLOR_HEX`、`COLOR_ORDER`、色盲符号表等），否则 TS 直接报错——这是好事，编译器会把所有消费点列出来。

亮暗色对位关系（官方未定义，本项目按色相接近程度裁定，用于翻面保色村规和 UI 转场）：

| 亮面 | 暗面 |
|------|------|
| red | pink |
| yellow | orange |
| green | teal |
| blue | purple |

### 3.2 卡型

```typescript
export type CardType =
  // 经典
  | 'number' | 'skip' | 'reverse' | 'draw_two' | 'wild' | 'wild_draw_four'
  // Flip 亮面新增
  | 'draw_one' | 'wild_draw_two' | 'flip'
  // Flip 暗面新增
  | 'draw_five' | 'skip_everyone' | 'wild_draw_color';
```

`draw_two`（带色 +2）与 `wild_draw_two`（万能 +2）是不同卡型；`reverse` / `skip` / `wild` / `number` 在两个模式两个面之间共用。

### 3.3 双面卡的表达方式（核心架构决策）

考虑过两种方案：

**方案 A —— 卡 = id + 两个面**

```typescript
interface Card { id: string; light: CardFace; dark: CardFace }
```

语义最干净，但代价是全仓 187 处 `card.type` / `card.color` 访问点（shared 138 + client 49）全部要改成 `activeFace(card, side).type`，且经典模式白付这份复杂度。**不采用。**

**方案 B —— 卡 = 当前活动面 + 背面（采用）**

```typescript
/** 一张牌的「另一面」。classic 模式为 undefined。 */
export interface CardBack {
  type: CardType;
  color: Color | null;
  value?: number;
}

export interface NumberCard {
  id: string;
  type: 'number';
  color: Color;
  value: number;
  back?: CardBack;          // ← 新增，所有 Card 变体都加
}
// ... 其余变体同理
```

`card.type` / `card.color` 的语义保持为「**当前活动面**」。

翻面就是一次纯函数映射：

```typescript
export function swapFace(card: Card): Card {
  if (!card.back) return card;
  const front: CardBack = { type: card.type, color: card.color, ...(card.type === 'number' ? { value: card.value } : {}) };
  return { id: card.id, ...card.back, back: front } as Card;
}
```

**为什么选 B：**

- 现有 187 处读取点**零改动**，`canPlayCard` / `getCardScore` / `sortHand` / 机器人估值全部自动作用于活动面，只需为新卡型补分支
- classic 模式 `back === undefined`，运行时与内存零额外成本，现有测试不受影响
- 官方「按结束时所在面计分」的要求天然满足——活动面就是当前面，无需额外传 `side`
- 村规插件里所有移动手牌的操作（seven-swap、hand-limit、jump-in）只搬动卡对象、不触碰面，因此**天然安全**

**代价与对策：**

| 代价 | 对策 |
|------|------|
| 牌的身份不再由活动面唯一确定，翻面会改变 `cardToIdentity` 输出 → `deckHash` 变化会被反作弊逻辑误报 | `cardToIdentity` 改为输出**与活动面无关的规范化双面身份**（两面按固定顺序排序后序列化），见 §7.3 |
| 翻面必须整体一致，漏掉任一集合（两个牌堆 / 弃牌堆 / 每个人手牌）就是状态腐坏 | 唯一入口 `flipAll(state)` + 不变量断言测试（§4.2） |
| 洗牌回收清除 `chosenColor` 时要连背面一起清 | `clearWildColor` 同时处理 `back` |

### 3.4 GameState

```typescript
export type FlipSide = 'light' | 'dark';

export interface GameState {
  // ...
  flipSide: FlipSide;                    // classic 恒为 'light'

  // Wild Draw Color 的条件式罚摸（见 §4.3）
  pendingPenaltyUntilColor?: Color | null;
  pendingPenaltyExtra?: number;
}
```

`flipSide` 在方案 B 下是冗余信息（可由任一张牌推导），但显式存储是必要的：UI 需要它切换主题、`ColorPicker` 需要它决定给哪 4 色、不变量测试需要它做交叉校验。

### 3.5 RoomSettings

```typescript
export interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500 | 1000;
  gameMode: GameMode;                   // ← 新增，默认 'classic'
  houseRules: HouseRules;
  allowSpectators: boolean;
  spectatorMode: 'full' | 'hidden';
}
```

需要贯通的位置：
- `packages/server/src/plugins/core/room/manager.ts:26` 默认值
- `packages/server/src/ws/room-events.ts:101 / :279 / :462` 三处 settings 归一化
- `room:create` / `room:update_settings` 的 payload 校验
- 切换模式时若 `targetScore` 仍是经典默认 1000，自动改为 500（Flip 官方目标分），反之切回 classic 恢复 1000

---

## 4. 规则引擎改造

### 4.1 牌组构造与配对

```typescript
export function createFlipDeck(): Card[]
```

按 §2.1 生成 112 个亮面与 112 个暗面，各自洗乱后一一配对。

> **本项目裁定：随机配对。** 实物 UNO Flip 的两面配对是印刷时固定的，熟练玩家可以通过记忆牌背推断牌面。我们每局随机配对，因为（a）我们没有官方配对表，（b）随机配对对所有玩家信息对称，反而更公平。
>
> 如果后续需要贴近实物手感，可作为村规 `flipFixedPairing` 引入一张固定配对表，优先级低。

### 4.2 翻面事务

```typescript
export function flipAll(state: GameState): GameState
```

严格按官方顺序：

1. `discardPile` 整体反转（刚打出的 Flip 卡沉底，原堆底成为新顶牌）
2. `discardPile` / `deckLeft` / `deckRight` / 每个 `player.hand` 的每一张执行 `swapFace`
3. `flipSide` 取反
4. 重算 `currentColor`（见下）
5. 不变量断言（仅测试环境）：所有牌都有 `back`；活动面颜色域与 `flipSide` 一致

**新顶牌是万能牌时的裁定**

翻面后新顶牌可能是 Wild / Wild Draw Two / Wild Draw Color（`color === null`），此时旧的 `chosenColor` 已失去意义。官方规则没有覆盖这个情况。

> **本项目裁定：由打出 Flip 卡的玩家指定新颜色**，进入现有 `choosing_color` 阶段，然后轮次正常推进到下家。理由：顶牌无色时必须有人定色，而定色权归属打出 Flip 的玩家最符合「谁触发谁负责」，且复用现有 phase 无需新状态。
>
> 替代方案作为村规 `flipKeepColorOnFlip` 提供：按 §3.1 的亮暗对位表把翻面前的 `currentColor` 映射到新面的对位色，不进入选色阶段。

**与罚摸状态的交互**

罚摸未清期间玩家不能出牌，因此默认规则下 Flip 卡不可能在 `pendingPenaltyDraws > 0` 时被打出，无需特殊处理。仅当启用村规 `flipDeflect` 系列允许 Flip 参与挡罚时才需定义——届时约定：**先完成罚摸转移，再执行翻面**。

### 4.3 条件式罚摸（Wild Draw Color）

现有罚摸机制是计数式（`pendingPenaltyDraws: number`，`game-engine.ts:finishPenaltyDrawIfNeeded`）。Wild Draw Color 的张数不确定，需要条件式：

```typescript
pendingPenaltyUntilColor?: Color | null;   // 非 null：摸到该色为止
pendingPenaltyExtra?: number;              // 命中目标色后再摸 N 张（质疑失败时为 2）
```

`finishPenaltyDrawIfNeeded` 增加分支：

- 若 `pendingPenaltyUntilColor` 非空，每摸一张后检查**新摸到的牌的活动面颜色**是否等于目标色
- 命中 → 清空 `pendingPenaltyUntilColor`，转为 `pendingPenaltyDraws = pendingPenaltyExtra ?? 0`
- 未命中 → 保持状态，玩家继续摸

**终止条件（必须有）**：两个牌堆 + 弃牌堆全部耗尽仍未摸到目标色时停止罚摸并推进轮次。虽然暗面每色有 22 张，理论上牌堆里一定存在，但这些牌可能全在其他玩家手里。沿用 `hasCardsAvailable()` 判断，并在游戏日志中给出提示文案。

村规 `flipDrawColorCap` 可为其设上限（默认 `null` = 无上限）。

### 4.4 卡牌效果实现映射

| 面 | type | 实现 |
|----|------|------|
| 亮 | `draw_one` | 复用 `startPenaltyDraw(count=1)`，逻辑同 `draw_two` |
| 亮 | `wild_draw_two` | `choosing_color` → `challenging`，罚摸 2；质疑罚则 2/4 |
| 亮/暗 | `skip` / `reverse` / `number` / `wild` | 完全复用现有分支 |
| 亮/暗 | `flip` | 新增：`currentColor = card.color` → `flipAll()` → 按 §4.2 决定是否进 `choosing_color` → 推进轮次 |
| 暗 | `draw_five` | `startPenaltyDraw(count=5)`；官方**不可叠加/转移**，默认不参与 `canRespondToDrawStack` |
| 暗 | `skip_everyone` | 新增：`currentPlayerIndex` **保持不变**（轮次回到出牌者），`currentColor = card.color` |
| 暗 | `wild_draw_color` | `choosing_color` → `challenging`，罚摸走 §4.3；质疑罚则「摸到色」/「摸到色 + 2」 |

`skip_everyone` 需要注意与 `checkRoundEnd` 的顺序：出牌者打出最后一张 Skip Everyone 时轮次不变但回合已结束，`checkRoundEnd` 的既有调用位置（`handlePlayCard` 末尾）已经能正确覆盖。

### 4.5 出牌合法性

`canPlayCard` 的 `getCardSymbol` 需要为新卡型返回符号：

```typescript
'draw_one' → 'draw_one'    'draw_five' → 'draw_five'
'flip' → 'flip'            'skip_everyone' → 'skip_everyone'
```

关键点：`flip` 的符号在两面都是 `'flip'`，所以「Flip 接 Flip」天然成立。而 `draw_one` 与 `draw_five` 符号不同 —— 翻面后手里的 +1 变成了 +5，符号也跟着变，这是正确行为。

`isValidWildDrawFour` 需要泛化为 `isValidWildDrawPenalty(hand, currentColor)`（逻辑不变：手中无同色牌），供 `wild_draw_two` / `wild_draw_color` 共用。

### 4.6 开局裁定

`handleFirstDiscard` 在 Flip 模式下：

- `wild_draw_two` → 放回牌堆重抽（官方明文）
- `wild_draw_color` 不会出现（首张必为亮面）
- `wild` → 由首位玩家选色，受现有村规 `wildFirstTurn` 控制
- `draw_one` → 首位玩家摸 1 并跳过（对应现有 `draw_two` 的首牌逻辑）
- `skip` / `reverse` → 同经典
- `flip` → **本项目裁定：立即生效，开局即翻到暗面。** 理由：官方对首张功能牌统一「按功能牌规则处理」，Flip 是功能牌，没有理由例外；且开局翻面是很有辨识度的开场。替代方案（放回重抽）留作村规，优先级低。

### 4.7 计分

```typescript
export const FLIP_CARD_SCORES: Record<CardType, number | 'face_value'> = {
  number: 'face_value',
  draw_one: 10,
  draw_five: 20, reverse: 20, skip: 20, flip: 20,
  skip_everyone: 30,
  wild: 40,
  wild_draw_two: 50,
  wild_draw_color: 60,
  // 经典专属卡型在 Flip 模式不会出现
  draw_two: 20, wild_draw_four: 50,
};
```

`getCardScore(card, mode)` 按模式分派（注意 `wild` 在经典是 50、Flip 是 40）。

---

## 5. 可见性与协议

这是 Flip 的核心博弈机制，也是最容易被漏掉的协议改动。

官方：手持牌时你看到亮面（当前面），**对手看到你手牌的暗面（背面）**。

### 5.1 PlayerView 扩展

```typescript
export interface PlayerViewPlayer {
  // ...
  hand: Card[];              // 仅自己 / 被揭示时非空
  handCount: number;
  handBacks?: CardBack[];    // ← 新增：与 handCount 等长，Flip 模式下对所有人可见
}
```

`packages/server/src/plugins/core/game/session.ts:64 buildPlayerViews` 改造：

- 自己：`hand`（**不含** back 字段，见下）+ `handBacks: undefined`
- 对手：`hand: []` + `handBacks: [...]`
- 观战 `spectatorMode: 'full'`：两面都可见；`'hidden'`：仅 `handBacks`
- 村规 `handRevealThreshold` 触发时：该玩家的 `hand` 与 `handBacks` 同时揭示

### 5.2 自己手牌的背面必须裁剪

> ⚠️ 官方规则下你**看不到自己手牌的背面**。方案 B 的 `Card.back` 字段直接下发给自己就等于泄露。

因此下发自己手牌时必须**剥离 `back` 字段**（除非村规 `flipShowOwnBacks` 开启）。这条约束同时适用于：

- `getPlayerView()` 自己的 hand
- `getGameUpdateBatch()` 单独下发的 hands
- MCP 的手牌查询工具
- 机器人可见状态（§9）

信息泄露量必须**正好等于**实物游戏：自己看当前面，别人看背面。

### 5.3 批量广播

`getGameUpdateBatch()` 的 `baseView` 里所有人都是 `hand: []` + `handBacks`，各自的 hand 单独下发。现有结构直接支持，只需 `baseView` 带上 `handBacks`。

### 5.4 顺序问题

`handBacks` 按服务端 hand 顺序下发。客户端会对自己手牌排序（`sortHand`），因此对手看到的排列与本人看到的排列不同。这**符合实物**（对手看到的就是你手里的物理排列），无需对齐。

---

## 6. 前端设计

### 6.1 模式开关

位置：房间页村规设置区块**下方**独立一块。

```
┌─ 村规设置 ────────────────────┐
│ [各村规开关…]                  │
└───────────────────────────────┘
┌───────────────────────────────┐
│  切换至 UNO Flip        [ ●] │
│  双面牌组 · 亮暗两套规则       │
└───────────────────────────────┘
```

- 组件：`GameModeSwitch`，放在 `RoomPage` 内联村规面板与 `HouseRulesPanel` 之后
- 仅房主可改；游戏进行中禁用
- 打开后村规面板中不兼容项自动置灰 + 显示禁用原因（读 §10 兼容矩阵）
- 打开后追加显示 Flip 专属村规组（§11）
- 切换时 `targetScore` 自动在 1000（classic）/ 500（flip）之间跟随

### 6.2 左右牌堆的亮暗视觉

Flip 模式下两侧摸牌堆的牌背分别渲染为亮面与暗面：

| 位置 | 横屏 | 竖屏 | 渲染 |
|------|------|------|------|
| `side="left"` | 左牌堆 | 上牌堆 | **亮面牌背**（白边 + 浅色底） |
| `side="right"` | 右牌堆 | 下牌堆 | **暗面牌背**（黑边 + 深色底） |

改动点：`DrawPile.tsx` 的 `CardBack`、移动端 `StageCenter.tsx` 的 `DeckBack`，按 `gameMode === 'flip'` 与 `side` 选择牌背样式。

> ⚠️ **这是纯视觉设计，不改变机制。** 两个牌堆装的都是同一副双面牌，摸到的牌处于哪一面由全局 `flipSide` 决定，与从左堆还是右堆摸无关。文档在此明确，避免实现时误解为「左堆摸出亮面牌、右堆摸出暗面牌」——后者会破坏双牌堆玩法的对称性（一侧摸完游戏就没法继续）。
>
> 未决项：见 §13。

### 6.3 卡面渲染

`Card.tsx`：

```typescript
// CARD_SYMBOL 新增
draw_one: '+1'        draw_five: '+5'
wild_draw_two: '+2'   wild_draw_color: '+?'
skip_everyone: '⊘⊘'   flip: '⇅'
```

`COLOR_CLASS` 新增 4 个暗色（`bg-uno-pink` / `bg-uno-teal` / `bg-uno-orange` / `bg-uno-purple`）。

**对手手牌显示背面**：对手手牌位（`PlayerNode` / `SeatCircle`）在 Flip 模式下不再画统一牌背，而是按 `handBacks` 画出每张牌的背面（颜色 + 符号）。这是玩家读牌的主要信息来源，需要在小尺寸下依然可辨——用「色块 + 符号」的极简版式，不复用完整 `Card` 组件。

**自己手牌不显示背面**（除非村规开启）。

### 6.4 主题与翻面动画

- `styles/tokens.css` 新增暗面 4 色 token
- 牌桌根节点挂 `data-flip-side="light|dark"`，暗面时压暗背景、金色描边转为银/紫色调
- 翻面转场：一次性的整桌 `rotateY` + 透明度过渡（约 600ms）后即刻结束

> ⚠️ 动画必须是一次性 `transform` / `opacity`，**不能引入常驻动画或持续重栅格化**。参见 5054ce5「修复对局中持续重栅格化导致的移动端发热」。翻面动画完成后必须移除 will-change 与动画类。

### 6.5 ColorPicker

按 `flipSide` 渲染当前面的 4 色，**不是 8 色** —— 任一时刻只有 4 色在场。

### 6.6 色盲模式

`ColorBlindOverlay` 为暗面 4 色补充区分符号。暗面色相（粉/橙）本身比亮面更易混淆，色盲支持在 Flip 下比经典更重要。

### 6.7 卡牌资源包

现有 `card-images.ts` 用 0–53 的固定索引覆盖经典 54 种牌面。Flip 需要：

- 亮面：数字 4×9 = 36 + draw_one 4 + skip 4 + reverse 4 + flip 4 + wild 1 + wild_draw_two 1 = **54**
- 暗面：同结构 = **54**

方案：Flip 使用独立索引段 **100–207**，`cardToImageIndex` 按 `gameMode` 分派。仅含 0–53 的旧资源包在 Flip 模式下降级为内置矢量渲染，不报错。

### 6.8 规则展示与教学

需要补 Flip 章节的位置：`GameRulesPanel`、`TutorialModal`、`RuleTeaching`、`GameStartRulesModal`（显示当前模式）。

---

## 7. 兼容性与既有功能交互

### 7.1 双牌堆与弃牌堆回收

`reshuffleSideFromDiscard` 从弃牌堆**底部**取牌回收。Flip 卡会反转弃牌堆，所以「底部」的含义在翻面后会变。这个交互本身无 bug（两个操作都作用于同一个数组，语义自洽），但**必须有测试覆盖**「翻面 → 回收 → 再翻面」的组合路径。

### 7.2 弃牌堆截断

`session.ts:62 DISCARD_TRUNCATE = 10` 只下发最后 10 张。翻面时服务端持有完整弃牌堆，反转后重新截断即可，客户端无需完整堆。但客户端的弃牌堆动画需要处理「顶牌突变为一张此前未在视野内的牌」——加一次淡入过渡。

### 7.3 反作弊哈希

`cardToIdentity` 必须输出**与活动面无关**的规范化双面身份：

```typescript
export function cardToIdentity(card: Card): CardIdentity {
  const a = faceOf(card), b = card.back;
  if (!b) return { color: a.color, type: a.type, ...(a.value !== undefined ? { value: a.value } : {}) };
  const [light, dark] = a.color !== null && LIGHT_COLORS.includes(a.color) ? [a, b] : [b, a];
  return { light, dark };   // 按亮/暗归一化，不随翻面变化
}
```

否则每次翻面 `deckHash` 都会变化，`AntiCheatToast` 会误报。

### 7.4 村规插件的手牌搬运

`seven-swap` / `zero-rotate` / `hand-limit` / `jump-in` 只搬动卡对象、不修改面，方案 B 下**天然安全**，无需改动。

### 7.5 MCP

- 工具描述补充 Flip 卡型与 `flipSide` 字段
- 手牌查询返回自己手牌（无 back）+ 对手 `handBacks`
- `docs/protocol.md` 同步

---

## 8. 机器人

### 8.1 最低可用

`card-evaluator.ts` 为新卡型补估值权重：`draw_five` > `draw_two`，`skip_everyone` 高价值（等于多打一张），`wild_draw_color` 视为最强控制牌。

### 8.2 Flip 专属决策维度

打 Flip 卡前需要评估「翻面后局面对我是变好还是变差」。可用的合法信息：

- ✅ **对手手牌的背面**（`handBacks`）—— 与人类信息对等。对手背面里暗面高罚牌（+5 / Wild Draw Color）多 → 避免翻到暗面
- ❌ **自己手牌的背面** —— 人类看不到，机器人也不许看

> 这条约束是公平性红线。机器人的可见状态必须走与人类玩家相同的 `PlayerView` 裁剪路径（§5.2），不能直接读 `GameState`。若现有机器人实现是直接读全量状态的，阶段 5 需要为其加一层视图裁剪。

### 8.3 启发式

- 手中暗面均分 < 亮面均分 → 倾向打 Flip
- 下家手牌数少（接近 UNO）→ 倾向翻到暗面（罚则更重）
- 自己手牌多 → 避免翻到暗面（被 +5 / Wild Draw Color 打中损失更大）

---

## 9. 阶段划分

每阶段一个 PR，逐阶段可验证。

| 阶段 | 内容 | 完成标准 |
|------|------|----------|
| **0** | 本设计文档 | 评审通过 |
| **1** | 类型与牌组：`Color` 扩展、`CardType` 扩展、`Card.back`、`swapFace`、`createFlipDeck`、`cardToIdentity` 双面化、`gameMode` 贯通 settings | **classic 行为逐位不变**，现有 shared 21 个测试文件 + server 测试全绿 |
| **2** | 规则引擎：`flipAll`、新卡效果、条件式罚摸、Flip 质疑罚则、Flip 计分表、开局裁定 | 新增 Flip 规则测试，覆盖翻面/条件罚摸/Skip Everyone/质疑罚则/回收组合路径 |
| **3** | 协议与可见性：`handBacks`、`PlayerView`、`session`、批量广播、观战 | 有测试断言「自己手牌不含 back」「对手 handBacks 长度 == handCount」 |
| **4** | 前端：模式开关、双牌堆亮暗、卡面渲染、对手背面显示、ColorPicker、主题、翻面动画、色盲、规则面板/教学、资源包索引 | 手动走通一局完整 Flip 对局；移动端无持续重栅格化 |
| **5** | 机器人：新卡型估值 + 翻面决策 + 视图裁剪 | 机器人能完整打完 Flip 对局不卡死；不读自己背面 |
| **6** | Flip 村规（§11）+ 兼容矩阵 UI | 每条 Flip 村规有测试 |
| **7** | MCP + `protocol.md` + CHANGELOG + 版本号 + 客户端更新弹窗 | 按 CLAUDE.md 版本号更新流程执行 |

验证命令（每阶段执行）：

```bash
pnpm --filter shared build
pnpm --filter server exec tsc --noEmit
pnpm --filter client build
pnpm test
```

---

## 10. 村规兼容矩阵

现有 34 条村规在 Flip 模式下的处置：

### 10.1 禁用

| 村规 | 原因 |
|------|------|
| `zeroRotateHands` | **Flip 两面都没有 0 牌**，规则无法触发 |
| `stackDrawTwo` / `stackDrawFour` / `crossStack` | 卡型语义不同（Flip 是 +1/+5/万能+2/万能摸色），改用 Flip 专属叠加村规 |
| `reverseDeflectDrawTwo` / `reverseDeflectDrawFour` / `skipDeflect` | 同上，改用 `flipReverseDeflect` / `flipSkipDeflect` |
| `noChallengeWildFour` | Flip 无 +4，改用 `flipNoChallenge` |
| `bombCard` | 依赖「3+ 张同数字」，Flip 每色每数字仅 2 张，跨色仍可凑但触发率与经典差异过大，先禁用待评估 |

禁用项在 UI 中置灰并显示原因，不静默忽略。

### 10.2 可用（语义按活动面自然成立）

`sevenSwapHands`、`jumpIn`、`multiplePlaySameNumber`、`wildFirstTurn`、`drawUntilPlayable`、`forcedPlayAfterDraw`、`forcedPlay`、`handLimit`、`handRevealThreshold`、`unoPenaltyCount`、`strictUnoCall`、`misplayPenalty`、`silentUno`、`noFunctionCardFinish`、`noWildFinish`、`doubleScore`、`elimination`、`blitzTimeLimit`、`revengeMode`、`teamMode`、`shuffleSeats`、`fastMode`、`noHints`、`blindDraw`

注意：
- `noFunctionCardFinish` 的「功能牌」判定要包含 Flip 新卡型
- `jumpIn` 的「完全相同」在 Flip 下按**活动面**判定（两张牌活动面相同即可，背面无需相同）
- `handRevealThreshold` 揭示时两面都揭示

---

## 11. Flip 专属村规

按常见玩法收录。所有键以 `flip` 前缀，仅在 `gameMode === 'flip'` 时显示。

| 键 | 标签 | 说明 |
|----|------|------|
| `flipStackDrawOne` | +1 叠加 | 被 +1 时可出 +1 叠加给下家 |
| `flipStackDrawFive` | +5 叠加 | 被 +5 时可出 +5 叠加给下家（官方明确禁止，是最常见的加牌村规） |
| `flipStackWildDraw` | 万能罚摸叠加 | Wild Draw Two / Wild Draw Color 可参与叠加 |
| `flipEscalateOnly` | 仅可升级叠加 | 叠加时只能往更重的罚则升（+1 → +5 合法，+5 → +1 不合法） |
| `flipReverseDeflect` | Reverse 反弹罚摸 | 被罚摸时出 Reverse 把罚摸反弹给上家 |
| `flipSkipDeflect` | Skip 挡罚 | 被罚摸时出 Skip / Skip Everyone 把罚摸转移给下家 |
| `flipWildFlip` | Flip 万能出 | Flip 卡视为万能牌，可无视颜色随时打出（常见简化玩法） |
| `flipKeepColorOnFlip` | 翻面保留颜色 | 翻面后新顶牌为万能牌时，按亮暗对位表沿用原颜色，不进入选色（替代 §4.2 默认裁定） |
| `flipShowOwnBacks` | 背面透视 | 允许玩家看到自己手牌的背面，大幅降低难度（休闲向） |
| `flipDrawColorCap` | 摸色上限 | Wild Draw Color 最多摸 N 张（`number \| null`，默认 `null` 无上限），防止摸爆 |
| `flipDarkDoubleScore` | 暗面结算翻倍 | 在暗面结束的回合，赢家得分翻倍 |

`flipDrawColorCap` 是 `number | null`，需要在客户端 `RULE_EXTRAS` 中补 select 配置（`RoomPage.tsx` / `HouseRulesPanel.tsx`）。

预设：新增 `HOUSE_RULES_PRESETS.flipParty`（`flipStackDrawOne` + `flipStackDrawFive` + `flipWildFlip` + `drawUntilPlayable`）。

---

## 12. 风险清单

| 风险 | 影响 | 缓解 |
|------|------|------|
| 阶段 1 的 `Color` 扩展会让所有 `Record<Color, T>` 报错 | 改动面广 | 这是**好事**——编译器会穷举所有消费点，按报错清单逐个补全 |
| 翻面漏掉某个牌集合 | 状态腐坏，难排查 | 单一入口 `flipAll` + 不变量断言测试 |
| 自己手牌背面泄露 | 破坏核心玩法平衡 | §5.2 的裁剪 + 专项测试断言 |
| 机器人直读全量状态 = 作弊 | 公平性问题 | 阶段 5 为机器人加视图裁剪层 |
| `deckHash` 因翻面变化触发反作弊误报 | 玩家看到假警告 | §7.3 双面规范化身份 |
| 翻面动画引入持续重绘 | 移动端发热（已踩过一次） | 一次性 transform/opacity，动画结束清理 will-change |
| Flip 卡面资源缺失 | 显示异常 | 内置矢量渲染兜底，旧资源包优雅降级 |

---

## 13. 未决问题

1. **左右牌堆的亮暗面是纯视觉还是有机制含义？** 本文档按纯视觉设计（§6.2）。若期望「摸左堆得亮面牌、摸右堆得暗面牌」，需要重新设计双牌堆玩法（一侧摸完后游戏无法继续），请在评审时确认。
2. **牌的双面配对：随机 vs 固定？** 本文档采用随机配对（§4.1）。
3. **`bombCard` 是否在 Flip 下保留？** 本文档暂禁用，触发率差异待评估。
4. **首张弃牌为 Flip 时立即翻面 vs 放回重抽？** 本文档采用立即翻面（§4.6）。

---

## 参考

- [UNO FLIP 官方说明书（Mattel GDR44）](https://service.mattel.com/instruction_sheets/GDR44-English.pdf) — 牌组构成、卡牌效果、计分表的权威来源
- [UNO Flip Rules — UltraBoardGames](https://www.ultraboardgames.com/uno/flip-game-rules.php)
- [UNO Flip! — Wikipedia](https://en.wikipedia.org/wiki/Uno_Flip!)
- 本项目：[村规扩展指南](house-rules-extension-guide.md)、[前端开发规范](frontend-development-guide.md)、[后端开发规范](backend-development-guide.md)
