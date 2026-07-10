# Frontend (`apps/frontend`)

React 19 + Vite + Tailwind v4, built to the **Aurora / Glow** design system —
a hyper-minimalist, "AI-first" visual language (heavy negative space, no
cards/borders, a soft pastel aurora glow for depth, `rounded-full` surfaces,
thin-line icons). Full spec: `.claude/skills/aurora-design/SKILL.md` and its
`references/*.md`. Any UI change in this app should match those tokens and
patterns rather than inventing new ones.

## Layout

`App.tsx` is a single non-scrolling viewport: a thin icon rail on the left
(new chat, history, documents, files, settings), an aurora glow background,
and one focal interaction — an empty-state hub that becomes a streaming
conversation once a message is sent. History/Documents/Settings are floating
flyout panels triggered from the rail (not docked sidebars — the design
system explicitly avoids a heavy/opaque sidebar); Files is a full page,
switched via `useConversationRouting.ts`.

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
  sending a `{ type: "decision", decisions }` `DataPart` on the same
  `taskId`.
- `stop()` calls A2A's `tasks/cancel`.
- After every turn settles (success or failure), `persistConversation()`
  fire-and-forgets a `PUT /conversations/:id` with the current `UITurn[]` —
  the backend never touches streaming envelopes directly; the frontend is the
  source of truth for what a saved transcript looks like.

## Key components

| Component | Role |
| --- | --- |
| `Conversation.tsx` | Renders turns: reasoning/text blocks, and a `ToolRow` per tool call — with special-cased rendering for `generate_image` (inline `<img>`), `search_documents` (source cards), `summarize_document` (markdown), `view_document_page` (image card), falling back to a raw JSON dump for anything else. |
| `Composer.tsx` | The message input — paperclip attach (unconditional for document mimetypes; gated by model modality for true image/audio input), send/stop. |
| `ModelSelector.tsx` | Live model picker, populated from `GET /models`; only orchestrator-eligible models are offered. |
| `UsageGauge.tsx` | A small radial gauge next to the composer showing this conversation's cumulative token usage against the selected model's real context length (`ModelInfo.contextLength`), with a popover breakdown including subagent token usage. |
| `HistoryPanel.tsx` | Rail-triggered flyout: search/delete/date-grouped list of saved conversations (no rename — deliberately out of scope). |
| `DocumentsPanel.tsx` | Rail-triggered flyout for the persistent document library — browse/activate/delete. |
| `ActiveDocuments.tsx` | Chip strip above the composer for documents active in the current conversation, polling ingest status. |
| `FilesPage.tsx` | Full-page gallery unifying documents, uploaded attachments, and generated images — grid/list view, search, sort, kind filter. |
| `DropOverlay.tsx` | Whole-pane drag-and-drop target, shown via `useFileDrop.ts`. |
| `SettingsPanel.tsx` | Appearance (light/dark) and other app settings. |

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
`useChat.ts` can safely narrow A2A `DataPart.data` before dispatching it to
the store.

## Other `lib/` modules

- `a2a.ts` — the A2A client (`getClient`), pointed at `VITE_AGENT_URL`.
- `upload.ts` — uploads a `File` to file-storage, returns `{ url, mimetype, size }`.
- `history.ts` — `saveConversation`/`getConversation`/list/delete against the agent's `/conversations` routes.
- `documents.ts` — register/list/delete against `/documents`, plus the `isDocumentFile`/`isLegacyOfficeFile` classifiers `useAttachments.ts` relies on.
- `attachments.ts` — the unified `/attachments` index consumed by `FilesPage.tsx`; `AttachmentItem.url` is the original file-storage URL, so mimetype-based thumbnailing (`isImage()`) needs zero extra logic even for OCR'd images.
- `models.ts` — `fetchModels()` plus `isAcceptableOtherFile()` (the modality-gating check `useAttachments.ts` uses).
- `tokens.ts` — `formatTokens()` used by `UsageGauge.tsx`.

## Theming — `store/theme.ts`

Light/dark theme state, toggled from `SettingsPanel.tsx`. Every hardcoded
light-mode Tailwind class in this app has a `dark:` companion — see the
design system's `references/dark-mode.md`.
