# Motion

Motion is **calm and slow**. The only ambient animation is the aurora drift;
interactive feedback is limited to short color/transform transitions. Everything
must degrade to no-motion under `prefers-reduced-motion`.

## The `float` keyframe (aurora drift)

Defined once in [../examples/index.css](../examples/index.css) /
`apps/frontend/src/index.css`:

```css
/* Slow, organic drift so the aurora glow feels alive rather than static. */
@keyframes float {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -52%) scale(1.08);
  }
}
```

Why it looks right:
- It preserves `translate(-50%, -50%)` (the centering offset from
  [glow.md](glow.md)) and only nudges +`scale`/-2% Y — a gentle breathing motion,
  not a slide.
- Because the keyframe includes the centering translate, **any element using it
  must be centered with `-translate-1/2`** or it will jump.

## Invoking custom keyframes in Tailwind v4

Tailwind does **not** auto-generate keyframes referenced by an arbitrary
`animate-[...]`. You must declare the `@keyframes` in CSS (above), then call it:

```
animate-[float_9s_ease-in-out_infinite]
animate-[float_11s_ease-in-out_infinite_reverse]
animate-[float_13s_ease-in-out_infinite]
```

- Underscores become spaces inside the arbitrary value.
- Stagger the durations (9s / 11s / 13s) across blobs so they never sync up — this
  is what makes the glow feel organic. Use `_reverse` on one for counter-motion.
- Longer duration = calmer. Keep ambient motion ≥ ~8s.

## Interactive transitions

Short, subtle, purposeful:

| Interaction | Classes |
| --- | --- |
| Icon button hover | `transition-colors hover:bg-slate-100 hover:text-slate-900` |
| Selector hover | `transition-colors hover:bg-slate-200/80` |
| Avatar hover | `transition-transform hover:scale-105` |
| Input focus | `transition focus-within:ring-blue-300/70` |

Guidelines: prefer `transition-colors`/`transition-transform` over `transition-all`;
keep durations at Tailwind's default (~150ms) unless there's a reason. No bouncy
easings, no large movement, no attention-grabbing loops besides the glow.

## Reduced motion (required)

Always ship this guard in the global CSS so the ambient glow (and any future
animation) stops for users who opt out:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
  }
}
```

Reference: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

If you add a motion that conveys meaning (rare here), provide a static equivalent
rather than relying on the animation alone.
