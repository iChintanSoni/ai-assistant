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
  <SkipLink />   {/* sr-only focus:not-sr-only, href="#main" */}
  <Nav />        {/* fixed bottom bar on phones, w-16 rail from md: up */}
  <main id="main" className="relative z-10 flex flex-1 flex-col overflow-hidden px-4
                   pb-[calc(3.25rem+max(0.5rem,env(safe-area-inset-bottom)))] md:px-6 md:pb-0">
    {/* focal content */}
  </main>
</div>
```

- **`h-dvh`, not `h-screen`.** `100vh` on mobile is measured against the *largest*
  viewport, so with the browser toolbar showing, the bottom of the layout sits
  below the fold — which is exactly where the composer lives. `dvh` tracks the
  toolbar. On desktop the two are identical.
- **The nav stays first in the DOM, with a skip link past it.** It's a landmark and
  it's visually first on desktop, so that's the order that matches. Reordering with
  `order-*` for the phone lane fixes one lane by breaking the other — it would leave
  the desktop rail painting first while reading last, which is exactly the
  visual-vs-focus mismatch [accessibility.md](accessibility.md) forbids. A
  `sr-only focus:not-sr-only` "Skip to content" link is what keeps a phone user from
  tabbing the whole bar before the composer.
- `flex-col md:flex-row` doesn't position the bar — the bar is `fixed`, so it's out
  of flow entirely. What the direction actually buys is that `main` takes the full
  width once the rail is hidden.
- **`main` must reserve the bar's height**, because a fixed bar cannot push content.
  Define it once — this app keeps it as `--nav-h` in `index.css`
  (`calc(3.25rem + max(0.5rem, env(safe-area-inset-bottom)))`: the bar's `pt-2` plus
  a 44px target) and references it as `pb-[var(--nav-h)]`. Retyping the expression
  at each call site drifts the moment the bar changes; a magic `pb-20` is wrong in
  both directions from the start.
- The **shell** still never scrolls. A *focal pane* may scroll inside it — that's
  the one relaxation of the single-screen rule, and it's what makes a long
  transcript or a file grid usable on a phone.
- Page gutters tighten to `px-4` on phones; `md:px-6` restores the desktop rhythm.

## Navigation: bottom bar under `md:`, rail above

Same icons, same `aria-label`s, same active treatment — re-flowed, not redesigned.
Bottom-anchored because that's where thumbs are, and because 64px of a 375px
viewport is too much to spend on chrome.

```tsx
{/* One <nav>, two lanes. Not two components: jsdom never loads the stylesheet, so
    a second `md:hidden` nav would duplicate every button for tests and make each
    getByRole ambiguous. */}
<nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around
                bg-white/70 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]
                ring-1 ring-slate-200/70 backdrop-blur-md
                md:relative md:inset-auto md:h-full md:w-16 md:flex-col md:justify-between
                md:bg-transparent md:px-0 md:py-6 md:ring-0 md:backdrop-blur-none">
  <div className="flex items-center gap-1 md:flex-col md:gap-2">…</div>
  <div className="flex items-center gap-1 md:flex-col md:gap-2">…</div>
</nav>
```

- **`env(safe-area-inset-*)` is 0 unless the page opts in.** It only reports a real
  inset when the viewport meta carries `viewport-fit=cover`:

  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
  ```

  Without it the padding silently collapses to the `max()` floor and the 44px nav
  buttons sit inside the home-indicator strip, where taps become system swipes.
  The `max()` wrapper is there so the bar still has breathing room on devices with
  genuinely no inset — it is not a substitute for the meta tag.
- **`viewport-fit=cover` opts in on every axis, not just the bottom.** A notched
  phone in landscape is wide enough for `md:`, where the rail is `w-16 px-0` and
  `main` is `px-6` — both narrower than the ~44px left/right inset, so controls end
  up under the notch. Pad the shell horizontally as well:
  `pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]`.
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
{/* container */}
<div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] grid-rows-[auto_auto] items-center
                gap-x-2 gap-y-2 rounded-3xl px-4 py-3
                md:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] md:grid-rows-1 md:gap-y-0
                md:rounded-full md:px-3 md:py-2.5">

  {/* the textarea owns a full-width row, then rejoins the pill at md: */}
  <textarea className="col-span-full row-start-1 px-2 py-2.5
                       md:col-span-1 md:col-start-2 md:row-start-1 md:px-0 md:py-0" />

  {/* controls sit on row 2, and fold back onto row 1 at md: */}
  <button className="col-start-1 row-start-2 md:row-start-1" />        {/* attach */}
  <div    className="col-start-3 row-start-2 md:col-start-4 md:row-start-1" />  {/* model */}
  <button className="col-start-4 row-start-2 md:col-start-5 md:row-start-1" />  {/* send */}
</div>
```

- The textarea needs **`col-span-full`** on the phone row — without it, auto-flow
  drops it into a single 1fr cell beside the controls and you are back to a ~37px
  input. `md:col-span-1` resets it when the pill collapses to one row.
- The phone grid has **five** columns (attach · flexible · model · mic · send) and
  the `md:` grid has six (the usage gauge rejoins). Column starts are therefore
  breakpoint-specific — count them when adding a control.
- Send and the mic coexist rather than sharing a slot: voice input appends to an
  existing draft, so swapping the mic out for Send would make dictation reachable
  only from an empty composer.
- `py-2.5` on the textarea is what lifts it to the 44px touch floor; the
  auto-resize reads `scrollHeight`, which includes padding under `border-box`.
- The `UsageGauge` is `hidden sm:flex` — it's a secondary readout, and the model
  selector already sets the precedent of hiding its label on small screens.
- Keep `rounded-3xl` when stacked (it's a panel at that point), `rounded-full` when
  it collapses back to one row.

## The on-screen keyboard

The one mobile failure mode with no desktop equivalent: the keyboard covers the
composer, and `100vh`/`h-screen` layouts don't notice.

- **`h-dvh` does not shrink for the keyboard.** By default browsers use
  `interactive-widget=resizes-visual`: the *visual* viewport shrinks while the
  layout viewport — and therefore `dvh` — stays put. On an `overflow-hidden` shell
  that means the composer is covered and cannot even be scrolled to. This is the
  trap; `h-dvh` solves the browser-toolbar problem, not this one.
- **`interactive-widget=resizes-content`** in the viewport meta makes the layout
  viewport — and `dvh` — shrink with the keyboard, so the existing layout just
  works. **It is Chromium-only.**
- **iOS Safari therefore still needs the `visualViewport` fallback**, which is not
  optional there: measure `innerHeight - visualViewport.height - offsetTop` and pad
  the shell by it. Listen to both `resize` and `scroll` (iOS scrolls the visual
  viewport to reveal the caret), feature-detect `visualViewport`, and detach on
  unmount. `hooks/useKeyboardInset.ts` is the implementation.
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

Key the floor on the **input device, not the viewport width**: `pointer-coarse:`
means an imprecise pointer, which is the thing that actually needs a bigger target.
`md:` gets this wrong in both directions — an iPad in portrait is 768px and
touch-only, a narrowed desktop window is 700px with a mouse.

```tsx
<button className="size-10 pointer-coarse:size-11" />
```

See [accessibility.md](accessibility.md) — a control that must look smaller can
still meet the floor by padding its hit area rather than its visual box.

## Verifying

Every UI change is checked at **375×812 and 1440×900**, in **light and dark**, plus
a keyboard-only pass. In practice:

- No horizontal scrolling at 375 — `document.documentElement.scrollWidth` must not
  exceed `window.innerWidth`.
- The composer is reachable with the keyboard open.
- Nothing interactive is under 44px with a coarse pointer.
- The glow still reads (see [glow.md](glow.md) — blob positions are tuned for a
  wide viewport and want checking when the shell goes vertical).
