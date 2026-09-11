# Responsive

**Design at phone width first, then add breakpoints upward.** The full-viewport
aurora layout with its left rail is the *enhancement*, not the starting point.

This is the newer stance. Everything else in this system — the glow, the
translucent surfaces, `rounded-full`, thin-line icons, the slate + blue→indigo
palette — is unchanged on a phone. What changes is **how the shell re-flows**, and
nothing here introduces a new visual vocabulary.

Measured on the app at 375×812 before this was written, so the rules below are
answers to real breakage, not hypotheticals:

| Symptom | Measurement |
| --- | --- |
| Composer textarea unusable | 37px wide, 96px tall — the placeholder wrapped one character per line |
| Rail eats the viewport | 64px of 375px (17%), leaving `main` 311px |
| History flyout runs off-screen | `left: 80px` + `width: 320px` = `right: 400px` on a 375px viewport |
| Files grid too dense | two columns at 115px each |
| Touch targets below the floor | 9 on the hub, 34 on Files, 25 on Settings |

## Breakpoint ladder

| Prefix | Width | What it means here |
| --- | --- | --- |
| *(none)* | phone | **The base case.** Write this first. |
| `sm:` | 640 | Roomier phone / small tablet. Secondary labels and the usage gauge can come back. |
| `md:` | 768 | **The rail returns and the bottom bar retires.** The single-row composer pill returns. |
| `lg:` | 1024 | Comfortable desktop; wider grids. |

Use min-width prefixes only. Never reach for `max-*` variants — they invert the
mental model and you end up maintaining two designs instead of one that grows.

## Root shell

```tsx
<div className="relative flex h-dvh w-full flex-col overflow-hidden md:flex-row">
  <AuroraGlow />
  <BottomBar />   {/* md:hidden — see below */}
  <Sidebar />     {/* hidden md:flex */}
  <main className="relative z-10 flex flex-1 flex-col overflow-hidden px-4 md:px-6">…</main>
</div>
```

- **`h-dvh`, not `h-screen`.** `100vh` on mobile is measured against the *largest*
  viewport, so with the browser toolbar showing, the bottom of the layout sits
  below the fold — which is exactly where the composer lives. `dvh` tracks the
  toolbar. On desktop the two are identical.
- `flex-col` on phones (content above, nav pinned to the bottom), `md:flex-row`
  for the rail beside the content.
- The **shell** still never scrolls. A *focal pane* may scroll inside it — that's
  the one relaxation of the single-screen rule, and it's what makes a long
  transcript or a file grid usable on a phone.
- Page gutters tighten to `px-4` on phones; `md:px-6` restores the desktop rhythm.

## Navigation: bottom bar under `md:`, rail above

Same icons, same `aria-label`s, same active treatment — re-flowed, not redesigned.
Bottom-anchored because that's where thumbs are, and because 64px of a 375px
viewport is too much to spend on chrome.

```tsx
{/* Phones */}
<nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around
                bg-white/70 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]
                ring-1 ring-slate-200/70 backdrop-blur-md
                md:hidden dark:bg-slate-900/70 dark:ring-slate-700/60">
  …RailButtons…
</nav>

{/* md: and up — unchanged from layout.md */}
<nav className="relative z-20 hidden h-full w-16 flex-col items-center justify-between py-6 md:flex">
```

- `env(safe-area-inset-bottom)` wrapped in `max()` so it still has padding on
  devices that report zero inset.
- The bar is the one place a translucent surface spans the full width; it uses the
  standard recipe (`bg-white/70` + `backdrop-blur-md` + hairline ring), so it still
  reads as glass over the glow rather than as chrome.
- `main` needs bottom padding on phones so the bar never covers content.
- The avatar/profile button moves into the bar's row; it does not get its own
  fixed corner on a phone.

## Overlays become sheets

A flyout positioned relative to the rail (`fixed top-6 left-20 w-80`) has nowhere
to go when the rail isn't there — measured above, it runs 25px off-screen. Under
`md:` the same component is a bottom sheet:

```tsx
<div className="fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] rounded-t-3xl
                bg-white/80 p-3 ring-1 ring-slate-200/70 backdrop-blur-md
                md:inset-x-auto md:bottom-auto md:top-6 md:left-20 md:max-h-[70vh] md:w-80 md:rounded-3xl
                dark:bg-slate-900/80 dark:ring-slate-700/60">
```

- `rounded-t-3xl` on a phone (it's anchored to an edge), fully `rounded-3xl` on
  desktop (it floats).
- `max-h-[70dvh]` with the list scrolling inside — never the shell.
- The dismissal contract is unchanged: Escape, outside click, and focus returning
  to whatever opened it. A sheet is a different shape, not different behaviour.

## The composer

One row at 375px gives the textarea 37px. Stack it instead:

```tsx
<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto] gap-2
                md:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] md:grid-rows-1">
```

- Phones: the textarea takes its own full-width row; the attach / model / send
  controls sit on a second row beneath it.
- `md:` restores the single-row pill exactly as it is today.
- The `UsageGauge` is `hidden sm:flex` — it's a secondary readout, and the model
  selector already sets the precedent of hiding its label on small screens.
- Keep `rounded-3xl` when stacked (it's a panel at that point), `rounded-full` when
  it collapses back to one row.

## The on-screen keyboard

The one mobile failure mode with no desktop equivalent: the keyboard covers the
composer, and `100vh`/`h-screen` layouts don't notice.

- `h-dvh` on the shell handles the common case on its own.
- Where it isn't enough, listen to `window.visualViewport`'s `resize` and offset
  the composer by `innerHeight - visualViewport.height`. Detach the listener on
  unmount; `visualViewport` can be undefined, so feature-detect.
- Never auto-focus the textarea on mount on a phone — it summons the keyboard
  before the user has seen the screen.

## Content density

- Grids start at one column: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Two
  115px cards side by side is not a gallery.
- Settings and any form-shaped view are a single column until `md:`.
- Wide content (tables, code blocks, diagrams) scrolls inside its own
  `overflow-x-auto` container. The page never scrolls sideways.
- Truncate with `truncate` + `min-w-0` rather than letting a long filename force
  the layout wider.

## Tap targets

`size-11` (44px) is the floor on touch; `size-10` (40px) is acceptable from `md:`
where there's a pointer. See [accessibility.md](accessibility.md) — a control that
is visually smaller can still meet the floor by padding its hit area.

## Verifying

Every UI change is checked at **375×812 and 1440×900**, in **light and dark**, plus
a keyboard-only pass. In practice:

- No horizontal scrolling at 375 — `document.documentElement.scrollWidth` must not
  exceed `window.innerWidth`.
- The composer is reachable with the keyboard open.
- Nothing interactive is under 44px on the phone viewport.
- The glow still reads (see [glow.md](glow.md) — blob positions are tuned for a
  wide viewport and want checking when the shell goes vertical).
