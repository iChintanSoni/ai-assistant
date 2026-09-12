# ai-assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Requires Ollama](https://img.shields.io/badge/requires-Ollama-black?logo=ollama&logoColor=white)

A local-first AI assistant: a TypeScript **A2A** agent server backed by a
deep agent (LangGraph + [deepagents-JS](https://www.npmjs.com/package/deepagents))
running entirely on local [Ollama](https://ollama.com) models, with a React
frontend. No hosted LLM, no external database — everything runs on your
machine.

## Features

- **Streaming** — live reasoning, answer text, and tool-call timelines over the [A2A protocol](https://github.com/a2aproject/A2A). [docs/agent.md](docs/agent.md)
- **Human-in-the-loop approvals** — risky tool calls (send email, run code, generate an image) pause for explicit approve/reject before executing. [docs/agent.md](docs/agent.md)
- **Long-term memory** — a persistent `/memories/` filesystem the agent reads and writes across sessions. [docs/agent.md](docs/agent.md)
- **Web search** — Tavily-backed, with a keyless DuckDuckGo fallback. [docs/tools.md](docs/tools.md)
- **Sandboxed code execution** — JavaScript/TypeScript in a Deno sandbox with no filesystem/network/env access. [docs/tools.md](docs/tools.md)
- **Image generation** — local text-to-image via Ollama. [docs/tools.md](docs/tools.md)
- **Conversation history** — every chat persisted verbatim and reopenable, with background-generated titles. [docs/agent.md](docs/agent.md)
- **Documents chat (RAG)** — upload PDFs/Office docs/images into a searchable library ([Docling](https://github.com/docling-project/docling)-parsed, hybrid full-text/embedding retrieval, figure captioning, page-image viewing). [docs/documents-chat.md](docs/documents-chat.md)
- **Files gallery** — one unified view of every document, attachment, and AI-generated file (images, documents, diagrams), with drag-and-drop intake. [docs/frontend.md](docs/frontend.md)
- **Document & diagram generation** — downloadable Word/PowerPoint/PDF/Excel/CSV/text files, plus draw.io diagrams, via a first-party MCP server. [docs/tools.md](docs/tools.md)
- **Read a URL directly** — full page content as markdown, via the official `mcp-server-fetch` MCP server. [docs/tools.md](docs/tools.md)
- **Mermaid diagrams** — the model draws a diagram inline in its reply, rendered client-side. [docs/frontend.md](docs/frontend.md)
- **Voice input** — record a mic clip, transcribed locally (whisper.cpp) into the composer for you to review before sending. [docs/architecture.md](docs/architecture.md)
- **Extensible by design** — three tiers for adding capabilities (consume an MCP server / write a first-party MCP server / stand up a peer A2A agent), all config-driven. [docs/architecture.md](docs/architecture.md#extending-the-agent-three-tiers)

## Architecture

Three independent HTTP services plus a first-party MCP server, all local:

| Service | Port | What it is |
| --- | --- | --- |
| `apps/agent` | 4000 | A2A server wrapping the deep agent; also an MCP client and an A2A client (peer delegation) |
| `apps/frontend` | 5173 | React 19 + Vite UI (Aurora/Glow design system) |
| `apps/file-storage` | 6060 | Upload/serve microservice for attachments and generated artifacts |
| `apps/mcp-authoring` | — | Document/diagram generation MCP server, spawned by `apps/agent` over stdio |

Full diagram and data flow: [docs/architecture.md](docs/architecture.md).

## Quickstart

Prerequisites: Node.js 24+, [Ollama](https://ollama.com) running locally
with a tool-calling chat model pulled:

```
ollama pull gemma4:12b
```

Then:

```
npm install
cp apps/agent/.env.example apps/agent/.env
cp apps/file-storage/.env.example apps/file-storage/.env
cp apps/frontend/.env.example apps/frontend/.env
npm run dev
```

Open `http://localhost:5173`. To use it from your phone, run `npm run dev:lan`
and see [docs/setup.md](docs/setup.md#using-it-from-your-phone). Full setup (optional Docling/Tavily/embedding
model/`uv`/whisper-cpp/ffmpeg, every env var explained):
[docs/setup.md](docs/setup.md).

## Status

All phases below are built and browser-verified:

- ✅ Streaming (reasoning/tokens/tool-calls), cancel, multimodal upload gating, multi-turn
- ✅ HITL approvals for risky tools
- ✅ Web search + sandboxed JS execution
- ✅ Durable long-term memory + subagent delegation
- ✅ Image generation
- ✅ Conversation history
- ✅ Files gallery with drag-and-drop
- ✅ Documents chat (Docling parsing, hybrid retrieval, figure captioning)
- ✅ Three-tier extensibility architecture (MCP client, first-party MCP server, peer A2A agents)
- ✅ Document/diagram generation (docx/pptx/pdf/xlsx/csv/txt, draw.io) + URL reading + mermaid diagrams
- ✅ Voice input (local whisper.cpp transcription)

Not built: authentication/multi-user support, a hosted deployment story —
this is a personal, single-user, local-first project. CI runs typecheck +
tests on push/PR (`.github/workflows/test.yml`).

## Docs

| Doc | Covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | How the three services fit together, data flow, local persistence |
| [docs/setup.md](docs/setup.md) | Full local dev setup, every environment variable |
| [docs/agent.md](docs/agent.md) | The A2A agent server, streaming envelope protocol, HITL flow, REST endpoints |
| [docs/tools.md](docs/tools.md) | Every deep-agent tool and the `researcher` subagent |
| [docs/documents-chat.md](docs/documents-chat.md) | The Docling → chunk → embed → retrieve RAG pipeline |
| [docs/frontend.md](docs/frontend.md) | React app structure, state, key components/hooks |
| [docs/file-storage.md](docs/file-storage.md) | The upload/serve microservice, mimetype validation |
| [docs/gotchas.md](docs/gotchas.md) | Real bugs found during development — symptom, root cause, fix |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
