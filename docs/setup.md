# Setup

Full local development setup for all three services.

## Prerequisites

- **Node.js 20.6+** (uses `node --env-file-if-exists`; developed against Node 24).
- **[Ollama](https://ollama.com)** running locally (`OLLAMA_BASE_URL`, default
  `http://localhost:11434`), with at least one tool-calling chat model pulled:
  ```
  ollama pull gemma4:12b
  ```
  The agent only offers models whose Ollama `/api/show` capabilities include
  both `completion` and `tools` as orchestrator choices.
- **Optional — document chat / RAG**: an embedding model, since large
  documents are retrieved by chunk-embedding similarity:
  ```
  ollama pull nomic-embed-text
  ```
  and the [Docling](https://github.com/docling-project/docling) CLI (Python,
  external to this repo):
  ```
  pip install docling
  ```
  Document upload still works without Docling installed except ingestion will
  fail — see `DOCLING_CLI_PATH` below.
- **Optional — web search**: a [Tavily](https://tavily.com) API key. Without
  one, `web_search` falls back to keyless DuckDuckGo scraping automatically.

## Install

```
npm install
```

This installs all three workspaces (`apps/agent`, `apps/frontend`,
`apps/file-storage`) from the root.

## Environment variables

Each app has a `.env.example` — copy it to `.env` in the same directory and
adjust as needed:

```
cp apps/agent/.env.example apps/agent/.env
cp apps/file-storage/.env.example apps/file-storage/.env
cp apps/frontend/.env.example apps/frontend/.env
```

### `apps/agent/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Port the A2A server listens on. |
| `PUBLIC_URL` | `http://localhost:PORT` | Public base URL advertised in the AgentCard. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama server. |
| `DEFAULT_MODEL` | `gemma4:12b` | Default orchestrator model (must support tool-calling). |
| `DATA_DIR` | `./data` | Where checkpoints, history, documents, and memories live. |
| `TAVILY_API_KEY` | unset | Optional; enables Tavily web search over the DuckDuckGo fallback. |
| `OLLAMA_CLI_PATH` | `ollama` | Path to the Ollama CLI binary, used for image generation. |
| `IMAGE_GEN_MODEL` | `x/z-image-turbo:latest` | Image-generation model. |
| `IMAGE_GEN_TIMEOUT_MS` | `240000` | Cold-start image generation can take ~100s locally; this gives headroom. |
| `FILE_STORAGE_BASE_URL` | `http://localhost:6060` | Where generated images are uploaded to become URLs the frontend can display. |
| `FILE_CLEANUP_ENABLED` | `true` | Orphan file-storage sweep (startup + every 6h). Set to `false` to disable entirely. |
| `DOCLING_CLI_PATH` | `~/.pyenv/versions/3.12.10/bin/docling` | Path to the Docling CLI. Override if `pip install docling` put it somewhere else — check with `which docling`. |
| `DOCUMENT_INGEST_TIMEOUT_MS` | `180000` | Timeout for a single Docling conversion. |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Ollama embedding model for large-document retrieval. |
| `CAPTION_MODEL` | `DEFAULT_MODEL` | Vision-capable model used to caption extracted figures at ingest time. |
| `SMALL_DOC_TOKEN_BUDGET` | `6000` | Documents at/under this size skip embedding and are searched as full text. |
| `DOCUMENT_CHUNK_TOKEN_BUDGET` | `500` | Target chunk size for larger documents. |
| `DENO_PATH` | `deno` | Path to the Deno binary used by the `run_javascript` sandbox. |
| `SANDBOX_TIMEOUT_MS` | `10000` | Timeout for a single `run_javascript` execution. |
| `MAX_CONTEXT_TOKENS` | unset | Clamps the orchestrator's context window below the model's real max if your hardware needs it. |

### `apps/file-storage/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address. |
| `PORT` | `6060` | Port. |
| `STORAGE_DIR` | `./.storage` | Where uploaded/generated file bytes are stored. |
| `DB_PATH` | `./file-storage.db` | SQLite metadata (verified mimetype, size, original name). |
| `BASE_URL` | `http://localhost:PORT` | Public base URL used to build download links returned by `/upload`. |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins; set explicitly in production. |

### `apps/frontend/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_AGENT_URL` | `http://localhost:4000` | The A2A agent server. |
| `VITE_FILE_STORAGE_URL` | `http://localhost:6060` | The file-storage service. |

## Running

From the repo root:

```
npm run dev
```

Runs all three via `concurrently` (agent, frontend, file-storage), color-coded
in one terminal. Individually:

```
npm run dev:agent   # apps/agent, :4000, tsx --watch
npm run dev:web      # apps/frontend, :5173, vite
npm run dev:files    # apps/file-storage, :6060, tsx --watch
```

Then open `http://localhost:5173`.

## Type checking and tests

```
npm run typecheck          # all three workspaces
npm run test                # unit tests across all three workspaces (vitest)
```
