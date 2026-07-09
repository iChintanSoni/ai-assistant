/**
 * Turns a DoclingDocument into ordered, page-tagged chunks.
 *
 * Reading order comes from `body.children` (and any nested `groups`), not
 * from iterating `texts[]`/`tables[]` directly — those arrays are populated
 * in extraction order, which usually but not always matches reading order.
 * Figures are deliberately not chunked here; figure captioning happens in a
 * later ingest step (Phase 3) once a figure's PNG has been extracted and
 * captioned, and becomes its own "figure"-kind chunk at that point.
 */
import type { DoclingDocument, DoclingTableCell } from "./docling.js";

export type ChunkKind = "text" | "table";

export interface Chunk {
  seq: number;
  kind: ChunkKind;
  pageStart: number;
  pageEnd: number;
  text: string;
}

/** ~4 chars/token is a standard rough estimate; avoids pulling in a real tokenizer for a budget check. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface FlatElement {
  kind: ChunkKind;
  label: string;
  page: number;
  text: string;
}

function resolveRef(doc: DoclingDocument, ref: string): unknown {
  // Refs look like "#/texts/3" or "#/tables/0".
  const segments = ref.replace(/^#\//, "").split("/");
  let node: unknown = doc;
  for (const seg of segments) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[seg];
  }
  return node;
}

function tableToMarkdown(cells: DoclingTableCell[]): string {
  if (cells.length === 0) return "";
  const rowCount = Math.max(...cells.map((c) => c.end_row_offset_idx)) || 1;
  const colCount = Math.max(...cells.map((c) => c.end_col_offset_idx)) || 1;
  const grid: string[][] = Array.from({ length: rowCount }, () => Array(colCount).fill(""));
  let headerRows = 0;
  for (const cell of cells) {
    grid[cell.start_row_offset_idx]![cell.start_col_offset_idx] = cell.text.replace(/\|/g, "\\|").trim();
    if (cell.column_header) headerRows = Math.max(headerRows, cell.end_row_offset_idx);
  }
  headerRows = Math.max(headerRows, 1);

  const lines: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    lines.push(`| ${grid[r]!.join(" | ")} |`);
    if (r === headerRows - 1) {
      lines.push(`| ${grid[r]!.map(() => "---").join(" | ")} |`);
    }
  }
  return lines.join("\n");
}

/** Flatten body.children (recursing through groups) into leaf text/table elements in reading order. */
function flatten(doc: DoclingDocument): FlatElement[] {
  const out: FlatElement[] = [];

  function visit(children: { $ref: string }[]): void {
    for (const { $ref } of children) {
      const [, kind, idxStr] = $ref.match(/^#\/(\w+)\/(\d+)$/) ?? [];
      if (kind === "groups") {
        const group = resolveRef(doc, $ref) as { children?: { $ref: string }[] } | undefined;
        if (group?.children) visit(group.children);
        continue;
      }
      if (kind === "texts") {
        const item = resolveRef(doc, $ref) as import("./docling.js").DoclingTextItem | undefined;
        if (!item?.text?.trim()) continue;
        out.push({ kind: "text", label: item.label, page: item.prov[0]?.page_no ?? 1, text: item.text.trim() });
      } else if (kind === "tables") {
        const item = resolveRef(doc, $ref) as import("./docling.js").DoclingTableItem | undefined;
        if (!item) continue;
        const md = tableToMarkdown(item.data.table_cells);
        if (md) out.push({ kind: "table", label: "table", page: item.prov[0]?.page_no ?? 1, text: md });
      }
      void idxStr;
      // pictures are intentionally skipped here — handled by the figure-captioning ingest step.
    }
  }

  visit(doc.body.children);
  return out;
}

/**
 * Group flattened elements into token-budgeted chunks. Tables always get
 * their own chunk (merging prose around a table produces confusing chunk
 * boundaries for retrieval). Text elements accumulate until either a new
 * section_header starts (a natural semantic boundary) or the budget is hit.
 */
export function chunkDocument(doc: DoclingDocument, tokenBudget: number): Chunk[] {
  const elements = flatten(doc);
  const chunks: Chunk[] = [];

  let buffer: string[] = [];
  let bufferPages: number[] = [];
  let bufferTokens = 0;

  function flush(): void {
    if (buffer.length === 0) return;
    chunks.push({
      seq: chunks.length,
      kind: "text",
      pageStart: Math.min(...bufferPages),
      pageEnd: Math.max(...bufferPages),
      text: buffer.join("\n\n"),
    });
    buffer = [];
    bufferPages = [];
    bufferTokens = 0;
  }

  for (const el of elements) {
    if (el.kind === "table") {
      flush();
      chunks.push({ seq: chunks.length, kind: "table", pageStart: el.page, pageEnd: el.page, text: el.text });
      continue;
    }

    const elTokens = estimateTokens(el.text);
    const isNewSection = el.label === "section_header" || el.label === "title";
    if (buffer.length > 0 && (isNewSection || bufferTokens + elTokens > tokenBudget)) {
      flush();
    }
    buffer.push(el.text);
    bufferPages.push(el.page);
    bufferTokens += elTokens;
  }
  flush();

  return chunks;
}

/** Whole-document extracted text, in reading order — used for the "small doc" full-text path. */
export function fullText(doc: DoclingDocument): string {
  return flatten(doc)
    .map((el) => el.text)
    .join("\n\n");
}

export function pageCount(doc: DoclingDocument): number {
  const pages = Object.keys(doc.pages).map(Number).filter((n) => !Number.isNaN(n));
  return pages.length > 0 ? Math.max(...pages) : 1;
}
