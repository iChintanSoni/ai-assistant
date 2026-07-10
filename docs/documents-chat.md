# Documents chat (RAG)

A persistent document library — separate from per-conversation attachments —
that the agent can search, summarize, and show pages from. Supports PDF,
DOCX, PPTX, TXT, MD, CSV, XLSX, plus standalone images (OCR'd) and HTML.
Legacy binary Office (`.doc`/`.xls`/`.ppt`) is explicitly rejected: Docling
can't parse OLE2/CFB at all, and file-storage's mimetype sniffer
([file-storage.md](file-storage.md)) has no CFB detector either.

## Pipeline

```
upload (file-storage) → POST /documents → background ingest:
  Docling CLI (parse) → chunk → classify small/large → embed (large only)
    → extract + upload figures/page images → (background) caption figures
    → (background) precompute whole-doc summary
```

1. **Parsing — `src/agent/docling.ts`.** The uploaded file's file-storage URL
   is handed directly to the [Docling](https://github.com/docling-project/docling)
   CLI (Python, external to this Node process — the same
   shell-out pattern `imageGen.ts` uses for Ollama's image-gen CLI): Docling
   fetches the URL itself, so raw bytes never pass through the agent process.
   `--to json --image-export-mode referenced` produces a structured
   `DoclingDocument`: a reading-order tree (`body.children`, possibly nested
   through `groups`), per-element page provenance, and each embedded figure
   written to a PNG file (rather than inlined as base64); full-page renders
   are in `pages[n].image.uri` as base64.

2. **Chunking — `src/agent/documentChunker.ts`.** `flatten()` walks
   `body.children` (recursing through `groups`) to get leaf text/table
   elements in true reading order — not `texts[]`/`tables[]` directly, whose
   extraction order doesn't always match reading order. **Known Docling
   quirk**: see [gotchas.md](gotchas.md) for a reading-order bug this file
   works around. `chunkDocument()` then groups elements into token-budgeted
   chunks (`DOCUMENT_CHUNK_TOKEN_BUDGET`, default 500 tokens): tables always
   get their own chunk (mixing prose around a table produces confusing
   retrieval boundaries), text accumulates until a new `section_header`/
   `title` starts or the budget is hit. Figures are **not** chunked here —
   they're handled by the figure-captioning step below.

3. **Small vs. large classification.** If the whole document's extracted
   text fits under `SMALL_DOC_TOKEN_BUDGET` (default 6000 tokens), it skips
   embeddings entirely — `search_documents` and `summarize_document` use the
   full text directly. Otherwise it's `large` and gets embedded chunks.

4. **Embedding — `src/agent/embeddings.ts`.** Large-document chunks are
   embedded via Ollama's `/api/embed` (`EMBEDDING_MODEL`, default
   `nomic-embed-text` — **not** pulled by default, see
   [setup.md](setup.md)) and stored as `Float32Array` BLOBs in `documents.db`.
   Retrieval is brute-force cosine similarity computed in JS
   (`cosineSimilarity` in `embeddings.ts`) — fine at personal-library scale;
   `sqlite-vec` would be the upgrade path if this ever needs to scale further,
   but it isn't built.

5. **Figures — `src/agent/documentFigures.ts`.** Extracted figure PNGs are
   uploaded to file-storage, then (as a background step, after the document
   is already `ready`/searchable) captioned by a multimodal `ChatOllama` call
   (`CAPTION_MODEL`, default `DEFAULT_MODEL`) and indexed as their own
   `figure`-kind chunks. **Why captioning happens up front rather than at
   query time**: the `ollamaToolContentFix` middleware
   ([agent.md](agent.md)) means a tool result can never hand live image
   content back to the orchestrator model — there's no "vision model looks
   at the page via a tool call" path in this stack. The orchestrator only
   ever reasons from the caption text; `view_document_page` shows the actual
   image directly to the *user*, not the model.

6. **Whole-document summary — `src/agent/documentSummarize.ts`.**
   Precomputed once in the background right after ingestion
   (`precomputeSummary`), and also computable on demand for a specific page
   range via `summarize_document`. Small documents summarize directly from
   full text; large documents use **map-reduce**: batch chunks by token
   budget, summarize each batch, then recursively reduce partial summaries
   until one remains. Deliberately sequential, not `Promise.all` — see
   [gotchas.md](gotchas.md).

## The three tools

`search_documents`, `summarize_document`, `view_document_page` — full
descriptions in [tools.md](tools.md). The system prompt
(`deepAgent.ts`) tells the model explicitly: never use `ls`/`glob`/
`read_file` (the `/memories/` filesystem tools) to look for uploaded
documents — those tools only see the memory folder and will never find a
document; go straight to `search_documents`/`summarize_document` instead.

## Frontend surfacing

- `DocumentsPanel.tsx` — a `HistoryPanel`-style rail-triggered flyout for
  browsing, activating, and deleting library documents.
- `ActiveDocuments.tsx` — a chip strip above the composer showing documents
  active in the current conversation, polling ingest status.
- Active document ids ride in `metadata.documentIds` on the outgoing A2A
  message; `executor.ts` prepends a name/id note to the turn (the same
  instruction+tool-call pattern the `/memories/` convention uses) so the
  model has document IDs available to pass into the tools above.
- `Conversation.tsx`'s `ToolRow` renders `search_documents` as source cards,
  `summarize_document` as markdown, and `view_document_page` as an image
  card — following the same precedent `generate_image` set for rendering
  something other than a raw JSON dump.

## Deleting a document

`DELETE /documents/:id` cascades: DB rows (document + chunks), the original
upload, and every figure/page-image file in file-storage — a document that
had figures leaves nothing behind.
