import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0]!.kind, "text");
  assert.match(chunks[0]!.text, /Intro/);
  assert.match(chunks[0]!.text, /First paragraph/);

  assert.equal(chunks[1]!.kind, "text");
  assert.match(chunks[1]!.text, /Data/);

  assert.equal(chunks[2]!.kind, "table");
  assert.match(chunks[2]!.text, /\| A \|/);
  assert.match(chunks[2]!.text, /\| 1 \|/);

  assert.equal(chunks[3]!.kind, "text");
  assert.match(chunks[3]!.text, /Closing paragraph/);
});

test("chunkDocument tracks page ranges per chunk, including across a page break", () => {
  const chunks = chunkDocument(makeDoc(), 500);
  assert.equal(chunks[0]!.pageStart, 1);
  assert.equal(chunks[0]!.pageEnd, 1);
  assert.equal(chunks[1]!.pageStart, 1); // "Data" header, alone in its own chunk
  assert.equal(chunks[1]!.pageEnd, 1);
  assert.equal(chunks[3]!.pageStart, 2); // closing paragraph starts a fresh chunk on page 2
  assert.equal(chunks[3]!.pageEnd, 2);
});

test("chunkDocument flushes on token budget even without a section header", () => {
  const doc = makeDoc();
  // A tiny budget forces every text element into its own chunk.
  const chunks = chunkDocument(doc, 1);
  const textChunks = chunks.filter((c) => c.kind === "text");
  assert.ok(textChunks.length >= 3, `expected budget-forced splitting, got ${textChunks.length} text chunks`);
});

test("fullText concatenates elements in reading order", () => {
  const text = fullText(makeDoc());
  const introIdx = text.indexOf("Intro");
  const dataIdx = text.indexOf("Data");
  const closingIdx = text.indexOf("Closing paragraph");
  assert.ok(introIdx >= 0 && dataIdx > introIdx && closingIdx > dataIdx);
});

test("pageCount returns the highest page number present", () => {
  assert.equal(pageCount(makeDoc()), 2);
});

test("chunkDocument returns nothing for a document with no body children", () => {
  const doc = makeDoc();
  doc.body.children = [];
  assert.deepEqual(chunkDocument(doc, 500), []);
});
