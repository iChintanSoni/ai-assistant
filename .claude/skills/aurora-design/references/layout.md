# Layout & Shells

How to structure a screen: a single non-scrolling viewport, navigation pinned to
one edge, and one centered focal area on top of the glow.

Written desktop-side below. The layout is **designed at phone width first** — see
[responsive.md](responsive.md) for the base case, the breakpoint ladder, and the
bottom-bar lane that the rail replaces at `md:`.

## Root shell

```tsx
<div className="relative flex h-dvh w-full flex-col overflow-hidden bg-white font-sans text-slate-800 antialiased md:flex-row">
  <AuroraGlow />   {/* paints first, behind everything */}
  <BottomBar />    {/* z-20, md:hidden */}
  <Sidebar />      {/* z-20, hidden md:flex */}
  <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 md:px-6">
    {/* focal content */}
  </main>
</div>
```

- `relative` — positioning context for the absolute glow.
- `flex flex-col md:flex-row` — nav sits below the content on a phone, beside it on
  desktop.
- `h-dvh w-full overflow-hidden` — exactly one screen, never scrolls. `dvh` rather
  than `vh` because mobile browser toolbars change the viewport height, and `vh`
  measures the largest one — putting the composer below the fold. (Needs
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
- Width is `w-16`, no background/border — it floats over the page and glow. It is
  `hidden md:flex`; below that the bottom bar takes over
  ([responsive.md](responsive.md)).
- `justify-between` splits nav group (top) and avatar (bottom).
- The rail is `z-20` so it always sits above the glow.
- Every item is icon-only → every item needs an `aria-label` (see
  [accessibility.md](accessibility.md)).
- `RailButton` markup lives in [components.md](components.md).

## Responsive behavior

**Mobile-first.** Write the phone layout, then add `sm:`/`md:`/`lg:` upward. Full
recipes live in [responsive.md](responsive.md); the essentials:

- Navigation is a **bottom bar** on phones and the `w-16` left rail from `md:` up.
  (This reverses an earlier rule that kept the rail at every size — 64px of a 375px
  viewport is too much chrome, and the bottom edge is where thumbs are.)
- Focal content scales with `sm:` breakpoints (e.g. `text-4xl sm:text-5xl`).
- Non-essential inline labels collapse on small screens — e.g. the model selector
  hides its text with `hidden sm:inline`, leaving icon + chevron. Prefer hiding
  secondary text over letting the pill overflow.
- Grids start at one column and widen: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- Keep `max-w-2xl` on the hub so it never spans an ultra-wide screen.
- Always verify at 375×812 **and** 1440×900, light and dark (see
  [glow.md](glow.md) → verifying).

## Anti-patterns

❌ A scrolling *shell* (breaks the single-screen intent). A focal pane that
scrolls inside the shell is fine, and on a phone it is usually required.
❌ `h-screen` on the root — use `h-dvh` ([responsive.md](responsive.md)).
❌ A left rail that survives below `md:`.
❌ Boxing `main` content in a bordered/shadowed card.
❌ Multiple focal blocks competing for attention.
❌ A heavy/opaque sidebar with its own panel background.
