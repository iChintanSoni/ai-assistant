/**
 * Figure extraction, upload, and captioning.
 *
 * Split into two phases because of two different constraints:
 *
 * 1. uploadFigures/uploadPageImages read the extracted PNG files that
 *    Docling wrote to the ingest scratch dir (via --image-export-mode
 *    referenced) — these MUST run before documentIngest.ts's cleanup step
 *    deletes that scratch dir, so they're awaited synchronously as part of
 *    the main ingest pipeline, before the document flips to "ready".
 *
 * 2. captionAndIndexFigures calls a vision model per figure — this is the
 *    slow part (like whole-document summarization), so it runs as a
 *    fire-and-forget background step *after* the document is already
 *    "ready" and searchable by text. It only needs the already-uploaded
 *    URLs, not the scratch dir, so it's safe to defer.
 *
 * Also: a genuine ChatOllama constraint (see middleware.ts's
 * ollamaToolContentFix) means tool results can't carry live image content
 * back to the orchestrator model — Ollama's /api/chat requires tool-message
 * content to be a plain string. So there is no way for the orchestrator to
 * "look at" a page image live via a tool call in this stack. Figures are
 * captioned once here (a plain multimodal *user*-role call, the same
 * mechanism direct image attachments already use — see parts.ts) and that
 * caption is what search_documents/view_document_page hand back to the
 * model; the actual image is shown directly to the human by the frontend,
 * the same way generate_image's picture is never re-described by the model.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ChatOllama } from "@langchain/ollama";
import { config } from "../config.js";
import type { DoclingDocument } from "./docling.js";
import { embedOne } from "./embeddings.js";
import { insertChunks, updateDocumentPageImages } from "./documentStore.js";

export interface UploadedFigure {
  seq: number;
  pageNo: number;
  figureUrl: string;
}

async function uploadPngBuffer(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/png" }), filename);
  const res = await fetch(`${config.fileStorageBaseUrl}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`file-storage upload failed: HTTP ${res.status}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("file-storage upload response missing url");
  return data.url;
}

/** Uploads each Docling-detected picture's extracted PNG. Must run before the ingest scratch dir is cleaned up. */
export async function uploadFigures(
  doc: DoclingDocument,
  artifactsDir: string,
  startSeq: number,
): Promise<UploadedFigure[]> {
  const uploaded: UploadedFigure[] = [];
  let seq = startSeq;
  for (const picture of doc.pictures) {
    if (!picture.image?.uri) continue;
    const pageNo = picture.prov[0]?.page_no ?? 1;
    try {
      const buffer = await fs.readFile(path.join(artifactsDir, picture.image.uri));
      const url = await uploadPngBuffer(buffer, `figure-${seq}.png`);
      uploaded.push({ seq: seq++, pageNo, figureUrl: url });
    } catch {
      // Skip a figure we couldn't read/upload rather than fail the whole document.
    }
  }
  return uploaded;
}

/** Uploads a full-page render for each page that has at least one figure. Same before-cleanup timing constraint. */
export async function uploadPageImages(
  doc: DoclingDocument,
  documentId: string,
  pageNumbers: Iterable<number>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const pageNo of new Set(pageNumbers)) {
    const page = doc.pages[String(pageNo)];
    const uri = page?.image?.uri;
    if (!uri?.startsWith("data:")) continue;
    const base64 = uri.slice(uri.indexOf(",") + 1);
    try {
      const url = await uploadPngBuffer(Buffer.from(base64, "base64"), `${documentId}-page-${pageNo}.png`);
      result[String(pageNo)] = url;
    } catch {
      // Skip; view_document_page falls back to text for this page.
    }
  }
  await updateDocumentPageImages(documentId, result);
  return result;
}

const CAPTION_PROMPT =
  "Describe this image from a document in 2-3 sentences. If it's a chart, graph, or diagram, describe " +
  "precisely what it shows: axes, labels, trends, and any concrete values visible. Don't speculate beyond " +
  "what's actually visible.";

async function captionImage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch figure image (HTTP ${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  const chat = new ChatOllama({ model: config.captionModel, baseUrl: config.ollamaBaseUrl });
  const response = await chat.invoke([
    { role: "user", content: [{ type: "text", text: CAPTION_PROMPT }, { type: "image_url", image_url: dataUrl }] },
  ]);
  const raw = typeof response.content === "string" ? response.content : String(response.content);
  return raw.trim();
}

/**
 * Fire-and-forget: captions each already-uploaded figure and indexes it as a
 * searchable "figure" chunk. Sequential — a local Ollama instance serializes
 * requests onto one model anyway (see documentSummarize.ts for why parallel
 * dispatch here previously caused header-timeout failures).
 */
export async function captionAndIndexFigures(documentId: string, figures: UploadedFigure[]): Promise<void> {
  for (const fig of figures) {
    try {
      const caption = await captionImage(fig.figureUrl);
      const embedding = await embedOne(caption);
      insertChunks(documentId, [
        {
          seq: fig.seq,
          kind: "figure",
          pageStart: fig.pageNo,
          pageEnd: fig.pageNo,
          text: caption,
          imageUrl: fig.figureUrl,
          embedding,
        },
      ]);
    } catch {
      // Best-effort: one uncaptioned figure shouldn't fail the rest.
    }
  }
}
