# Plunge Design System

> **Aesthetic**: Liquid Glass — Refined Futurism

*Apple Vision Pro meets luxury pool at dusk*

---

## Core Principles

1. **Premium & Calm** — Every element feels considered, nothing cheap or rushed
2. **Glanceable** — Status visible in < 1 second, even in bright sunlight or dark night
3. **Fluid** — Motion mimics water: smooth, continuous, never jarring
4. **Depth** — Layered glass creates hierarchy without hard borders

---

## Color Palette

### Backgrounds
```css
--bg-deep:        #0a0f14;      /* Darkest - page background */
--bg-surface:     #0d1419;      /* Card backgrounds */
--bg-elevated:    #141c24;      /* Elevated elements, modals */
--bg-glass:       rgba(255, 255, 255, 0.03);  /* Frosted glass panels */
--bg-glass-hover: rgba(255, 255, 255, 0.06);  /* Glass hover state */
```

### Glass Effects
```css
--glass-border:   rgba(255, 255, 255, 0.08);  /* Subtle glass edge */
--glass-blur:     12px;                        /* Backdrop blur amount */
--glass-glow:     0 0 40px rgba(0, 210, 211, 0.1);  /* Ambient glow */
```

### Accent — Cyan (Water/Active)
```css
--cyan-glow:      #00d2d3;      /* Primary accent - "on" state */
--cyan-soft:      #00d2d3cc;    /* 80% opacity for softer use */
--cyan-dim:       #00d2d340;    /* 25% opacity for subtle hints */
--cyan-bg:        rgba(0, 210, 211, 0.08);   /* Cyan tinted backgrounds */
--cyan-shadow:    0 0 30px rgba(0, 210, 211, 0.3);  /* Glow effect */
```

### Temperature Gradient
```css
/* Cold (40°F) → Hot (104°F) */
--temp-cold:      #3b82f6;      /* Blue - cold */
--temp-cool:      #06b6d4;      /* Cyan - cool */
--temp-warm:      #f59e0b;      /* Amber - warm */
--temp-hot:       #ef4444;      /* Red-orange - hot */
```

### Text
```css
--text-primary:   rgba(255, 255, 255, 0.95);  /* High emphasis */
--text-secondary: rgba(255, 255, 255, 0.60);  /* Medium emphasis */
--text-muted:     rgba(255, 255, 255, 0.35);  /* Low emphasis, labels */
```

### State Colors
```css
--state-on:       #00d2d3;      /* Circuit on - cyan glow */
--state-off:      #3a4550;      /* Circuit off - muted gray */
--state-heating:  #f59e0b;      /* Actively heating - amber pulse */
--state-error:    #ef4444;      /* Error/offline - red */
```

---

## Typography

### Font Stack
```css
/* Primary - Display & Body (Google Sans Flex exclusively) */
--font-display: 'Google Sans Flex', sans-serif;
--font-text: 'Google Sans Flex', sans-serif;

/* Load from Google Fonts */
/* https://fonts.google.com/specimen/Google+Sans+Flex */
```

### Scale
| Use | Size | Weight | Tracking |
|-----|------|--------|----------|
| Hero Temp | 72px | 300 (Light) | -0.02em |
| Section Title | 24px | 500 (Medium) | -0.01em |
| Card Title | 18px | 500 (Medium) | 0 |
| Body | 16px | 400 (Regular) | 0 |
| Label | 13px | 500 (Medium) | 0.02em |
| Caption | 11px | 400 (Regular) | 0.01em |

### Temperature Display
- Large temps: `font-mono`, 72px, light weight, letter-spacing tight
- Unit (°F): 24px, muted color, slight offset up

---

## Components

### Glass Card
```css
.glass-card {
  background: var(--bg-glass);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: var(--glass-glow);
}
```

### Circuit Toggle
- **Off State**: Muted gray pill, subtle inner shadow
- **On State**: Cyan glow, pulsing light bleed on edges
- **Transition**: 300ms ease-out, scale(1.02) on tap

### Temperature Ring
- Circular arc showing current temp position in range (40-104°F)
- Ring stroke: 4px, gradient from cold→hot
- Current position: Glowing dot with soft pulse
- Center: Large temp number + heat mode icon

### Heat Mode Selector
- Horizontal segmented control (Off | Solar | Heater)
- Selected segment: Glass highlight with cyan accent
- Icons: Minimal line icons (sun for solar, flame for heater)

---

## Motion

### Principles
- **Fluid**: All motion is smooth, ease-out curves
- **Subtle**: No bouncy/playful — calm and premium
- **Purposeful**: Motion indicates state change, not decoration

### Timing
```css
--duration-fast:   150ms;   /* Micro-interactions (hover, press) */
--duration-normal: 300ms;   /* State changes (toggle, select) */
--duration-slow:   500ms;   /* Page transitions, reveals */

--ease-out: cubic-bezier(0.16, 1, 0.3, 1);  /* Smooth deceleration */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);  /* Symmetric */
```

### Signature Animations
1. **Glow Pulse** — Active circuits have subtle breathing glow (3s cycle)
2. **Temp Ring Fill** — On load, ring animates from 0 to current position
3. **Glass Reveal** — Cards fade in with slight Y translation (staggered)
4. **Ripple Tap** — Touch creates expanding ring of light

---

## Spacing

### Base Unit: 4px

| Token | Value | Use |
|-------|-------|-----|
| `--space-xs` | 4px | Tight gaps |
| `--space-sm` | 8px | Related elements |
| `--space-md` | 16px | Card padding |
| `--space-lg` | 24px | Section gaps |
| `--space-xl` | 32px | Page margins |
| `--space-2xl` | 48px | Major separations |

### Card Padding
- Standard: 20px
- Compact: 16px
- Touch targets: minimum 44px height

---

## Layout

### Mobile-First (iPhone)
- Max width: 100vw
- Safe area padding for notch/home indicator
- Bottom-anchored navigation (if needed)

### Dashboard Grid
```
┌─────────────────────────────────┐
│  Air Temp        [Last updated] │  ← Header
├─────────────────────────────────┤
│                                 │
│     ┌───────────────────┐       │
│     │    POOL  84°F     │       │  ← Primary temp ring
│     │   ○──────────●    │       │
│     │   Solar Active    │       │
│     └───────────────────┘       │
│                                 │
│     ┌───────────────────┐       │
│     │    SPA   72°F     │       │  ← Secondary temp (smaller)
│     │      Off          │       │
│     └───────────────────┘       │
│                                 │
├─────────────────────────────────┤
│  Quick Actions                  │
│  ┌─────┐ ┌─────┐ ┌─────┐       │  ← Circuit toggles
│  │Pool │ │ Spa │ │Light│       │
│  └─────┘ └─────┘ └─────┘       │
└─────────────────────────────────┘
```

---

## Iconography

- Style: Outlined, 1.5px stroke, rounded caps
- Size: 24px standard, 20px compact
- Active state: Filled or glow effect

### Core Icons
| Icon | Use |
|------|-----|
| Water droplet | Pool circuit |
| Hot tub / bubbles | Spa circuit |
| Lightbulb | Lights |
| Sun | Solar heating |
| Flame | Gas heater |
| Snowflake | Freeze protection active |
| Refresh | Last sync / refresh |

---

## Responsive Behavior

### Touch States
- Hover (desktop): `--bg-glass-hover`
- Active/Press: scale(0.98), slight darken
- Focus: Cyan outline ring (2px)

### Loading States
- Skeleton: Subtle shimmer on glass cards
- Spinner: Rotating arc (matches temp ring style)

### Offline/Error
- Connection lost: Muted overlay, subtle pulse
- Error: Red glow accent, clear message

---

## Dark Mode Only

This app is dark mode exclusively. No light theme planned.

Rationale:
- Pool control often happens at night
- Prevents eye strain outdoors at dusk
- Cyan accents pop better on dark
- Matches premium/luxury aesthetic

---

## Sample CSS Variables (Full)

```css
:root {
  /* Backgrounds */
  --bg-deep: #0a0f14;
  --bg-surface: #0d1419;
  --bg-elevated: #141c24;
  --bg-glass: rgba(255, 255, 255, 0.03);
  --bg-glass-hover: rgba(255, 255, 255, 0.06);
  
  /* Glass */
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur: 12px;
  
  /* Accent */
  --cyan: #00d2d3;
  --cyan-glow: 0 0 30px rgba(0, 210, 211, 0.3);
  
  /* Text */
  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.60);
  --text-muted: rgba(255, 255, 255, 0.35);
  
  /* States */
  --state-on: #00d2d3;
  --state-off: #3a4550;
  --state-heating: #f59e0b;
  
  /* Typography */
  --font-display: 'Google Sans Flex', sans-serif;
  --font-text: 'Google Sans Flex', sans-serif;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```
