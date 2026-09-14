# Frontend (`apps/frontend`)

React 19 + Vite + Tailwind v4, built to the **Aurora / Glow** design system —
a hyper-minimalist, "AI-first" visual language (heavy negative space, no
cards/borders, a soft pastel aurora glow for depth, `rounded-full` surfaces,
thin-line icons). Full spec: `.claude/skills/aurora-design/SKILL.md` and its
`references/*.md`. Any UI change in this app should match those tokens and
patterns rather than inventing new ones.

## Layout

`App.tsx` is just the router's entry point (`createBrowserRouter` +
`RouterProvider`). The shell it renders lives in `routes/RootLayout.tsx`: a
single non-scrolling viewport with a thin icon rail on the left (new chat,
history, files, settings), an aurora glow background, and one focal
interaction — an empty-state hub that becomes a streaming conversation once a
message is sent. History is a floating flyout panel triggered from the rail
(not a docked sidebar — the design system explicitly avoids a heavy/opaque
sidebar). There is no separate "documents" rail icon — browsing/deleting the
persistent document library lives in the Files page alongside attachments and
generated images.

## Routing — `routes.tsx`

`react-router` in data-router mode. `routes.tsx` exports the route table as a
plain array (not a built router) so tests can mount it in a fresh
`createMemoryRouter` per test:

| Route | Renders |
| --- | --- |
| `/` | `ChatRoute` — the hub, or the live transcript |
| `/c/:id` | `ChatRoute`, with a loader that restores the conversation |
| `/files` | `FilesRoute` → `FilesPage` |
| `/settings` | `SettingsRoute` → `SettingsPage` |
| `*` | redirect to `/` — an unknown path used to fall through to the chat view, so it still does rather than dead-ending on the router's default error page |

Every route renders through the shared `routes/PageMain.tsx` `<main>`, which is
focusable so `hooks/useFocusOnRouteChange.ts` can move focus into the new view
on navigation (keyed on the *view*, not the pathname — see below). The root
route's `HydrateFallback` paints the glow alone while an initial loader runs,
so a refreshed `/c/:id` never flashes a blank page.

Two pieces carry the subtlety, both of which exist because the store and the
URL are separate sources of truth for "which conversation is open":

- **`conversationLoader`'s early return** (`routes.tsx`). A brand-new chat
  rewrites its own URL to `/c/:id` the moment the agent assigns a contextId —
  *while the turn is still streaming*. The loader therefore skips its fetch when
  the store is already on that conversation; without it, loading the
  not-yet-saved transcript would blank the screen mid-answer. It also means the
  History flyout and Files page (which load a conversation themselves, so a
  failure can be reported in place) don't trigger a second fetch when they
  navigate.
- **`hooks/useConversationUrlSync.ts`**. Reconciles the two at the hub, where
  "`/` is showing but the store holds a contextId" has two opposite causes: a
  navigation landed there (Back, New chat → clear the conversation), or the
  agent just assigned a contextId mid-stream (→ point the URL at it, with
  `replace`, so Back returns where the user came from rather than the stale
  hub). `location.key` distinguishes the first; `activeTaskId` the second. It
  must be hosted by `RootLayout`, which outlives route changes — see
  [gotchas.md](gotchas.md) for why the obvious alternatives don't work.

## State — `store/chat.ts`

A single `zustand` store (`useChatStore`) holds the whole chat session:
`turns: UITurn[]`, the selected model, `contextId`/task ids, streaming state,
and `activeDocumentIds`. Each `UITurn` accumulates `reasoning`, `text`,
`tools[]`, `subagents[]`, `approvals[]`, `compactions[]`, and `usage` as
envelopes stream in — `applyEnvelope` is the single reducer for every
`EnvelopeType` (see [agent.md](agent.md)).

## Talking to the agent — `hooks/useChat.ts`

- `send(text, files)` uploads any attached files to file-storage first
  (`lib/upload.ts`), builds an A2A `Message` referencing them by URL (never
  inline bytes, in the live message or the persisted transcript), and streams
  the response via `client.sendMessageStream`, dispatching each event into
  the store.
- `respond(decisions)` resumes a paused (HITL `input-required`) task by
  sending a `{ type: "decision", decisions }` `data`-kind `Part` on the same
  `taskId`.
- `stop()` calls A2A's `tasks/cancel`.
- After every turn settles (success or failure), `persistConversation()`
  fire-and-forgets a `PUT /conversations/:id` with the current `UITurn[]` —
  the backend never touches streaming envelopes directly; the frontend is the
  source of truth for what a saved transcript looks like.

## Key components

| Component | Role |
| --- | --- |
| `Conversation.tsx` | Renders turns: reasoning/text blocks, and a `ToolRow` per tool call — with special-cased rendering for `generate_image` (inline `<img>`), the `apps/mcp-authoring` tools (download cards, `FILE_TOOL_NAMES`), `search_documents` (source cards), `summarize_document` (markdown), `view_document_page` (image card), falling back to a raw JSON dump for anything else. Markdown rendering also special-cases ` ```mermaid ` code fences via `MermaidDiagram.tsx` (client-side `mermaid.render()`, no tool call involved) instead of a plain code block. |
| `Composer.tsx` | The message input — paperclip attach (unconditional for document mimetypes; gated by model modality for true image/audio input), a mic button (`hooks/useVoiceInput.ts`: record → upload → `POST /transcribe` → drops the transcript into the text box for editing, never auto-sent), send/stop. |
| `ModelSelector.tsx` | Live model picker, populated from `GET /models`; only orchestrator-eligible models are offered. |
| `UsageGauge.tsx` | A small radial gauge next to the composer showing this conversation's cumulative token usage against the selected model's real context length (`ModelInfo.contextLength`), with a popover breakdown including subagent token usage. |
| `HistoryPanel.tsx` | Rail-triggered flyout: search/delete/date-grouped list of saved conversations (no rename — deliberately out of scope). |
| `ChatFiles.tsx` | Chip strip above the composer: documents active in the current conversation (polling ingest status) plus files staged to send next. A document becomes "active" by being uploaded/attached during the current conversation — there's no separate action to pull an existing library document into a new one. |
| `FilesPage.tsx` | Full-page gallery unifying the persistent document library, uploaded attachments, and every AI-generated file (images, `apps/mcp-authoring` documents/diagrams) — grid/list view, search, sort, delete. The "Generated" kind filter groups every `generated-*` `AttachmentKind` together (`matchesKindFilter`), so a future generation tool needs no filter-bar change — only `KIND_LABEL`/`KindIcon` need a new case. |
| `DropOverlay.tsx` | Whole-pane drag-and-drop target, shown via `useFileDrop.ts`. |
| `SettingsPage.tsx` | Full-page settings: appearance (light/dark) and Ollama model management (search/pull/delete local models, set the default orchestrator/image-gen/embedding model) via the `/ollama/*` routes ([agent.md](agent.md)). |

## Attachment intake — `hooks/useAttachments.ts` + `hooks/useFileDrop.ts`

Both the paperclip picker and whole-pane drag-and-drop funnel through one
shared `addFiles` classification pipeline in `useAttachments.ts`. Precedence
order matters: a **vision/audio-capable model** claims an image/audio file
first (direct live attachment, unchanged legacy behavior); only if the
selected model can't accept it does it fall through to the **document**
path (uploaded + OCR'd via Docling into the searchable library). Legacy
binary Office files get a specific rejection message rather than a generic
"unsupported" one. `MAX_ATTACHMENTS` (`lib/config.ts`, currently 5) caps
documents-active-in-conversation + staged attachments combined.

## Streaming envelope decoding — `lib/envelope.ts`

Mirrors the agent's `Envelope` type (`isEnvelope` type guard) so
`useChat.ts` can safely narrow a `data`-kind A2A `Part`'s content before
dispatching it to the store.

## Other `lib/` modules

- `a2a.ts` — the A2A client (`getClient`), pointed at `VITE_AGENT_URL`.
- `upload.ts` — uploads a `File` to file-storage, returns `{ url, mimetype, size }`.
- `history.ts` — `saveConversation`/`getConversation`/list/delete against the agent's `/conversations` routes.
- `documents.ts` — register/list/delete against `/documents`, plus the `isDocumentFile`/`isLegacyOfficeFile` classifiers `useAttachments.ts` relies on.
- `attachments.ts` — the unified `/attachments` index consumed by `FilesPage.tsx`; `AttachmentItem.url` is the original file-storage URL, so mimetype-based thumbnailing (`isImage()`) needs zero extra logic even for OCR'd images.
- `transcribe.ts` — `transcribeAudio(url)` against the agent's `POST /transcribe`, used by `hooks/useVoiceInput.ts`.
- `models.ts` — `fetchModels()` plus `isAcceptableOtherFile()` (the modality-gating check `useAttachments.ts` uses).
- `tokens.ts` — `formatTokens()` used by `UsageGauge.tsx`.

## Theming — `store/theme.ts`

Light/dark theme state, toggled from `SettingsPanel.tsx`. Every hardcoded
light-mode Tailwind class in this app has a `dark:` companion — see the
design system's `references/dark-mode.md`.

## PWA — installable, offline shell

`vite-plugin-pwa` (`vite.config.ts`) makes the app an installable PWA with
an offline-capable app shell (decision 9 in `PLAN.md`).

- **Manifest + icons**: `manifest.name`/`icons`/`theme_color`/
  `background_color` are declared inline in the `VitePWA({...})` plugin
  config — the `<link rel="manifest">` is auto-injected into the built
  `index.html`, no manual edit needed. `public/icon-192.png` and
  `public/icon-512.png` are the `favicon.svg` glow-mark centered at ~60%
  scale on a `#020617` square (both carry `purpose: "any maskable"` — an
  Android adaptive-icon mask crops aggressively, so the safe-zone padding
  matters there). `public/apple-touch-icon.png` uses the *same* source at a
  larger ~85% scale instead: iOS applies its own, much gentler corner
  rounding and expects a fuller icon, so reusing the 60%-scale maskable
  version there looks tiny and over-padded. Regenerate both if
  `favicon.svg` changes:
  ```sh
  python3 - <<'EOF'
  import re
  src = open("public/favicon.svg", encoding="utf-8").read()
  inner = re.match(r'^<svg[^>]*>(.*)</svg>\s*$', src, re.S).group(1)
  def wrap(scale_pct):
      scale = 512 * scale_pct / 48
      tx, ty = (512 - 48 * scale) / 2, (512 - 46 * scale) / 2
      return ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
              '<rect width="512" height="512" fill="#020617"/>'
              f'<g transform="translate({tx:.3f} {ty:.3f}) scale({scale:.4f})">{inner}</g></svg>')
  open("/tmp/pwa-icon-maskable.svg", "w").write(wrap(0.60))  # icon-192/512: safe-zone padded
  open("/tmp/pwa-icon-apple.svg", "w").write(wrap(0.85))     # apple-touch-icon: fuller
  EOF
  rsvg-convert -w 512 -h 512 /tmp/pwa-icon-maskable.svg -o public/icon-512.png
  rsvg-convert -w 192 -h 192 /tmp/pwa-icon-maskable.svg -o public/icon-192.png
  rsvg-convert -w 180 -h 180 /tmp/pwa-icon-apple.svg -o public/apple-touch-icon.png
  ```
  `apple-touch-icon.png` is linked directly in `index.html` since iOS
  doesn't read the web manifest for its home-screen icon.
- **Theme-color**: `lib/themeColors.ts`'s `THEME_COLOR` is the shared source
  for the manifest's `theme_color`/`background_color` (a single static
  fallback used for the OS splash screen, before any CSS loads) and for
  `store/theme.ts`. The actual browser-chrome tint (address bar, task
  switcher) comes from `index.html`'s
  `<meta name="theme-color" id="theme-color-meta">`, whose `content` is kept
  in sync with the app's *resolved* theme — not bare `prefers-color-scheme`,
  since the preference can override the system scheme — by the pre-paint
  inline script (first paint, a hardcoded literal since it runs before any
  module graph exists — keep it in sync by hand) and `theme.ts`'s
  `applyThemeClass` (every later change, importing `THEME_COLOR`).
- **Service worker**: hand-written (`src/sw.ts`), built via
  `vite-plugin-pwa`'s `injectManifest` strategy (`strategies:
  'injectManifest'`, `srcDir`/`filename` in `vite.config.ts`) rather than
  the fully auto-generated `generateSW` — switched specifically so the
  share-target route below has a `fetch` listener to hook into; a fully
  generated SW has no such hook. `sw.ts` calls `precacheAndRoute` +
  registers the SPA navigation fallback itself (what `generateSW` used to
  do automatically), and calls `self.skipWaiting()`/`clientsClaim()`
  directly (no plugin-config equivalent under `injectManifest`). Its own
  project (`tsconfig.worker.json`, `lib: ["WebWorker"]`) is excluded from
  `tsconfig.app.json` — a service worker isn't a DOM context, and
  `ServiceWorkerGlobalScope` isn't declared under the `DOM` lib. Still no
  routes for the agent/file-storage origins at all — **never add one**; a
  stale model list, document status, or transcript is worse than a loading
  state. `devOptions` stays omitted (defaults to disabled) so `npm run dev`
  never registers one — only a production build
  (`npm run build && npm run preview`) does.
  `injectRegister: false` — the plugin's own auto-injected registration
  calls `window.location.reload()` unprompted the instant a new SW version
  activates (including mid-session), which would silently discard whatever
  the user was typing in the composer. `main.tsx` registers it manually via
  `virtual:pwa-register` with a no-op `onNeedReload`: `skipWaiting`/
  `clientsClaim` still let a new version take over in the background; the
  no-op just means it's served starting next natural navigation instead of
  forced.
- **Share target**: the manifest's `share_target` (`action: '/share-target'`,
  same accept list as the paperclip — `lib/documentAccept.ts`'s
  `DOCUMENT_ACCEPT`, imported by both `vite.config.ts` and
  `lib/documents.ts`) registers the installed app as an OS "Share"/"Open
  with" destination. The OS triggers a real POST navigation to that URL;
  `sw.ts`'s `registerRoute` (matched on `method === 'POST'` — registered
  *before* the SPA navigation route, since workbox treats a POST
  navigation as `mode: 'navigate'` too, and the first matching registered
  route wins) reads the file(s) out of the `multipart/form-data` body,
  stores them via `lib/pendingShareStore.ts` (a small hand-rolled
  IndexedDB store — File objects are directly structured-cloneable, no
  serialization needed), and responds with a 303 redirect back to
  `/share-target`. The browser's GET follow-up to that redirect *does* fall
  through to the SPA navigation route, landing on `routes/ShareTargetRoute.tsx`,
  which recovers the file(s) (`takePendingShare()`, consume-once) and hands
  them straight to `useAttachments.ts`'s `addFiles` — the exact same
  classification/upload/`POST /documents`/`addActiveDocument` pipeline the
  paperclip and drag-and-drop already use, so nothing about ingest itself
  is reimplemented. Then navigates to `/`, landing in a fresh chat with the
  shared file already active. Verified live via a real `<form
  method="post" enctype="multipart/form-data">` + `DataTransfer`-attached
  file submitted in the browser — a genuine POST navigation, the same
  shape an OS share triggers — since no browser-automation tool can invoke
  a real OS share sheet.
- **Offline state**: `hooks/useOnlineStatus.ts` wraps `navigator.onLine` +
  the `online`/`offline` window events; `components/OfflineBanner.tsx`
  renders a fixed top banner off it, wired into `RootLayout.tsx` so it's
  visible on every route. This is a *device network* signal, deliberately
  separate from `ChatRoute.tsx`'s `ErrorNote` (`store/chat.ts`'s
  `modelsError`, a specific failed fetch) — the two can be true
  independently and both render at once when they are.
- **Stale service worker during development**: if `devOptions` is ever
  flipped on locally, or a previous production build's SW lingers in the
  browser from testing against `vite preview`, do a hard reset — DevTools →
  Application → Service Workers → Unregister, then a hard reload
  (`Cmd+Shift+R`). See `docs/setup.md` for the install/testing walkthrough.

## Notifications — `lib/notify.ts` + `store/notifications.ts`

A background-completion notification (R2's "Notification API" catalogue
item), via the page's own `Notification` constructor — **no service worker
and no push server**. That's a deliberate scope limit, not an oversight:
this only fires while the tab/installed-app process is still alive, just not
focused (switched away, minimized, another app in front); a true
fully-closed-app push would need the Push API plus a push server, which
conflicts with local-first (`PLAN.md` §I3).

- **`lib/notify.ts`** is the pure browser-API wrapper: `canNotify()` feature-
  detects `"Notification" in window` and checks `Notification.permission
  === "granted"`; `notifyIfHidden(title, body?)` fires only when
  `document.visibilityState === "hidden"` — while the tab is visible the
  live UI already shows the same information, so a notification would just
  be redundant — wrapped in try/catch so a notification failure can never
  interrupt the flow that triggered it (§I7). Clicking the notification
  calls `window.focus()` since this is a same-page `Notification` instance,
  not a service-worker-shown one — no `clients.openWindow` needed.
- **`store/notifications.ts`** owns the user's preference, mirroring
  `store/theme.ts`'s shape exactly: `enabled` (persisted to
  `localStorage["aurora-notifications"]`) and `permission` (the browser's
  live `Notification.permission` — **always re-read fresh, never restored
  from storage**, since the OS/browser is the actual source of truth and
  can be revoked outside the app). `setEnabled(true)` calls
  `Notification.requestPermission()` — only invoke this from a real click
  handler (a user-gesture context), never on mount, or the browser can
  silently auto-deny the prompt. `setEnabled(false)` never prompts.
- **Two trigger points**, both extending an *existing* state-transition
  observer rather than adding new polling (§I10):
  - `hooks/useChat.ts`'s `handleEvent` — the single place a turn already
    reaches `TASK_STATE_COMPLETED`/`FAILED`/`INPUT_REQUIRED` — calls
    `notifyIfHidden` for completion, failure, and the HITL
    input-required pause. `TASK_STATE_CANCELED` deliberately does not
    notify (user-initiated; they already know).
  - `components/ChatFiles.tsx`'s existing 1.5s ingest-status poll diffs
    each document's previous vs. new `status` and calls `notifyIfHidden`
    only on a genuine `pending → ready|failed` transition — **not** on the
    initial fetch, even if that first fetch already returns a resolved
    status (a document already done by the time you started watching it
    isn't a transition, just its existing state; notifying then would be a
    false positive on every page load).
- **Settings UI**: `components/SettingsPage.tsx`'s "Notifications" section
  (next to "Appearance") is a `role="switch"` toggle — disabled with an
  explanatory message when permission is `"denied"` (browsers refuse to
  re-prompt once denied; the only fix is the browser's own site settings)
  or `"unsupported"`.
- **Verified live** (see `docs/gotchas.md`'s CDP-permission-prompt entry for
  why plain click automation couldn't grant permission directly): real
  Chrome, permission granted via Playwright's
  `context.grantPermissions(["notifications"], {origin})` — sent a message
  to real Ollama with the tab hidden, got a real "Response ready"
  notification on completion; triggered
  `generate_image` (HITL-gated) and got "Needs your approval"; confirmed no
  notification at all while the tab was visible; confirmed the document
  pending→ready path via a real upload with `/documents/:id` responses
  intercepted (this dev environment's Docling install already fails every
  ingest in ~2ms, a pre-existing environment issue unrelated to this
  feature — confirmed via existing failed records' near-identical
  `createdAt`/`updatedAt`, so there's no real pending window to observe
  end-to-end here). Settings toggle checked at 375×812 and 1440×900, light
  and dark, plus keyboard focus (visible ring) and Enter-key activation.
