# Contributing

`ai-assistant` is a personal project, developed solo, but issues and pull
requests are welcome — there's just no heavyweight process around them.

## Getting set up

Follow [docs/setup.md](docs/setup.md) for prerequisites, environment
variables, and running the three services locally. Don't duplicate that
guide here; if it's out of date, fix it there.

## How features get built — PLAN.md

[PLAN.md](PLAN.md) is the playbook: the standing decisions, the conventions,
and the gates a change has to pass. It's the authority on process — this file
just points at it. The short version:

- **Plan first** (PLAN.md §P0), and get it agreed before implementing.
- **Agent capabilities are MCP-first** — config entry, then a first-party MCP
  server, then a peer A2A agent. A new built-in tool in `tools.ts` needs a
  stated reason.
- **Tests land with the code.** Coverage thresholds are advisory; a dip needs a
  reason in the PR, not silence.
- **Verify it live.** Typecheck and green tests aren't enough: drive the real
  browser (phone *and* desktop width, light *and* dark) or hit the real
  endpoint against local Ollama, and say in the PR what you actually checked.
- **Update the docs in the same change** — `docs/*.md`, `src/config.ts` +
  `.env.example`, the README, and a [docs/gotchas.md](docs/gotchas.md) entry
  for every non-obvious bug you hit along the way.

PLAN.md §P7 ends with a Definition of Done checklist — copy it into the PR.

## Before opening a PR

- `npm run typecheck` from the repo root (checks every workspace).
- `npm run test` from the repo root (all projects), or `npm run test -w agent`
  for a quick pass while working inside `apps/agent`.
- `npx eslint .` in `apps/frontend` for UI changes.
- For frontend changes, follow the **aurora-design** skill
  (`.claude/skills/aurora-design/SKILL.md`) — it's the source of truth for
  this app's visual language, and PRs that don't match its tokens/patterns
  will be asked to change. New UI is mobile-first, with accessibility and dark
  mode part of "done", not a follow-up.
- Keep PRs scoped to one change. Conventional-commit subjects
  (`feat:`/`fix:`/`refactor:`/`docs:`/`test:`/`chore:`). Explain the *why* in
  the description, not just the *what*.

## Conventions

- TypeScript throughout, strict mode. No new `any` without a good reason.
- Prefer editing/reusing existing modules over introducing new abstractions —
  see [docs/architecture.md](docs/architecture.md) for where things live.
- Env vars go through each app's `src/config.ts`, with a matching entry added
  to that app's `.env.example` and [docs/setup.md](docs/setup.md).
- Schemas and protocols stay backward-compatible — there's real data on disk
  and no migration tooling. New fields are optional; renames aren't allowed.
- Nothing fails silently. A broken capability reports itself unavailable and
  keeps the rest of the agent running; a caught error still has to reach a log,
  the UI, or the model.

PLAN.md Part I has the reasoning behind each of these, and Part IV lists the
anti-patterns this repo has already paid for.

## Reporting bugs

Open a GitHub issue with repro steps. If you hit something like the issues
catalogued in [docs/gotchas.md](docs/gotchas.md), check there first — it
might be a known, already-diagnosed limitation rather than a new bug.

## Code of conduct

Be respectful and constructive. That's it.
