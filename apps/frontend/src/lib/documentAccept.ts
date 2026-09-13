/**
 * The document mimetypes/extensions the paperclip (and the PWA manifest's
 * share_target, see vite.config.ts) accept, independent of the selected
 * model's modalities. Includes image/* unconditionally — a dropped image is
 * always acceptable one way or another (see documents.ts's isDocumentFile),
 * so neither the picker nor the OS share sheet should hide images just
 * because the current model can't see them directly.
 *
 * A standalone leaf module (no imports of its own) rather than living in
 * documents.ts directly: vite.config.ts (a Node-context build config) needs
 * this exact list too, and documents.ts's own relative imports (./config,
 * ./models) don't resolve cleanly across that project's stricter NodeNext
 * module resolution — same reason lib/themeColors.ts is its own file.
 */
export const DOCUMENT_ACCEPT =
  ".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.html,.htm,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "text/plain,text/markdown,text/csv,text/html," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";
