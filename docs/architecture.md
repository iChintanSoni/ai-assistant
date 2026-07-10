# Architecture

`ai-assistant` is an npm-workspaces monorepo with three independent Node/TS
services plus a browser frontend. Everything runs locally against
[Ollama](https://ollama.com) — there is no hosted LLM dependency.

```
┌─────────────────┐        A2A protocol         ┌──────────────────┐
│  apps/frontend   │ ───────────────────────────▶│   apps/agent     │
│  React 19 + Vite │   (streamed task events)    │  A2A server      │
│  :5173           │◀───────────────────────────  │  :4000           │
└─────────┬────────┘                              └─────────┬────────┘
          │ uploads / fetches file URLs                      │ shells out
          ▼                                                   ▼
┌──────────────────┐                              ┌──────────────────────┐
│ apps/file-storage │◀─────────────────────────────│ Ollama (:11434)      │
│ Express + multer  │      publishes generated      │ chat / embed / CLI  │
│ :6060             │      images, serves uploads    │ Docling CLI (Python)│
└──────────────────┘                              └──────────────────────┘
```

## The three services

| Service | Port | Role |
| --- | --- | --- |
| [`apps/agent`](../apps/agent) | 4000 | A2A server wrapping a deepagents-JS deep agent (`ChatOllama`). Owns all agent state: checkpoints, conversation history, document library, long-term memory. See [agent.md](agent.md). |
| [`apps/frontend`](../apps/frontend) | 5173 | React 19 + Vite + Tailwind v4 UI (Aurora/Glow design system). Talks to the agent over A2A and to file-storage for uploads. See [frontend.md](frontend.md). |
| [`apps/file-storage`](../apps/file-storage) | 6060 | Standalone Express upload/serve microservice. Stores uploaded attachments and agent-generated artifacts (images, document page renders), serves them back over HTTP. See [file-storage.md](file-storage.md). |

Each service has its own `package.json`, `.env`, and lifecycle — they only
know about each other through HTTP (agent ↔ file-storage) and the A2A
protocol (frontend ↔ agent). `npm run dev` from the repo root runs all three
concurrently; each also has its own `dev` script for running in isolation.

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
4. If the agent calls a risky tool (`send_email`, `run_javascript`,
   `generate_image`), the turn pauses at LangGraph's `interruptOn` and the
   task moves to A2A's `input-required` state; the frontend renders an
   approval prompt and resumes the same task with a decision message.
5. On completion, the frontend persists the full `UITurn[]` transcript to the
   agent's history store (`PUT /conversations/:id`) so reopening it later is
   pixel-identical, not reconstructed from LangGraph state.

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

No CI, no auth/multi-user support, no hosted deployment story — this is a
local-first, single-user assistant. See the README's Status/Roadmap section
for what's done.
