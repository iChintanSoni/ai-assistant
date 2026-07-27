/**
 * Pure, testable file-content builders for each authoring tool in index.ts.
 * Kept separate from index.ts (MCP wiring + temp-file/upload plumbing) so
 * this logic can be unit tested without touching disk or spawning the MCP
 * server, the same split this repo already uses elsewhere (e.g. agent/tools.ts
 * vs agent/imageGen.ts).
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import PptxGenJSImport from "pptxgenjs";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "node:path";

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "document";
}

/** Makes a caller-supplied output filename safe to join beneath a temp directory. */
export function safeOutputFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : "";
  const stem = safeExt ? filename.slice(0, -ext.length) : filename;
  return `${slugify(stem)}${safeExt}`;
}

export function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export interface DocxSection {
  heading?: string;
  paragraphs: string[];
}

export async function buildDocxBuffer(title: string, sections: DocxSection[]): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  for (const section of sections) {
    if (section.heading) children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    for (const p of section.paragraphs) children.push(new Paragraph({ children: [new TextRun(p)] }));
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

// pptxgenjs's shipped .d.ts declares both `export as namespace PptxGenJS` and
// `export default PptxGenJS` under the same identifier, which resolves to the
// module namespace (not a constructable class) under `moduleResolution: NodeNext`
// — a known upstream typing issue, not a runtime one (the default export is a
// real constructable class at runtime). Re-typed narrowly to the surface used here.
interface PptxSlide {
  addText(
    text: string | Array<{ text: string; options?: Record<string, unknown> }>,
    options?: Record<string, unknown>,
  ): void;
}
interface PptxGenJSInstance {
  addSlide(): PptxSlide;
  write(props: { outputType: "nodebuffer" }): Promise<Buffer>;
}
const PptxGenJS = PptxGenJSImport as unknown as new () => PptxGenJSInstance;

export interface PptxSlideSpec {
  title: string;
  bullets: string[];
}

export async function buildPptxBuffer(title: string, slides: PptxSlideSpec[]): Promise<Buffer> {
  const pres = new PptxGenJS();
  const titleSlide = pres.addSlide();
  titleSlide.addText(title, { x: 0.5, y: 2, w: "90%", h: 1.5, fontSize: 32, bold: true, align: "center" });
  for (const slide of slides) {
    const s = pres.addSlide();
    s.addText(slide.title, { x: 0.5, y: 0.3, w: "90%", h: 0.8, fontSize: 24, bold: true });
    s.addText(
      slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
      { x: 0.5, y: 1.3, w: "90%", h: 4, fontSize: 16 },
    );
  }
  return pres.write({ outputType: "nodebuffer" });
}

export function buildPdfBuffer(title: string, paragraphs: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(20).text(title);
    doc.moveDown();
    doc.fontSize(12);
    for (const p of paragraphs) {
      doc.text(p);
      doc.moveDown();
    }
    doc.end();
  });
}

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

export async function buildXlsxBuffer(sheets: XlsxSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  const written = await wb.xlsx.writeBuffer();
  // exceljs transitively pulls in fast-csv, which ships its own much older nested
  // @types/node — so writeBuffer()'s declared Buffer is a structurally different
  // nominal type from ours (confirmed: identical at runtime, just typed against a
  // different @types/node version). Re-wrap through our own Buffer.from rather
  // than fight dependency-tree @types/node deduplication for one call site.
  return Buffer.from(written as unknown as Uint8Array);
}

// ---------------------------------------------------------------------------
// drawio diagram (mxGraph XML — the native draw.io/diagrams.net file format)
// ---------------------------------------------------------------------------

export interface DrawioNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface DrawioEdge {
  from: string;
  to: string;
  label?: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Builds a valid .drawio (mxGraph XML) file, openable directly in draw.io/diagrams.net. */
export function buildDrawioXml(nodes: DrawioNode[], edges: DrawioEdge[]): string {
  const cells: string[] = [`<mxCell id="0" />`, `<mxCell id="1" parent="0" />`];

  nodes.forEach((node, i) => {
    // Simple grid fallback (4 columns) when the caller doesn't specify a position.
    const x = node.x ?? 40 + (i % 4) * 180;
    const y = node.y ?? 40 + Math.floor(i / 4) * 120;
    const width = node.width ?? 140;
    const height = node.height ?? 60;
    cells.push(
      `<mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label)}" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" /></mxCell>`,
    );
  });

  edges.forEach((edge, i) => {
    const labelAttr = edge.label ? ` value="${escapeXml(edge.label)}"` : "";
    cells.push(
      `<mxCell id="edge-${i}"${labelAttr} style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;" edge="1" parent="1" ` +
        `source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}"><mxGeometry relative="1" as="geometry" /></mxCell>`,
    );
  });

  return (
    `<mxfile host="app.diagrams.net"><diagram name="Page-1" id="page-1">` +
    `<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" ` +
    `fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">` +
    `<root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`
  );
}
