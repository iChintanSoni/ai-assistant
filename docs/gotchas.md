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

## A route loader that writes to an external store races the location it belongs to

**General React Router + external-store lesson, not specific to this repo.** In a
data router (`createBrowserRouter`), a route loader runs *before* the navigation
commits — that's the point of it. If the loader writes into an external store
(zustand here, but any `useSyncExternalStore`-style source behaves the same), there
is a window where the store already describes the destination while `useLocation()`
still reports the origin. Worse, the store's own update can trigger the render in
which your components observe that inconsistency, so the router's `navigation.state`
is not a usable guard: `useNavigation()` reads a context value React may not have
committed yet, and it can still report `"idle"` mid-navigation.

It surfaced here in the `react-router` migration. `conversationLoader` loads a
conversation into `useChatStore`, and `useConversationUrlSync` watches for the hub
(`/`) showing while the store holds a `contextId` — which is how a brand-new chat
learns to rewrite its URL once the agent assigns one mid-stream. During any
navigation to `/c/:id`, that exact condition is true *for one render* before the
location catches up, so the hook fired a `replace` into the conversation. The user's
`push` was silently demoted to a `replace`, collapsing two history entries into one,
and Back stopped working — the symptom that exposed it was a test asserting Back out
of a conversation left a fresh chat behind, where the router never moved because
there was no longer an entry to go back to.

**Fix**: discriminate on a *state fact written by the thing you care about*, not on
timing. `setActiveTask` sets `activeTaskId` alongside `contextId` for a live task,
while `loadConversation`/`newChat` null it — so `activeTaskId` means "this contextId
came from a task streaming in this tab" and a loader-restored conversation can never
impersonate one. Two related traps in the same area, both worth knowing:

- **Host this kind of reconciliation in a component that outlives route changes.**
  `/` and `/c/:id` are separate route entries, so a `useRef` in the route element is
  reset by the very navigation it's trying to detect. It belongs in the layout route.
- **Keep it in one effect.** Split into "clear the conversation" and "sync the URL",
  the two run in the same commit and the second reads a `contextId` the first has not
  cleared yet — navigating straight back into the conversation the user just left.
  Child effects also run before parent effects, so moving one up a level doesn't fix
  the ordering.

## `crypto.randomUUID` is secure-context-only, and it fails *loudly but late*

**General browser lesson, not specific to this repo.** The usual list of
secure-context-gated APIs is service workers, `navigator.mediaDevices`,
`navigator.clipboard` — the ones you expect to check. `crypto.randomUUID` is on that
list too, and it is easy to miss because it looks like a pure utility with no
privacy dimension. `crypto.getRandomValues` on the same object is **not** gated, so
"crypto works" is not a useful signal either.

`localhost` is treated as a secure context, so this is invisible during normal
development. It surfaced here the first time the app was opened over the LAN
(`http://<machine>.local:5173`, which is *not* a secure context): the page rendered
perfectly, models loaded, the composer worked — and pressing Send produced
`crypto.randomUUID is not a function`, because `useChat.ts` mints the A2A
`messageId` with it. Chat was completely broken while everything around it looked
healthy, which is the worst version of this failure: the page gives no hint that the
origin is the problem.

**Fix** (`apps/frontend/src/lib/uuid.ts`): a `randomUUID()` that prefers the native
one and otherwise assembles a v4 from `crypto.getRandomValues` — still
cryptographically random, just laying out the version/variant bits by hand. Call
sites in `useChat.ts` and `store/chat.ts` use it instead.

Two things generalise. **Audit for secure-context APIs before assuming a page works
off `localhost`** — `mediaDevices`, `clipboard`, `randomUUID`, service workers, and
`crypto.subtle` (but not `getRandomValues`). And **the failure mode is a missing
function, not a thrown permission error**, so it reads like a bundling bug rather
than an origin problem. See [setup.md](setup.md#using-it-from-your-phone) for the
ones this app still can't do over plain http.

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

## `@a2a-js/sdk` v1's resume path silently violates a new event-ordering rule

Migrating `@a2a-js/sdk` `^0.3` → `^1` is not a routine bump: v1's `Task`/
`Message`/`Part` types moved from JSON-Schema shapes to protobuf-generated
ones (`TaskState`/`Role` become numeric enums, not `"working"`/`"agent"`
strings; `Part` becomes a `{ content: { $case, value } }` union instead of a
`kind`-discriminated one), and `AgentExecutor.execute()` gained a
server-enforced invariant: **every call must publish a `task` or `message`
event as its first event, including a resume/follow-up call** — the request
handler rejects a stream that opens with a `statusUpdate`.

This repo's HITL resume path (`executor.ts`, the `isResume` branch) used to
skip straight to streaming `status-update` envelopes with no task event
first, since the task already existed. That type-checks fine under v1 (the
invariant is documented, not enforced by the type system) and would have
broken HITL resume at runtime post-migration, silently, with nothing to
catch it short of driving an actual approval flow. Same issue existed on the
*fresh*-turn failure paths: an ineligible-model/bad-upload rejection called
`publisher.failed(...)` before `publisher.startTask(...)`, which is now also
a first-event violation.

**Fix**: `publisher.ts` gained a `resumeTask(task: Task)` method that
republishes the existing `Task` (from `RequestContext.task`, which the SDK
guarantees is populated on a follow-up) as the resume's first event;
`executor.ts` calls it before anything else on the resume branch, and the
fresh-turn branch now calls `publisher.startTask(userMessage)` unconditionally
before running model/upload validation, instead of after. Covered by a
regression test in `executor.test.ts` that asserts the resume path's first
`bus.publish()` call is a `task` event.

## `@a2a-js/sdk` v1's generated types require every field spelled out

The protobuf-generated `Message`/`Task`/`Part`/`SendMessageRequest`/etc.
interfaces declare fields as `foo: Bar | undefined` rather than `foo?: Bar`
— so a plain object literal missing a key fails to type-check even when
`undefined` is a legal value for it (TypeScript's excess/missing-property
checks apply to required keys regardless of whether the value type includes
`undefined`). There's no ergonomic `Message.create({...})`/`fromPartial`
helper exported from the package's public `.d.ts` either — the exported
`MessageFns<T>` only has `fromJSON`/`toJSON`. **Fix**: small local builder
functions per file (e.g. `textPart`/`dataPart` in `publisher.ts`,
`parts.ts`, `a2aPeers.ts`, and `useChat.ts`) that spell out every field
once, rather than repeating full literals at every call site.

## A hand-written service worker needs its own TS project, not `tsconfig.app.json`

Switching `vite-plugin-pwa` to `injectManifest` (needed for the share-target
route's custom `fetch` listener — `generateSW` has no hook for that) means
`src/sw.ts` is real application source under `src/`, which
`tsconfig.app.json`'s blanket `"include": ["src"]` would otherwise pull in.
That fails: `ServiceWorkerGlobalScope` (and `self.skipWaiting()`,
`clients`, etc.) isn't declared under the `DOM` lib `tsconfig.app.json`
uses — a service worker isn't a DOM context. **Fix**: a new
`tsconfig.worker.json` (`lib: ["ES2023", "WebWorker"]`, `include:
["src/sw.ts", ...]`), referenced from the root `tsconfig.json`, with
`tsconfig.app.json` gaining `"exclude": ["src/sw.ts"]` so the same file
isn't compiled under both DOM and WebWorker lib sets (which conflict).

## Importing an app module from `vite.config.ts` only works if it's a leaf

`vite.config.ts` runs under `tsconfig.node.json`'s `moduleResolution:
nodenext`, which requires explicit `.js` extensions on every relative
import — but files under `src/` are written for `tsconfig.app.json`'s
`moduleResolution: bundler`, where extensions are optional and usually
omitted. Importing a leaf module with no imports of its own (e.g.
`lib/themeColors.ts`, for the PWA manifest's `theme_color`) works fine.
Importing a *non*-leaf module (`lib/documents.ts`, for its `DOCUMENT_ACCEPT`
list — it also imports `./config` and `./models`) breaks: `tsc -b` pulls
those transitive imports into the `node` project too and applies its
stricter extension rule to them, and they don't have `.js` extensions.
**Fix**: extracted `DOCUMENT_ACCEPT` into its own leaf module
(`lib/documentAccept.ts`, re-exported from `lib/documents.ts` so existing
importers don't change) — the general rule: anything `vite.config.ts`
needs to import from `src/` must have zero relative imports of its own.

## jsdom's `File`/`Blob` aren't recognized by structured-clone (breaks `fake-indexeddb` tests)

`fake-indexeddb` (added as a devDependency to unit-test
`lib/pendingShareStore.ts`, since jsdom has no native IndexedDB) uses the
structured-clone algorithm internally, same as real IndexedDB. Under
vitest's jsdom environment, storing a `File`/`Blob` and reading it back
silently returns `{}` — none of `.name`/`.type`/`.size` survive — even
though `f instanceof Blob` is `true` right before the write. Root cause,
confirmed by running the exact same store code directly under plain
Node.js (where it round-trips `File.name`/`.type` correctly): jsdom
provides its own pure-JS `File`/`Blob` classes, and structured-clone
implementations (real IndexedDB, `fake-indexeddb`, Node's own
`structuredClone`) specifically recognize *native*, engine-backed Blobs —
not a userland polyfill class, even one that duck-types correctly and
passes `instanceof` checks. This is a known, tracked jsdom limitation
(https://github.com/dumbmatter/fakeIndexedDB/issues/88), not something
fixable from application code. **Fix**: the unit tests for this store
assert on file *count* through put/take/replace/clear (the control flow
that could actually have a bug), not on file content surviving the
round-trip (a guarantee of real browser IndexedDB, not of this code) —
content fidelity was instead verified live, in a real browser, per
docs/frontend.md's share-target section.

## Workbox routes are bucketed by HTTP method — registration order is a red herring

A form POST to a URL — exactly what an OS share sheet, or any
`<form method="post">`, produces — is *still* `request.mode === 'navigate'`
to a service worker's `fetch` listener, same as an ordinary link click. The
first version of this repo's `sw.ts` assumed that meant the share-target
POST route had to be registered *before* the SPA-shell `NavigationRoute`,
reasoning that workbox dispatches to "the first registered route whose
match succeeds" and a POST navigation would otherwise fall into
`NavigationRoute` too. A code-review pass caught that this explanation is
wrong, confirmed by reading `workbox-routing`'s actual source
(`node_modules/workbox-routing/src/{Route,NavigationRoute,Router}.ts`):
`Route`'s constructor defaults `method` to `'GET'` unless given one
explicitly; `NavigationRoute`'s constructor never passes a method, so it's
always GET-only; and `Router.findMatchingRoute` looks requests up by
`this._routes.get(request.method)` — a `Map` keyed by method, not a single
ordered list. A POST request only ever consults the POST bucket; it can
never reach a GET-bucketed route, and swapping the two `registerRoute`
calls in `sw.ts` changes nothing. **The actual fix (unchanged) is simply
declaring `"POST"` as the route's method** — that's what puts it in a
different bucket than `NavigationRoute`; registration order between them
is irrelevant. Lesson: a plausible-sounding mental model of a library's
dispatch order is exactly the kind of claim to verify against the library's
own source (or a targeted live test of the specific claim, not just "the
feature works") before writing it into a comment — this one worked by
accident of a *correct* fix paired with an *incorrect* explanation for why.
