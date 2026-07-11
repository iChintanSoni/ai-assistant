import { expect, test } from "vitest";
import { chunkDocument, fullText, pageCount } from "../src/agent/documentChunker.js";
import type { DoclingDocument } from "../src/agent/docling.js";

/** Minimal DoclingDocument fixture: two pages, a section header + prose, a table, then more prose. */
function makeDoc(): DoclingDocument {
  return {
    schema_name: "DoclingDocument",
    texts: [
      { self_ref: "#/texts/0", label: "section_header", text: "Intro", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/1", label: "text", text: "First paragraph of prose.", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/2", label: "section_header", text: "Data", prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/3", label: "text", text: "Closing paragraph on page two.", prov: [{ page_no: 2 }] },
    ],
    tables: [
      {
        self_ref: "#/tables/0",
        label: "table",
        prov: [{ page_no: 1 }],
        data: {
          table_cells: [
            {
              text: "A",
              row_span: 1,
              col_span: 1,
              start_row_offset_idx: 0,
              end_row_offset_idx: 1,
              start_col_offset_idx: 0,
              end_col_offset_idx: 1,
              column_header: true,
              row_header: false,
            },
            {
              text: "1",
              row_span: 1,
              col_span: 1,
              start_row_offset_idx: 1,
              end_row_offset_idx: 2,
              start_col_offset_idx: 0,
              end_col_offset_idx: 1,
              column_header: false,
              row_header: false,
            },
          ],
        },
      },
    ],
    pictures: [],
    groups: [],
    body: {
      self_ref: "#/body",
      children: [
        { $ref: "#/texts/0" },
        { $ref: "#/texts/1" },
        { $ref: "#/texts/2" },
        { $ref: "#/tables/0" },
        { $ref: "#/texts/3" },
      ],
    },
    pages: { "1": { size: { width: 612, height: 792 } }, "2": { size: { width: 612, height: 792 } } },
  };
}

test("chunkDocument preserves reading order and splits on section headers + tables", () => {
  const chunks = chunkDocument(makeDoc(), 500);

  // "Data" gets flushed into its own chunk because a table immediately follows it
  // (tables always force a flush) — this matches the real behavior observed against
  // a live Docling PDF conversion during Phase 1 manual testing.
  expect(chunks.length).toBe(4);
  expect(chunks[0]!.kind).toBe("text");
  expect(chunks[0]!.text).toMatch(/Intro/);
  expect(chunks[0]!.text).toMatch(/First paragraph/);

  expect(chunks[1]!.kind).toBe("text");
  expect(chunks[1]!.text).toMatch(/Data/);

  expect(chunks[2]!.kind).toBe("table");
  expect(chunks[2]!.text).toMatch(/\| A \|/);
  expect(chunks[2]!.text).toMatch(/\| 1 \|/);

  expect(chunks[3]!.kind).toBe("text");
  expect(chunks[3]!.text).toMatch(/Closing paragraph/);
});

test("chunkDocument tracks page ranges per chunk, including across a page break", () => {
  const chunks = chunkDocument(makeDoc(), 500);
  expect(chunks[0]!.pageStart).toBe(1);
  expect(chunks[0]!.pageEnd).toBe(1);
  expect(chunks[1]!.pageStart).toBe(1); // "Data" header, alone in its own chunk
  expect(chunks[1]!.pageEnd).toBe(1);
  expect(chunks[3]!.pageStart).toBe(2); // closing paragraph starts a fresh chunk on page 2
  expect(chunks[3]!.pageEnd).toBe(2);
});

test("chunkDocument flushes on token budget even without a section header", () => {
  const doc = makeDoc();
  // A tiny budget forces every text element into its own chunk.
  const chunks = chunkDocument(doc, 1);
  const textChunks = chunks.filter((c) => c.kind === "text");
  expect(textChunks.length, `expected budget-forced splitting, got ${textChunks.length} text chunks`).toBeGreaterThanOrEqual(3);
});

test("fullText concatenates elements in reading order", () => {
  const text = fullText(makeDoc());
  const introIdx = text.indexOf("Intro");
  const dataIdx = text.indexOf("Data");
  const closingIdx = text.indexOf("Closing paragraph");
  expect(introIdx).toBeGreaterThanOrEqual(0);
  expect(dataIdx).toBeGreaterThan(introIdx);
  expect(closingIdx).toBeGreaterThan(dataIdx);
});

test("pageCount returns the highest page number present", () => {
  expect(pageCount(makeDoc())).toBe(2);
});

test("chunkDocument returns nothing for a genuinely empty document", () => {
  const doc = makeDoc();
  doc.body.children = [];
  doc.texts = [];
  doc.tables = [];
  expect(chunkDocument(doc, 500)).toEqual([]);
});

test("chunkDocument still recovers texts/tables via the orphan fallback when body.children is empty", () => {
  // Distinguishes "empty document" (asserted above) from "body.children just
  // doesn't link anything" (the real Docling bug this fallback exists for).
  const doc = makeDoc();
  doc.body.children = [];
  expect(chunkDocument(doc, 500).length).toBeGreaterThan(0);
});

/**
 * Shaped after a real `docling sample.html --to json` run: HTML has no page
 * concept, so every text/table item's `prov` is an empty array (not just
 * missing page_no) and `pages` is `{}` entirely, unlike a paginated PDF/DOCX.
 */
function makeUnpaginatedDoc(): DoclingDocument {
  return {
    schema_name: "DoclingDocument",
    texts: [
      { self_ref: "#/texts/0", label: "title", text: "Section One", prov: [] },
      { self_ref: "#/texts/1", label: "text", text: "Body text with no page provenance.", prov: [] },
    ],
    tables: [],
    pictures: [],
    groups: [],
    body: { self_ref: "#/body", children: [{ $ref: "#/texts/0" }, { $ref: "#/texts/1" }] },
    pages: {},
  };
}

test("chunkDocument defaults to page 1 for elements with empty provenance (HTML-shaped input)", () => {
  const chunks = chunkDocument(makeUnpaginatedDoc(), 500);
  expect(chunks.length).toBe(1);
  expect(chunks[0]!.pageStart).toBe(1);
  expect(chunks[0]!.pageEnd).toBe(1);
});

test("pageCount defaults to 1 for a document with an empty pages map (HTML-shaped input)", () => {
  expect(pageCount(makeUnpaginatedDoc())).toBe(1);
});

/**
 * Shaped after a real `docling` run on HTML/DOCX with a leading heading: the
 * heading is the only entry in body.children, and the paragraph + table that
 * follow exist in texts[]/tables[] but aren't referenced by body.children or
 * any group — confirmed Docling 2.36.1 behavior, not a hypothetical.
 */
function makeOrphanedContentDoc(): DoclingDocument {
  return {
    schema_name: "DoclingDocument",
    texts: [
      { self_ref: "#/texts/0", label: "title", text: "Heading", prov: [] },
      { self_ref: "#/texts/1", label: "text", text: "Orphaned paragraph.", prov: [] },
    ],
    tables: [
      {
        self_ref: "#/tables/0",
        label: "table",
        prov: [],
        data: {
          table_cells: [
            {
              text: "cell",
              row_span: 1,
              col_span: 1,
              start_row_offset_idx: 0,
              end_row_offset_idx: 1,
              start_col_offset_idx: 0,
              end_col_offset_idx: 1,
              column_header: true,
              row_header: false,
            },
          ],
        },
      },
    ],
    pictures: [],
    groups: [],
    body: { self_ref: "#/body", children: [{ $ref: "#/texts/0" }] }, // only the heading is linked
    pages: {},
  };
}

test("chunkDocument recovers text/table content orphaned from body.children instead of dropping it", () => {
  const text = fullText(makeOrphanedContentDoc());
  expect(text).toMatch(/Heading/);
  expect(text).toMatch(/Orphaned paragraph/);
  expect(text).toMatch(/cell/);
});
