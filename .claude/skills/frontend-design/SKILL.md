---
name: bento-layout
description: Transform any frontend UI into a beautiful bento card/grid layout. Use this skill whenever the user asks to redesign, restyle, or restructure their frontend into a bento layout, bento grid, bento cards, dashboard cards, or any grid-of-cards style design. Also trigger when the user says things like "make it look like a bento box", "card grid layout", "bento-style dashboard", "tile layout", "mosaic grid", "Apple-style feature grid", or asks to "modernize the layout" or "make the design more visual" — bento layouts are a strong default for modern UI redesigns. Trigger even if the user doesn't say "bento" explicitly but describes a layout with mixed-size cards, feature tiles, or a grid where items span different rows/columns. This skill covers React (JSX/TSX), HTML/CSS, and Tailwind-based implementations.
---

# Bento Card Layout Skill

some changes were recently made for story.
Create stunning, modern bento-style grid layouts — the asymmetric, mixed-size card grids popularized by Apple, Linear, Vercel, and other design-forward companies. Bento layouts turn boring uniform grids into visually dynamic compositions where cards of different sizes create rhythm, hierarchy, and visual interest.

## When This Skill Applies

- User wants to convert an existing UI to bento/card grid layout
- User asks for a dashboard, feature showcase, portfolio, or landing page with a modern grid
- User describes wanting "cards of different sizes" or "a mosaic/tile layout"
- User references Apple-style feature grids, Linear's homepage, or similar designs
- Any frontend redesign where a bento layout would be a strong fit

## Design Philosophy

Bento layouts succeed because of **intentional asymmetry**. The grid is not uniform — it uses a mix of card sizes to create visual hierarchy:

- **Hero cards** (2×2 or 3×2): The most important content. Usually 1-2 per section.
- **Wide cards** (2×1): Secondary highlights, stats, or feature callouts.
- **Tall cards** (1×2): Vertical content like lists, progress bars, or testimonials.
- **Standard cards** (1×1): Supporting details, metrics, icons, or quick links.

The magic is in the **contrast between sizes** — a hero card next to small cards creates drama. Uniform grids feel static; bento grids feel alive.

## Core Implementation Pattern

### Step 1: Analyze the Content

Before writing any code, inventory the content the user wants to display. Categorize each piece by importance:

- **Primary** → Hero card (large, prominent)
- **Secondary** → Wide or tall card
- **Tertiary** → Standard 1×1 card

Aim for a ratio of roughly 1 hero : 2-3 secondary : 3-5 standard cards per visible section.

### Step 2: Choose the Grid Foundation

Use CSS Grid (not Flexbox) as the foundation. The grid should be column-based with explicit row sizing.

**Base grid setup (CSS):**

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr); /* 4-column grid is the sweet spot */
  grid-auto-rows: minmax(180px, auto); /* Consistent row height */
  gap: 16px; /* Comfortable spacing */
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
```

**Base grid setup (Tailwind):**

```html
<div
  class="grid grid-cols-4 gap-4 p-4 max-w-[1200px] mx-auto auto-rows-[minmax(180px,auto)]"
></div>
```

### Step 3: Define Card Span Classes

Create reusable span utilities for different card sizes:

```css
/* Card sizes */
.card-hero {
  grid-column: span 2;
  grid-row: span 2;
} /* 2×2 */
.card-wide {
  grid-column: span 2;
  grid-row: span 1;
} /* 2×1 */
.card-tall {
  grid-column: span 1;
  grid-row: span 2;
} /* 1×2 */
.card-standard {
  grid-column: span 1;
  grid-row: span 1;
} /* 1×1 */

/* Rare but impactful — use sparingly */
.card-banner {
  grid-column: span 3;
  grid-row: span 1;
} /* 3×1 */
.card-mega {
  grid-column: span 3;
  grid-row: span 2;
} /* 3×2 full showcase */
```

**Tailwind equivalents:**

```
Hero:     col-span-2 row-span-2
Wide:     col-span-2
Tall:     row-span-2
Standard: (default, no span needed)
Banner:   col-span-3
Mega:     col-span-3 row-span-2
```

### Step 4: Style the Cards

Each card should feel like a self-contained, polished surface. Apply these principles:

```css
.bento-card {
  background: var(--card-bg, #ffffff);
  border-radius: 16px; /* Generous rounding — signature bento look */
  padding: 24px;
  overflow: hidden;
  position: relative;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  /* Subtle depth — avoid heavy drop shadows */
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 1px 2px rgba(0, 0, 0, 0.06);
}

/* Light theme card border for definition */
.bento-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

/* Dark theme — cards are slightly elevated surfaces */
[data-theme="dark"] .bento-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Hover interaction — subtle lift */
.bento-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 25px rgba(0, 0, 0, 0.08),
    0 2px 6px rgba(0, 0, 0, 0.06);
}
```

### Step 5: Responsive Breakpoints

Bento grids MUST degrade gracefully. The grid should simplify at smaller screens:

```css
/* Tablet */
@media (max-width: 1024px) {
  .bento-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .card-mega {
    grid-column: span 3;
  }
  .card-banner {
    grid-column: span 3;
  }
}

/* Mobile landscape / small tablet */
@media (max-width: 768px) {
  .bento-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: minmax(140px, auto);
  }
  .card-hero {
    grid-column: span 2;
    grid-row: span 2;
  }
  .card-wide {
    grid-column: span 2;
  }
  .card-banner {
    grid-column: span 2;
  }
  .card-mega {
    grid-column: span 2;
    grid-row: span 2;
  }
}

/* Mobile portrait */
@media (max-width: 480px) {
  .bento-grid {
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(120px, auto);
    gap: 12px;
  }
  .card-hero,
  .card-wide,
  .card-tall,
  .card-banner,
  .card-mega {
    grid-column: span 1;
    grid-row: span 1;
  }
}
```

## Visual Enhancements (Apply Selectively)

These effects make bento layouts feel premium. Apply them based on the project's aesthetic:

### Gradient Accent Cards

For hero or highlight cards, use subtle gradient backgrounds to draw the eye:

```css
.card-accent-blue {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}
.card-accent-warm {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
}
```

### Glassmorphism Cards (Dark Themes)

```css
.card-glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

### Subtle Card Illustrations / Background Patterns

Hero cards benefit from a background visual — a faint grid pattern, dots, or a decorative SVG:

```css
.card-pattern {
  background-image: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.03) 1px,
    transparent 1px
  );
  background-size: 20px 20px;
}
```

### Icon or Emoji Badges

Small visual anchors in the top-left corner of cards help scanability:

```html
<div class="bento-card">
  <span class="card-badge">📊</span>
  <h3>Analytics</h3>
  <p>Real-time dashboard metrics</p>
</div>
```

### Animated Number Counters (for stat cards)

Standard 1×1 cards displaying metrics feel more alive with a count-up animation on mount.

## Layout Composition Recipes

Use these proven arrangements as starting points. Read the `references/layouts.md` file for detailed visual diagrams and more compositions.

### Recipe A: Feature Showcase (Landing Page)

```
[ Hero 2×2  ] [ Std 1×1 ] [ Std 1×1 ]
[           ] [ Wide 2×1          ]
[ Tall 1×2  ] [ Std 1×1 ] [ Std 1×1 ]
[           ] [ Wide 2×1          ]
```

Best for: Product feature pages, SaaS landing pages.

### Recipe B: Dashboard

```
[ Wide 2×1 stats     ] [ Std 1×1 ] [ Std 1×1 ]
[ Tall 1×2 chart     ] [ Hero 2×2 main chart       ]
[                    ] [                            ]
[ Std 1×1 ] [ Std 1×1 ] [ Wide 2×1 recent activity ]
```

Best for: Admin dashboards, analytics pages.

### Recipe C: Portfolio / Gallery

```
[ Hero 2×2  ] [ Tall 1×2 ] [ Std 1×1 ]
[           ] [          ] [ Std 1×1 ]
[ Std 1×1 ] [ Std 1×1 ] [ Hero 2×2   ]
[ Wide 2×1          ] [              ]
```

Best for: Portfolios, image galleries, case studies.

### Recipe D: Profile / About Page

```
[ Hero 2×2 avatar   ] [ Wide 2×1 bio            ]
[                   ] [ Std 1×1 ] [ Std 1×1     ]
[ Wide 2×1 skills   ] [ Tall 1×2 timeline       ]
[ Std 1×1 ] [ Std 1×1 ] [                       ]
```

Best for: Personal sites, team member pages.

## React Component Pattern

When building in React/JSX, structure the bento grid as a composable component:

```jsx
// BentoGrid.jsx
const BentoGrid = ({ children, className = "" }) => (
  <div className={`bento-grid ${className}`}>{children}</div>
);

const BentoCard = ({
  children,
  size = "standard", // "hero" | "wide" | "tall" | "standard" | "banner" | "mega"
  variant = "default", // "default" | "accent" | "glass" | "gradient"
  className = "",
  ...props
}) => (
  <div
    className={`bento-card card-${size} card-variant-${variant} ${className}`}
    {...props}
  >
    {children}
  </div>
);
```

**Usage:**

```jsx
<BentoGrid>
  <BentoCard size="hero" variant="gradient">
    <h2>Main Feature</h2>
    <p>Hero content here</p>
  </BentoCard>
  <BentoCard size="standard">
    <span>📈</span>
    <h3>Metric</h3>
    <p>1,234</p>
  </BentoCard>
  <BentoCard size="wide">
    <h3>Recent Activity</h3>
    {/* content */}
  </BentoCard>
  <BentoCard size="tall">
    <h3>Timeline</h3>
    {/* content */}
  </BentoCard>
</BentoGrid>
```

## Common Mistakes to Avoid

1. **All same-size cards** — This defeats the purpose. Always mix at least 2-3 different sizes.
2. **Too many hero cards** — One hero per visible section max. Two heroes competing kills hierarchy.
3. **No breathing room** — Gaps of 12-16px minimum. Cramped bento grids look cluttered.
4. **Ignoring mobile** — A 4-column bento that doesn't collapse to 1-2 columns on mobile is broken.
5. **Flat cards with no depth** — Cards need subtle borders, shadows, or background contrast to read as distinct surfaces.
6. **Uniform padding** — Hero cards can have more padding (32px); small cards less (16-20px). Scale padding with card size.
7. **Generic white/gray** — Give cards personality: accent colors, gradients, illustrations, or tinted backgrounds for variety.
8. **Content overflow** — Always set `overflow: hidden` on cards and test with real content lengths.

## Checklist Before Delivering

- [ ] Grid uses CSS Grid with `grid-template-columns: repeat(4, 1fr)` (or 3 for simpler layouts)
- [ ] At least 3 different card sizes are used
- [ ] Hero card is clearly the largest and most prominent
- [ ] Cards have rounded corners (12-20px), subtle shadows, and borders
- [ ] Hover states exist on interactive cards
- [ ] Responsive: 4 cols → 3 → 2 → 1 at appropriate breakpoints
- [ ] Content fits within cards without overflow
- [ ] Consistent spacing via `gap` property
- [ ] Typography hierarchy: card titles are bold, descriptions are muted
- [ ] Dark theme support if applicable

## Additional Reference

For detailed layout diagrams, advanced animation patterns, and full themed examples, read: `references/layouts.md`
