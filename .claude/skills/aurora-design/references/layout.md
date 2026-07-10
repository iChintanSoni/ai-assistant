# Layout & Shells

How to structure a screen: a single non-scrolling viewport, a thin fixed rail on
the left, and one centered focal area on top of the glow.

## Root shell

```tsx
<div className="relative flex h-screen w-screen overflow-hidden bg-white font-sans text-slate-800 antialiased">
  <AuroraGlow />   {/* paints first, behind everything */}
  <Sidebar />      {/* z-20 */}
  <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
    {/* focal content */}
  </main>
</div>
```

- `relative` — positioning context for the absolute glow.
- `flex` — rail + main sit side by side.
- `h-screen w-screen overflow-hidden` — exactly one screen, never scrolls. (Needs
  `html, body, #root { height: 100% }` from [setup.md](setup.md).)
- `bg-white font-sans text-slate-800 antialiased` — base surface + type.

### Centering the focal hub

`main` uses `flex flex-1 flex-col items-center justify-center`. `flex-1` lets it
take the remaining width beside the rail; the flex centering handles both axes.
Keep a single focal group (e.g. greeting + input) — do not stack multiple competing
blocks.

## Sidebar rail

Thin, floating, iconographic. Top navigation group; profile avatar pinned to the
bottom via `justify-between`.

```tsx
<nav className="relative z-20 flex h-full w-16 flex-col items-center justify-between py-6">
  <div className="flex flex-col items-center gap-2">
    <RailButton label="New chat"><PlusIcon /></RailButton>
    <RailButton label="History"><HistoryIcon /></RailButton>
    <RailButton label="Explore"><ExploreIcon /></RailButton>
    <RailButton label="Settings"><SettingsIcon /></RailButton>
  </div>

  <button
    type="button"
    aria-label="Profile"
    className="flex size-9 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-500 text-sm font-medium text-white transition-transform hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
  >
    C
  </button>
</nav>
```

Rules:
- Width is `w-16`, no background/border — it floats over the page and glow.
- `justify-between` splits nav group (top) and avatar (bottom).
- The rail is `z-20` so it always sits above the glow.
- Every item is icon-only → every item needs an `aria-label` (see
  [accessibility.md](accessibility.md)).
- `RailButton` markup lives in [components.md](components.md).

## Responsive behavior

This is desktop-first but must not break on mobile.

- The rail stays `w-16` at all sizes (it is already minimal). Do **not** convert it
  to a bottom bar unless a task explicitly asks.
- Focal content scales with `sm:` breakpoints (e.g. `text-4xl sm:text-5xl`).
- Non-essential inline labels collapse on small screens — e.g. the model selector
  hides its text with `hidden sm:inline`, leaving icon + chevron. Prefer hiding
  secondary text over letting the pill overflow.
- Keep `max-w-2xl` on the hub so it never spans an ultra-wide screen.
- Always verify at 1440×900 **and** 390×844 (see [glow.md](glow.md) → verifying).

## Anti-patterns

❌ A scrolling page (breaks the single-screen, non-scroll intent).
❌ Boxing `main` content in a bordered/shadowed card.
❌ Multiple focal blocks competing for attention.
❌ A heavy/opaque sidebar with its own panel background.
