# Contributing

`ai-assistant` is a personal project, developed solo, but issues and pull
requests are welcome — there's just no heavyweight process around them.

## Getting set up

Follow [docs/setup.md](docs/setup.md) for prerequisites, environment
variables, and running the three services locally. Don't duplicate that
guide here; if it's out of date, fix it there.

## Before opening a PR

- `npm run typecheck` from the repo root (checks all three workspaces).
- `npm run test -w agent` if you touched anything under `apps/agent`.
- For frontend changes, follow the **aurora-design** skill
  (`.claude/skills/aurora-design/SKILL.md`) — it's the source of truth for
  this app's visual language, and PRs that don't match its tokens/patterns
  will be asked to change.
- Keep PRs scoped to one change. Explain the *why* in the description, not
  just the *what*.

## Conventions

- TypeScript throughout, strict mode. No new `any` without a good reason.
- Prefer editing/reusing existing modules over introducing new abstractions —
  see [docs/architecture.md](docs/architecture.md) for where things live.
- Env vars go through each app's `src/config.ts`, with a matching entry added
  to that app's `.env.example`.

## Reporting bugs

Open a GitHub issue with repro steps. If you hit something like the issues
catalogued in [docs/gotchas.md](docs/gotchas.md), check there first — it
might be a known, already-diagnosed limitation rather than a new bug.

## Code of conduct

Be respectful and constructive. That's it.
