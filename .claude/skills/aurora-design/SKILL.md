---
name: aurora-design
description: >-
  Aurora / Glow design system for this project's frontend (Vite + React 19 +
  Tailwind v4). Use whenever building, editing, styling, or reviewing ANY UI —
  pages, components, layouts, colors, spacing, typography, icons, or animation.
  Covers the signature aurora-glow background, the full-viewport minimalist
  layout, pill inputs, thin-line SVG icons, motion, design tokens, and
  accessibility. Load the relevant reference file before writing UI code.
  Triggers: UI, frontend, component, page, layout, screen, style, CSS, Tailwind,
  glow, aurora, aura, gradient, design, theme, spacing, color, icon, animation.
---

# Aurora Design System

The visual language for this app: **hyper-minimalist, airy, "AI-first"** — heavy
negative space, no cards or hard borders, and a soft pastel **aurora glow** that
carries the composition. Inspired by the Google Gemini web UI.

> **Golden rule:** separation between elements comes from **whitespace + the
> glow**, never from borders, drop shadows, or boxed "cards." If you reach for
> `shadow-lg` or a solid `border`, stop and reconsider.

## When to use this skill

Load this skill for **any** frontend/UI task in this repo. It is the source of
truth for how things should look and how they are built. Match the existing
tokens and patterns instead of inventing new ones.

## The 8 principles (memorize these)

1. **Airy first.** Massive negative space. When unsure, add more space, not more UI.
2. **One focal point per screen.** Center the primary interaction; let everything else recede.
3. **Glow, not chrome.** Depth = a blurred pastel aurora, not shadows/borders.
4. **Soft surfaces.** Translucent whites (`bg-white/70`) + `backdrop-blur`, hairline `ring-1` at low opacity — never opaque cards.
5. **Ultra-rounded.** Primary surfaces and controls are `rounded-full`. Nothing sharp.
6. **Thin-line iconography.** 1.5px stroke, `currentColor`, geometric. Never filled/heavy icons.
7. **Restrained palette.** Slate neutrals + a blue→indigo accent. Color is an accent, not a fill.
8. **Alive but calm.** Slow, subtle motion (glow drift). Always honor `prefers-reduced-motion`.

## Quick start

```tsx
<div className="relative flex h-screen w-screen overflow-hidden bg-white font-sans text-slate-800 antialiased">
  <AuroraGlow />   {/* decorative, aria-hidden, pointer-events-none */}
  <Sidebar />      {/* thin w-16 rail, avatar pinned bottom */}
  <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
    {/* one centered focal interaction */}
  </main>
</div>
```

Full, runnable reference: [examples/HomePage.tsx](examples/HomePage.tsx) +
[examples/index.css](examples/index.css).

## Routing table — read the file that matches your task

| If you are… | Read |
| --- | --- |
| Setting up Tailwind, fixing "styles not applying", or a new build | [references/setup.md](references/setup.md) |
| Choosing colors, spacing, radius, blur, opacity, or type | [references/tokens.md](references/tokens.md) |
| Adding/tuning the background glow | [references/glow.md](references/glow.md) |
| Building page shells, sidebars, or centering a hub | [references/layout.md](references/layout.md) |
| Building pills, inputs, buttons, selectors, avatars | [references/components.md](references/components.md) |
| Adding or drawing icons | [references/icons.md](references/icons.md) |
| Adding animation / transitions | [references/motion.md](references/motion.md) |
| Anything interactive (a11y is not optional) | [references/accessibility.md](references/accessibility.md) |
| Adding dark-mode variants, or touching the Appearance setting | [references/dark-mode.md](references/dark-mode.md) |

## Non-negotiable checklist (apply on every UI change)

- [ ] No `card`, no solid `border-*` for separation, no `shadow-md/lg/xl`.
- [ ] Primary container/controls are `rounded-full` (or `rounded-3xl` minimum).
- [ ] Translucent surfaces use `bg-white/70` + `backdrop-blur-*` + `ring-1 ring-slate-200/70`.
- [ ] Decorative elements are `aria-hidden="true"` and `pointer-events-none`.
- [ ] Every icon-only button has an `aria-label`.
- [ ] Focus is visible: `focus-visible:ring-2 focus-visible:ring-blue-400/60` (paired with `focus:outline-hidden`).
- [ ] Any animation is wrapped by the `prefers-reduced-motion` guard.
- [ ] Accent stays blue→indigo (`from-blue-500 to-indigo-500`); neutrals stay `slate-*`.
- [ ] Every hardcoded light token has a `dark:` companion — see [references/dark-mode.md](references/dark-mode.md).

## External references

- Tailwind v4 docs: https://tailwindcss.com/docs
- Tailwind v4 + Vite install: https://tailwindcss.com/docs/installation/using-vite
- `blur` utilities: https://tailwindcss.com/docs/filter-blur
- Gradients (v4 `bg-linear-*`, `bg-radial`): https://tailwindcss.com/docs/background-image
- `backdrop-blur`: https://tailwindcss.com/docs/backdrop-filter-blur
- `prefers-reduced-motion` (MDN): https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- WCAG contrast checker: https://webaim.org/resources/contrastchecker/
- Inspiration — Google Gemini: https://gemini.google.com
