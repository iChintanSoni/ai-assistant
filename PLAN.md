# PLAN.md — How features get built in `ai-assistant`

This is the engineering playbook for this repo: the conventions a feature must
follow, and the gates it must pass before it counts as done.

**How to read it**

- **Part I — Principles** explains *why* each convention exists. Read once;
  re-read when a rule feels wrong.
- **Part II — The Playbook** is the mechanical, ordered checklist. Follow it
  literally, per feature, without needing Part I.
- **Part III — Foundation work** lists the changes the newer rules (mobile-first,
  router, PWA) assume but that the codebase hasn't made yet.
- **Part IV — Reference** is the lookup layer: extension seams, platform
  capabilities, commands, anti-patterns.

Companion documents, all still authoritative:
[`CLAUDE.md`](CLAUDE.md), [`CONTRIBUTING.md`](CONTRIBUTING.md),
[`docs/`](docs/) (8 files), and the **`aurora-design`** skill
(`.claude/skills/aurora-design/SKILL.md`) for anything visual.

---

## Part 0 — Standing decisions

These are settled. Don't re-litigate them per feature; change them here, in one
commit, with a reason.

| # | Decision | Consequence |
| --- | --- | --- |
| 1 | **Plan before code, with explicit approval.** | No implementation starts until the plan in §P0 is written and approved. |
| 2 | **Tests land with the feature; coverage thresholds are advisory.** | Meaningful tests are mandatory. A dip under 80/80/80/70 is acceptable *with a stated reason* in the PR. |
| 3 | **Live verification is a gate, not a courtesy.** | Frontend: driven in a real browser. Agent: hit against real Ollama/real endpoint. Typecheck + green tests are necessary, never sufficient. |
| 4 | **The full documentation trail is mandatory.** | `docs/*.md` + `src/config.ts` + `.env.example` + README bullet/status + a `docs/gotchas.md` entry for every non-obvious bug met on the way. |
| 5 | **New agent capabilities are MCP-first.** | Tier 1 (consume an MCP server) → Tier 2 (write one) → Tier 3 (peer A2A). A new built-in tool in `tools.ts` needs a written justification. |
| 6 | **Branch + PR, conventional commits, squash merge.** | `feat:`/`fix:`/`refactor:`/`docs:`/`test:`/`chore:`. Green typecheck + tests before push. **No `Co-Authored-By: Claude` trailer.** |
| 7 | **Mobile-first is the new baseline.** | New UI is designed at phone width and scaled up. The desktop full-viewport aurora layout becomes the enhancement, not the starting point. |
| 8 | **`react-router` is adopted.** | `useConversationRouting.ts` is replaced (see §F1). Sanctioned exception to decision 10. |
| 9 | **The app becomes an installable PWA with an offline shell.** | Manifest + icons + service worker (see §F3). Sanctioned exception to decision 10. |
| 10 | **A new runtime dependency is a decision, not a reflex.** | Justify it in the plan: what it does, why the platform/an existing dep can't, what it costs. Decisions 8 and 9 are the only pre-approved additions. |
| 11 | **Schema and protocol changes stay backward-compatible.** | Envelope `v: 1`, persisted `UITurn` JSON, and every SQLite schema must read old data. Additive only. |
| 12 | **Nothing fails silently.** | One broken capability degrades to "unavailable" and says so. Never swallow an error into a generic fallback. |
| 13 | **Accessibility and dark mode are part of "done" for UI.** | Not a follow-up pass. |
| 14 | **Modularity is layering, not line counts.** | No enforced ceiling. The layers in §I9 are the rule. |
| 15 | **Every feature leaves a seam behind.** | Prefer extending a registry/config over adding a special case (§I10). |

---

# Part I — Principles

## I1. Config over code: the three-tier capability model

The single most important architectural idea in this repo
([`docs/architecture.md`](docs/architecture.md#extending-the-agent-three-tiers)).
Adding a capability should mean editing JSON, not `deepAgent.ts`.

1. **Consume an MCP server** — an entry in
   `apps/agent/config/mcp-servers.json`. Zero custom code. Precedent: `fetch`
   (`uvx mcp-server-fetch`).
2. **Write a first-party MCP server** — a new workspace spoken to over stdio,
   reusable outside this repo, crash-isolated from the agent process.
   Precedent: `apps/mcp-authoring`.
3. **Stand up a peer A2A agent** — an entry in
   `apps/agent/config/a2a-peers.json`, for a capability that needs its *own*
   multi-turn reasoning loop rather than a stateless tool call. The agent
   derives a `delegate_to_<name>` tool automatically (`a2aPeers.ts`).

**Built-in tools in `tools.ts` are the exception, not the default.** They're
justified only when the tool needs something that lives inside the agent
process: `documentStore` access (`search_documents`, `summarize_document`,
`view_document_page`), `config` values, or the embedding cache. "It was
quicker" is not a justification — `tools.ts` is already 407 lines and is the
file most likely to rot.

A fourth, in-process option exists and is often overlooked: an **in-process
subagent** (`subagents.ts`, reachable via the built-in `task` tool) when you
need a focused reasoning loop with a *restricted* toolset but no separate
server. Precedent: `researcher`.

## I2. One protocol, one reducer

A2A has no notion of "thinking text" or "tool call," so this repo layers its
own **envelope** on top (`apps/agent/src/server/envelope.ts`): exactly one
`Envelope` per `DataPart` per `TaskStatusUpdateEvent`. The frontend mirrors
that type in `lib/envelope.ts` with an `isEnvelope` guard, and
`store/chat.ts`'s `applyEnvelope` is the **single** reducer for every
`EnvelopeType`.

Consequences you must respect:

- A new kind of streamed event means a new `EnvelopeType` **and** a new
  `applyEnvelope` branch **and** a mirrored type on the frontend. All three, or
  none.
- `v: 1` never changes. New information arrives as new *optional* fields.
- Finished, addressable outputs use `TaskArtifactUpdateEvent`, not an envelope.
- `reasoning`/`text` are deltas correlated by `id`; `usage` is a **snapshot,
  not a delta** — Ollama resends the whole growing history each call, so the
  latest value *is* the total. Never sum it.

## I3. Local-first is a constraint, not a preference

No hosted LLM, no external database, no cloud storage. Everything runs against
local Ollama, local SQLite, the local filesystem, and local CLIs. This is load-bearing:

- **A local single-GPU Ollama serializes requests.** `Promise.all` over model
  calls buys nothing and trips `UND_ERR_HEADERS_TIMEOUT`. Dispatch sequentially
  (`documentSummarize.ts`, `documentFigures.ts`, `documentIngest.ts`'s
  `runBackgroundEnrichment`).
- **Shelling out to a CLI is a legitimate integration.** `ollama run` for image
  generation, `docling` for parsing, `whisper-cli` + `ffmpeg` for speech. Use
  `spawn()` with explicit `stdio`, never `execFile()` — `execFile` silently
  ignores `stdio` and hangs CLIs that need stdin closed
  ([`docs/gotchas.md`](docs/gotchas.md)).
- **Every external binary is optional.** Missing `uvx`/`docling`/`whisper-cli`
  degrades that one capability with a clear message; the agent still boots.
- **Slow is expected.** Long work (ingest, captioning, summarization) runs as a
  background job that flips a status the frontend polls — never inside the
  request that started it.

## I4. Files are URLs, never bytes

Attachments and generated artifacts go to `apps/file-storage` first; messages,
tool results, and persisted transcripts carry the **URL**. This holds in the
live A2A message (`useChat.ts`), in tool returns (`{ url, filename }`), and in
the saved transcript JSON.

`apps/file-storage` verifies mimetypes by **magic bytes** (`file-type`), not by
the client's claim — with two deliberate, narrow trust-after-verification
exceptions documented in `validate.ts` (`text/*`, and audio-WebM
disambiguation). A new supported format means an explicit allow-list entry;
silently returning 415 for a format the UI advertises has already happened
twice.

## I5. Clear ownership of state

- **The frontend owns what a saved conversation looks like.** It `PUT`s the
  exact `UITurn[]` after every turn settles; the backend stores that JSON
  verbatim and never reconstructs a transcript from LangGraph state. Reopening a
  chat is pixel-identical by construction.
- **The agent owns agent state**: checkpoints, the document library, long-term
  memory, the attachments index, settings.
- Derived indexes are built as a **side effect of the existing write path**
  (`attachmentsStore.syncFromTurns` from the conversation `PUT`), not by
  scanning storage on read.

## I6. Every store has the same shape

Four hand-rolled SQLite stores in `apps/agent` (`historyStore`, `documentStore`,
`attachmentsStore`, `settingsStore`) plus `file-storage`'s own share one pattern —
copy it exactly for the next. (`checkpoints.db` is the exception: LangGraph's
`SqliteSaver` owns it, via `checkpointer.ts`.)

- Its **own** `.db` file under `config.dataDir`. Don't add a table to someone
  else's database.
- Lazy `let db | undefined` + `getDb()` that `mkdirSync`es, opens, sets
  `journal_mode = WAL`, and runs `CREATE TABLE IF NOT EXISTS`. No module-level
  side effects — this is what makes `tests/setup.ts`'s temp-`DATA_DIR` trick work.
- `snake_case` columns, a `*Row` interface, a `*Record` interface, and an
  explicit row→record mapper. No leaking row shapes out of the module.
- Migrations are additive: new nullable column, or a new table. Reads must
  tolerate rows written by every previous version.

## I7. Degrade loudly and locally

The `mcp.ts` precedent is the model: `onConnectionError: "ignore"` +
`throwOnLoadError: false` means one unreachable server costs you that server's
tools and nothing else — and risky-tool registration is filtered to tools that
*actually loaded*, so no dead `interruptOn` entries linger.

The other half of the rule: a caught error must go **somewhere a human sees**
— a returned error string the model can relay, a `console.error`, a surfaced UI
message, a `failed` status. A `catch {}` that produces a plausible-looking empty
result is the bug pattern this repo has paid for most.

## I8. Backward compatibility is permanent

There is real user data on disk and no migration tooling. The codebase already
carries the scars, and they're the template:

- `UIAttachment | LegacyUIAttachment | string` — three historical shapes of the
  same field, all still rendered.
- `timestamp?: number` — absent on old turns, rendered as "no timestamp", never
  as an error.
- `sizeClass: "pending" | "small" | "large"` — a state that exists only because
  ingest is asynchronous.

So: new fields are optional, renames are forbidden, and any reader must handle
the shape that existed before it.

## I9. Modularity is layering

No line-count rule. These boundaries instead — when a module starts doing two
of these jobs, split it.

**Frontend**

| Layer | Does | Must not |
| --- | --- | --- |
| `components/*` | Render; local UI state only. | Fetch, or know about A2A. |
| `hooks/*` | Orchestrate a flow (send, attach, record, route). | Contain markup. |
| `lib/*` | Pure functions + the HTTP/A2A boundary. | Touch React. |
| `store/*` | Hold state; one reducer per protocol. | Perform I/O. |

`lib/*` being React-free is what makes it cheaply unit-testable, and most of
this repo's test value sits there.

**Agent**

| Layer | Does |
| --- | --- |
| `src/server/*` | Transport: Express routes, A2A executor, publisher, envelope, streaming translation. |
| `src/agent/*` | Capability: tools, stores, model/CLI integrations, pipelines. |
| `src/config.ts` | The only place `process.env` is read. |

A route handler in `app.ts` should validate input, call one `agent/*` function,
and map the result to a status code. Business logic living in a route handler is
a smell.

**Shared** — code needed by two workspaces goes in `packages/shared-node`
(source-only, no build step), as `uploadToFileStorage()` did.

## I10. Leave a seam, not a special case

Look at how the Files page handles generated files: `matchesKindFilter` groups
every `generated-*` kind with `item.kind.startsWith("generated-")`, so a future
generation tool needs **no filter-bar change** — only a `KIND_LABEL`/`KindIcon`
case. That's the standard to hit.

When you add the second instance of something, convert the first into a
registry. The existing ones, which are the extension points to reach for first:

| Registry | Where | Governs |
| --- | --- | --- |
| `RISKY_TOOLS` + per-server `riskyTools` | `tools.ts`, `config/mcp-servers.json` | Which tools need HITL approval |
| `FILE_TOOL_NAMES` | `components/Conversation.tsx` | Which tool results render as a download card |
| `DOCUMENT_TOOL_NAMES` / `DIAGRAM_TOOL_NAMES` | `agent/attachmentsStore.ts` | Which tool outputs enter the Files gallery |
| `AttachmentKind` | `attachmentsStore.ts` + `lib/attachments.ts` | Files-gallery taxonomy (keep both sides in sync) |
| `DELEGATION_TOOL_NAMES` | `server/streaming.ts` | What renders as a nested subagent block |
| `Modality` / capability flags | `agent/models.ts` | Upload gating and model eligibility |

## I11. The design system is law; mobile-first is the baseline

For **any** UI work, load the `aurora-design` skill first and follow it —
it is the source of truth, and PRs that invent their own tokens get changed
back. The golden rule: separation comes from **whitespace and the glow**, never
borders, shadows, or cards.

Mobile-first (decision 7) changes the *starting point*, not the visual
language. It conflicted with the skill's then-current `h-screen w-screen
overflow-hidden` + fixed `w-16` rail shell, and the resolution was explicit:
**update the skill, never diverge from it**. That half of §F2 has landed — the
skill now documents `h-dvh`, a bottom bar below `md:`, and a 44px
coarse-pointer touch floor.

While the screen retrofits are in flight the app trails the skill rather than
leading it. That direction is the safe one: the skill is the target every screen
is moving toward, and §F2 names the remaining ones. The reverse — a component
styling itself mobile-first while the skill still documented desktop-only
shells — is the one to avoid.

## I12. Docs are part of the product

This repo's docs are unusually good and that's deliberate — eight files, each
with a clear scope, plus `gotchas.md` written as *standalone engineering notes*
(symptom → root cause → fix) rather than a changelog. Several entries are
useful well beyond this repo (the `execFile` stdio trap, the cross-package
`Buffer` nominal-typing problem, the Docling reading-order bug). Keeping that
quality is a gate, not a nicety — see §P6.

---

# Part II — The Playbook

Run these phases in order, for every feature.

## P0 — Plan and get approval *(gate)*

Produce a short written plan and **stop for approval**. It must state:

1. **What and why** — the user-visible outcome in one or two sentences.
2. **Tier/seam** — for an agent capability, which of the four options from §I1
   and why; for UI, which existing components/hooks/registries it extends. If
   it's a new built-in tool, the justification for *not* using MCP.
3. **Contracts touched** — new envelope type or field? `UITurn` field? SQLite
   column or table? REST route? Config/env var? New registry entry?
   Name each, and state the backward-compatibility story (§I8).
4. **Files** — the concrete list you expect to create or edit.
5. **Dependencies** — any new package, with the §I1 justification; or
   explicitly "none".
6. **Test list** — what gets tested and at which layer.
7. **Verification method** — exactly how this will be proven working live (§P5).
8. **Docs to update** — which `docs/*.md` sections, README lines, `.env.example`
   entries.
9. **Risks / open questions** — including anything you'd otherwise guess at.

Skip nothing. A small feature gets a short plan, not no plan.

## P1 — Contracts first

Before behaviour, land the shapes:

- Types (`Envelope`, `UITurn`, `*Record`, tool Zod schema) — and their mirrored
  counterpart on the other side of the wire.
- SQLite DDL, additive.
- Config: add to the app's `src/config.ts` **and** its `.env.example` in the
  same edit, with a comment saying what it's for and why the default is the
  default. Never read `process.env` outside `config.ts`.
- Tool schemas use `zod` with `.describe()` on every field — the descriptions
  are the model's only documentation.

## P2 — Implement: agent lane

Ordered, with the rules that apply at each step:

1. **Capability module** in `src/agent/` — one responsibility, no Express
   imports. Shelling out? `spawn()` with explicit `stdio`, an explicit timeout
   from config, and cleanup of temp files in a `finally`.
2. **Store** (if it needs persistence) — copy the §I6 pattern exactly, own
   `.db` file.
3. **Tool or route**:
   - Tool → Tier 1/2/3 per §I1. Risky? Add it to `RISKY_TOOLS` or the server's
     `riskyTools`; that one list is the whole HITL wiring. Return *strings the
     model can use*, including for errors; a file-producing tool returns
     `{ url, filename }` and gets registered in the §I10 registries.
   - Route → in `app.ts`: validate, delegate, map to a status code. `400` for a
     bad request shape, `404` for a missing entity, `502` for an unreachable
     dependency (Ollama) — matching what's already there.
4. **Streaming**, only if the feature introduces a genuinely new event kind:
   new `EnvelopeType`/field → emit in `streaming.ts`/`executor.ts` → mirror in
   `lib/envelope.ts` → handle in `applyEnvelope` → render. Never partially.
5. **Long work** → background job + status the frontend polls; sequential
   Ollama calls only (§I3).
6. **Cleanup** — anything that writes to file-storage must be reachable by
   `fileCleanup.ts`'s sweep (URLs present in transcript JSON) or delete its own
   objects on entity delete, the way `deleteDocumentRecord` does.

## P3 — Implement: frontend lane

1. **Load the `aurora-design` skill** and open the specific reference file for
   the task (tokens / layout / components / icons / motion / accessibility /
   dark-mode / responsive).
2. **Design at phone width first**, then scale up (decision 7): single column,
   `≥44px` tap targets, safe-area insets, a composer that survives the on-screen
   keyboard, sheets rather than desktop flyouts. Then add the `sm:`/`md:`/`lg:`
   enhancements up to the desktop aurora shell.
3. **Layer it** per §I9: pure logic into `lib/`, flow into a `hooks/` hook,
   markup into `components/`, shared state into the store. A component that
   starts calling `fetch` is in the wrong layer.
4. **Extend a registry, don't special-case** (§I10).
5. **Accessibility and dark mode as you write, not after**: `aria-label` on
   every icon-only button, `focus-visible:ring-2 focus-visible:ring-blue-400/60`
   paired with `focus:outline-hidden`, decorative nodes `aria-hidden` +
   `pointer-events-none`, a `dark:` companion for every light token, every
   animation behind a `prefers-reduced-motion` guard.
6. **Navigation**: route-driven, deep-linkable, back/forward-correct, focus moved
   to the new view on navigation, Escape and the back gesture both dismiss
   overlays, no dead ends (an unknown path redirects to the hub rather than
   landing on the router's error page). A URL a view rewrites for itself —
   rather than one the user asked for — uses `replace`, so Back returns where the
   user came from instead of a state they never chose.
7. **Platform capabilities** — check §R2 and use what genuinely fits. Every one
   is progressive enhancement: feature-detect, and degrade to the existing path.
8. **Optimistic, honest UI** — a pending state for every async action, an error
   the user can act on, and never lose user input on failure (`Composer.tsx`
   only clears the draft *after* the upload succeeds).

## P4 — Test

- **Place tests as the repo already does**: agent/file-storage/mcp-authoring in
  `tests/*.test.ts`; frontend colocated as `src/**/*.test.{ts,tsx}`.
- **Mock at the module boundary**, `vi.mock(...)` hoisted above imports, then
  `vi.mocked(x).mockReset()` in `beforeEach` — the established style in
  `tools.test.ts` and `useChat.test.ts`.
- **Never touch real `./data`.** `tests/setup.ts` points `DATA_DIR` at a temp
  dir before any module reads `config`; lazy `getDb()` (§I6) is what makes that
  work. Don't break it with module-level DB opens.
- **What to cover**: the happy path; every error branch you wrote; the
  backward-compatibility branch (old persisted shape still renders); the
  degraded path (dependency missing/unreachable).
- **Frontend**: assert on user-visible behaviour via Testing Library and roles/
  labels. Reset the zustand store in `beforeEach` with explicit state.
- **Tests needing real Ollama/Docling** go in
  `apps/agent/tests/integration/*.integration.ts` — excluded from CI, run with
  `npm run test:integration -w agent`.
- **Coverage** (80/80/80/70, root-level): keep it green. If the feature is
  mostly CLI-shelling or glue and coverage dips, say so in the PR with the
  reason — that's allowed (decision 2), silence isn't.

## P5 — Verify live *(gate)*

Typecheck and tests passing is **not** done.

- **Frontend** — run the app (`npm run dev`), drive the real flow in a browser
  (chrome-devtools MCP or Playwright), and confirm: the happy path, at least one
  error path, **phone viewport and desktop viewport**, light **and** dark, and
  keyboard-only operation of anything new. Check the console for errors you
  introduced.
- **Agent** — exercise it against real local Ollama: the tool actually invoked
  by the model (not just unit-called), the HITL pause/approve/reject round trip
  if it's risky, and the route via `curl`. Confirm a restart preserves whatever
  should persist.
- **Write down what you verified** in the PR, specifically. "Tested locally" is
  not a verification record; "sent a 12-page PDF, ingest went pending → ready in
  ~40s, `search_documents` cited pages 3 and 7, survived a server restart" is.

## P6 — Document *(gate)*

A feature is not done until all of these are true:

- [ ] The owning `docs/*.md` file describes the new behaviour — `agent.md`
      (server/endpoints/envelope/HITL), `tools.md` (any new tool),
      `frontend.md` (components/hooks/state), `architecture.md` (new service,
      data flow, or persistence), `documents-chat.md` (RAG pipeline),
      `file-storage.md`, `setup.md` (new prerequisite or env var).
- [ ] Every new env var is in `src/config.ts` **and** `.env.example` **and**
      `docs/setup.md`'s table, with its default explained.
- [ ] `README.md`'s feature bullet list and Status list reflect reality.
- [ ] **Every non-obvious bug hit on the way has a `docs/gotchas.md` entry** —
      symptom, root cause, fix, written so it's useful to someone outside this
      repo (§I12). Found a library behaving surprisingly, a format silently
      rejected, a CLI hanging? That's an entry. This is the highest-value
      artifact in the repo; don't skip it because the bug is fixed.
- [ ] Comments explain **why**, not what. Match the density of the surrounding
      code — which is high, and load-bearing (see the comment on `usage` in
      `store/chat.ts`, or `mcp.ts`'s `cwd` note).

## P7 — Ship

1. Branch off `main`, one feature per branch.
2. `npm run typecheck` (all workspaces) and `npm run test` from the root — both
   green. `npx eslint .` in `apps/frontend` for UI work.
3. Conventional-commit messages: `feat:`/`fix:`/`refactor:`/`docs:`/`test:`/
   `chore:`. Imperative, specific. **No `Co-Authored-By: Claude` trailer.**
4. PR body: the **why**, the verification record from §P5, any coverage-dip
   reason, and any dependency justification.
5. Squash merge.

## Definition of Done — copy this into the PR

```
- [ ] Plan written and approved before implementation      (P0)
- [ ] Contracts additive & backward-compatible             (P1, I8)
- [ ] Capability tier justified (MCP-first)                (P0.2, I1)
- [ ] Layering respected; a seam left behind, not a special case (I9, I10)
- [ ] No new runtime dep, or justified in the PR            (D10)
- [ ] Nothing fails silently                               (D12, I7)
- [ ] Env vars: config.ts + .env.example + setup.md        (P1, P6)
- [ ] Tests land with the code; coverage green or dip explained (P4)
- [ ] aurora-design followed; mobile-first; a11y + dark mode done (P3)
- [ ] Verified live — browser (phone + desktop, light + dark) / real Ollama (P5)
- [ ] docs/*.md + README updated; gotchas entry for every non-obvious bug (P6)
- [ ] typecheck + tests + eslint green; conventional commit; no Claude trailer (P7)
```

---

# Part III — Foundation work

Decisions 7, 8 and 9 describe a codebase that doesn't exist yet. Until these
land, there's a gap between the rules and the repo. Each is its own
plan-and-PR cycle, in this order.

## F1 — Adopt `react-router` ✅ *done*

Landed on `feat/react-router`: `react-router` 8.3.1 in data-router mode, the Node
floor moved to 24, `useConversationRouting.ts` replaced by `routes.tsx` + a
`conversationLoader` + `hooks/useConversationUrlSync.ts`, an unknown-path redirect,
focus-on-navigation, and 13 route tests (`App.test.tsx` passed unchanged, which was
the behaviour-neutrality check). The store/URL race it surfaced is written up in
[docs/gotchas.md](docs/gotchas.md); the routing contract is in
[docs/frontend.md](docs/frontend.md).

**Was:** `hooks/useConversationRouting.ts` (105 lines) hand-rolls `/`, `/c/:id`,
`/files`, `/settings` with `pushState` + a `popstate` listener; `App.tsx`
switches on a `view` string and threads `navigateToChat`/`navigateToFiles`/
`navigateToSettings` callbacks down into `Sidebar` and `HistoryPanel`.

**Why change:** mobile-first (F2) adds real navigation weight — sheets, a
bottom bar, back-gesture dismissal, scroll restoration per view — and the
hand-rolled hook has no answer for nested routes, route-level code splitting
(which the PWA shell in F3 wants), or focus management on navigation. The hook's
own comment ("there are only ever four pages here, so a router dependency isn't
needed") stops being true at that point.

**Shape:** `createBrowserRouter` with a root layout route (glow + rail/bottom
bar + `HistoryPanel`) and children `/`, `/c/:id`, `/files`, `/settings`. The
conversation restore currently in `loadFromUrl` becomes a route loader. Keep
`useChatStore` as the state owner — the router owns *which view*, not *what's in
it*. Replace the threaded callbacks with `useNavigate`/`Link`.

**Risks:** the mid-stream `contextId`→URL sync (the `lastSynced` ref dance) is
subtle and easy to regress into a navigation loop; `useConversationRouting.test.ts`
(110 lines) encodes behaviour worth preserving — port the assertions rather than
deleting them.

**Done when:** all four routes deep-link and refresh correctly; back/forward
traverses conversations; a failed conversation load still redirects to `/`;
focus moves to the new view on navigate; the old hook and its ad-hoc callbacks
are gone; tests ported.

## F2 — Mobile-first in the design system ✅ *done*

The **design-system half has landed**: `references/responsive.md` is written, and
`layout.md`'s stance, `tokens.md`'s breakpoint ladder and 44px tap-target floor,
`accessibility.md`, `components.md`, `glow.md`, `examples/HomePage.tsx` and
`SKILL.md` all now read mobile-first. Navigation is a bottom bar below `md:` and
the `w-16` rail above it. What remains is retrofitting the four screens, in the
order listed below.

All four screens have been retrofitted. Measured at 375×812, before → after:

| | Before | After |
| --- | --- | --- |
| Composer textarea | 37 × 96px | 311 × 44px |
| Nav | 64px rail (17% of the viewport) | bottom bar, `main` full width |
| History panel | ran 25px off-screen | full-width bottom sheet |
| Files grid | two 115px columns | one column |
| Controls under 44px (hub / Files / Settings) | 9 / 34 / 25 | **0 / 0 / 0** |

Along the way this surfaced a class of bug worth naming: every destructive control
in the app was `opacity-0 group-hover:opacity-100`. A touch device never hovers, so
deleting a conversation, a file, or a model was **impossible** on a phone — the
controls were not merely small, they were invisible. They are now shown under
`pointer-coarse:` and hover-revealed only where there's a fine pointer.

Desktop is unchanged throughout: the rail returns at `md:`, the composer collapses
back to its single-row `rounded-full` pill, the History flyout re-anchors to the
rail, and the Files grid keeps its 4/5-column densities.

**Was:** the `aurora-design` skill documents a desktop-only shell —
`h-screen w-screen overflow-hidden` with a fixed `w-16` rail
(`references/layout.md`) — and `App.tsx` implements exactly that. `index.html`'s
viewport meta is the plain `width=device-width, initial-scale=1`, which is *not*
enough: without `viewport-fit=cover` every `env(safe-area-inset-*)` reads 0, and
without `interactive-widget=resizes-content` the on-screen keyboard covers the
composer on an `overflow-hidden` shell.

**Why change:** decision 7. And the skill must stay the single source of truth
(§I11), so the skill changes *first*.

**Shape:**

1. Add `.claude/skills/aurora-design/references/responsive.md` and route to it
   from `SKILL.md`'s routing table and checklist. It defines the mobile
   translation of each existing pattern: rail → bottom bar (or drawer) with the
   same thin-line icons; `HistoryPanel` flyout → bottom sheet; `FilesPage` grid
   → single column; composer with `env(safe-area-inset-*)` and `visualViewport`
   handling; the `overflow-hidden` rule relaxed to "the *shell* doesn't scroll,
   the focal pane may".
2. Amend `references/layout.md` so the root shell is stated mobile-first with
   desktop as the `md:`+ enhancement.
3. Add the breakpoint ladder and tap-target minimum to `references/tokens.md`.
4. Then retrofit the screens, one PR each, most-used first: chat shell +
   composer → `HistoryPanel` → `FilesPage` → `SettingsPage`.

**Done when:** the skill documents both lanes; all four screens are usable at
375px wide with no horizontal scroll, in light and dark; §P5's phone-viewport
verification is actually passable.

## F3 — PWA: installable, offline shell ✅ *done*

Landed on `feat/pwa-installable-shell`: `vite-plugin-pwa` in `generateSW`
mode, a manifest with one safe-zone-padded icon design carrying
`purpose: "any maskable"`, and a `<meta name="theme-color">` kept in sync
with the app's *resolved* theme (not bare `prefers-color-scheme`, since
`store/theme.ts`'s preference can override it) rather than a static
per-scheme value. No `runtimeCaching` rules — precache-only, so the agent/
file-storage origins are never touched. `devOptions` stays off, confirmed
live that `npm run dev` registers no service worker while a production
`preview` build does, activates, and serves the shell (verified by forcing
Chrome's network-offline state and reloading) with a new `OfflineBanner`
(`navigator.onLine`-driven, distinct from the pre-existing `modelsError`
fetch-failure note) rendering alongside it. Full shape/rationale below is
kept as the original design record.

**Now (before this landed):** a plain Vite SPA — no manifest, no service
worker, no icons beyond `favicon.svg`.

**Why:** decision 9. Concretely valuable here because the transcript is already
persisted server-side and conversations are the main thing you return to — an
app-shell cache means a reopened conversation paints before the agent answers.
It's also the prerequisite for several §R2 capabilities (share target, file
handlers, badging, notifications).

**Shape:** `vite-plugin-pwa` (the dependency decision 9 sanctions), a manifest
with maskable icons and `theme-color` per scheme, and a service worker caching
the app shell + static assets only. **Never cache agent API responses** — a
stale model list, document status, or transcript is worse than a loading state.
Add an explicit offline state: the app shell renders and says the agent is
unreachable (§I7).

**Risks:** a service worker serving a stale shell during development is a
genuinely confusing failure mode — register it in production builds only, and
document the reset procedure in `docs/setup.md`.

**Done when:** installable on desktop and Android; the shell loads offline and
says so honestly; `npm run dev` behaviour is unchanged; `docs/frontend.md` and
`docs/setup.md` cover it.

---

# Part IV — Reference

## R1 — Where things live

| Need | File |
| --- | --- |
| Add an MCP server (Tier 1/2) | `apps/agent/config/mcp-servers.json` |
| Add a peer agent (Tier 3) | `apps/agent/config/a2a-peers.json` |
| Add a built-in tool *(justify first)* | `apps/agent/src/agent/tools.ts` (`getAllTools`) |
| Gate a tool behind approval | `RISKY_TOOLS` in `tools.ts`, or `riskyTools` in the server's JSON entry |
| Add an in-process subagent | `apps/agent/src/agent/subagents.ts` |
| Change the system prompt / model wiring | `apps/agent/src/agent/deepAgent.ts` |
| Add a streamed event kind | `server/envelope.ts` → `server/streaming.ts` → `lib/envelope.ts` → `store/chat.ts` |
| Add a REST route | `apps/agent/src/server/app.ts` |
| Add persistence | new store in `src/agent/`, own `.db`, §I6 pattern |
| Add an env var | that app's `src/config.ts` + `.env.example` + `docs/setup.md` |
| Render a tool result specially | `components/Conversation.tsx` (+ `FILE_TOOL_NAMES` if it's a file) |
| Put a generated file in the gallery | `DOCUMENT_TOOL_NAMES`/`DIAGRAM_TOOL_NAMES` + `AttachmentKind` (both copies) + `KIND_LABEL`/`KindIcon` |
| Change model eligibility / upload gating | `agent/models.ts` + `lib/models.ts` |
| Share code between workspaces | `packages/shared-node` |

## R2 — Platform capability catalogue

A checklist to consider, not a backlog to implement. Each is progressive
enhancement: feature-detect, degrade to the existing path, and never make it
load-bearing.

**Capture & media input**
- Camera capture for attachments (`<input capture>` on mobile; `getUserMedia`
  for a live preview) — routes straight into the existing
  `useAttachments.addFiles` pipeline.
- Clipboard paste of an image into the composer — same pipeline, two lines of
  paste handler.
- `navigator.permissions` to pre-check mic state so the button can say *why*
  it's unavailable instead of failing on click.
- **Explicitly rejected:** Web Speech `SpeechRecognition` as a faster
  alternative to the whisper round trip — Chrome's implementation ships audio to
  Google's servers, which breaks the local-first constraint (§I3). Keep
  `whisper-cli`.

**OS integration** *(most need F3)*
- Web Share API — share a generated document/diagram/image out to another app.
- **Share target + file handlers** in the manifest ✅ *done* — receive a PDF
  from the OS share sheet or "Open with" and drop it straight into document
  ingest. The single highest-value one on this list: it makes the assistant
  a first-class destination for files. Landed on
  `feat/pwa-share-target`: `manifest.share_target` + a hand-written
  `src/sw.ts` (switched `vite-plugin-pwa` to `injectManifest` for this —
  `generateSW` has no hook for a custom `fetch` listener), a small
  `lib/pendingShareStore.ts` IndexedDB handoff, and `routes/ShareTargetRoute.tsx`
  reusing `useAttachments.ts`'s existing upload/ingest pipeline verbatim —
  no ingest logic duplicated. See `docs/frontend.md`'s PWA section and
  `docs/gotchas.md` for the TS-project-split, cross-config-import, and
  workbox-routing-precedence gotchas hit along the way.
- Notification API — tell the user a long job finished (ingest, image
  generation, summarization) while the tab is backgrounded.
- Badging API — a count of finished-but-unseen jobs on the installed icon.
- File System Access API — save a generated file where the user wants, instead
  of the downloads folder.

**Touch & device ergonomics**
- `env(safe-area-inset-*)` on the composer and bottom bar.
- `≥44px` tap targets (several current rail/composer buttons are `size-10` = 40px).
- `visualViewport` so the mobile keyboard never covers the composer.
- `overscroll-behavior` to stop pull-to-refresh fighting a scrolled transcript.
- `navigator.vibrate` on a HITL approval prompt — a real side-effect pause is
  exactly the moment a haptic earns its place.
- Screen Orientation / landscape sanity for the conversation view.

**Additional ideas worth evaluating**
- **Page Visibility API** — pause the document-ingest and model-pull polling
  loops while the tab is hidden. Cheap, immediate, removes pointless load from a
  machine that's also running the model.
- **Screen Wake Lock** — hold the screen awake during a long generation on
  mobile, where the default is to sleep and kill the stream.
- **Speech Synthesis** — read an answer aloud; fully on-device, and the natural
  counterpart to the existing voice input.
- **View Transitions API** — pairs with F1's router for navigation motion that
  costs nothing and stays inside the `prefers-reduced-motion` rules.
- **`<meta name="theme-color">` per scheme** — the mobile browser chrome
  currently ignores dark mode, which breaks the aurora look at the edges.
- **IndexedDB draft persistence** — an unsent composer draft (and staged
  attachments) surviving a reload; mobile tabs get evicted far more often than
  desktop.
- **`navigator.onLine` + Network Information** — say "the agent is unreachable"
  distinctly from "the agent failed" (§I7).
- **`navigator.storage.persist()` / `estimate()`** — protect PWA caches from
  eviction, and surface what the app is holding.
- **`content-visibility` / virtualization** for very long transcripts.
- **Keyboard shortcuts / command palette** — the desktop half of "platform
  ergonomics"; this app is keyboard-driven by nature.
- **`display-mode` media query** — adjust chrome when running installed vs. in a
  browser tab.

## R3 — Commands

```
npm run dev                      # all three services (agent + web + file-storage)
npm run dev:agent                # one service at a time
npm run typecheck                # every workspace — required before commit
npm run test                     # vitest, all projects — required before commit
npm run test:coverage            # with the 80/80/80/70 gates
npm run test -w agent            # one workspace
npm run test:integration -w agent  # needs real Ollama/Docling; not in CI
npx eslint .                     # in apps/frontend
```

## R4 — Anti-patterns, all previously paid for

| Don't | Why |
| --- | --- |
| `execFile()` for a long-running CLI | Silently ignores `stdio`; hangs CLIs needing stdin closed. Use `spawn()`. |
| `Promise.all` over Ollama calls | One local GPU serializes them anyway; concurrency only buys header timeouts. |
| Inline file bytes in a message or transcript | Upload first, reference by URL. |
| Summing `usage` across calls | It's a growing snapshot, not a delta. |
| A new table in someone else's `.db` | One store, one database file. |
| Opening a DB at module load | Breaks the temp-`DATA_DIR` test isolation. |
| Reading `process.env` outside `config.ts` | Config is a single, documented surface. |
| Renaming a persisted field | There's real data on disk and no migration tooling. |
| `catch {}` with a plausible-looking fallback | The most expensive bug shape in this repo. |
| A new mimetype the UI advertises but `validate.ts` rejects | Has shipped as a silent 415 twice. |
| Borders, shadows, or cards for separation | Violates the design system's golden rule. |
| A light-mode token with no `dark:` companion | Half the app's users are in dark mode. |
| An icon-only button with no `aria-label` | Fails the non-negotiable a11y checklist. |
