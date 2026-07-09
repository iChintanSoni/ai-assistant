/** Document library — the agent's /documents endpoints (see documentStore.ts). */
import { AGENT_URL } from "./config";

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

/** The document mimetypes/extensions the paperclip accepts, independent of the selected model's modalities. */
export const DOCUMENT_ACCEPT =
  ".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "text/plain,text/markdown,text/csv," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isDocumentFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return [".pdf", ".docx", ".pptx", ".txt", ".md", ".csv", ".xlsx"].some((ext) => name.endsWith(ext));
}
