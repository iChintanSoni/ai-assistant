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

## No Ollama model supports real audio input (as of this writing)

Before building voice input, confirmed via Ollama's own GitHub issue tracker
(open feature requests #11798, #15427) that **no model** — including
gemma3n/gemma4 — accepts audio content parts through Ollama's `/api/chat`
yet, despite some of those models supporting audio natively through other
inference stacks (e.g. llama.cpp). `models.ts` already carries a
forward-compatible `audio` `Modality` flag for when this changes, but
nothing consumes it today. **Consequence**: voice input has to be a local
speech-to-text step (`speechToText.ts`, whisper-cpp) that transcribes to
plain text *before* the orchestrator model ever sees it, rather than handing
audio bytes to the model directly — which has the side benefit of working
identically regardless of which orchestrator model is selected.

## `whisper-cli` can't decode a browser's default `MediaRecorder` output

whisper.cpp's bundled decoder (`miniaudio` + a couple of extra codecs)
supports `flac, mp3, ogg, wav` only — confirmed live via `whisper-cli
--help` and by feeding it a real `audio/webm;codecs=opus` file (Chrome's
`MediaRecorder` default, and the only container Chrome can record to at
all): `read_audio_data: failed to read audio data`. Ogg-container Opus
("ogg") is supported; WebM-container Opus is a different container
entirely and is not, despite using the same codec. There's no single
`MediaRecorder` output format every major browser can produce that
whisper-cli also natively reads (Firefox can target `audio/ogg`; Chrome and
Safari can't). **Fix**: `speechToText.ts` always transcodes the upload to
16kHz mono WAV via `ffmpeg` before invoking `whisper-cli`, regardless of the
input container — confirmed live end-to-end with a real recorded clip.

## `file-type` can't distinguish an audio-only WebM from a video WebM

A consequence of the gotcha above: `apps/file-storage`'s magic-byte sniffer
(the `file-type` package) identifies **any** WebM container — audio-only or
not — as `video/webm`, because the container-level magic bytes are
identical; telling them apart requires parsing the track list, which
`file-type` doesn't do. Since `validate.ts`'s allow-list only accepted
`audio/*`, every real voice-input upload from Chrome was being rejected
with HTTP 415 (confirmed live) despite being genuine audio. **Fix**:
`isAllowedMime()` accepts a sniffed `video/webm` specifically when the
*client* declared an `audio/*` mimetype — trusting the client's claim only
to disambiguate an already-verified-WebM container, not to bypass sniffing
altogether (mirrors the existing `text/*` trust-after-verification pattern
in the same file). The stored/served mimetype is normalized to
`audio/webm`, not the ambiguous sniffed `video/webm`.

## Cross-package `@types/node` versions produce structurally "different" `Buffer` types

**General TypeScript/npm-workspaces lesson, not specific to this repo.**
Several npm packages (`docx`, `pptxgenjs`) bundle their own nested
`@types/node`, and `exceljs` transitively pulls in yet another (a very old
one, via `fast-csv`) — `npm ls @types/node --all` showed 5 different
resolved copies in this repo's tree even after adding a root-level
`overrides` pin (the override only fully deduped the shallower ones; the
deepest transitive copies, e.g. under `fast-csv`, stayed put even after a
clean `rm -rf node_modules && npm install` — not fully understood why).
Symptom: `tsc` errors like `Type 'Buffer' is missing the following
properties from type 'Buffer<ArrayBufferLike>'` when a value crosses from
one of those packages' API into code typed against your own `@types/node` —
each package's `Buffer` is a real, distinct nominal type as far as the
checker is concerned, even though they're identical at runtime (there is
only ever one real `Buffer` class at runtime; `@types/node` versions only
affect the static type). **Fix used here** (`apps/mcp-authoring/src/builders.ts`):
don't fight the dependency tree — at the exact call site where a foreign
`Buffer`-typed value crosses the boundary, re-wrap it through your own
`Buffer.from(value as unknown as Uint8Array)` (safe: every `Buffer`,
regardless of which `@types/node` typed it, really is a `Uint8Array` at
runtime), producing a genuine instance of your own `Buffer` type for
everything downstream.

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
