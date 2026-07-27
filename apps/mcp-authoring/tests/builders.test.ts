import ExcelJS from "exceljs";
import { expect, test } from "vitest";
import {
  buildCsv,
  buildDocxBuffer,
  buildDrawioXml,
  buildPdfBuffer,
  buildPptxBuffer,
  buildXlsxBuffer,
  csvField,
  safeOutputFilename,
  slugify,
} from "../src/builders.js";

// --- slugify -----------------------------------------------------------------

test("slugify lowercases, hyphenates, and trims non-alphanumeric runs", () => {
  expect(slugify("Q3 Report: Sales & Growth!")).toBe("q3-report-sales-growth");
});

test("slugify falls back to 'document' when nothing alphanumeric survives", () => {
  expect(slugify("!!!")).toBe("document");
});

test("slugify truncates to 60 characters", () => {
  const long = "a".repeat(100);
  expect(slugify(long).length).toBe(60);
});

test("safeOutputFilename preserves a safe extension while removing path traversal and separators", () => {
  expect(safeOutputFilename("../../Quarterly Report.xlsx")).toBe("quarterly-report.xlsx");
  expect(safeOutputFilename("..\\..\\notes.txt")).toBe("notes.txt");
});

// --- csvField / buildCsv -------------------------------------------------------

test("csvField leaves plain values untouched", () => {
  expect(csvField("plain")).toBe("plain");
});

test("csvField quotes and escapes values containing commas, quotes, or newlines", () => {
  expect(csvField("a,b")).toBe('"a,b"');
  expect(csvField('say "hi"')).toBe('"say ""hi"""');
  expect(csvField("line1\nline2")).toBe('"line1\nline2"');
});

test("buildCsv joins rows with CRLF and ends with a trailing CRLF", () => {
  const csv = buildCsv([
    ["name", "value"],
    ["a,b", "1"],
  ]);
  expect(csv).toBe('name,value\r\n"a,b",1\r\n');
});

// --- buildDocxBuffer -----------------------------------------------------------

test("buildDocxBuffer produces a real, non-empty docx (zip) buffer", async () => {
  const buffer = await buildDocxBuffer("My Title", [
    { heading: "Intro", paragraphs: ["Hello.", "World."] },
    { paragraphs: ["No heading here."] },
  ]);
  expect(buffer.length).toBeGreaterThan(0);
  // docx files are zip archives — a valid PK zip signature confirms real output,
  // not just "some bytes came back".
  expect(buffer.subarray(0, 2).toString("hex")).toBe("504b");
});

// --- buildPptxBuffer -------------------------------------------------------------

test("buildPptxBuffer produces a real, non-empty pptx (zip) buffer", async () => {
  const buffer = await buildPptxBuffer("Deck Title", [{ title: "Slide 1", bullets: ["A", "B"] }]);
  expect(buffer.length).toBeGreaterThan(0);
  expect(buffer.subarray(0, 2).toString("hex")).toBe("504b");
});

// --- buildPdfBuffer --------------------------------------------------------------

test("buildPdfBuffer produces a real, non-empty PDF buffer", async () => {
  const buffer = await buildPdfBuffer("PDF Title", ["Paragraph one.", "Paragraph two."]);
  expect(buffer.length).toBeGreaterThan(0);
  expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
});

// --- buildXlsxBuffer -------------------------------------------------------------

test("buildXlsxBuffer produces a real, non-empty xlsx (zip) buffer with the given sheet name/rows, readable back by exceljs", async () => {
  const buffer = await buildXlsxBuffer([{ name: "Sheet1", rows: [["a", "b"], ["1", "2"]] }]);
  expect(buffer.length).toBeGreaterThan(0);
  expect(buffer.subarray(0, 2).toString("hex")).toBe("504b");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet("Sheet1")!;
  expect(sheet.getRow(1).getCell(1).value).toBe("a");
  expect(sheet.getRow(2).getCell(2).value).toBe("2");
});

test("buildXlsxBuffer supports multiple sheets", async () => {
  const buffer = await buildXlsxBuffer([
    { name: "One", rows: [["x"]] },
    { name: "Two", rows: [["y"]] },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  expect(wb.worksheets.map((s) => s.name)).toEqual(["One", "Two"]);
});

// --- buildDrawioXml --------------------------------------------------------------

test("buildDrawioXml wraps nodes/edges in a valid mxfile/mxGraphModel envelope", () => {
  const xml = buildDrawioXml([{ id: "n1", label: "Start" }], []);
  expect(xml).toMatch(/^<mxfile /);
  expect(xml).toContain("<mxGraphModel");
  expect(xml).toContain('<mxCell id="0" />');
  expect(xml).toContain('<mxCell id="1" parent="0" />');
});

test("buildDrawioXml renders each node as a vertex cell with its label and explicit position", () => {
  const xml = buildDrawioXml([{ id: "n1", label: "Start", x: 10, y: 20, width: 100, height: 50 }], []);
  expect(xml).toContain('id="n1"');
  expect(xml).toContain('value="Start"');
  expect(xml).toContain('vertex="1"');
  expect(xml).toContain('x="10" y="20" width="100" height="50"');
});

test("buildDrawioXml auto-arranges nodes left-to-right when x/y are omitted", () => {
  const xml = buildDrawioXml(
    [
      { id: "n0", label: "A" },
      { id: "n1", label: "B" },
    ],
    [],
  );
  expect(xml).toMatch(/id="n0"[\s\S]*?x="40" y="40"/);
  expect(xml).toMatch(/id="n1"[\s\S]*?x="220" y="40"/);
});

test("buildDrawioXml wraps to a second row after 4 columns", () => {
  const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }));
  const xml = buildDrawioXml(nodes, []);
  expect(xml).toMatch(/id="n0"[\s\S]*?x="40" y="40"/);
  expect(xml).toMatch(/id="n3"[\s\S]*?x="580" y="40"/);
  expect(xml).toMatch(/id="n4"[\s\S]*?x="40" y="160"/);
});

test("buildDrawioXml renders edges referencing node ids by source/target, with an optional label", () => {
  const xml = buildDrawioXml(
    [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    [{ from: "a", to: "b", label: "next" }],
  );
  expect(xml).toContain('edge="1"');
  expect(xml).toContain('source="a"');
  expect(xml).toContain('target="b"');
  expect(xml).toContain('value="next"');
});

test("buildDrawioXml escapes XML-special characters in labels and ids", () => {
  const xml = buildDrawioXml([{ id: "n<1", label: `Tom & "Jerry" <3` }], []);
  expect(xml).toContain("Tom &amp; &quot;Jerry&quot; &lt;3");
  expect(xml).toContain('id="n&lt;1"');
  expect(xml).not.toContain("Tom & \"Jerry\"");
});
