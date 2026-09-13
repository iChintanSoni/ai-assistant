# Setup

Full local development setup for all three services.

## Prerequisites

- **Node.js 24+** — what the project is developed and CI-tested against. The hard
  floors from dependencies are lower (`react-router` asks for 22.22+,
  `node --env-file-if-exists` for 20.6+); 24 is chosen so local and CI match, and
  `package.json`'s `engines` states it.
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
| `HOST` | `0.0.0.0` | Bind address. `127.0.0.1` keeps the agent off the network — it has no auth, see [Security](#security). |
| `PUBLIC_URL` | `http://localhost:PORT` | Public base URL advertised in the AgentCard. The A2A client connects to whatever this says — see [Using it from your phone](#using-it-from-your-phone). |
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
| `BASE_URL` | `http://localhost:PORT` | Public base URL used to build download links returned by `/upload`. Stored in saved transcripts — see [Using it from your phone](#using-it-from-your-phone). |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins; set explicitly in production. |

### `apps/frontend/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_AGENT_URL` | same host as the page, port 4000 | The A2A agent server. Defaults to the host you loaded the UI from, so LAN/phone access needs no setting here. |
| `VITE_FILE_STORAGE_URL` | same host as the page, port 6060 | The file-storage service. Same derivation. |

## Running

From the repo root:

```
npm run dev
```

Runs all three via `concurrently` (agent, frontend, file-storage), color-coded
in one terminal. Individually:

```
npm run dev:agent   # apps/agent, :4000, tsx --watch
npm run dev:web      # apps/frontend, :5173, vite (localhost only)
npm run dev:files    # apps/file-storage, :6060, tsx --watch
```

To reach it from another device, use `npm run dev:lan` instead — see
[Using it from your phone](#using-it-from-your-phone).

Then open `http://localhost:5173`.

## Using it from your phone

The UI is mobile-first, but `npm run dev` binds the frontend to localhost only, so
nothing else on the network can load it. Use the LAN variant instead:

```
npm run dev:lan
```

That's the only difference — it runs the frontend with `vite --host`; the agent and
file-storage already listen on every interface.

You also have to tell the two services what to call themselves, because both hand
out **absolute** URLs that the browser then fetches:

| Var | File | Why it matters |
| --- | --- | --- |
| `PUBLIC_URL` | `apps/agent/.env` | The agent card advertises this, and the A2A client connects to whatever it says. Left as `localhost`, the phone tries to reach *itself* and every message fails. |
| `BASE_URL` | `apps/file-storage/.env` | Every stored file URL. Left as `localhost`, images and generated documents won't load on the phone. |

**Use your machine's name, not its IP.** macOS publishes `<hostname>.local` over
Bonjour, which resolves from both the laptop and the phone:

```
# apps/agent/.env
PUBLIC_URL=http://my-macbook.local:4000
# apps/file-storage/.env
BASE_URL=http://my-macbook.local:6060
```

`hostname` prints yours. Vite normally rejects a `Host` header that isn't
localhost or an IP; `apps/frontend/vite.config.ts` sets `allowedHosts: true` so
any name — `.local`, a router-assigned hostname, Tailscale MagicDNS, ngrok —
works without a source edit. That's fine here specifically because this is a
single-user tool with no authentication regardless (see Security below).

An IP works too, but file URLs are stored in saved
transcripts — so a conversation recorded against `192.168.1.5` renders broken once
DHCP moves you, and one recorded against `localhost` never renders on the phone at
all. The `.local` name is stable and works from either machine.

The frontend needs no configuration: it derives the agent and file-storage hosts
from whatever address you loaded the page at (`lib/config.ts`), so browsing to
`http://my-macbook.local:5173` from the phone just works. `VITE_AGENT_URL` /
`VITE_FILE_STORAGE_URL` still override if the services live elsewhere.

### What won't work over the LAN

`http://` on anything other than `localhost` is not a **secure context**, so the
browser withholds two APIs:

- **Voice input** — `navigator.mediaDevices` is undefined, so the mic button fails.
- **Copy buttons** — `navigator.clipboard` is undefined.

Everything else — chat, streaming, approvals, History, Files, Settings, uploads —
works normally. Fixing these needs HTTPS across all three services, which isn't
set up.

`crypto.randomUUID` is gated the same way and *did* break sending outright until
`lib/uuid.ts` added a fallback — see [gotchas.md](gotchas.md). Worth remembering if
you add anything else that assumes a secure context.

### Security

Worth knowing, and it is **not** specific to `dev:lan`: the agent has **no
authentication**, its CORS policy allows every origin, and it has always bound
every network interface. Anyone who can reach port 4000 can use it — including
running code in the sandbox, reading your uploaded documents, and deleting
conversations. `dev:lan` only adds the UI to what's already reachable.

On a network you don't control, keep it to the machine:

```
# apps/agent/.env
HOST=127.0.0.1
# apps/file-storage/.env
HOST=127.0.0.1
```

## Type checking and tests

```
npm run typecheck          # every workspace
npm run test                # unit tests across every workspace (vitest)
```
