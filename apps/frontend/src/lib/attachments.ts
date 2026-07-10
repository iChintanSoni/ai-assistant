/** Files gallery — the agent's /attachments endpoint (see attachmentsStore.ts). */
import { AGENT_URL } from "./config";
import type { DocumentStatus } from "./documents";

export type AttachmentKind = "document" | "attachment" | "generated-image";

export interface AttachmentItem {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  createdAt: number;
  usedIn: { id: string; title: string }[];
  // present only when kind === "document"
  documentId?: string;
  status?: DocumentStatus;
  summaryStatus?: "pending" | "ready" | "failed";
  pageCount?: number;
  error?: string | null;
}

export async function listAttachments(): Promise<AttachmentItem[]> {
  const res = await fetch(`${AGENT_URL}/attachments`);
  if (!res.ok) throw new Error(`Could not load files (HTTP ${res.status})`);
  const data = (await res.json()) as { attachments: AttachmentItem[] };
  return data.attachments;
}

/** For kind === "document" use deleteDocument from ./documents instead. */
export async function deleteAttachment(id: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Could not delete file (HTTP ${res.status})`);
}
