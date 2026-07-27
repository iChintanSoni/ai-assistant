# Architecture

`ai-assistant` is an npm-workspaces monorepo: three independent Node/TS HTTP
services, a browser frontend, a first-party MCP server the agent spawns on
demand, and a small shared internal package. Everything runs locally against
[Ollama](https://ollama.com) — there is no hosted LLM dependency.

```
┌─────────────────┐        A2A protocol         ┌──────────────────┐
│  apps/frontend   │ ───────────────────────────▶│   apps/agent     │
│  React 19 + Vite │   (streamed task events)    │  A2A server      │
│  :5173           │◀───────────────────────────  │  :4000           │
└─────────┬────────┘                              └─────────┬────────┘
          │ uploads / fetches file URLs                      │ shells out / MCP stdio
          ▼                                                   ▼
┌──────────────────┐                              ┌──────────────────────────────┐
│ apps/file-storage │◀─────────────────────────────│ Ollama (:11434)              │
│ Express + multer  │      publishes generated      │ chat / embed / CLI          │
│ :6060             │      images/docs, serves      │ Docling CLI (Python)         │
└──────────────────┘      uploads                  │ MCP servers (fetch, authoring)│
                                                     │ whisper-cli / ffmpeg CLI      │
                                                     └──────────────────────────────┘
```

## The services and workspaces

| Workspace | Port | Role |
| --- | --- | --- |
| [`apps/agent`](../apps/agent) | 4000 | A2A server wrapping a deepagents-JS deep agent (`ChatOllama`). Owns all agent state: checkpoints, conversation history, document library, long-term memory. Also an MCP *client* and an A2A *client* (for peer delegation) — see below. See [agent.md](agent.md). |
| [`apps/frontend`](../apps/frontend) | 5173 | React 19 + Vite + Tailwind v4 UI (Aurora/Glow design system). Talks to the agent over A2A and to file-storage for uploads. See [frontend.md](frontend.md). |
| [`apps/file-storage`](../apps/file-storage) | 6060 | Standalone Express upload/serve microservice. Stores uploaded attachments and agent-generated artifacts (images, generated documents/diagrams, document page renders), serves them back over HTTP. See [file-storage.md](file-storage.md). |
| [`apps/mcp-authoring`](../apps/mcp-authoring) | — | First-party MCP server (no HTTP port — spoken to over stdio, spawned by `apps/agent`). Document/diagram generation tools. See [tools.md](tools.md). |
| [`packages/shared-node`](../packages/shared-node) | — | Source-only internal package (no build step, consumed directly via its `package.json` `exports`). `uploadToFileStorage()`, shared by `apps/agent` and `apps/mcp-authoring`. |

Each service has its own `package.json`, `.env` (where applicable), and
lifecycle — they only know about each other through HTTP (agent ↔
file-storage), the A2A protocol (frontend ↔ agent, agent ↔ any registered
peer agent), and MCP over stdio (agent ↔ `mcp-authoring`/`fetch`/any
configured server). `npm run dev` from the repo root runs the three HTTP
services concurrently; each also has its own `dev` script for running in
isolation. `apps/mcp-authoring` isn't run standalone — the agent spawns it on
demand per `config/mcp-servers.json`.

## Extending the agent: three tiers

Every capability added to the agent falls into one of three tiers, in order
of how much custom code it needs. All three are **config-driven** — adding a
capability means editing a JSON file, not `deepAgent.ts`/`tools.ts`:

1. **Consume an existing MCP server** — cheapest, zero custom code. Add an
   entry to `apps/agent/config/mcp-servers.json` (stdio command/args, or an
   `http`/`sse` `url`) pointing at any MCP server, third-party or your own.
   Example: `fetch`, the official `mcp-server-fetch` reference server.
2. **Write a first-party MCP server** — custom logic that still runs
   isolated from the agent process (a separate workspace, spawned over
   stdio), reusable outside this repo. Example: `apps/mcp-authoring`. Use
   `@modelcontextprotocol/sdk`'s `McpServer`/`StdioServerTransport`; if it
   produces a file, upload it via `packages/shared-node`'s
   `uploadToFileStorage()` and return `{ url, filename }` — the frontend's
   `Conversation.tsx` already knows how to render that shape as a download
   card (extend `FILE_TOOL_NAMES` there, and `attachmentsStore.ts`'s
   `DOCUMENT_TOOL_NAMES`/`DIAGRAM_TOOL_NAMES` if it should show up in the
   Files gallery).
3. **Stand up a peer A2A server** — for a capability that needs its own
   multi-turn reasoning loop, not just a stateless tool call. Add an entry to
   `apps/agent/config/a2a-peers.json` (`{ name, description, url }`); the
   agent gets a `delegate_to_<name>` tool automatically (see
   `a2aPeers.ts`). No peer is registered by default.

See [tools.md](tools.md) for the concrete tools each tier currently
provides, and `mcp.ts`/`a2aPeers.ts` for the wiring.

## Why A2A

The frontend and agent speak
[A2A](https://github.com/a2aproject/A2A) (`@a2a-js/sdk`) rather than a
bespoke REST/WebSocket protocol. A2A gives task lifecycle (`submitted` →
`working` → `completed`/`failed`/`canceled`/`input-required`) and streaming
status/artifact events for free. A2A has no native concept of "thinking
text" or "tool call" events, so the agent layers its own protocol on top —
see the **envelope** section in [agent.md](agent.md).

## Data flow: a chat turn

1. Frontend uploads any attached files to file-storage first, then sends an
   A2A message referencing them by URL (never inline bytes) — see
   `useChat.ts` (`apps/frontend/src/hooks/useChat.ts`).
2. The agent's `DeepAgentExecutor` (`apps/agent/src/server/executor.ts`)
   validates the chosen model supports tool-calling and the uploads match its
   modalities, opens an A2A task, and hands off to
   `runAgentToEvents` (`apps/agent/src/server/streaming.ts`), which drives
   the LangGraph deep agent turn-by-turn.
3. Each incremental model/tool event is translated into an **envelope**
   (`apps/agent/src/server/envelope.ts`) and published as a `DataPart` inside
   a `TaskStatusUpdateEvent`.
4. If the agent calls a risky tool — the built-in `RISKY_TOOLS`
   (`send_email`, `run_javascript`, `generate_image`) plus any MCP server's
   declared `riskyTools` (e.g. every `apps/mcp-authoring` tool) — the turn
   pauses at LangGraph's `interruptOn` and the task moves to A2A's
   `input-required` state; the frontend renders an approval prompt and
   resumes the same task with a decision message.
5. On completion, the frontend persists the full `UITurn[]` transcript to the
   agent's history store (`PUT /conversations/:id`) so reopening it later is
   pixel-identical, not reconstructed from LangGraph state.

## Data flow: voice input

Decoupled from the chat-turn flow above and from the orchestrator model
entirely (no Ollama model has real audio input yet — see
[gotchas.md](gotchas.md)):

1. The frontend's `useVoiceInput.ts` records a clip via `MediaRecorder`,
   uploads it to file-storage like any other attachment (`lib/upload.ts`).
2. It then calls the agent's `POST /transcribe { url }`, which downloads the
   clip, transcodes it to 16kHz mono WAV via `ffmpeg` (browser
   `MediaRecorder` output isn't a format whisper-cli's bundled decoder
   reads — see [gotchas.md](gotchas.md)), and runs it through a local
   `whisper-cli` (whisper.cpp) process, returning `{ text }`.
3. The transcript fills the composer's text box for the user to review/edit
   — it is never auto-sent as a message.

## Data flow: a document upload (documents chat / RAG)

See [documents-chat.md](documents-chat.md) for the full pipeline
(Docling → chunking → embedding → retrieval). In short: the frontend uploads
to file-storage, then `POST /documents` on the agent kicks off a background
ingest job that converts, chunks, classifies (small vs. large), embeds (large
docs only), and extracts+captions figures — the frontend polls
`GET /documents/:id` for status.

## Local persistence

All state is local SQLite/filesystem — there's no external database.

| Store | File | Owned by | Holds |
| --- | --- | --- | --- |
| LangGraph checkpoints | `apps/agent/data/checkpoints.db` | `checkpointer.ts` | Per-thread agent state (messages, tool calls), enabling multi-turn + resumable HITL interrupts. |
| Conversation history | `apps/agent/data/history.db` | `historyStore.ts` | The frontend's exact `UITurn[]` JSON per conversation, plus LLM-generated titles. |
| Document library | `apps/agent/data/documents.db` | `documentStore.ts` | Document metadata, chunk text, and (for large docs) chunk embeddings as `Float32Array` BLOBs. |
| Long-term memory | `apps/agent/data/memories/` | `backends.ts` | Plain files under a virtual `/memories/` root, read/written by the agent via `write_file`/`ls`/`read_file`, durable across sessions. |
| File-storage metadata | `apps/file-storage/file-storage.db` | `store.ts` | Verified mimetype/size/original-name per stored file. |
| File-storage blobs | `apps/file-storage/.storage/` | — | The actual uploaded/generated file bytes. |

## Not built

No auth/multi-user support, no hosted deployment story — this is a
local-first, single-user assistant. (CI does exist:
`.github/workflows/test.yml` runs typecheck + tests on push/PR.) See the
README's Status/Roadmap section for what's done.
