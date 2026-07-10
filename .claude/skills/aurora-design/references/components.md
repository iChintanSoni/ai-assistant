# Components

Reusable building blocks and their exact recipes. Reuse these class strings;
don't reinvent per component. All share the same language: `rounded-full`,
translucent/soft surfaces, `slate` neutrals, blue→indigo accent, visible focus.

## Prompt / input pill

The primary interaction surface: an ultra-rounded, translucent, glassy pill.

```tsx
<div className="w-full max-w-2xl">
  <div className="flex items-center gap-3 rounded-full bg-white/70 px-3 py-2.5 ring-1 ring-slate-200/70 backdrop-blur-md transition focus-within:ring-blue-300/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
    <IconButton label="Add attachment"><PlusIcon /></IconButton>

    <input
      type="text"
      placeholder="Ask anything..."
      aria-label="Ask anything"
      className="min-w-0 flex-1 bg-transparent text-base text-slate-800 placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100 dark:placeholder:text-slate-500"
    />

    <ModelSelector />
    <IconButton label="Voice input"><MicIcon /></IconButton>
  </div>
</div>
```

Key points:
- Surface = `bg-white/70` + `backdrop-blur-md` + `ring-1 ring-slate-200/70`. This
  is the glass recipe — **no** solid border, **no** shadow.
- `focus-within:ring-blue-300/70` lights the whole pill when the input is focused.
- Input is `bg-transparent` + `focus:outline-hidden` (the pill shows focus, not the
  raw input). `min-w-0 flex-1` lets it shrink correctly in flexbox.
- `gap-3` between the `+`, input, selector, and mic.

## Icon button (rail item / pill action)

One recipe, used for all icon-only circular actions.

```tsx
function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {children}
    </button>
  )
}
```

The rail's `RailButton` is the same recipe (add `group` if you need hover-driven
children). Requirements: `size-10` hit target, `aria-label`, visible focus ring,
`hover:bg-slate-100` soft fill. Icon-only buttons **must** have `aria-label`.

## Model / version selector (dropdown pill)

A soft-filled pill: accent sparkle + label + chevron. Label collapses on mobile.

```tsx
function ModelSelector() {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100/80 py-1.5 pl-3 pr-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80"
    >
      <SparkleIcon />
      <span className="hidden sm:inline">Opus 4.8</span>
      <ChevronDownIcon />
    </button>
  )
}
```

- Secondary surface = `bg-slate-100/80` + `hover:bg-slate-200/80` (softer than the
  main pill, so it reads as nested).
- Asymmetric padding `pl-3 pr-2` visually balances text against the chevron.
- `hidden sm:inline` on the label — icon + chevron remain on mobile.
- When wiring real behavior, use a proper listbox/menu with keyboard support and
  `aria-expanded` (see [accessibility.md](accessibility.md)).

## Gradient accent text

For a highlighted phrase inside a heading.

```tsx
<h1 className="mb-10 text-center text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl">
  Hi Chintan,{' '}
  <span className="bg-linear-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
    let&apos;s get started
  </span>
</h1>
```

`bg-linear-to-r from-blue-500 to-indigo-500` + `bg-clip-text text-transparent`
paints the text with the accent gradient. Use the v4-native `bg-linear-*` name
(the legacy `bg-gradient-*` alias still resolves but is flagged by the Tailwind
editor tooling — see [setup.md](setup.md)).

## Avatar

```tsx
<button
  type="button"
  aria-label="Profile"
  className="flex size-9 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-500 text-sm font-medium text-white transition-transform hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
>
  {initial}
</button>
```

Diagonal `bg-linear-to-br` accent, white initial, subtle `hover:scale-105`.

## Segmented control (tri-state)

Used for the Appearance setting (Auto/Light/Dark) in the Settings flyout —
any future tri-state choice should reuse this recipe rather than a dropdown.

```tsx
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon: IconType }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="flex gap-1 rounded-full bg-slate-100/80 p-1 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:ring-slate-700/60"
    >
      {options.map(({ value: v, label, icon: Icon }) => {
        const checked = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(v)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
              checked
                ? "bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

Key points:
- Track = the same "secondary soft fill" recipe as the model pill
  (`bg-slate-100/80` / `dark:bg-slate-800/80`), so it nests visually.
- Active segment = solid fill (`bg-white` / `dark:bg-slate-700`), not a
  border or shadow — consistent with "glow, not chrome."
- `role="radiogroup"` + `role="radio"` + `aria-checked`, with roving
  `tabIndex` (only the checked segment is `0`) and Left/Right arrow-key
  navigation between segments — see [accessibility.md](accessibility.md).
- Real usage: `src/components/SettingsPanel.tsx`.

## Surface cheat-sheet

| Surface | Light | Dark |
| --- | --- | --- |
| Primary glass (input) | `bg-white/70 backdrop-blur-md ring-1 ring-slate-200/70` | `dark:bg-slate-900/70 dark:ring-slate-700/60` |
| Secondary soft fill (selector) | `bg-slate-100/80 hover:bg-slate-200/80` | `dark:bg-slate-800/80 dark:hover:bg-slate-700/80` |
| Ghost hover (icon buttons) | transparent → `hover:bg-slate-100` | transparent → `dark:hover:bg-slate-800` |
| Accent (avatar / active) | `bg-linear-to-br from-blue-500 to-indigo-500 text-white` | unchanged |

See [dark-mode.md](dark-mode.md) for the full token table and mechanism.
Icons used above (`PlusIcon`, `MicIcon`, `SparkleIcon`, `ChevronDownIcon`, …) are
defined in [icons.md](icons.md).
