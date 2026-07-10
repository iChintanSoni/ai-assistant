# File storage (`apps/file-storage`)

A small standalone Express service that stores and serves files — uploaded
attachments from the frontend, and artifacts the agent generates (images,
document page renders) so it can hand the frontend a plain URL rather than
inline bytes. Modeled on a prior `apps/file-server` from an earlier PoC
(`a2a-langchain-mcp`).

## Routes — `src/app.ts`

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness check. |
| `POST /upload` | Multipart upload (`multer`, single field `file`). Verifies the real mimetype (see below) and stores the file, returning `{ url, mimetype, size }`. |
| `GET /files` | List stored files with metadata. |
| `GET /files/:filename` | Serve a file with its verified `Content-Type`. |
| `DELETE /files/:filename` | Delete a file (used when the agent cleans up orphaned or cascaded-delete files). |

## Mimetype validation — `src/validate.ts`

Never trusts a client-declared mimetype or file extension for what gets
stored and later served back with a real `Content-Type`:

- Binary formats are sniffed by magic bytes via the
  [`file-type`](https://www.npmjs.com/package/file-type) package.
- Text has no magic bytes, so a client's `text/*` claim is only trusted after
  the bytes are confirmed to decode cleanly as UTF-8 (`looksLikeText`).
- `image/svg+xml` is explicitly excluded even though it's an "image" mimetype
  — SVG can carry `<script>`.
- Office Open XML (`.docx`/`.pptx`/`.xlsx`) mimetypes are explicitly
  allow-listed (`ALLOWED_OFFICE_MIMES`) alongside PDF/`text/plain`/images/
  audio. See [gotchas.md](gotchas.md) for a real bug this list used to have.

Legacy binary Office (`.doc`/`.xls`/`.ppt`, OLE2/CFB format) has no detector
in `file-type` at all and is rejected here — the frontend gives users a
specific message about it rather than a generic upload failure (see
[frontend.md](frontend.md)).

## Storage — `src/store.ts`

SQLite (`better-sqlite3`) tracks per-file metadata: verified mimetype, size,
original name, creation time — used both to serve the right `Content-Type`
and to let the agent reconcile/garbage-collect files no saved conversation
references anymore ([agent.md](agent.md)'s `fileCleanup.ts`). Actual bytes
live under `STORAGE_DIR` (default `./.storage`), keyed by a generated
filename distinct from the original name.

## Config — `src/config.ts`

See [setup.md](setup.md) for the full `.env` table (`HOST`, `PORT`,
`STORAGE_DIR`, `DB_PATH`, `BASE_URL`, `CORS_ORIGIN`).
