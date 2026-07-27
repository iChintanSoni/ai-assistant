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
- **Optional — reading URLs directly**: [`uv`](https://docs.astral.sh/uv/)
  (provides `uvx`), used to run the `fetch` MCP server
  (`uvx mcp-server-fetch`) with no separate install step. Without it, that
  one MCP server just fails to connect at startup — the rest of the agent
  (including every other MCP server/tool) is unaffected. See
  [architecture.md](architecture.md#extending-the-agent-three-tiers).
- **Optional — voice input**: [whisper-cpp](https://github.com/ggml-org/whisper.cpp)
  and [ffmpeg](https://ffmpeg.org) (both bottled on Homebrew, fast installs):
  ```
  brew install whisper-cpp ffmpeg
  ```
  plus a GGML model file — any size works, `tiny.en` is fastest for testing:
  ```
  curl -L -o apps/agent/data/whisper-models/ggml-tiny.en.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin
  ```
  then set `WHISPER_MODEL_PATH` to that file's path (see the env var table
  below). Without it, the mic button still renders but transcription returns
  a clear "isn't set up yet" error rather than failing silently. `ffmpeg` is
  required regardless of model — it transcodes whatever format the browser
  recorded into something whisper-cli can actually decode (see
  [gotchas.md](gotchas.md)).

## Install

```
npm install
```

This installs every workspace (`apps/agent`, `apps/frontend`,
`apps/file-storage`, `apps/mcp-authoring`, `packages/shared-node`) from the
root — `apps/mcp-authoring` isn't run directly (see
[architecture.md](architecture.md)), so it needs no `.env`/`dev` step of its
own.

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
| `MCP_SERVERS_CONFIG_PATH` | `config/mcp-servers.json` | MCP servers the agent connects to as a client — see [architecture.md](architecture.md#extending-the-agent-three-tiers). |
| `A2A_PEERS_CONFIG_PATH` | `config/a2a-peers.json` | Peer A2A agents the agent can delegate to. Empty (`[]`) by default. |
| `WHISPER_CLI_PATH` | `whisper-cli` | Path to the whisper-cpp CLI binary, used for voice input. |
| `WHISPER_MODEL_PATH` | unset | Path to a `ggml-*.bin` model file. Voice input returns a setup-guidance error until this is set. |
| `TRANSCRIBE_TIMEOUT_MS` | `60000` | Timeout for a single transcription (ffmpeg transcode + whisper-cli). |
| `FFMPEG_PATH` | `ffmpeg` | Path to the ffmpeg binary, used to transcode recorded audio before transcription. |
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
npm run typecheck          # every workspace
npm run test                # unit tests across every workspace (vitest)
```
