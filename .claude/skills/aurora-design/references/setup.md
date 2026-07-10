# Setup — Tailwind v4 in this Vite + React project

> Read this first if styles are not applying, or when scaffolding a new app.

This project uses **Tailwind CSS v4** with the first-party Vite plugin
(`@tailwindcss/vite`) — **not** PostCSS and **not** a `tailwind.config.js`. v4 is
CSS-first: configuration lives in your CSS via `@theme`.

## The gotcha we hit

Tailwind can be present in `package.json` yet produce **zero styles** if the Vite
plugin is not registered and the CSS entry does not `@import "tailwindcss"`.
Symptom: classes render as plain unstyled markup, build succeeds, CSS output is
tiny. Fix = the two steps below.

## 1. Register the plugin — `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'   // ← add

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),                              // ← add
    babel({ presets: [reactCompilerPreset()] }),
  ],
})
```

## 2. Import Tailwind + declare theme — `src/index.css`

```css
@import 'tailwindcss';

/* CSS-first config. Custom tokens go in @theme and become utilities/vars. */
@theme {
  --font-sans: 'Inter', system-ui, 'Segoe UI', Roboto, sans-serif;
}

html,
body,
#root {
  height: 100%;   /* required so h-screen / h-full fill the viewport */
  margin: 0;
}
```

`index.css` must be imported once, in [src/main.tsx](../../../apps/frontend/src/main.tsx):

```ts
import './index.css'
```

## v4 naming changes to remember

- Config is CSS-first via `@theme` — no `tailwind.config.js` by default.
- Gradients: prefer v4 names `bg-linear-to-r`, `bg-linear-to-br`, and `bg-radial`.
  The old `bg-gradient-to-*` names still work as aliases in this version, but new
  code should use `bg-linear-*` for clarity. (`bg-clip-text` is unchanged.)
- Custom keyframes: define real `@keyframes` in CSS, then invoke with an arbitrary
  utility like `animate-[float_9s_ease-in-out_infinite]`. Tailwind does not
  auto-generate keyframes referenced by arbitrary animations — see
  [motion.md](motion.md).

## Verify it works

```bash
cd apps/frontend
npm run build   # CSS output should be ~15–25 kB, not ~1 kB
npm run dev     # open the printed localhost URL
```

If CSS output is tiny, step 1 or 2 is missing.
