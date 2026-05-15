# UIUX Guidelines

Design system and UI/UX standards for UNO Online.

---

## 1. TailwindCSS Usage Rules

### Token-First Tailwind

Prefer named theme tokens for reusable values, design-system colors, z-indexes, card sizes, shadows, radii, and repeated layout dimensions. Arbitrary bracket syntax `[...]` is allowed for isolated one-off values or CSS features that Tailwind does not expose cleanly, but do not hard-code colors, z-indexes, or repeated dimensions when an existing token fits.

```diff
- className="text-[#ff3366] z-[100] w-[52px]"
+ className="text-uno-red z-modal w-card-w"
```

If a value appears in more than one component, add a token to the theme before reusing it.

### Adding New Tokens

Add tokens to `@theme inline` in `packages/client/src/index.css`, following the namespace convention:

| CSS Custom Property Namespace | Tailwind Utility Prefix | Example |
|-------------------------------|------------------------|---------|
| `--spacing-*` | `w-*`, `h-*`, `p-*`, `m-*`, `gap-*` | `--spacing-card-w: 60px` -> `w-card-w` |
| `--font-size-*` | `text-*` | `--font-size-card-number: 1.5rem` -> `text-card-number` |
| `--shadow-*` | `shadow-*` | `--shadow-card: 3px 4px ...` -> `shadow-card` |
| `--radius-*` | `rounded-*` | `--radius-card: 0.5rem` -> `rounded-card` |
| `--z-index-*` | `z-*` | `--z-index-modal: 100` -> `z-modal` |
| `--color-*` | `bg-*`, `text-*`, `border-*` | `--color-uno-red: #ff3366` -> `bg-uno-red` |
| `--animate-*` | `animate-*` | `--animate-shake: shake 0.3s` -> `animate-shake` |
| `--font-*` (family) | `font-*` | `--font-game: 'Comic Sans MS', ...` -> `font-game` |

### Conditional Class Merging

Always use `cn()` for conditional class merging. In the client app import it from `@/shared/lib/utils`; in the admin app import it from `@/lib/utils`.

```tsx
import { cn } from "@/shared/lib/utils";

<div className={cn(
  "rounded-lg p-4 bg-card",
  isActive && "shadow-glow-active",
  isDisabled && "opacity-50 pointer-events-none"
)} />
```

### Component Variants with CVA

Use `class-variance-authority` (CVA) for components with multiple variants:

```tsx
import { cva } from "class-variance-authority";

const buttonVariants = cva("rounded-lg font-game transition-colors", {
  variants: {
    variant: {
      primary: "bg-primary text-primary-foreground hover:opacity-90",
      danger: "bg-destructive text-destructive-foreground",
      secondary: "bg-secondary text-secondary-foreground",
      ghost: "bg-transparent text-foreground hover:bg-white/10",
      outline: "bg-transparent text-primary border-2 border-primary/50",
      game: "bg-primary text-primary-foreground font-game",
    },
    size: {
      sm: "px-3 py-1 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});
```

### Custom Utility Classes

Use the `@utility` directive for custom utility classes:

```css
@utility font-game {
  font-family: var(--font-game);
}
```

---

## 2. Color System Reference

### UNO Card Colors

| Token | Value | Usage | Tailwind Class |
|-------|-------|-------|----------------|
| `uno-red` | `#ff3366` | Red cards | `bg-uno-red`, `text-uno-red`, `border-uno-red` |
| `uno-blue` | `#4488ff` | Blue cards | `bg-uno-blue`, `text-uno-blue`, `border-uno-blue` |
| `uno-green` | `#33cc66` | Green cards | `bg-uno-green`, `text-uno-green`, `border-uno-green` |
| `uno-yellow` | `#fbbf24` | Yellow cards | `bg-uno-yellow`, `text-uno-yellow`, `border-uno-yellow` |

### Semantic UI Colors

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#1a1a2e` | Main app background |
| `card` | `#16213e` | Card/panel surfaces |
| `muted` | `#0f3460` | Secondary surfaces |
| `primary` | `#fbbf24` | Accent/highlight (golden) |
| `destructive` | `#ff3366` | Danger actions |
| `foreground` | `#e2e8f0` | Primary text |
| `muted-foreground` | `#94a3b8` | Secondary text |

### Feedback Colors

| Token | Value | Usage |
|-------|-------|-------|
| `toast-info` | `rgba(59,130,246,0.9)` | Info notifications |
| `toast-error` | `rgba(239,68,68,0.9)` | Error notifications |
| `toast-success` | `rgba(34,197,94,0.9)` | Success notifications |
| `effect-skip` | `#ff6b6b` | Skip card effect |
| `error-text` | `#ef4444` | Error labels |
| `speaking` | `#22c55e` | Voice speaking indicator |

### Voice Panel Colors

| Token | Usage |
|-------|-------|
| `voice-active` | Active voice panel background |
| `voice-active-border` | Active voice panel border |
| `voice-inactive` | Inactive voice panel background |
| `voice-inactive-border` | Inactive voice panel border |
| `voice-leave` | Leave voice button background |
| `voice-leave-border` | Leave voice button border |

### Avatar Palette (9 colors)

| Token | Usage |
|-------|-------|
| `avatar-1` through `avatar-9` | Player avatar background colors, assigned by join order |

---

## 3. Typography

### Font Families

| Token | Stack | Usage |
|-------|-------|-------|
| `font-game` | `'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive, sans-serif` | Game text: card values, headings, effect labels, buttons |
| `font-ui` (default) | `system-ui, -apple-system, sans-serif` | Interface elements: inputs, body text, labels |

### Named Size Tokens

| Token | Usage |
|-------|-------|
| `text-2xs` | Tiny labels |
| `text-xs` | Small secondary text |
| `text-sm` | Compact UI text |
| `text-caption` | Captions, timestamps |
| `text-base` | Default body text |
| `text-lg` | Emphasized text |
| `text-xl` | Sub-headings |
| `text-heading-lg` | Section headings |
| `text-heading-xl` | Page headings |

### Card-Specific Sizes

| Token | Usage |
|-------|-------|
| `text-card-number` | Number card values |
| `text-card-symbol` | Action card symbols (skip, reverse) |
| `text-card-draw` | Draw card values (+2) |
| `text-card-wild` | Wild card text |
| `text-card-wild4` | Wild Draw Four text |

---

## 4. Spacing & Sizing

### Card Dimensions

| Token | Size | Context |
|-------|------|---------|
| `card-w` / `card-h` | 52 x 76px | Default mobile card size |
| `card-w-md` / `card-h-md` | 70 x 100px | Desktop card size via `md:` prefix |
| `card-mini-w` / `card-mini-h` | 22 x 32px | Last-played card on player node |
| `card-log-w` / `card-log-h` | 20 x 28px | Inline card icons in game log |
| `card-sm-w` / `card-sm-h` | 28 x 40px | Compact card previews |

### Standard Padding

Use Tailwind's built-in spacing scale for padding and margin:

| Class | Value | Common Use |
|-------|-------|------------|
| `p-1` | 4px | Tight inner spacing |
| `p-2` | 8px | Compact padding |
| `p-3` | 12px | Default card/button padding |
| `p-4` | 16px | Standard section padding |
| `p-6` | 24px | Generous panel padding |
| `p-8` | 32px | Large section padding |
| `p-10` | 40px | Page-level spacing |

---

## 5. Shadow System

| Token | Usage |
|-------|-------|
| `shadow-card` | Standard card/button drop shadow |
| `shadow-card-sm` | Smaller shadow for compact elements |
| `shadow-card-playable` | Golden glow for playable cards |
| `shadow-glow-active` | Active player avatar glow |
| `shadow-draw-ready` | Pulsing glow on draw pile when it's your turn |
| `shadow-toast` | Notification toast shadow |

---

## 6. Z-Index Scale

| Layer | Token | Value | Usage |
|-------|-------|-------|-------|
| Base | `z-card` | 1 | Cards on table |
| TopBar | `z-topbar` | 10 | Game header bar |
| Actions | `z-actions` | 20 | Game action buttons |
| FAB | `z-fab` | 50 | Mobile floating action buttons |
| Confetti | `z-confetti` | 85 | Victory confetti particles |
| Effects | `z-effects` | 90 | Game effect text (skip, reverse, etc.) |
| Timer | `z-timer-overlay` | 95 | Countdown overlay |
| Modal | `z-modal` | 100 | Dialogs, score board, color picker |
| Connection | `z-connection` | 200 | Reconnection overlay |
| Toast | `z-toast` | 300 | Notifications (topmost) |

---

## 7. Responsive Design

### Breakpoint

A single breakpoint is used:

| Prefix | Min Width | Target |
|--------|-----------|--------|
| (none) | 0px | Mobile (default) |
| `md:` | 768px | Desktop |

### Mobile-First Approach

All styles are written mobile-first. Desktop overrides use the `md:` prefix:

```tsx
<div className="p-2 text-sm md:p-4 md:text-base" />
<Card className="w-card-w h-card-h md:w-card-w-md md:h-card-h-md" />
```

### Game Table Adaptation

The elliptical game table adapts its dimensions based on viewport:

- **Desktop** (>=768px): `rx = 40vw`, `ry = 35vh` (wide ellipse)
- **Mobile** (<768px): `rx = 42vw`, `ry = 30vh` (narrower, flatter)

---

## 8. Animation Guidelines

### Technology Choice

| Animation Type | Technology | When to Use |
|----------------|-----------|-------------|
| Enter/exit transitions | framer-motion | Component mount/unmount, layout changes |
| Interactive animations | framer-motion | Drag, hover, tap, gestures |
| Repeating/looping animations | CSS `@keyframes` + `animate-*` tokens | Pulsing glows, spinning, shaking |
| Scroll-linked animations | CSS or framer-motion `useScroll` | Parallax, scroll-triggered reveals |

### Spring Animation Defaults

```tsx
// Standard interactive spring
transition={{ type: "spring", stiffness: 300, damping: 25 }}

// Snappy spring (cards, buttons)
transition={{ type: "spring", stiffness: 400, damping: 20 }}
```

### Duration Limits

| Category | Duration | Example |
|----------|----------|---------|
| Entrance | 200-400ms | Card fan-in, panel slide-up |
| Exit | 150-300ms | Panel close, card discard |
| Effects | 500-1500ms | Skip effect, reverse animation, throw impact |
| Looping | 1000-2000ms per cycle | Active player glow, draw pile pulse |

### Reduced Motion

Always respect `prefers-reduced-motion`:

```tsx
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

<motion.div
  animate={{ scale: prefersReducedMotion ? 1 : [1, 1.1, 1] }}
  transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
/>
```

### Existing CSS Keyframes

| Animation | Usage |
|-----------|-------|
| `shake` | Error shake on invalid card play |
| `timerFlash` | Timer flash when time is low |
| `spin` | Loading spinner |
| `drawReadyPulse` | Draw pile golden glow pulse |

---

## 9. Component Patterns

### Conditional Classes with `cn()`

All components must use `cn()` for conditional className merging:

```tsx
import { cn } from "@/shared/lib/utils";

function Card({ color, isPlayable, className }: CardProps) {
  return (
    <div className={cn(
      "rounded-lg shadow-card font-game",
      color === "red" && "bg-uno-red",
      color === "blue" && "bg-uno-blue",
      isPlayable && "shadow-card-playable cursor-pointer",
      className
    )} />
  );
}
```

### Button Component (CVA)

Use the CVA `Button` component for all buttons. Available variants:

| Variant | Usage |
|---------|-------|
| `primary` | Main actions (play card, start game, confirm) |
| `danger` | Destructive actions (leave room, cancel) |
| `secondary` | Secondary actions (toggle panels, settings) |
| `ghost` | Low-emphasis inline actions |
| `outline` | Secondary outlined actions |
| `game` | Prominent game-themed actions |

### Card Component

The `Card` component accepts a `className` prop for size overrides:

```tsx
// Standard size (uses default card-w/card-h)
<Card card={card} />

// Mini card for player node last-played display
<Card card={card} className="w-card-mini-w h-card-mini-h" />

// Log card for game diary inline display
<Card card={card} className="w-card-log-w h-card-log-h" />
```

### Interactive State Requirements

All interactive elements must have:

- **Hover state** (`hover:`) - visual feedback on mouse over
- **Active state** (`active:`) - pressed/clicked feedback
- **Focus state** (`focus-visible:`) - keyboard navigation indicator

### Fixed Position Panels

Panels (game log, house rules) use fixed positioning with z-index tokens:

```tsx
// PC: fixed bottom-left panel
<div className="fixed left-4 bottom-24 z-fab w-70 max-h-[60vh] overflow-y-auto">

// PC: fixed bottom-right panel
<div className="fixed right-4 bottom-24 z-fab w-70 max-h-[60vh] overflow-y-auto">
```

---

## 10. Accessibility

### Color-Blind Mode

A color-blind mode toggle exists in the game settings. When enabled:

- Cards display pattern overlays (stripes, dots, crosshatch, diamonds) in addition to color
- Patterns provide a secondary visual channel to distinguish card colors

### Touch Targets

| Context | Minimum Size |
|---------|-------------|
| Mobile | 36 x 36px |
| Desktop | 32 x 32px |

### Keyboard Accessibility

- All interactive elements must be reachable via Tab key
- Buttons, links, and controls must use native semantic HTML elements (`<button>`, `<a>`, `<input>`)
- Do not use `<div>` or `<span>` as interactive elements
- Custom interactive components must include `tabIndex`, `role`, and keyboard event handlers

### Screen Reader Support

- Icon-only buttons must have a `title` or `aria-label` attribute:

```tsx
<button aria-label="Open game log" title="Open game log">
  <BookIcon />
</button>
```

- Game state changes should be announced via `aria-live` regions where appropriate
- Card descriptions should be readable (e.g., "Red Skip", "Blue 7", "Wild Draw Four")

### Semantic HTML

Prefer semantic elements over generic containers:

| Instead of | Use |
|-----------|-----|
| `<div onClick>` | `<button>` |
| `<div>` for sections | `<section>`, `<aside>`, `<nav>` |
| `<span>` for links | `<a>` |
| `<div>` for lists | `<ul>`, `<ol>` |
