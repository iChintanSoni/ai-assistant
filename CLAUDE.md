# ai-assistant

Monorepo. Frontend lives in `apps/frontend` (Vite + React 19 + Tailwind v4).

## Any feature work — read PLAN.md first

[`PLAN.md`](PLAN.md) is the engineering playbook for this repo: the standing
decisions, the conventions, and the gates a feature must pass. Read it **before
planning or writing any feature**, frontend or agent.

The parts that change how you work, every time:

- **Plan first.** Write the plan described in PLAN.md §P0 and get explicit
  approval before implementing.
- **Agent capabilities are MCP-first** (config entry → first-party MCP server →
  peer A2A agent). A new built-in tool in `tools.ts` needs a written
  justification.
- **Live verification is a gate.** Typecheck + green tests are never sufficient:
  drive the real browser (phone *and* desktop width, light *and* dark) or hit
  the real endpoint against local Ollama, and record what you verified.
- **The documentation trail is mandatory** — `docs/*.md`, `src/config.ts` +
  `.env.example`, the README, and a `docs/gotchas.md` entry for every
  non-obvious bug you hit on the way.
- **UI is mobile-first**, and accessibility + dark mode are part of "done".

PLAN.md §P7 ends with a Definition of Done checklist — copy it into the PR.

## UI work — always use the aurora-design skill

For **any** frontend/UI task in this repo — building or editing pages,
components, layouts, styling, colors, spacing, icons, or animation — invoke the
**`aurora-design`** skill first and follow it. It is the source of truth for the
app's visual language (the "Aurora / Glow" design system) and how it is built.

Start at `.claude/skills/aurora-design/SKILL.md`, then open the specific
reference file for your task (setup, tokens, glow, layout, components, icons,
motion, accessibility). Match existing tokens and component recipes rather than
inventing new ones.
