# Gotchas

Real bugs found and fixed (or knowingly left open) during development.
Written as standalone engineering notes — symptom, root cause, fix — since
some of these are useful lessons beyond this repo specifically.

## `execFile()`'s `stdio` option is silently ignored

**General Node.js lesson, not specific to this repo.** `child_process.execFile()`'s
callback-based API always forces piped stdio internally (so it can buffer
`stdout`/`stderr` for the callback) — passing a `stdio` option to it does
nothing, silently. This only bites when a spawned CLI's behavior actually
depends on stdin being closed rather than left open.

It surfaced here in `src/agent/imageGen.ts`: `ollama run <image-model>
<prompt>` hangs indefinitely (confirmed via `ollama ps` that it never even
reaches the daemon) if its stdin is left as an open, unread pipe — which is
exactly what `execFile` does regardless of any `stdio` option passed to it.
**Fix**: use `spawn()` instead, with an explicit
`stdio: ["ignore", "pipe", "pipe"]`, which Node actually honors. The same
fix pattern is used in `src/agent/docling.ts` for the same reason (a
long-running external CLI).

## Docling reading-order bug on a leading heading (2.36.1)

Confirmed via live `docling ... --to json` runs against Docling **2.36.1**:
when the **first body element is a heading/title**, everything after it in
the document silently fails to get linked into `body.children` (or any
`groups` entry) — the orphaned text/table elements still exist in the flat
`texts[]`/`tables[]` arrays, but code that only walks `body.children` for
reading order never sees them. Confirmed on both the HTML and DOCX backends.
Virtually every real document starts with a title, so this would silently
drop most of a document's content from search/chunking. A document with no
leading heading at all links fine.

**Fix** (`src/agent/documentChunker.ts`'s `flatten()`): after the normal
`body.children`/`groups` walk, do a second pass appending any leaf
text/table element never visited, in its own array's order. This is a
no-op for the common case (PDFs, or any HTML/DOCX without a leading
heading) where `body.children` already covers everything; for the buggy
case it's a best-effort recovery — interleaving between recovered texts and
tables won't always match true reading order, but that's strictly better
than losing the content outright. Test fixtures for both the orphaning
shape and the pre-existing "truly empty document" case are in
`documentChunker.test.ts`.

## `gemma4:12b` leaks a `thought <channel|>...` fragment into final answer text

A pre-existing, reproducible artifact where a stray
`thought <channel|>...` fragment leaks into `gemma4:12b`'s final answer
text after tool-calling turns. **Known, unfixed, out of scope** — not
investigated further, and not something introduced by any streaming/envelope
work in this repo (`streaming.ts`/`envelope.ts` weren't touched around when
this was noticed).

## OOXML mimetypes were missing from file-storage's allow-list

`apps/file-storage/src/validate.ts`'s `isAllowedMime()` originally only
allowed `image/*`, `audio/*`, `application/pdf`, and `text/plain`. Real
`.docx`/`.pptx`/`.xlsx` uploads get magic-byte-sniffed by the `file-type`
package to their specific OOXML mimetypes (e.g.
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`),
none of which were on the list — meaning those formats were silently
returning HTTP 415 despite being advertised as supported in the UI ever
since the documents-chat feature shipped. **Fix**: added an explicit
`ALLOWED_OFFICE_MIMES` set for the three OOXML formats.

## A local single-GPU Ollama instance serializes requests — don't `Promise.all` them

Firing multiple chunk-summarization LLM calls concurrently via `Promise.all`
buys no real throughput against a local Ollama instance, because it
serializes requests onto one model/GPU anyway — but the concurrent client
requests still sit queued long enough to trip `UND_ERR_HEADERS_TIMEOUT`
(confirmed on an 18-page document). **Fix**: dispatch batches sequentially
instead (`documentSummarize.ts`'s `summarizeBatchesSequentially`,
`documentFigures.ts`, and the document-ingest pipeline's own background
enrichment step all avoid concurrent Ollama call streams for this reason —
see `documentIngest.ts`'s `runBackgroundEnrichment`).
