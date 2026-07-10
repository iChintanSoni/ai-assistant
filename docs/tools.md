# Tools

All tools are defined in `apps/agent/src/agent/tools.ts` and registered via
`getTools()`, consumed by `buildAgent` in `deepAgent.ts`. See
[agent.md](agent.md) for the HITL approval flow that gates the risky ones.

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

## Subagents

`getSubagents()` (`apps/agent/src/agent/subagents.ts`) defines one subagent,
reachable via the deep agent's built-in `task` tool:

- **`researcher`** — a focused web-research delegate with only `web_search`
  available. Used for questions needing current/external information; replies
  with a short, sourced summary rather than surfacing its intermediate steps
  to the orchestrator.

## `RISKY_TOOLS`

```ts
export const RISKY_TOOLS = ["send_email", "run_javascript", "generate_image"] as const;
```

This list drives `deepAgent.ts`'s `interruptOn` config directly — adding a
new tool here is the only step needed to gate it behind human approval.
