/** Document library — the agent's /documents endpoints (see documentStore.ts). */
import { AGENT_URL } from "./config";
import type { ModelInfo } from "./models";

export type DocumentStatus = "pending" | "ready" | "failed";
export type SizeClass = "pending" | "small" | "large";

export interface DocumentSummary {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  pageCount: number;
  sizeClass: SizeClass;
  summary: string | null;
  summaryStatus: "pending" | "ready" | "failed";
  status: DocumentStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UploadedDocRef {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const res = await fetch(`${AGENT_URL}/documents`);
  if (!res.ok) throw new Error(`Could not load documents (HTTP ${res.status})`);
  const data = (await res.json()) as { documents: DocumentSummary[] };
  return data.documents;
}

export async function getDocument(id: string): Promise<DocumentSummary> {
  const res = await fetch(`${AGENT_URL}/documents/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Could not load document (HTTP ${res.status})`);
  return (await res.json()) as DocumentSummary;
}

export async function registerDocument(file: UploadedDocRef): Promise<DocumentSummary> {
  const res = await fetch(`${AGENT_URL}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(file),
  });
  if (!res.ok) throw new Error(`Could not register document (HTTP ${res.status})`);
  return (await res.json()) as DocumentSummary;
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Could not delete document (HTTP ${res.status})`);
}

/**
 * The document mimetypes/extensions the paperclip accepts, independent of
 * the selected model's modalities. Includes image/* unconditionally — a
 * dropped image is always acceptable one way or another (see
 * isDocumentFile's model-aware OCR fallback), so the picker shouldn't hide
 * images just because the current model can't see them directly.
 */
export const DOCUMENT_ACCEPT =
  ".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.html,.htm,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "text/plain,text/markdown,text/csv,text/html," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";

const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".md", ".csv", ".xlsx", ".html", ".htm"];

/** Pre-2007 binary Office formats — Docling can't parse these at all. */
export const LEGACY_OFFICE_EXTENSIONS = [".doc", ".xls", ".ppt"];

export function isLegacyOfficeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return LEGACY_OFFICE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * A file is a "document" (routed through Docling ingest) if it's one of the
 * plain document extensions, or if it's an image that the current model
 * can't already see directly — in that case it gets OCR'd into a searchable
 * document instead of being rejected. A vision-capable model keeps claiming
 * images for live attachment first (see isAcceptableOtherFile in models.ts,
 * checked before this in useAttachments' classification order).
 */
export function isDocumentFile(file: File, model?: ModelInfo): boolean {
  const name = file.name.toLowerCase();
  if (DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") {
    return !model || !model.modalities.includes("image");
  }
  return false;
}
