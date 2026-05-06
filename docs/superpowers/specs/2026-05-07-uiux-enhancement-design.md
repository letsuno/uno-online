# UNO Online — UIUX Enhancement Design Spec

**Date:** 2026-05-07
**Scope:** 7 core features + 4 enhancements for cross-device game experience

---

## 1. Round Table Layout (圆桌布局)

### Overview
Replace the current linear opponent row + separate player hand with a unified elliptical table where all players (including the current user) sit around a central draw/discard pile area.

### Layout Algorithm
- All players distributed along an ellipse using parametric equations:
  - `x = cx + rx * cos(angle)`
  - `y = cy + ry * sin(angle)`
- The current user is fixed at the bottom (angle = π/2 or 270°).
- Remaining players fill the rest of the ellipse evenly, starting from bottom-left going clockwise (or counter-clockwise depending on game direction).
- **Ellipse dimensions** adapt to viewport:
  - PC (≥768px): `rx = 40vw, ry = 35vh` (wide ellipse)
  - Mobile (<768px): `rx = 42vw, ry = 30vh` (narrower, flatter)
- Player count 2-10: angle spacing = `2π / playerCount`, with the current user always at the bottom anchor.

### Per-Player Node
Each player node on the ellipse displays:
1. **Avatar** (circular, 44px PC / 36px mobile) with background color from palette
2. **Username** below avatar (11px, truncated if >8 chars)
3. **Hand count** below name (10px, muted color)
4. **Last played card** — small card (18×26px) positioned to the right-bottom of the avatar, with bounce-in animation on play, fades out after 5 seconds
5. **Chat bubble** — appears above avatar (see Module 4)
6. **Countdown ring** (see Enhancement C below)

### Current Turn Indicator (Enhancement A)
- Active player's avatar gets an animated pulsing golden ring (`box-shadow` with `@keyframes` pulse animation cycling opacity 0.4→1.0 over 1.5s)
- Combined with the countdown ring for a unified visual

### Countdown Ring (Enhancement C)
- SVG `<circle>` with `stroke-dasharray` and `stroke-dashoffset` animated to show remaining time
- Rendered as an arc around the active player's avatar
- Color transitions: green (>50%) → yellow (25-50%) → red (<25%)
- Replaces the text-based TurnTimer in the top bar; the TopBar still shows the numeric seconds as a small label

### Direction Arrow
- Animated dashed arc path along the ellipse between players
- Uses SVG `<path>` with `stroke-dasharray` animation (CSS `@keyframes` moving `stroke-dashoffset`)
- Arrow direction reverses when game direction changes (framer-motion `animate` on the path)
- Semi-transparent golden color (#fbbf24 at 50% opacity)

### Component Structure
- **New:** `components/GameTable.tsx` — main container, calculates ellipse positions, renders PlayerNode components and direction arrows
- **New:** `components/PlayerNode.tsx` — individual player on the table (avatar, name, count, last card, bubble, countdown ring)
- **Modified:** `pages/GamePage.tsx` — replace `<OpponentRow>` + separate center area with `<GameTable>`
- **Removed (from game layout):** `OpponentRow.tsx` (functionality merged into GameTable), `DirectionIndicator.tsx` (replaced by ellipse direction arrows)

---

## 2. Card Visual Upgrade (卡牌视觉升级)

### Poker-Style Card Design
Redesign the Card component to show value/symbol in **top-left** and **bottom-right** (rotated 180°) corners, like a standard playing card:

```
┌──────────┐
│ +2  ♦    │
│          │
│   +2     │  ← center value (larger)
│          │
│    ♦  +2 │  ← bottom-right, rotated 180°
└──────────┘
```

- **Top-left corner:** small value (10px) + color symbol below it
- **Center:** main value (current font sizes per type)
- **Bottom-right corner:** same as top-left but `transform: rotate(180deg)`
- Wild cards: no corner symbols (keep center only)
- Yellow cards: dark text (#1a1a2e) for contrast

### Hand Fan Layout
Replace the current flat horizontal scroll with a fan arc:

- Cards rotate around a virtual center point below the screen
- Rotation angle per card: `(index - center) * spreadAngle`
- `spreadAngle` adapts to hand size:
  - ≤5 cards: 6° per card
  - 6-10 cards: 4° per card
  - 11+ cards: 3° per card (with horizontal scroll fallback on mobile)
- Playable cards float up (translateY -10px additional offset)
- Selected/hovered card pops up higher (translateY -24px, scale 1.1)

### Glowing Hand Bar
- Background: semi-transparent black (rgba(0,0,0,0.35)) with `rounded-t-2xl`
- Top border: 1px solid line in primary color at 15% opacity
- Radial gradient glow behind cards: golden color fading outward from center
- Hand count label centered above the bar: "我的手牌 · N张"

### Auto-Sort (Enhancement B)
- Cards sorted by: color group (red → blue → green → yellow → wild) → within color: number asc → skip → reverse → draw_two
- Visual gap (8px extra margin) between color groups
- Sorting happens client-side in the PlayerHand component, does not affect server state
- Sort is applied automatically; no toggle needed

### Component Changes
- **Modified:** `components/Card.tsx` — add top-left and bottom-right corner elements
- **Modified:** `components/PlayerHand.tsx` — fan layout calculation, auto-sort, glow bar styling
- **Modified:** `components/AnimatedCard.tsx` — updated hover/tap interactions for fan context

---

## 3. Last Played Card Display (出牌展示)

### Behavior
- When a player plays a card, a miniature version (18×26px) appears near their avatar on the table
- Position: offset right-bottom of the avatar center (+20px x, +10px y)
- Animation: spring bounce-in (scale 0→1.2→1, slight rotation)
- Persists for 5 seconds, then fades out (opacity 1→0 over 0.5s)
- New play replaces the old card immediately with fresh animation

### Data Source
- Track `lastAction` from game store; when it's a `PLAY_CARD` action, extract the card and player ID
- Store a map of `playerId → { card, timestamp }` in a local React state within GameTable
- Clear entries after 5 seconds via setTimeout

### Component
- Rendered inside `PlayerNode.tsx` as a positioned mini `<Card>` component with reduced dimensions via className overrides

---

## 4. Chat Bubbles + Quick Reactions (聊天气泡 + 快捷表情)

### Chat Bubble
- When a `chat:message` event arrives, display the message text in a speech bubble above the sender's avatar on the table
- Bubble style: `bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5`, with a triangular pointer below pointing to the avatar
- Max width: 160px, text truncated with ellipsis if >2 lines
- Auto-dismiss: fade out after 3 seconds
- Multiple messages: new message replaces old one (no queue/stack)
- Emoji-only messages: displayed at larger font size (20px vs 12px)

### Quick Emoji Reactions (Enhancement D)
- **Trigger:** Double-click (PC) / double-tap (mobile) on an opponent's avatar
- **UI:** A small radial menu appears around the avatar with 6 emoji options: 👍 😂 😭 🎉 💪 😱
- Menu auto-closes after 3 seconds or on selection
- **Animation:** Selected emoji floats up from the target avatar (translateY -40px, opacity 1→0, scale 1→1.5) over 1 second
- **Socket event:** Reuse `chat:message` with the emoji as text — the bubble display logic handles it

### Backend Chat Rate Limiting
- **New middleware** in socket-handler.ts for `chat:message` events specifically
- Limit: 2 messages per 5 seconds per user
- Implementation: per-userId sliding window counter
- When exceeded: emit `chat:rate_limited` back to sender with message "发言太快，请稍后再试"
- Does not count against the general 20msg/s socket rate limiter

---

## 5. Throw Items (扔物品)

### Available Items
6 throwable items: 🥚 鸡蛋, 🍅 番茄, 🌹 玫瑰, 💩 便便, 👍 点赞, 💖 爱心

### Trigger Flow
1. Player long-presses (mobile) or right-clicks (PC) on an opponent's avatar on the table (single-click is reserved for quick reactions, double-click for emoji reactions)
2. A popover panel appears near the avatar showing the 6 items in a row
3. Player clicks an item
4. Client emits `throw:item` event: `{ targetId: string, item: string }`
5. Server validates (rate limit check), then broadcasts `throw:item` to all players in the room: `{ fromId, targetId, item }`
6. All clients animate the throw

### Throw Animation (Bezier Curve from Bottom)
- **Start point:** Current user's avatar position (always at the bottom of the ellipse)
- **End point:** Target player's avatar position on the ellipse
- **Control point:** Midpoint of start/end, offset upward by `-(distance * 0.4)` to create an arc
- Use framer-motion `animate` with custom `transition` or a manual `requestAnimationFrame` loop updating position along the quadratic Bezier curve: `B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂`
- Duration: 600ms, ease-out
- The emoji item (font-size 32px) rotates slightly during flight (0→360° for eggs/tomatoes, no rotation for hearts/thumbs)

### Impact Effect
- On arrival: item scales up briefly (1→1.3→0) with 4-6 small particles bursting outward
- Particles: small colored circles matching the item theme (red for tomato, yellow for egg, pink for hearts)
- Particles fade out over 500ms

### Rate Limiting
- Server-side: 1 throw per 10 seconds per user
- When exceeded: callback with `{ success: false, error: '扔太快了' }`

### Socket Events (New)
- Client → Server: `throw:item` `{ targetId: string, item: string }`
- Server → Client: `throw:item` `{ fromId: string, targetId: string, item: string }`

### Components
- **New:** `components/ThrowItemPicker.tsx` — popover panel with 6 emoji buttons
- **New:** `components/ThrowAnimation.tsx` — Bezier curve flight + impact particles, rendered in a fixed overlay
- **Modified:** `PlayerNode.tsx` — long-press/right-click opens ThrowItemPicker for opponent nodes; double-click opens QuickReaction

---

## 6. House Rules Info Card (村规介绍卡)

### Content
- Only shows rules that are **enabled** (non-default) in the current game's houseRules
- Each rule entry displays:
  1. Rule name (bold, 12px)
  2. Rule description (muted, 10px)
  3. **Teaching illustration**: miniature card renderings showing the rule's mechanic
    - Example for "+2 叠加": `[red +2] → [blue +2] → "下家摸4张"`
    - Example for "7 牌交换": `[green 7] ⇄ "交换手牌"`
    - Example for "Reverse 反弹 +2": `[red +2] → [blue ⟲] ↩ "反弹!"`
- Left border: 3px solid colored line, **no border-radius** (square corners)
- Border colors cycle through: #fbbf24, #33cc66, #4488ff, #ff3366, #a855f7

### PC Layout
- Fixed position: bottom-left corner (`fixed left-4 bottom-24`)
- Max width: 280px, max height: 60vh with overflow-y scroll
- Header: "📋 本局村规" with collapse/expand toggle button
- Default: expanded on game start, user can collapse
- Collapsed state: only shows the header bar with "展开 ▲" button

### Mobile Layout
- Default: hidden
- Accessed via floating action button (📋) in the mobile FAB group
- Opens as a bottom sheet / drawer (slide up from bottom, 70vh max height)

### Data Source
- Read `settings.houseRules` from game store
- Compare each key against `DEFAULT_HOUSE_RULES` to determine which are non-default
- Teaching illustrations are static mappings defined in the component (a `Record<keyof HouseRules, TeachingConfig>`)

### Components
- **New:** `components/HouseRulesCard.tsx` — the info card panel with teaching illustrations
- **New:** `components/RuleTeaching.tsx` — renders miniature card illustrations for a specific rule

---

## 7. Game Log / Diary (游戏日记)

### Tracked Events
Record these action types from `game:update` / `game:state` events:

| Action | Log Format |
|--------|-----------|
| PLAY_CARD (skip) | `{player} [skip card] 跳过 → {target}` |
| PLAY_CARD (reverse) | `{player} [reverse card] 反转方向` |
| PLAY_CARD (draw_two) | `{player} [+2 card] → {target}` |
| PLAY_CARD (wild_draw_four) | `{player} [+4 card] → {target} 选{color}` |
| PLAY_CARD (wild) | `{player} [wild card] 选{color}` |
| CATCH_UNO | `{target} 🚨 忘喊UNO! 被 {catcher} 抓住 +{penalty}` |
| CHALLENGE (success) | `{player} 质疑成功! {target} 摸4张` |
| CHALLENGE (fail) | `{player} 质疑失败! 摸6张` |
| Stack (draw_two on draw_two) | `{player} [+2] 叠加 → {target} (+{total})` |

### Entry Display
- Timestamp (HH:MM format, muted, 9px, fixed width 32px)
- Player names in their assigned colors (from avatar color palette)
- Miniature card icons (16×22px) inline
- Special events (UNO catch, challenge) get a red-tinted background with border

### PC Layout
- Fixed position: bottom-right corner (`fixed right-4 bottom-24`)
- Max width: 280px, max height: 60vh with overflow-y scroll (auto-scroll to newest)
- Header: "📖 游戏日记" with round number

### Mobile Layout
- Default: hidden
- Accessed via floating action button (📖) in the mobile FAB group
- Opens as a bottom sheet (same pattern as house rules card)

### Data Source
- Client-side accumulation: listen to `lastAction` changes in game store
- Build a local array of log entries in a new Zustand store or React context
- Each entry: `{ id, timestamp, type, playerId, targetId?, card?, extra? }`
- Reset on new round or new game

### Components
- **New:** `components/GameLog.tsx` — the diary panel
- **New:** `components/GameLogEntry.tsx` — individual log entry renderer
- **New:** `stores/game-log-store.ts` — Zustand store for accumulating log entries

---

## 8. Mobile Floating Action Buttons (移动端浮动按钮)

### Layout
- Visible only on mobile (<768px)
- Position: fixed, right side, vertically centered or bottom-right
- 3 circular buttons stacked vertically with 8px gap:
  - 📋 House Rules Card
  - 📖 Game Log
  - 💬 Chat
- Style: 40×40px, rounded-full, bg-black/40, border border-white/20
- Active state: bg-primary/30, border-primary

### Behavior
- Tapping a button toggles its panel as a bottom sheet overlay
- Only one panel open at a time (opening one closes the other)
- Bottom sheet: slides up from bottom, 70vh max, with drag-to-close handle
- Backdrop: semi-transparent overlay, tap to close

### Component
- **New:** `components/MobileFAB.tsx` — floating action button group
- **New:** `components/BottomSheet.tsx` — reusable bottom sheet container

---

## 9. Backend Changes Summary

### New Socket Events
| Event | Direction | Payload |
|-------|-----------|---------|
| `throw:item` | Client → Server | `{ targetId: string, item: string }` |
| `throw:item` | Server → Client (broadcast) | `{ fromId: string, targetId: string, item: string }` |
| `chat:rate_limited` | Server → Client | `{ message: string }` |

### New Rate Limiters
1. **Chat rate limiter:** 2 messages per 5 seconds per userId (separate from socket rate limiter)
2. **Throw rate limiter:** 1 throw per 10 seconds per userId

### Implementation Location
- Add throw event handler in `ws/game-events.ts` or new `ws/interaction-events.ts`
- Add chat-specific rate limiter in `ws/socket-handler.ts` as middleware for `chat:message`
- Add throw rate limiter inline in the throw handler

---

## 10. Files to Create / Modify

### New Files (Client)
- `components/GameTable.tsx` — elliptical table layout
- `components/PlayerNode.tsx` — individual player on the table
- `components/CountdownRing.tsx` — SVG countdown arc
- `components/ThrowItemPicker.tsx` — item selection popover
- `components/ThrowAnimation.tsx` — Bezier flight + impact
- `components/HouseRulesCard.tsx` — rules info panel with teaching
- `components/RuleTeaching.tsx` — miniature card teaching illustrations
- `components/GameLog.tsx` — game diary panel
- `components/GameLogEntry.tsx` — individual log entry
- `components/ChatBubble.tsx` — speech bubble above avatar
- `components/QuickReaction.tsx` — emoji radial menu + float animation
- `components/MobileFAB.tsx` — mobile floating action buttons
- `components/BottomSheet.tsx` — reusable bottom sheet
- `stores/game-log-store.ts` — log entry accumulation

### New Files (Server)
- `ws/interaction-events.ts` — throw item handler + rate limiting

### Modified Files (Client)
- `components/Card.tsx` — poker-style corners
- `components/PlayerHand.tsx` — fan layout, auto-sort, glow bar
- `components/AnimatedCard.tsx` — updated for fan context
- `components/TopBar.tsx` — remove TurnTimer (moved to countdown ring)
- `components/ChatBox.tsx` — integrate with bubble display, rate limit feedback
- `pages/GamePage.tsx` — integrate GameTable, new panels, mobile FAB

### Modified Files (Server)
- `ws/socket-handler.ts` — register interaction events, add chat rate limiter
- `ws/game-events.ts` — emit enriched lastAction data for game log

### Removed Components
- `components/OpponentRow.tsx` — merged into GameTable/PlayerNode
- `components/DirectionIndicator.tsx` — replaced by ellipse direction arrows
- `components/TurnTimer.tsx` — replaced by CountdownRing on avatar
