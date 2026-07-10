# The Aurora Glow

The signature element. A soft, organic, pastel radial glow sitting **behind the
focal point**, fading smoothly into the white edges. It is the primary source of
depth in this design — replacing shadows and borders entirely.

## Anatomy

Three translucent, heavily-blurred blobs, stacked and slightly offset, inside one
decorative container. Different sizes/hues/offsets make it read as organic rather
than a single flat circle.

```tsx
function AuroraGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute left-1/2 top-[62%] h-[38rem] w-[56rem] -translate-1/2 animate-[float_9s_ease-in-out_infinite] rounded-full bg-blue-400/20 blur-3xl" />
      <div className="absolute left-[44%] top-[58%] h-[24rem] w-[34rem] -translate-1/2 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-indigo-300/25 blur-3xl" />
      <div className="absolute left-[57%] top-[66%] h-[22rem] w-[30rem] -translate-1/2 animate-[float_13s_ease-in-out_infinite] rounded-full bg-sky-300/20 blur-3xl" />
    </div>
  )
}
```

Requires the `float` keyframe — see [motion.md](motion.md).

## The mandatory recipe (per blob)

1. `absolute` + position (`left-*`, `top-*`) + `-translate-1/2`
   so the coordinate is the blob's **center**.
2. Large size in `rem` (`h-[38rem] w-[56rem]`) — the glow must be bigger than the
   element it sits behind.
3. Low-opacity pastel fill: `bg-blue-400/20` (`/20`–`/25` only).
4. `rounded-full` — the shape before blurring.
5. `blur-3xl` — **non-negotiable.** This is what turns a hard disc into a soft
   aurora that fades into white. Anything less looks like a colored circle.

Container: `pointer-events-none absolute inset-0 overflow-hidden` +
`aria-hidden="true"`. `overflow-hidden` clips the blur so it can't cause page
scroll; `pointer-events-none` keeps it click-through; `aria-hidden` hides it from
assistive tech.

## Placement rule

Center the glow **behind the focal interaction**, not the geometric center of the
screen. Our hub (greeting + input) is centered as a group, so its optical center
sits below 50% — hence `top-[62%]`, `top-[58%]`, `top-[66%]`. When you move the
focal element, move the glow with it. Verify by screenshot (see below).

## Tuning guide

| Want… | Change |
| --- | --- |
| Bigger / more present glow | Increase `h-`/`w-` rem values |
| Softer, more diffuse | Keep `blur-3xl`; lower opacity to `/15`–`/20` |
| More vivid | Raise opacity toward `/25`; do not exceed `/30` |
| Shift the hotspot | Move `left-*` / `top-*` of the largest (blue) blob |
| Different mood | Swap hues within pastel blues: `sky`, `blue`, `indigo`, `cyan`, `violet` |
| Calmer motion | Longer durations in the `animate-[...]` (see motion.md) |

## Dark mode

On the `dark-mode.md` near-black background (`bg-slate-950`), the same
`/20`–`/25` opacities read as too faint — the glow nearly disappears. Boost
each blob's opacity by `dark:` variant so it stays visible without going
muddy:

```
bg-blue-400/20   dark:bg-blue-500/30
bg-indigo-300/25 dark:bg-indigo-400/30
bg-sky-300/20    dark:bg-sky-400/25
```

Keep `blur-3xl`, size, position, and animation identical between themes —
only opacity (and, where it improves visibility, one shade darker/more
saturated hue) changes. See [dark-mode.md](dark-mode.md) for the full
palette and mechanism.

## Do / Don't

✅ Keep opacity ≤ `/25` in light mode (`/30`–`/35` ceiling in dark), size in
`rem`, always `blur-3xl`, always centered on the focal point.
✅ Use 2–3 offset blobs of different hue/size for organic depth.
✅ Let it fade fully into the page background (`bg-white` / `dark:bg-slate-950`) at the edges.

❌ No hard-edged colored discs (missing/weak blur).
❌ No opacity ≥ `/30` (turns muddy, breaks the "airy" feel).
❌ Don't let the glow container add scroll — always `overflow-hidden`.
❌ Don't put content inside the glow container; content lives in `main` with a higher `z-index`.

## Layering

Glow container has no explicit z-index (paints first). Interactive layers sit
above it: `main` uses `z-10`, the sidebar `z-20`. Keep this order so the glow is
always behind everything.

## Verifying placement

Glow placement is visual — confirm it, don't guess. Run the app and screenshot:

```bash
cd apps/frontend && npm run dev
```

Then use the chrome-devtools MCP tools (`new_page`, `resize_page`,
`take_screenshot`) at both desktop (1440×900) and mobile (390×844). The brightest
part of the glow should sit directly behind the focal element on both.
