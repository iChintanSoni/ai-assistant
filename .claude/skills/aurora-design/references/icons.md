# Iconography

Thin-line, geometric, monochromatic icons that inherit `currentColor`. No icon
library dependency — icons are inline SVG components. This keeps the bundle small
and every icon perfectly on-style.

## The shared spec

Every icon uses these props: 24×24 viewBox, no fill, `currentColor` stroke,
**1.5px stroke width**, round caps/joins, and `aria-hidden` (icons are decorative;
the accessible name lives on the wrapping button — see
[accessibility.md](accessibility.md)).

```tsx
const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}
```

Rules:
- **Always** `fill: 'none'` + `stroke: 'currentColor'`. Color comes from the parent's
  `text-*` class, so the same icon adapts to rest/hover/accent states for free.
- **Always** `strokeWidth: 1.5`. This thinness is the house style; never use filled or 2px+ heavy icons.
- Render at `width/height: 20` inside `size-10` buttons; smaller inline icons
  (sparkle, chevron) render at `16` and may set their own color, e.g.
  `className="text-blue-500"`.

## The icon set (copy as needed)

```tsx
function PlusIcon() {
  return <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>
}

function HistoryIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function ExploreIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m14.8 9.2-1.6 4.6-4.6 1.6 1.6-4.6z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg {...iconProps} width={16} height={16} className="text-blue-500">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return <svg {...iconProps} width={16} height={16}><path d="m6 9 6 6 6-6" /></svg>
}
```

## Adding a new icon

1. Find a **1.5px stroke, 24×24** outline icon. Good sources whose geometry matches
   this style:
   - Lucide — https://lucide.dev (search, copy the `<path>` data)
   - Heroicons "outline" — https://heroicons.com
2. Create a `function XIcon()` that spreads `{...iconProps}` and contains only the
   `<path>`/`<circle>`/`<rect>` primitives — **strip** any `stroke`, `fill`, or
   `width` on the SVG root so `iconProps` governs.
3. Keep it monochrome (single `currentColor` stroke). No two-tone/filled icons.
4. If it's a small inline accent, pass `width={16} height={16}` and an optional
   `text-*` color override.

## Don't

❌ Import an icon component library (react-icons, etc.) — inline SVG only here.
❌ Hard-code `stroke="#..."` — breaks `currentColor` theming.
❌ Filled/duotone/2px icons — off-style.
❌ Put an `aria-label` on the SVG; label the **button** instead.
