# Cue Console Design System

**Product Type:** Developer Tool / Collaboration Console / Messaging SaaS  
**Industry:** Developer Tools, AI Collaboration  
**Style:** Professional, Modern, Glassmorphism with Dark Mode Support  
**Stack:** Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui

---

## Design Pattern

**Primary Pattern:** Glassmorphism with Professional Developer Aesthetic

This design system prioritizes:
- **Clarity & Focus:** Clean interfaces that reduce cognitive load for developers
- **Professional Polish:** Subtle glassmorphism effects without being distracting
- **Performance:** Optimized animations and transitions
- **Accessibility:** WCAG 2.1 AA compliance minimum

---

## Style Guidelines

### Visual Style: Modern Glassmorphism

**Core Characteristics:**
- Frosted glass surfaces with subtle blur effects
- Soft shadows and depth layers
- Minimal borders with transparency
- Gradient backgrounds for ambient atmosphere
- High contrast text for readability

**Implementation:**
```css
/* Light Mode Glass */
--glass-bg: rgb(255 255 255 / 0.72);
--glass-bg-soft: rgb(255 255 255 / 0.80);
--glass-bg-opaque: rgb(255 255 255 / 0.88);
--glass-border: rgb(255 255 255 / 0.55);
--glass-blur: 20px;

/* Dark Mode Glass */
--glass-bg: rgb(12 18 32 / 0.55);
--glass-bg-soft: rgb(12 18 32 / 0.62);
--glass-bg-opaque: rgb(12 18 32 / 0.72);
--glass-border: rgb(255 255 255 / 0.08);
--glass-blur: 22px;
```

---

## Color Palette

### Primary Colors

**Light Mode:**
- Background: `#F7F8FB` (Soft cool gray)
- Foreground: `#0B1220` (Deep navy, high contrast)
- Card: `#FFFFFF` (Pure white)
- Muted Text: `#475569` (slate-600, minimum for readability)

**Dark Mode:**
- Background: `oklch(0.165 0.01 258)` (Deep blue-tinted dark)
- Foreground: `oklch(0.975 0.01 258)` (Near white)
- Card: `oklch(0.22 0.01 258)` (Elevated dark surface)
- Muted Text: `oklch(0.74 0.01 258)` (Light gray)

### Accent Colors

**Interactive Elements:**
- Primary: `#0B1220` (Dark) / `oklch(0.93 0.01 258)` (Light in dark mode)
- Ring/Focus: `rgb(37 99 235 / 0.28)` (Blue with transparency)
- Destructive: `oklch(0.577 0.245 27.325)` (Red)

**Backdrop Gradients:**
- Ice: `rgb(56 189 248 / 0.16)` (Cyan accent)
- Foam: `rgb(99 102 241 / 0.10)` (Indigo accent)
- Ink: `rgb(11 18 32 / 0.05)` (Subtle depth)

### Contrast Requirements

**CRITICAL - Accessibility:**
- Normal text: Minimum 4.5:1 contrast ratio
- Large text (18px+): Minimum 3:1 contrast ratio
- Interactive elements: Minimum 3:1 against background
- Focus indicators: Minimum 3:1 contrast

**Light Mode Text Hierarchy:**
- Primary text: `#0F172A` (slate-900) - 15.8:1 contrast
- Secondary text: `#475569` (slate-600) - 7.2:1 contrast
- Muted text: `#64748B` (slate-500) - 5.1:1 contrast (minimum)

**Dark Mode Text Hierarchy:**
- Primary text: `oklch(0.975 0.01 258)` - 18.2:1 contrast
- Secondary text: `oklch(0.74 0.01 258)` - 8.1:1 contrast
- Muted text: `oklch(0.65 0.01 258)` - 5.2:1 contrast (minimum)

---

## Typography

### Font Stack

**Primary Font:** Source Sans 3 Variable
- **Rationale:** Professional, highly readable, excellent for UI and code
- **Weights:** 300 (Light), 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)
- **Fallback:** ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont

**Monospace Font:** SF Mono, Menlo, Monaco, Consolas
- **Use:** Code snippets, technical data, timestamps

### Type Scale

```css
/* Headings */
h1: 2rem (32px) / font-weight: 700 / line-height: 1.2
h2: 1.5rem (24px) / font-weight: 600 / line-height: 1.3
h3: 1.25rem (20px) / font-weight: 600 / line-height: 1.4
h4: 1.125rem (18px) / font-weight: 600 / line-height: 1.4

/* Body */
body: 1rem (16px) / font-weight: 400 / line-height: 1.5
small: 0.875rem (14px) / font-weight: 400 / line-height: 1.5
xs: 0.75rem (12px) / font-weight: 400 / line-height: 1.4
```

### Line Height Rules

- Body text: 1.5-1.75 (optimal readability)
- Headings: 1.2-1.4 (tighter for impact)
- Code blocks: 1.6 (breathing room for monospace)
- UI labels: 1.4 (compact but readable)

### Line Length

- Optimal: 65-75 characters per line
- Maximum: 80 characters for body text
- Chat messages: No hard limit (natural conversation flow)

---

## Spacing System

### Base Scale (Tailwind)

```
0.25rem (4px)  → spacing-1
0.5rem (8px)   → spacing-2
0.75rem (12px) → spacing-3
1rem (16px)    → spacing-4
1.5rem (24px)  → spacing-6
2rem (32px)    → spacing-8
3rem (48px)    → spacing-12
4rem (64px)    → spacing-16
```

### Component Spacing Guidelines

**Cards & Containers:**
- Padding: `p-4` (16px) minimum, `p-6` (24px) for larger cards
- Gap between cards: `gap-3` (12px) or `gap-4` (16px)

**Lists:**
- Item padding: `py-2 px-3` (8px vertical, 12px horizontal)
- Gap between items: `gap-1` (4px) or `gap-2` (8px)

**Forms:**
- Label margin: `mb-2` (8px)
- Input padding: `px-3 py-2` (12px horizontal, 8px vertical)
- Form field gap: `gap-4` (16px)

**Layout:**
- Section margins: `my-8` (32px) or `my-12` (48px)
- Content max-width: `max-w-6xl` or `max-w-7xl`

---

## Border Radius

### Radius Scale

```css
--radius: 0.625rem (10px) /* Base radius */
--radius-sm: 6px
--radius-md: 8px
--radius-lg: 10px
--radius-xl: 14px
--radius-2xl: 18px
--radius-3xl: 22px
--radius-4xl: 26px
```

### Usage Guidelines

- Buttons: `rounded-lg` (10px)
- Cards: `rounded-xl` (14px) or `rounded-2xl` (18px)
- Inputs: `rounded-lg` (10px)
- Modals: `rounded-2xl` (18px)
- Avatars: `rounded-full` (circle)
- Small badges: `rounded-md` (8px)

---

## Effects & Shadows

### Shadow System

**Light Mode:**
```css
/* Glass shadows */
--glass-shadow: 0 18px 44px rgb(11 18 32 / 0.10);
--glass-shadow-soft: 0 14px 36px rgb(11 18 32 / 0.09);

/* Component shadows */
sm: 0 1px 2px rgb(0 0 0 / 0.05)
md: 0 4px 6px rgb(0 0 0 / 0.07)
lg: 0 10px 15px rgb(0 0 0 / 0.10)
xl: 0 20px 25px rgb(0 0 0 / 0.12)
```

**Dark Mode:**
```css
--glass-shadow: 0 22px 60px rgb(0 0 0 / 0.42);
--glass-shadow-soft: 0 18px 48px rgb(0 0 0 / 0.34);
```

### Blur Effects

- Glass surfaces: `blur(20px)` light / `blur(22px)` dark
- Backdrop overlays: `blur(8px)`
- Focus blur: `blur(4px)` for subtle depth

### Inset Highlights

```css
/* Glass inset (light mode) */
inset 0 1px 0 rgb(255 255 255 / 0.78),
inset 0 0 0 1px rgb(255 255 255 / 0.22)

/* Glass inset (dark mode) */
inset 0 1px 0 rgb(255 255 255 / 0.06),
inset 0 0 0 1px rgb(255 255 255 / 0.05)
```

---

## Animation & Transitions

### Duration Guidelines

- **Micro-interactions:** 150ms (hover, focus)
- **Standard transitions:** 200-250ms (state changes)
- **Complex animations:** 300-400ms (modals, slides)
- **Page transitions:** 400-500ms (route changes)

### Timing Functions

```css
/* Standard easing */
ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)

/* Smooth entrance */
ease-out: cubic-bezier(0, 0, 0.2, 1)

/* Quick exit */
ease-in: cubic-bezier(0.4, 0, 1, 1)

/* Bouncy (use sparingly) */
spring: cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

### Performance Rules

**CRITICAL:**
- Use `transform` and `opacity` only (GPU-accelerated)
- Avoid animating `width`, `height`, `margin`, `padding`
- Use `will-change` sparingly and remove after animation
- Check `prefers-reduced-motion` media query

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Common Transitions

```tsx
// Hover states
className="transition-colors duration-200 hover:bg-accent"

// Scale on press (buttons)
className="transition-transform duration-150 active:scale-95"

// Fade in/out
className="transition-opacity duration-300"

// Slide animations
className="transition-transform duration-300 ease-out"
```

---

## Interaction Patterns

### Touch Targets

**CRITICAL - Accessibility:**
- Minimum size: 44x44px (iOS/Android guidelines)
- Recommended: 48x48px for primary actions
- Spacing between targets: Minimum 8px

### Hover States

**All interactive elements must have hover feedback:**
```tsx
// Cards
className="hover:bg-accent/50 cursor-pointer transition-colors"

// Buttons
className="hover:bg-primary/90 transition-colors"

// Links
className="hover:underline hover:text-primary"
```

**IMPORTANT:** Never use `hover:scale-*` on cards or large elements (causes layout shift)

### Focus States

**CRITICAL - Accessibility:**
```tsx
// Visible focus ring
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// Custom focus styles
className="focus:ring-2 focus:ring-primary/50 focus:border-primary"
```

### Loading States

**Button loading:**
```tsx
<Button disabled={loading}>
  {loading ? <Spinner /> : "Submit"}
</Button>
```

**Skeleton screens:**
- Use for content that takes >300ms to load
- Match layout structure of actual content
- Animate with pulse or shimmer effect

### Error Feedback

**Inline errors:**
- Display near the problem (below form field)
- Use destructive color with icon
- Clear, actionable message

```tsx
{error && (
  <p className="text-sm text-destructive mt-1 flex items-center gap-1">
    <AlertCircle className="h-4 w-4" />
    {error}
  </p>
)}
```

---

## Layout Guidelines

### Responsive Breakpoints

```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### Mobile-First Approach

**Always design for mobile first, then enhance:**
```tsx
// Mobile: Stack vertically
// Desktop: Side by side
<div className="flex flex-col md:flex-row gap-4">
```

### Container Widths

- Full-width app: `w-full`
- Content container: `max-w-6xl mx-auto px-4`
- Reading content: `max-w-3xl mx-auto`
- Narrow forms: `max-w-md mx-auto`

### Z-Index Scale

**Defined hierarchy (avoid random values):**
```css
z-0: 0      /* Base layer */
z-10: 10    /* Elevated content */
z-20: 20    /* Dropdowns, popovers */
z-30: 30    /* Sticky headers */
z-40: 40    /* Fixed navigation */
z-50: 50    /* Modals, overlays */
```

---

## Component Patterns

### Buttons

**Primary Button:**
```tsx
<Button 
  className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
>
  Primary Action
</Button>
```

**Secondary Button:**
```tsx
<Button 
  variant="outline"
  className="border-border hover:bg-accent transition-colors"
>
  Secondary Action
</Button>
```

**Icon Button:**
```tsx
<Button 
  size="icon"
  variant="ghost"
  className="h-10 w-10 rounded-lg hover:bg-accent transition-colors"
  aria-label="Close"
>
  <X className="h-5 w-5" />
</Button>
```

### Cards

**Glass Card:**
```tsx
<div className="glass-surface rounded-2xl p-6">
  {/* Content */}
</div>
```

**Interactive Card:**
```tsx
<div className="glass-surface rounded-2xl p-4 hover:bg-accent/30 cursor-pointer transition-colors">
  {/* Content */}
</div>
```

### Forms

**Input Field:**
```tsx
<div className="space-y-2">
  <label htmlFor="email" className="text-sm font-medium">
    Email
  </label>
  <input
    id="email"
    type="email"
    className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
    placeholder="you@example.com"
  />
</div>
```

### Modals

**Dialog Pattern:**
```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="glass-surface rounded-2xl max-w-md">
    <DialogHeader>
      <DialogTitle className="text-xl font-semibold">
        Dialog Title
      </DialogTitle>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>
```

---

## Accessibility Checklist

### CRITICAL Requirements

- [ ] **Color Contrast:** Minimum 4.5:1 for normal text, 3:1 for large text
- [ ] **Focus States:** Visible focus rings on all interactive elements
- [ ] **Alt Text:** Descriptive alt text for all meaningful images
- [ ] **ARIA Labels:** aria-label for icon-only buttons
- [ ] **Keyboard Navigation:** Tab order matches visual order
- [ ] **Form Labels:** All inputs have associated labels with `htmlFor`
- [ ] **Touch Targets:** Minimum 44x44px for all interactive elements
- [ ] **Reduced Motion:** Respect `prefers-reduced-motion` media query
- [ ] **Semantic HTML:** Use proper heading hierarchy (h1 → h2 → h3)
- [ ] **Screen Reader:** Test with VoiceOver (Mac) or NVDA (Windows)

---

## Icon System

**Library:** Lucide React (consistent, professional SVG icons)

**Usage:**
```tsx
import { MessageCircle, Send, Settings } from "lucide-react";

<MessageCircle className="h-5 w-5" />
```

**Sizing:**
- Small: `h-4 w-4` (16px)
- Medium: `h-5 w-5` (20px)
- Large: `h-6 w-6` (24px)
- Extra large: `h-8 w-8` (32px)

**NEVER use emojis as UI icons** (unprofessional, inconsistent rendering)

---

## Anti-Patterns to Avoid

### Visual Anti-Patterns

❌ **Don't:** Use emojis as UI icons (🎨 🚀 ⚙️)  
✅ **Do:** Use SVG icons from Lucide React

❌ **Don't:** Use `hover:scale-*` on cards (causes layout shift)  
✅ **Do:** Use `hover:bg-accent` or `hover:shadow-lg`

❌ **Don't:** Mix different icon sets  
✅ **Do:** Use Lucide React consistently

❌ **Don't:** Use low opacity text in light mode (`text-gray-400`)  
✅ **Do:** Use `text-slate-600` or darker for sufficient contrast

### Interaction Anti-Patterns

❌ **Don't:** Forget `cursor-pointer` on clickable elements  
✅ **Do:** Add `cursor-pointer` to all interactive cards/elements

❌ **Don't:** Animate `width`, `height`, `margin`  
✅ **Do:** Animate `transform` and `opacity` only

❌ **Don't:** Use instant state changes  
✅ **Do:** Add smooth transitions (150-300ms)

### Accessibility Anti-Patterns

❌ **Don't:** Use color as the only indicator  
✅ **Do:** Combine color with icons, text, or patterns

❌ **Don't:** Forget alt text on images  
✅ **Do:** Add descriptive alt text for meaningful images

❌ **Don't:** Use `<div>` for buttons  
✅ **Do:** Use `<button>` or `<Button>` component

---

## Implementation Notes

### Tech Stack Integration

**Next.js 16:**
- Use App Router
- Server Components by default
- Client Components only when needed (`"use client"`)

**React 19:**
- Use hooks for state management
- Leverage concurrent features
- Optimize with `useDeferredValue` for heavy lists

**Tailwind CSS 4:**
- Use utility classes
- Custom properties for theming
- Responsive design with mobile-first approach

**shadcn/ui:**
- Pre-built accessible components
- Customizable with Tailwind
- Consistent design language

### Performance Optimization

1. **Images:** Use Next.js `<Image>` with lazy loading
2. **Lists:** Use `react-virtuoso` for long lists (>100 items)
3. **Code Splitting:** Dynamic imports for heavy components
4. **Memoization:** Use `useMemo` and `useCallback` judiciously
5. **Bundle Size:** Monitor with `next build` analysis

---

## Design System Maintenance

**Version:** 1.0.0  
**Last Updated:** 2026-01-24  
**Owner:** Cue Console Team

**Review Schedule:**
- Minor updates: As needed
- Major review: Quarterly
- Accessibility audit: Bi-annually

**Feedback:** Report design system issues or suggestions via GitHub Issues
