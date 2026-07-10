# Design Tokens

The constrained vocabulary. Pull from these; do not introduce new hues, random
radii, or ad-hoc opacities. All values are stock Tailwind v4 utilities unless
noted.

The app supports Light and Dark (plus Auto). Every token below has a `dark:`
companion — see [dark-mode.md](dark-mode.md) for the mechanism, the full
palette, and the checklist to follow when adding new UI.

## Color

### Neutrals — always the `slate` ramp

| Role | Light token | Dark token | Notes |
| --- | --- | --- | --- |
| Page background | `bg-white` | `dark:bg-slate-950` | Deep near-black in dark, not a softer navy. |
| Primary text / headings | `text-slate-900` | `dark:text-slate-100` | Highest contrast. |
| Body text | `text-slate-800` | `dark:text-slate-200` | Default on the root. |
| Secondary / icon rest | `text-slate-500`, `text-slate-600` | `dark:text-slate-400`, `dark:text-slate-300` | Rails, muted labels. |
| Placeholder / disabled | `text-slate-400` | `dark:text-slate-500` | Decorative; keep off critical info. |
| Hairline ring | `ring-slate-200/70` | `dark:ring-slate-700/60` | The only "border" we use. |
| Soft hover fill | `hover:bg-slate-100`, `bg-slate-100/80` | `dark:hover:bg-slate-800`, `dark:bg-slate-800/80` | Rail buttons, model pill. |

### Accent — blue → indigo, only as an accent

| Use | Token |
| --- | --- |
| Gradient (text, avatar, active) | `from-blue-500 to-indigo-500` |
| Focus ring | `ring-blue-400/60` |
| Focus-within (input) | `ring-blue-300/70` |
| Small accent icon (sparkle) | `text-blue-500` |

Never fill large areas with saturated accent. Accent = ≤ ~10% of the pixels.
The accent gradient and focus ring are **unchanged in dark mode** — never
re-hue them.

### Glow hues (translucent only — see [glow.md](glow.md))

Light: `bg-blue-400/20` · `bg-indigo-300/25` · `bg-sky-300/20`
Dark (boosted so it stays visible on near-black): `dark:bg-blue-500/30` ·
`dark:bg-indigo-400/30` · `dark:bg-sky-400/25`

## Typography

- Family: `font-sans` → `Inter, system-ui, 'Segoe UI', Roboto, sans-serif`
  (declared in `@theme`, [setup.md](setup.md)). Geometric, clean.
- Hero greeting: `text-4xl sm:text-5xl font-medium tracking-tight`.
- Body / input: `text-base`.
- Labels / pills: `text-sm font-medium`.
- Weights: stay at `font-medium` for headings — this design avoids heavy `bold`.
- `tracking-tight` on large type; default tracking elsewhere.

## Radius (rounded, never sharp)

| Element | Token |
| --- | --- |
| Primary surfaces, inputs, all buttons, avatar, pills | `rounded-full` |
| Larger panels (if ever needed) | `rounded-3xl` (minimum) |

There is effectively no `rounded-md`/`rounded-lg` in this system.

## Elevation & surfaces

- **No shadows for separation.** Depth is the aurora glow only.
- Translucent surface recipe: `bg-white/70` + `backdrop-blur-md` + `ring-1 ring-slate-200/70`.
- Soft fill (secondary control): `bg-slate-100/80` + `hover:bg-slate-200/80`.

## Blur scale

| Purpose | Token |
| --- | --- |
| Aurora glow blobs | `blur-3xl` (heavy, required for the smooth fade) |
| Glass surfaces | `backdrop-blur-md` (occasionally `backdrop-blur-sm`) |

## Opacity ladder (keep it on these rungs)

`/20`, `/25` (glow) · `/60`, `/70` (rings, glass) · `/80` (soft fills). Avoid
arbitrary values like `/37`.

## Spacing rhythm

- Page gutters: `px-6`.
- Greeting → input gap: `mb-10`.
- Intra-pill gaps: `gap-3` (major), `gap-1.5` (tight, e.g. selector internals).
- Rail vertical padding: `py-6`; rail item gap: `gap-2`.
- Hit targets: `size-10` (rail/pill actions), `size-9` (avatar). Never below
  40px for primary tap targets — see [accessibility.md](accessibility.md).

## Layout constants

- Sidebar width: `w-16`.
- Prompt hub max width: `max-w-2xl`.
- Root: `h-screen w-screen overflow-hidden` (non-scrolling single screen).
