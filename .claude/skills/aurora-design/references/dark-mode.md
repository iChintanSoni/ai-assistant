# Dark Mode

The app supports an **Appearance** setting — Auto / Light / Dark, default
Auto — controlled from the Settings flyout (gear icon on the rail). This
document is the source of truth for the mechanism and the dark palette.

## Strategy: manual, class-based `dark:`

Tailwind v4 defaults the `dark:` variant to a `prefers-color-scheme` media
query, which can't be manually overridden by a user setting. This app
switches to class-based dark mode in `src/index.css`:

```css
@import 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));
```

A `.dark` class on `<html>` (not the React root div) is what flips every
`dark:` utility. `html { color-scheme: light; }` / `html.dark { color-scheme:
dark; }` keeps native form controls and scrollbars in sync.

## Preference vs. resolved theme

- **Preference** (`"auto" | "light" | "dark"`) — what the user picked.
  Persisted to `localStorage["aurora-theme"]`. Owned by `useThemeStore` in
  `src/store/theme.ts`.
- **Resolved** (`"light" | "dark"`) — what's actually applied. For `auto`,
  resolved = `window.matchMedia('(prefers-color-scheme: dark)').matches`.
  A module-level `matchMedia` change listener keeps `auto` **live**: if the
  OS theme flips while the app is open, the class updates without a reload.

## Avoiding a flash of the wrong theme (FOUC)

`index.html` has a small inline script in `<head>`, before `main.tsx` loads,
that reads `localStorage`/`matchMedia` and sets `.dark` on `<html>`
synchronously — so the very first paint is already correct. The store's own
init logic (which runs the same resolution) is idempotent with this.

## The dark palette

Same slate ramp as light mode, just inverted toward the deep end — **deep
near-black**, matching the high-contrast "AI-first" look of Gemini/ChatGPT
dark mode (not a softer navy). The blue→indigo accent gradient and focus
ring stay **identical** in both themes — accent is never re-hued for dark.

| Role | Light | Dark |
| --- | --- | --- |
| Page background | `bg-white` | `dark:bg-slate-950` |
| Primary text/headings | `text-slate-900` | `dark:text-slate-100` |
| Body text | `text-slate-800` | `dark:text-slate-200` |
| Secondary text/icons | `text-slate-500`/`600` | `dark:text-slate-400`/`dark:text-slate-300` |
| Placeholder/disabled | `text-slate-400` | `dark:text-slate-500` |
| Hairline ring | `ring-slate-200/70` | `dark:ring-slate-700/60` |
| Glass surface | `bg-white/70` + `backdrop-blur-md` | `dark:bg-slate-900/70` |
| Soft hover fill | `bg-slate-100`, `/80` | `dark:bg-slate-800/70`, `dark:hover:bg-slate-800` |
| Secondary pill (selector) | `bg-slate-100/80 hover:bg-slate-200/80` | `dark:bg-slate-800/80 dark:hover:bg-slate-700/80` |
| Code block | `bg-slate-50/70 ring-slate-200/60` | `dark:bg-slate-900/60 dark:ring-slate-700/50` |
| Inline code | `bg-slate-100/80 text-slate-700` | `dark:bg-slate-800/80 dark:text-slate-300` |
| Error/destructive text | `text-rose-500` | `dark:text-rose-400` |
| Approval card (amber) | `bg-amber-50/70 ring-amber-200/70 text-amber-700` | `dark:bg-amber-500/10 dark:ring-amber-400/30 dark:text-amber-300` |
| Subagent card (indigo) | `bg-indigo-50/60 ring-indigo-200/60` | `dark:bg-indigo-500/10 dark:ring-indigo-400/30` |
| Accent gradient / focus ring | `from-blue-500 to-indigo-500` / `ring-blue-400/60` | **unchanged** |

Glow blob opacity is boosted for dark — see [glow.md](glow.md).

## Settings flyout + segmented control

Appearance lives in `src/components/SettingsPanel.tsx`, a flyout opened
from the rail's Settings button (same structural pattern as
`HistoryPanel.tsx`: `role="dialog"`, outside-click + Escape to close, focus
returns to the trigger). The picker itself is a 3-segment pill — see the
"Segmented control" recipe in [components.md](components.md).

## Checklist when adding new UI

- [ ] Every hardcoded light token (`bg-white`, `text-slate-800`,
  `ring-slate-200/70`, etc.) has a `dark:` companion from the table above.
- [ ] Don't re-hue the accent gradient or focus ring for dark.
- [ ] Re-verify contrast on dark surfaces — see
  [accessibility.md](accessibility.md).
- [ ] If you add a new surface type not covered above, add it to this table.
