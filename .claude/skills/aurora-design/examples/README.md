# Examples — canonical reference implementation

These files are **verbatim copies of the live source**, kept here as the
ground-truth reference for the [aurora-design](../SKILL.md) skill:

| Example | Live source |
| --- | --- |
| [HomePage.tsx](HomePage.tsx) | `apps/frontend/src/App.tsx` |
| [index.css](index.css) | `apps/frontend/src/index.css` |

`HomePage.tsx` is the complete home screen — root shell, `AuroraGlow`, `Sidebar`,
`PromptBar`, `ModelSelector`, and the full inline icon set — assembled exactly as
the reference files describe. `index.css` holds the Tailwind import, `@theme` font
token, the `float` keyframe, and the reduced-motion guard.

When you change the real UI in a way that shifts the design language (new tokens,
new component recipe, changed glow), update the matching reference file **and**
refresh these copies so the skill never drifts from reality:

```bash
cp apps/frontend/src/App.tsx   .claude/skills/aurora-design/examples/HomePage.tsx
cp apps/frontend/src/index.css .claude/skills/aurora-design/examples/index.css
```
