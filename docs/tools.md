# Tools

Built-in tools are defined in `apps/agent/src/agent/tools.ts` and merged with
MCP-sourced and peer-agent-delegation tools by `getAllTools()`, consumed by
`buildAgent` in `deepAgent.ts`. See [agent.md](agent.md) for the HITL
approval flow that gates the risky ones, and
[architecture.md](architecture.md#extending-the-agent-three-tiers) for the
three-tier model (built-in / MCP server / peer A2A agent) this is part of.

## Built-in tools

| Tool | HITL-gated | Summary |
| --- | --- | --- |
| `get_current_time` | No | Returns the current ISO 8601 timestamp. Trivial demo of tool-call streaming. |
| `random_number` | No | Random integer in `[min, max]`. Trivial demo. |
| `web_search` | No | Web search with title/URL/snippet results. Uses Tavily if `TAVILY_API_KEY` is set, falling back to keyless DuckDuckGo HTML scraping (`parseDuckDuckGo`) either when no key is set or if Tavily's request fails. |
| `send_email` | **Yes** | Mock side-effect (no real email is sent) — demonstrates the approval flow for a "sends something" action. |
| `run_javascript` | **Yes** | Runs JavaScript/TypeScript in a sandboxed Deno subprocess with no `--allow-*` flags, so filesystem/network/env access is denied by default. A `looksLikePython` heuristic rejects Python-shaped input with a clear message rather than letting Deno fail confusingly. Timeout via `SANDBOX_TIMEOUT_MS` (default 10s). |
| `generate_image` | **Yes** | Generates an image from a text prompt via a local Ollama image-generation model (default `x/z-image-turbo:latest`), uploads the PNG to `apps/file-storage`, returns its URL. See [gotchas.md](gotchas.md) for why this shells out via `spawn` rather than using Ollama's REST API. |
| `search_documents` | No | Similarity/full-text search over the uploaded document library (optionally scoped to specific `documentIds`). Small documents are searched as full text; large documents via embedded-chunk cosine similarity. Figure captions are surfaced alongside text, tagged `[Figure]`. Read-only. |
| `summarize_document` | No | Map-reduce summary of a whole document or a page range — deliberately not similarity-based, since no query vector is "similar to" an entire document. See [documents-chat.md](documents-chat.md). |
| `view_document_page` | No | Returns the URL of a rendered page image (if the page contains a detected figure) or the page's raw text otherwise, so the frontend can show the actual image directly to the user. |

## MCP-sourced tools

`apps/agent/src/agent/mcp.ts` connects to every server listed in
`apps/agent/config/mcp-servers.json` (`MultiServerMCPClient` from
`@langchain/mcp-adapters`) and folds their tools into `getAllTools()`. A
server config entry can list `riskyTools` — tool names from that server that
get the same HITL gate as `RISKY_TOOLS` below. A server that fails to
connect (missing binary, etc.) is skipped, not fatal — the rest of the agent
still boots.

| Server | Tool(s) | HITL-gated | Summary |
| --- | --- | --- | --- |
| `fetch` (official `mcp-server-fetch`, run via `uvx`) | `fetch` | No | Fetches a URL and returns its content as markdown, with pagination for long pages. Zero custom code — an off-the-shelf MCP server. |
| `authoring` (first-party, `apps/mcp-authoring`) | `create_docx`, `create_pptx`, `create_pdf`, `create_xlsx`, `create_csv`, `create_txt` | **Yes** | Generates a downloadable file from structured content (`docx`/`pptxgenjs`/`pdfkit`/`exceljs`/plain text under the hood — see `apps/mcp-authoring/src/builders.ts`), uploads it via the shared `uploadToFileStorage` helper (`packages/shared-node`), returns `{ url, filename }`. |
| `authoring` | `create_drawio_diagram` | **Yes** | Generates a valid `.drawio` (mxGraph XML) diagram from nodes/edges, openable directly in draw.io/diagrams.net. Position is optional — omitted nodes auto-arrange in a grid. |

Mermaid diagrams are **not** a tool — the model just writes a ` ```mermaid `
code fence in its reply and the frontend renders it client-side
(`MermaidDiagram.tsx`, see [frontend.md](frontend.md)).

## Peer A2A agents

`apps/agent/src/agent/a2aPeers.ts` reads `apps/agent/config/a2a-peers.json`
(`[{ name, description, url }]`, empty by default) and builds one
`delegate_to_<name>` tool per entry, which sends the peer a message over A2A
(the same protocol/client the frontend itself uses) and returns its final
text reply. This is the tier for a capability that needs its own multi-turn
reasoning loop rather than a single stateless tool call — registering a peer
is a JSON edit, no orchestrator code changes.

## Subagents

`getSubagents()` (`apps/agent/src/agent/subagents.ts`) defines one subagent,
reachable via the deep agent's built-in `task` tool. Unlike a peer A2A agent
above, a subagent runs **in-process** (LangGraph, not a separate server):

- **`researcher`** — a focused web-research delegate with only `web_search`
  available. Used for questions needing current/external information; replies
  with a short, sourced summary rather than surfacing its intermediate steps
  to the orchestrator.

## `RISKY_TOOLS`

```ts
export const RISKY_TOOLS = ["send_email", "run_javascript", "generate_image"] as const;
```

`deepAgent.ts`'s `buildInterruptOn()` merges this list with every connected
MCP server's declared `riskyTools` to build the HITL `interruptOn` config —
adding a new *built-in* tool here (or a `riskyTools` entry in
`mcp-servers.json` for an MCP-sourced one) is the only step needed to gate it
behind human approval.
