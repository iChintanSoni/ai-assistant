# Accessibility

This design is minimal and glassy, which creates specific a11y risks: icon-only
controls, low-contrast placeholders, translucent surfaces, and ambient motion.
None of the following are optional.

## Icon-only controls need names

Every button whose content is just an icon **must** carry an `aria-label`, and its
SVG must be `aria-hidden`. The label goes on the interactive element, not the SVG.

```tsx
<button type="button" aria-label="New chat" className="…">
  <PlusIcon />           {/* svg has aria-hidden via iconProps */}
</button>
```

Applies to: every rail item, the `+`/mic pill actions, the avatar, and the model
selector when it has no visible text on mobile (`hidden sm:inline` label ⇒ keep the
`aria-label`).

## Decorative elements are hidden

The aurora glow conveys no information:

```tsx
<div aria-hidden="true" className="pointer-events-none absolute inset-0 …">
```

`aria-hidden` removes it from the a11y tree; `pointer-events-none` keeps it from
intercepting clicks/focus.

## Visible focus — never remove the outline without replacing it

We use `focus:outline-hidden` **only** when paired with a ring:

```
focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60
```

- Use `focus-visible` (keyboard) rather than `focus` so mouse clicks don't flash a
  ring, but keyboard users always see one.
- The `ring-blue-400/60` is intentionally the accent so focus is obvious against
  white and glass. Confirm it's visible on every surface (glass, soft-fill, gradient
  avatar).

## Contrast

Verify with https://webaim.org/resources/contrastchecker/ (WCAG AA: 4.5:1 body,
3:1 large text ≥ 24px/bold).

- Body/headings: `text-slate-800` / `text-slate-900` on `bg-white` — passes with margin.
- **`text-slate-400` placeholder does NOT meet 4.5:1.** That's acceptable for a
  placeholder hint, but never put essential, non-recoverable information in
  `slate-400`. Real labels use `slate-600`+.
- Accent text on white (`blue-500`/`indigo-500`) passes for large headings; re-check
  if used at small sizes.
- On translucent glass, contrast depends on what's behind it. The glow is pale, so
  `slate-800` text on `bg-white/70` stays legible — but re-verify if you darken the
  surface or place text directly over a saturated glow region.
- **Dark mode**: `text-slate-100`/`slate-200` on `bg-slate-950` passes AA with
  plenty of margin (it's a higher-contrast pairing than the light-mode
  equivalent). Re-check the same way you would in light mode if you introduce
  a new dark surface — `dark:text-slate-500` placeholder text does not meet
  4.5:1 either, same caveat as `slate-400` in light mode. See
  [dark-mode.md](dark-mode.md) for the token table.

## Motion

Honor `prefers-reduced-motion` — the global guard in [motion.md](motion.md) kills
the glow drift and all animation for users who opt out. Never gate meaning behind
motion alone.

## Keyboard & semantics

- Use real `<button>`/`<input>`/`<a>` — not `<div onClick>`. Native focusability and
  roles come for free.
- The text input has both a `placeholder` and an `aria-label` (placeholders vanish
  on input and aren't reliable names).
- When you build the model **dropdown** for real: it must be keyboard-operable
  (Enter/Space to open, arrows to move, Esc to close), expose `aria-expanded` /
  `aria-haspopup`, and manage focus. A plain `<button>` is a placeholder only.
- The **segmented control** (Appearance, or any future tri-state choice) uses
  `role="radiogroup"`/`role="radio"` with roving `tabIndex` and Left/Right
  arrow-key navigation between segments — see [components.md](components.md).
- Maintain a logical DOM/tab order: rail → main. Don't reorder visually in a way
  that fights the tab sequence.

## Tap targets

Primary interactive targets are `size-10` (40px) — the practical minimum for
touch. Don't shrink icon buttons below that. The avatar at `size-9` (36px) is a
borderline exception; enlarge if it becomes a primary action.

## Quick audit checklist

- [ ] Every icon-only control has `aria-label`; every decorative SVG is `aria-hidden`.
- [ ] Glow/decoration is `aria-hidden` + `pointer-events-none`.
- [ ] Focus ring visible on every interactive element (keyboard).
- [ ] Text contrast ≥ AA (placeholders excepted, and only for hints).
- [ ] Reduced-motion guard present.
- [ ] Native elements + sensible tab order; custom menus fully keyboard-operable.
- [ ] Tap targets ≥ 40px for primary actions.

For deeper audits, use the `chrome-devtools-mcp:a11y-debugging` skill.
