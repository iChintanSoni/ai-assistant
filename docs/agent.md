# Agent server (`apps/agent`)

An [A2A](https://github.com/a2aproject/A2A) server (`@a2a-js/sdk`) that wraps
a [deepagents-JS](https://www.npmjs.com/package/deepagents) `createDeepAgent`
running on a local Ollama model via `@langchain/ollama`'s `ChatOllama`.

## Building the agent — `src/agent/deepAgent.ts`

`buildAgent(modelName)` builds (and caches, per model name) a deep agent:

- **Model**: `ChatOllama` with `numCtx` resolved from the model's real Ollama
  `/api/show` context length (`resolveNumCtx`), optionally clamped by
  `MAX_CONTEXT_TOKENS`. Because `ChatOllama` doesn't expose a LangChain
  `.profile`, `createDeepAgent`'s own context-aware compaction trigger (85% of
  `maxInputTokens`) would otherwise silently fall back to a fixed 170k-token
  default unrelated to the model's real window — the code defines a
  `profile` getter on the model instance so that trigger is correct.
- **Tools**: `getTools()` from `src/agent/tools.ts` — see [tools.md](tools.md).
- **System prompt**: a fixed prompt (in `deepAgent.ts`) covering tone, when to
  use each tool, the `/memories/` convention, and how to cite document search
  results.
- **Checkpointer**: `getCheckpointer()` (`checkpointer.ts`) — a
  `SqliteSaver` at `data/checkpoints.db`, giving multi-turn state and durable
  HITL interrupts per `contextId`/thread.
- **Backend**: `buildBackend()` (`backends.ts`) — a `CompositeBackend` that
  routes the deep agent's built-in filesystem tools (`read_file`, `ls`,
  `write_file`, …) to in-memory `StateBackend` by default, except paths under
  `/memories/` which go to a `FilesystemBackend` rooted at
  `data/memories/` — durable across sessions, not just the current thread.
- **Subagents**: `getSubagents()` (`subagents.ts`) — a single `researcher`
  subagent (web search only) reachable via the deep agent's built-in `task`
  tool.
- **Middleware**: `ollamaToolContentFix` (`middleware.ts`) — see below.
- **`interruptOn`**: pauses execution before `RISKY_TOOLS` run (`send_email`,
  `run_javascript`, `generate_image`) until a human approves/rejects.

## The `ollamaToolContentFix` middleware

`ChatOllama` requires `ToolMessage.content` to be a plain string, but
deepagents' built-in filesystem tools can return content-block arrays. This
`wrapModelCall` middleware (`middleware.ts`) flattens any non-string tool
message content to text immediately before each model call. Without it,
calling `read_file`/`ls` against a local Ollama model throws.

## The streaming envelope

A2A has no native concept of "thinking text," "tool call," or "subagent
delegation" events — only task state transitions and message/artifact parts.
The agent layers its own protocol on top: `src/server/streaming.ts` drives the
LangGraph agent turn and, for every intermediate event, emits **one
`Envelope`** (`src/server/envelope.ts`) as a `DataPart` inside an A2A
`TaskStatusUpdateEvent`.

```ts
type EnvelopeType =
  | "reasoning" | "text" | "tool_call" | "tool_result"
  | "subagent" | "approval" | "usage" | "compaction" | "error";
```

- `reasoning` / `text` carry incremental `delta` strings, correlated by `id`.
- `tool_call` / `tool_result` carry a tool `name`, `args`, and `output`.
- `subagent` carries the same shape for a `task`-tool delegation (e.g. to
  `researcher`), so the frontend can render it as a nested block instead of a
  flat tool call.
- `approval` carries pending `ApprovalRequest[]` when the turn is paused for
  HITL.
- `usage` carries running token totals for the turn (Ollama resends full
  growing history each call, so the latest snapshot **is** the total, not a
  per-call delta to sum).
- `compaction` marks the deep agent's own summarization middleware having
  compacted older history mid-turn.

Finished, addressable outputs (as opposed to incremental deltas) use A2A's
`TaskArtifactUpdateEvent` instead of an envelope.

## HITL (human-in-the-loop) approval flow

1. The deep agent hits `interruptOn` for a risky tool call and the LangGraph
   run interrupts.
2. `executor.ts` turns the interrupt's `actionRequests` into an `approval`
   envelope and publishes the task as A2A `input-required`
   (`publisher.inputRequired(...)`).
3. The frontend renders the pending approval(s) and, on a user decision,
   sends a new message on the **same** `taskId` carrying a `DataPart`:
   `{ type: "decision", decisions: [...] }`.
4. `executor.ts`'s `extractDecisions` recognizes this shape and resumes the
   graph via `new Command({ resume: { decisions } })` against the
   checkpointed thread state — the turn continues exactly where it paused.

## Model capability rules — `src/agent/models.ts`

Ollama's `/api/show` returns a `capabilities` array per model, mapped to:

- `tools` → can drive the deep-agent orchestrator (function calling).
- `completion` → is a chat model at all (pure image-generation models lack
  this).
- `vision` → accepts image **input**.
- `image` → capability name for image-**generation** output (e.g. Flux/
  z-image) — **not** the same as `vision`; excluded from the orchestrator
  picker since generation is handled as the `generate_image` tool instead.
- `audio` → accepts audio input.
- `thinking` → emits reasoning/thinking content.

`isOrchestratorEligible` requires both `completion` and `tools`; `GET /models`
only lists models passing that check.

## REST endpoints — `src/server/app.ts`

Alongside the A2A endpoints (message send/stream, task get/cancel), the
server exposes plain REST routes the frontend uses directly:

| Route | Purpose |
| --- | --- |
| `GET /models` | Installed, orchestrator-eligible models + capabilities (chat composer's picker). |
| `GET /ollama/models` | Every local Ollama model, unfiltered, plus the current default/image-gen/embedding model (Settings page). |
| `PUT /ollama/default-model` | Set the orchestrator's default model. |
| `PUT /ollama/image-gen-model` | Set the `generate_image` model. |
| `PUT /ollama/embedding-model` | Set the document-embedding model. |
| `POST /ollama/pull` | Pull a model; streams Ollama's NDJSON progress through to the client. |
| `DELETE /ollama/models/:name` | Delete a local Ollama model. |
| `GET /conversations` | List saved conversation summaries. |
| `GET /conversations/:id` | Full persisted `UITurn[]` transcript for one conversation. |
| `PUT /conversations/:id` | Save/overwrite a transcript (called after every turn settles). |
| `DELETE /conversations/:id` | Delete a conversation (and sweep its now-orphaned files). |
| `POST /documents` | Register an uploaded file for background ingestion. |
| `GET /documents` | List the document library. |
| `GET /documents/:id` | One document's status/metadata (frontend polls this during ingest). |
| `DELETE /documents/:id` | Delete a document, its chunks, and its file-storage objects (original + figures + page images). |
| `GET /attachments` | Unified attachments/documents/generated-images index for the Files gallery. |
| `DELETE /attachments/:id` | Delete one attachment. |

## Background maintenance

- `reconcileStuckDocuments()` (`documentIngest.ts`) runs once at startup and
  marks any document still `pending` well past the ingest timeout as
  `failed` — covers the process dying mid-ingest.
- `startFileCleanup()` (`fileCleanup.ts`) sweeps file-storage for objects no
  saved transcript still references (attachments/generated images are plain
  URLs inside transcript JSON), on a 6-hour interval plus once at startup,
  with a 24-hour grace period for in-flight sends. Set `FILE_CLEANUP_ENABLED=false`
  to disable.
- `backfillAttachmentsIndex()` (`attachmentsStore.ts`) runs once at startup to
  index any pre-existing attachments/documents into the `/attachments` table
  for the Files gallery.
